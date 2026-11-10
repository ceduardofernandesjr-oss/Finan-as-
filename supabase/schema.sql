-- =====================================================================
-- Finanças Pessoais — banco de dados (Supabase / PostgreSQL 15+)
-- Cole este arquivo inteiro no Supabase: SQL Editor → New query → Run.
-- Pode ser executado de novo sem perder dados (é idempotente).
--
-- Regras gerais
--  * Todo valor em dinheiro é guardado em CENTAVOS (bigint): sem erros de arredondamento.
--  * Cada linha pertence a um usuário (user_id) e o RLS só deixa cada pessoa ver as suas.
--  * Chaves estrangeiras compostas (id, user_id) impedem ligar um registro a dados de outra pessoa.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Contas bancárias e carteiras
-- ---------------------------------------------------------------------
create table if not exists public.accounts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 80),
  type             text not null check (type in ('corrente','poupanca','carteira','dinheiro','investimento')),
  initial_balance  bigint not null default 0,
  color            text not null default '#1e3a8a',
  archived         boolean not null default false,
  created_at       timestamptz not null default now(),
  unique (id, user_id)
);

-- ---------------------------------------------------------------------
-- Categorias e subcategorias
-- ---------------------------------------------------------------------
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  kind        text not null check (kind in ('receita','despesa')),
  parent_id   uuid,
  color       text not null default '#64748b',
  created_at  timestamptz not null default now(),
  unique (id, user_id),
  unique nulls not distinct (user_id, kind, parent_id, name),
  foreign key (parent_id, user_id) references public.categories(id, user_id)
    on delete cascade deferrable initially deferred
);

-- ---------------------------------------------------------------------
-- Cartões de crédito
-- ---------------------------------------------------------------------
create table if not exists public.credit_cards (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 60),
  institution   text not null default '',
  brand         text not null default 'Outra',
  limit_amount  bigint not null check (limit_amount >= 0),
  closing_day   int not null check (closing_day between 1 and 31),
  due_day       int not null check (due_day between 1 and 31),
  color         text not null default '#7c3aed',
  archived      boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (id, user_id)
);

-- ---------------------------------------------------------------------
-- Empréstimos e financiamentos
-- ---------------------------------------------------------------------
create table if not exists public.loans (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  institution         text not null check (char_length(institution) between 1 and 80),
  description         text not null default '',
  principal           bigint not null check (principal > 0),
  installment_amount  bigint not null check (installment_amount > 0),
  installments_count  int not null check (installments_count between 1 and 600),
  monthly_rate        numeric(9,6) not null default 0 check (monthly_rate >= 0 and monthly_rate < 100),
  contract_date       date not null,
  first_due_date      date not null,
  notes               text not null default '',
  created_at          timestamptz not null default now(),
  unique (id, user_id)
);

-- ---------------------------------------------------------------------
-- Compras no cartão e suas parcelas (cada parcela cai em uma fatura)
-- ---------------------------------------------------------------------
create table if not exists public.card_purchases (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  card_id        uuid not null,
  description    text not null check (char_length(description) between 1 and 120),
  category_id    uuid,
  total          bigint not null check (total > 0),
  installments   int not null check (installments between 1 and 72),
  purchase_date  date not null,
  notes          text not null default '',
  created_at     timestamptz not null default now(),
  unique (id, user_id),
  foreign key (card_id, user_id) references public.credit_cards(id, user_id) on delete cascade,
  foreign key (category_id, user_id) references public.categories(id, user_id) on delete set null (category_id)
);

