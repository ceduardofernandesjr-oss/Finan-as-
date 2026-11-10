-- =====================================================================
-- Conexões bancárias (Pluggy / Open Finance) — migração ADITIVA
-- Só cria tabelas e uma função novas; não altera nem apaga nada que já existe.
-- Pode ser executada de novo sem efeito (idempotente). Também está no fim de schema.sql.
-- =====================================================================

-- Conexão com uma instituição (um "item" da Pluggy)
create table if not exists public.bank_links (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  provider      text not null default 'pluggy' check (provider in ('pluggy')),
  item_id       text not null check (char_length(item_id) between 1 and 100),
  institution   text not null default '' check (char_length(institution) <= 120),
  last_sync_at  timestamptz,
  created_at    timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, provider, item_id)
);

-- Cada conta/cartão do banco e a conta/cartão do app que recebe os lançamentos
create table if not exists public.bank_link_accounts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  link_id      uuid not null,
  external_id  text not null check (char_length(external_id) between 1 and 100),
  kind         text not null check (kind in ('conta', 'cartao')),
  name         text not null default '' check (char_length(name) <= 120),
  number       text not null default '' check (char_length(number) <= 60),
  account_id   uuid,
  card_id      uuid,
  sync_from    date not null default (date_trunc('month', now()) - interval '1 month')::date,
  enabled      boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, external_id),
  foreign key (link_id, user_id)    references public.bank_links(id, user_id) on delete cascade,
  foreign key (account_id, user_id) references public.accounts(id, user_id) on delete set null (account_id),
  foreign key (card_id, user_id)    references public.credit_cards(id, user_id) on delete set null (card_id),
  check (kind <> 'conta' or card_id is null),
  check (kind <> 'cartao' or account_id is null)
);

-- Registro de cada lançamento do banco já tratado (importado ou ignorado): impede duplicar
create table if not exists public.bank_imports (
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  external_id     text not null check (char_length(external_id) between 1 and 100),
  status          text not null check (status in ('importado', 'ignorado')),
  transaction_id  uuid,
  purchase_id     uuid,
  created_at      timestamptz not null default now(),
  primary key (user_id, external_id),
  foreign key (transaction_id, user_id) references public.transactions(id, user_id) on delete set null (transaction_id),
  foreign key (purchase_id, user_id)    references public.card_purchases(id, user_id) on delete set null (purchase_id)
);

create index if not exists bank_link_accounts_link    on public.bank_link_accounts (link_id, user_id);
create index if not exists bank_link_accounts_account on public.bank_link_accounts (account_id, user_id);
create index if not exists bank_link_accounts_card    on public.bank_link_accounts (card_id, user_id);
create index if not exists bank_imports_transaction   on public.bank_imports (transaction_id, user_id);
create index if not exists bank_imports_purchase      on public.bank_imports (purchase_id, user_id);

do $$
declare t text;
begin
  foreach t in array array['bank_links', 'bank_link_accounts', 'bank_imports']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "dono" on public.%I', t);
    execute format($p$create policy "dono" on public.%I for all to authenticated
                     using (user_id = (select auth.uid()))
                     with check (user_id = (select auth.uid()))$p$, t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Importa lançamentos revisados, tudo ou nada.
--   p_items: [{ "external_id": "...", "action": "transacao" | "compra" | "ignorar",
--               "tx": {kind, description, amount, due_date, paid_date, account_id, to_account_id,
--                      category_id, payment_method, notes, card_id, invoice_month},
--               "purchase": {card_id, description, category_id, total, purchase_date, notes,
--                            installments: [{number, amount, invoice_month}]} }]
--   Itens já registrados são pulados (pode chamar de novo sem duplicar).
-- ---------------------------------------------------------------------
create or replace function public.import_bank_items(p_items jsonb)
returns int language plpgsql security invoker set search_path = public as $$
declare
  uid uuid := auth.uid();
  e jsonb; p jsonb; x transactions%rowtype;
  v_tx uuid; v_p uuid; n int := 0;
begin
  if uid is null then raise exception 'não autenticado'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'lista inválida'; end if;
  for e in select * from jsonb_array_elements(p_items) loop
    if coalesce(e->>'external_id', '') = '' then raise exception 'lançamento sem identificador'; end if;
    if exists (select 1 from bank_imports where user_id = uid and external_id = e->>'external_id') then continue; end if;
    v_tx := null; v_p := null;
    if e->>'action' = 'transacao' then
      x := jsonb_populate_record(null::transactions, e->'tx');
      insert into transactions (kind, description, amount, due_date, paid_date, account_id, to_account_id,
                                category_id, payment_method, notes, card_id, invoice_month)
      values (x.kind, x.description, x.amount, x.due_date, x.paid_date, x.account_id, x.to_account_id,
              x.category_id, coalesce(x.payment_method, ''), coalesce(x.notes, ''), x.card_id, x.invoice_month)
      returning id into v_tx;
      n := n + 1;
    elsif e->>'action' = 'compra' then
      p := e->'purchase';
      v_p := save_card_purchase(null, (p->>'card_id')::uuid, p->>'description', nullif(p->>'category_id', '')::uuid,
                                (p->>'total')::bigint, jsonb_array_length(p->'installments'), (p->>'purchase_date')::date,
                                coalesce(p->>'notes', ''), p->'installments');
      n := n + 1;
    elsif coalesce(e->>'action', '') <> 'ignorar' then
      raise exception 'ação inválida: %', e->>'action';
    end if;
    insert into bank_imports (external_id, status, transaction_id, purchase_id)
    values (e->>'external_id', case when e->>'action' = 'ignorar' then 'ignorado' else 'importado' end, v_tx, v_p);
  end loop;
  return n;
end $$;

revoke all on function public.import_bank_items(jsonb) from public, anon;
grant execute on function public.import_bank_items(jsonb) to authenticated;
