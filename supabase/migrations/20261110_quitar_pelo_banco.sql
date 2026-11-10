-- =====================================================================
-- Conexões bancárias: ação "quitar" (pagamento visto no banco marca como pago um lançamento
-- pendente que já existe no app). Só substitui a função import_bank_items; não mexe em dados.
-- =====================================================================

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
    elsif e->>'action' = 'quitar' then
      -- pagamento visto no banco quita um lançamento pendente que já existe no app
      update transactions
         set paid_date = (e->>'paid_date')::date,
             account_id = coalesce(nullif(e->>'account_id', '')::uuid, account_id)
       where id = (e->>'transaction_id')::uuid and paid_date is null
       returning id into v_tx;
      if v_tx is null then raise exception 'O lançamento a quitar não existe ou já foi pago. Sincronize de novo.'; end if;
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