create table if not exists public.card_installments (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  purchase_id    uuid not null,
  card_id        uuid not null,
  number         int not null check (number >= 1),
  amount         bigint not null check (amount > 0),
  invoice_month  date not null check (extract(day from invoice_month) = 1),
  unique (purchase_id, number),
  foreign key (purchase_id, user_id) references public.card_purchases(id, user_id) on delete cascade,
  foreign key (card_id, user_id) references public.credit_cards(id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------
-- Lançamentos: receitas, despesas, transferências e pagamentos de fatura
--   paid_date nulo = pendente (conta a pagar / a receber)
--   'transferencia' e 'fatura' movimentam contas, mas não são receita nem despesa.
-- ---------------------------------------------------------------------
create table if not exists public.transactions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind              text not null check (kind in ('receita','despesa','transferencia','fatura')),
  description       text not null check (char_length(description) between 1 and 120),
  amount            bigint not null check (amount > 0),
  due_date          date not null,
  paid_date         date,
  account_id        uuid,
  to_account_id     uuid,
  category_id       uuid,
  payment_method    text not null default '',
  notes             text not null default '',
  recurrence_id     uuid,
  recurrence_index  int,
  recurrence_total  int,
  parent_id         uuid,
  loan_id           uuid,
  loan_installment  int,
  card_id           uuid,
  invoice_month     date,
  created_at        timestamptz not null default now(),
  unique (id, user_id),
  foreign key (account_id, user_id)    references public.accounts(id, user_id),
  foreign key (to_account_id, user_id) references public.accounts(id, user_id),
  foreign key (category_id, user_id)   references public.categories(id, user_id) on delete set null (category_id),
  foreign key (parent_id, user_id)     references public.transactions(id, user_id)
    on delete set null (parent_id) deferrable initially deferred,
  foreign key (loan_id, user_id)       references public.loans(id, user_id) on delete cascade,
  foreign key (card_id, user_id)       references public.credit_cards(id, user_id) on delete cascade,
  -- um lançamento pago sempre diz de qual conta saiu / para qual entrou
  check (paid_date is null or account_id is not null),
  check (kind <> 'transferencia' or (paid_date is not null and to_account_id is not null and to_account_id <> account_id)),
  check (kind =  'transferencia' or to_account_id is null),
  check (kind <> 'fatura' or (paid_date is not null and card_id is not null and invoice_month is not null)),
  check (invoice_month is null or extract(day from invoice_month) = 1)
);

-- ---------------------------------------------------------------------
-- Orçamento mensal por categoria
-- ---------------------------------------------------------------------
create table if not exists public.budgets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category_id  uuid not null,
  amount       bigint not null check (amount > 0),
  created_at   timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, category_id),
  foreign key (category_id, user_id) references public.categories(id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------
-- Metas, reserva de emergência e planejamento de compras
-- ---------------------------------------------------------------------
create table if not exists public.goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  kind        text not null check (kind in ('reserva','meta','compra')),
  target      bigint not null check (target > 0),
  saved       bigint not null default 0 check (saved >= 0),
  deadline    date,
  notes       text not null default '',
  created_at  timestamptz not null default now(),
  unique (id, user_id)
);

-- ---------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------
create index if not exists transactions_user_due   on public.transactions (user_id, due_date);
create index if not exists transactions_user_paid  on public.transactions (user_id, paid_date);
create index if not exists transactions_recurrence on public.transactions (recurrence_id);
create index if not exists transactions_loan       on public.transactions (loan_id);
create index if not exists installments_card_month on public.card_installments (card_id, invoice_month);
create index if not exists purchases_card          on public.card_purchases (card_id);
create index if not exists categories_user         on public.categories (user_id);
create index if not exists accounts_user           on public.accounts (user_id);

-- ---------------------------------------------------------------------
-- Segurança: cada pessoa só vê e altera os próprios dados
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['accounts','categories','credit_cards','loans','card_purchases',
                           'card_installments','transactions','budgets','goals']
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
-- Categorias padrão (criadas no cadastro e sob demanda)
-- ---------------------------------------------------------------------
create or replace function public.seed_default_categories(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.categories where user_id = p_user) then return; end if;
  insert into public.categories (user_id, name, kind, color) values
    (p_user, 'Salário',            'receita', '#16a34a'),
    (p_user, 'Serviços',           'receita', '#22c55e'),
    (p_user, 'Vendas',             'receita', '#10b981'),
    (p_user, 'Trabalho extra',     'receita', '#14b8a6'),
    (p_user, 'Rendimentos',        'receita', '#0ea5e9'),
    (p_user, 'Outras receitas',    'receita', '#64748b'),
    (p_user, 'Moradia',            'despesa', '#1e40af'),
    (p_user, 'Alimentação',        'despesa', '#ea580c'),
    (p_user, 'Transporte',         'despesa', '#0891b2'),
    (p_user, 'Combustível',        'despesa', '#ca8a04'),
    (p_user, 'Saúde',              'despesa', '#dc2626'),
    (p_user, 'Educação',           'despesa', '#7c3aed'),
    (p_user, 'Lazer',              'despesa', '#db2777'),
    (p_user, 'Assinaturas',        'despesa', '#9333ea'),
    (p_user, 'Impostos',           'despesa', '#475569'),
    (p_user, 'Compras',            'despesa', '#f59e0b'),
    (p_user, 'Contas domésticas',  'despesa', '#2563eb'),
    (p_user, 'Empréstimos e financiamentos', 'despesa', '#b91c1c'),
    (p_user, 'Outros',             'despesa', '#64748b');
