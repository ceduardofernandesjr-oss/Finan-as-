\set ON_ERROR_STOP 1
insert into auth.users values ('aaaaaaaa-0000-0000-0000-000000000001','a@x'), ('bbbbbbbb-0000-0000-0000-000000000002','b@x');
set role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001', false);
do $$
declare acc uuid; acc2 uuid; card uuid; cat uuid; pid uuid; t uuid; t2 uuid; n int; loan uuid;
begin
  select count(*) into n from categories; assert n = 19, 'categorias padrão: '||n;
  perform ensure_defaults(); select count(*) into n from categories; assert n = 19, 'ensure_defaults duplicou';
  insert into accounts (name,type,initial_balance) values ('Nubank','corrente',100000) returning id into acc;
  insert into accounts (name,type) values ('Carteira','dinheiro') returning id into acc2;
  insert into credit_cards (name,limit_amount,closing_day,due_day) values ('Roxinho',500000,5,12) returning id into card;
  select id into cat from categories where name='Compras';
  pid := save_card_purchase(null, card, 'TV', cat, 100000, 3, '2026-11-10', '',
    '[{"number":1,"amount":33334,"invoice_month":"2026-12-01"},{"number":2,"amount":33333,"invoice_month":"2027-01-01"},{"number":3,"amount":33333,"invoice_month":"2027-02-01"}]');
  select count(*) into n from card_installments where purchase_id = pid; assert n = 3;
  begin
    perform save_card_purchase(null, card, 'X', cat, 100, 1, '2026-11-10', '', '[{"number":1,"amount":99,"invoice_month":"2026-12-01"}]');
    assert false, 'deveria recusar soma errada';
  exception when raise_exception then null; end;
  -- edição recria parcelas
  perform save_card_purchase(pid, card, 'TV 55', cat, 90000, 2, '2026-11-10', '',
    '[{"number":1,"amount":45000,"invoice_month":"2026-12-01"},{"number":2,"amount":45000,"invoice_month":"2027-01-01"}]');
  select count(*) into n from card_installments where purchase_id = pid; assert n = 2, 'edição: '||n;
  -- pendente + pagamento parcial
  insert into transactions (kind,description,amount,due_date) values ('despesa','Luz',20000,'2026-11-15') returning id into t;
  t2 := settle_transaction(t, 5000, '2026-11-10', acc);
  assert (select amount from transactions where id=t) = 15000;
  assert (select parent_id from transactions where id=t2) = t;
  perform settle_transaction(t, 15000, '2026-11-14', acc);
  assert (select paid_date from transactions where id=t) = '2026-11-14';
  begin perform settle_transaction(t, 1, '2026-11-14', acc); assert false; exception when raise_exception then null; end;
  -- transferência
  insert into transactions (kind,description,amount,due_date,paid_date,account_id,to_account_id) values ('transferencia','Saque',3000,'2026-11-10','2026-11-10',acc,acc2);
  begin
    insert into transactions (kind,description,amount,due_date,account_id,to_account_id) values ('transferencia','sem data',1,'2026-11-10',acc,acc2);
    assert false, 'transferência pendente não pode';
  exception when check_violation then null; end;
  -- empréstimo
  loan := create_loan('Banco X','Pessoal',1000000,94560,12,1.5,'2026-10-01','2026-11-10','',null,2,acc,
    (select jsonb_agg(jsonb_build_object('number',g,'due_date',('2026-11-10'::date + make_interval(months=>g-1))::date,'amount',94560)) from generate_series(1,12) g));
  select count(*) into n from transactions where loan_id = loan; assert n = 12;
  select count(*) into n from transactions where loan_id = loan and paid_date is not null; assert n = 2;
  -- fatura
  insert into transactions (kind,description,amount,due_date,paid_date,account_id,card_id,invoice_month) values ('fatura','Fatura dez',45000,'2026-12-12','2026-12-12',acc,card,'2026-12-01');
  raise notice 'usuário A ok';
end $$;

-- usuário B
select set_config('request.jwt.claim.sub','bbbbbbbb-0000-0000-0000-000000000002', false);
do $$
declare n int; a_acc uuid; a_cat uuid;
begin
  select count(*) into n from accounts; assert n = 0, 'B vê contas de A';
  select count(*) into n from transactions; assert n = 0, 'B vê lançamentos de A';
  select count(*) into n from categories; assert n = 19;
  -- tenta ligar um lançamento à conta de A (id descoberto de alguma forma)
  reset role; select id into a_acc from accounts limit 1; select id into a_cat from categories where user_id <> 'bbbbbbbb-0000-0000-0000-000000000002' limit 1;
  set role authenticated;
  begin
    insert into transactions (kind,description,amount,due_date,paid_date,account_id) values ('despesa','x',1,'2026-11-01','2026-11-01',a_acc);
    assert false, 'B usou conta de A';
  exception when foreign_key_violation then null; end;
  begin
    insert into accounts (user_id,name,type) values ('aaaaaaaa-0000-0000-0000-000000000001','hack','corrente');
    assert false, 'B inseriu para A';
  exception when insufficient_privilege then null; end;
  update accounts set name='x'; get diagnostics n = row_count; assert n = 0;
  raise notice 'isolamento ok';
end $$;

-- backup/restore como A
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001', false);
create temp table bk as select jsonb_build_object('app','financas-pessoais',
  'accounts',(select jsonb_agg(to_jsonb(x)) from accounts x),
  'categories',(select jsonb_agg(to_jsonb(x)) from categories x),
  'credit_cards',(select jsonb_agg(to_jsonb(x)) from credit_cards x),
  'loans',(select jsonb_agg(to_jsonb(x)) from loans x),
  'card_purchases',(select jsonb_agg(to_jsonb(x)) from card_purchases x),
  'card_installments',(select jsonb_agg(to_jsonb(x)) from card_installments x),
  'transactions',(select jsonb_agg(to_jsonb(x)) from transactions x),
  'budgets','[]'::jsonb,'goals','[]'::jsonb) d;
do $$
declare before int; after int; d jsonb;
begin
  select count(*) into before from transactions;
  select bk.d into d from bk;
  delete from transactions where description like 'Saque%';
  perform restore_backup(d);
  select count(*) into after from transactions; assert before = after, format('restore %s/%s', before, after);
  begin perform restore_backup('{"app":"outro"}'); assert false; exception when raise_exception then null; end;
  raise notice 'backup ok';
end $$;
-- anon não pode nada
reset role; set role anon;
do $$ begin
  begin perform 1 from accounts; assert false, 'anon leu'; exception when insufficient_privilege then null; end;
  begin perform ensure_defaults(); assert false, 'anon executou'; exception when insufficient_privilege then null; end;
  raise notice 'anon bloqueado ok';
end $$;