end $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.seed_default_categories(new.id);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Chamada pelo app ao entrar: garante as categorias de quem se cadastrou antes deste script.
create or replace function public.ensure_defaults()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  perform public.seed_default_categories(auth.uid());
end $$;

-- ---------------------------------------------------------------------
-- Compra no cartão + parcelas, de uma vez só (tudo ou nada)
--   p_installments: [{"number":1,"amount":12345,"invoice_month":"2026-11-01"}, ...]
-- ---------------------------------------------------------------------
create or replace function public.save_card_purchase(
  p_id uuid, p_card uuid, p_description text, p_category uuid, p_total bigint,
  p_installments_count int, p_purchase_date date, p_notes text, p_installments jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_id uuid;
begin
  if (select coalesce(sum((e->>'amount')::bigint), 0) from jsonb_array_elements(p_installments) e) <> p_total
     or jsonb_array_length(p_installments) <> p_installments_count then
    raise exception 'parcelas não somam o total da compra';
  end if;
  if p_id is null then
    insert into card_purchases (card_id, description, category_id, total, installments, purchase_date, notes)
    values (p_card, p_description, p_category, p_total, p_installments_count, p_purchase_date, coalesce(p_notes, ''))
    returning id into v_id;
  else
    update card_purchases set card_id = p_card, description = p_description, category_id = p_category,
      total = p_total, installments = p_installments_count, purchase_date = p_purchase_date,
      notes = coalesce(p_notes, '')
    where id = p_id returning id into v_id;
    if v_id is null then raise exception 'compra não encontrada'; end if;
    delete from card_installments where purchase_id = v_id;
  end if;
  insert into card_installments (purchase_id, card_id, number, amount, invoice_month)
  select v_id, p_card, (e->>'number')::int, (e->>'amount')::bigint, (e->>'invoice_month')::date
  from jsonb_array_elements(p_installments) e;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Empréstimo + suas parcelas como contas a pagar (tudo ou nada)
--   p_installments: [{"number":1,"due_date":"2026-12-10","amount":50000}, ...]
-- ---------------------------------------------------------------------
create or replace function public.create_loan(
  p_institution text, p_description text, p_principal bigint, p_installment_amount bigint,
  p_installments_count int, p_monthly_rate numeric, p_contract_date date, p_first_due_date date,
  p_notes text, p_category uuid, p_paid_count int, p_account uuid, p_installments jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_id uuid;
begin
  insert into loans (institution, description, principal, installment_amount, installments_count,
                     monthly_rate, contract_date, first_due_date, notes)
  values (p_institution, coalesce(p_description, ''), p_principal, p_installment_amount, p_installments_count,
          p_monthly_rate, p_contract_date, p_first_due_date, coalesce(p_notes, ''))
  returning id into v_id;

  insert into transactions (kind, description, amount, due_date, paid_date, account_id, category_id,
                            loan_id, loan_installment, payment_method)
  select 'despesa',
         p_institution || ' — parcela ' || (e->>'number') || '/' || p_installments_count,
         (e->>'amount')::bigint, (e->>'due_date')::date,
         case when (e->>'number')::int <= coalesce(p_paid_count, 0) then (e->>'due_date')::date end,
         case when (e->>'number')::int <= coalesce(p_paid_count, 0) then p_account end,
         p_category, v_id, (e->>'number')::int, 'Débito automático'
  from jsonb_array_elements(p_installments) e;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Pagar / receber um lançamento pendente, inteiro ou em parte
--   Pagamento parcial: cria um lançamento pago com o valor pago (ligado ao original)
--   e reduz o valor ainda pendente do original.
-- ---------------------------------------------------------------------
create or replace function public.settle_transaction(p_id uuid, p_amount bigint, p_date date, p_account uuid)
returns uuid language plpgsql security invoker set search_path = public as $$
declare t transactions%rowtype; v_new uuid;
begin
  select * into t from transactions where id = p_id for update;
  if not found then raise exception 'lançamento não encontrado'; end if;
  if t.paid_date is not null then raise exception 'este lançamento já foi quitado'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > t.amount then raise exception 'valor inválido'; end if;
  if p_account is null then raise exception 'escolha a conta'; end if;

  if p_amount = t.amount then
    update transactions set paid_date = p_date, account_id = p_account where id = p_id;
    return p_id;
  end if;

  insert into transactions (kind, description, amount, due_date, paid_date, account_id, category_id,
                            payment_method, notes, parent_id, loan_id, loan_installment)
  values (t.kind, t.description || ' (parcial)', p_amount, t.due_date, p_date, p_account, t.category_id,
          t.payment_method, t.notes, t.id, null, null)
  returning id into v_new;
  update transactions set amount = amount - p_amount where id = p_id;
  return v_new;
end $$;

-- ---------------------------------------------------------------------
-- Restaurar um backup (substitui TODOS os dados de quem chama, tudo ou nada)
-- ---------------------------------------------------------------------
create or replace function public.restore_backup(p_data jsonb)
returns void language plpgsql security invoker set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'não autenticado'; end if;
  if coalesce(p_data->>'app', '') <> 'financas-pessoais' then raise exception 'arquivo de backup inválido'; end if;

  delete from transactions;      delete from card_installments; delete from card_purchases;
  delete from budgets;           delete from goals;             delete from loans;
  delete from credit_cards;      delete from categories;        delete from accounts;

  insert into accounts select (jsonb_populate_record(null::accounts, e || jsonb_build_object('user_id', uid))).*
    from jsonb_array_elements(coalesce(p_data->'accounts', '[]')) e;
  insert into categories select (jsonb_populate_record(null::categories, e || jsonb_build_object('user_id', uid))).*
    from jsonb_array_elements(coalesce(p_data->'categories', '[]')) e;
  insert into credit_cards select (jsonb_populate_record(null::credit_cards, e || jsonb_build_object('user_id', uid))).*
    from jsonb_array_elements(coalesce(p_data->'credit_cards', '[]')) e;
  insert into loans select (jsonb_populate_record(null::loans, e || jsonb_build_object('user_id', uid))).*
    from jsonb_array_elements(coalesce(p_data->'loans', '[]')) e;
  insert into card_purchases select (jsonb_populate_record(null::card_purchases, e || jsonb_build_object('user_id', uid))).*
    from jsonb_array_elements(coalesce(p_data->'card_purchases', '[]')) e;
  insert into card_installments select (jsonb_populate_record(null::card_installments, e || jsonb_build_object('user_id', uid))).*
    from jsonb_array_elements(coalesce(p_data->'card_installments', '[]')) e;
  insert into transactions select (jsonb_populate_record(null::transactions, e || jsonb_build_object('user_id', uid))).*
    from jsonb_array_elements(coalesce(p_data->'transactions', '[]')) e;
  insert into budgets select (jsonb_populate_record(null::budgets, e || jsonb_build_object('user_id', uid))).*
    from jsonb_array_elements(coalesce(p_data->'budgets', '[]')) e;
  insert into goals select (jsonb_populate_record(null::goals, e || jsonb_build_object('user_id', uid))).*
    from jsonb_array_elements(coalesce(p_data->'goals', '[]')) e;
end $$;

revoke all on function public.seed_default_categories(uuid) from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array[
    'public.ensure_defaults()',
    'public.save_card_purchase(uuid, uuid, text, uuid, bigint, int, date, text, jsonb)',
    'public.create_loan(text, text, bigint, bigint, int, numeric, date, date, text, uuid, int, uuid, jsonb)',
    'public.settle_transaction(uuid, bigint, date, uuid)',
    'public.restore_backup(jsonb)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- =====================================================================
-- Conexões bancárias (Pluggy / Open Finance) — ver supabase/migrations/20261109_conexoes_bancarias.sql
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
