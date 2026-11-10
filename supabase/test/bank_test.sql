\set ON_ERROR_STOP 1
-- Testes das conexões bancárias (rode depois de stub.sql, schema.sql e rls_test.sql)
insert into auth.users values ('cccccccc-0000-0000-0000-000000000003','c@x'), ('dddddddd-0000-0000-0000-000000000004','d@x');
set role authenticated;
select set_config('request.jwt.claim.sub','cccccccc-0000-0000-0000-000000000003', false);
do $$
declare acc uuid; acc2 uuid; card uuid; cat uuid; lk uuid; n int; items jsonb;
begin
  insert into accounts (name,type,initial_balance) values ('Itaú','corrente',0) returning id into acc;
  insert into accounts (name,type) values ('Poupança','poupanca') returning id into acc2;
  insert into credit_cards (name,limit_amount,closing_day,due_day) values ('Visa',300000,25,5) returning id into card;
  select id into cat from categories where name='Alimentação';
  insert into bank_links (item_id, institution) values ('item-1','Banco X') returning id into lk;
  insert into bank_link_accounts (link_id, external_id, kind, name, account_id) values (lk,'acc-1','conta','Conta',acc);
  insert into bank_link_accounts (link_id, external_id, kind, name, card_id) values (lk,'card-1','cartao','Cartão',card);
  begin
    insert into bank_link_accounts (link_id, external_id, kind, name, card_id) values (lk,'x','conta','errado',card);
    assert false, 'conta com cartão';
  exception when check_violation then null; end;

  items := jsonb_build_array(
    jsonb_build_object('external_id','t1','action','transacao','tx', jsonb_build_object('kind','despesa','description','Mercado','amount',5000,'due_date','2026-11-05','paid_date','2026-11-05','account_id',acc,'category_id',cat,'payment_method','Débito')),
    jsonb_build_object('external_id','t2','action','transacao','tx', jsonb_build_object('kind','transferencia','description','Para poupança','amount',10000,'due_date','2026-11-06','paid_date','2026-11-06','account_id',acc,'to_account_id',acc2)),
    jsonb_build_object('external_id','t3','action','ignorar'),
    jsonb_build_object('external_id','t4','action','compra','purchase', jsonb_build_object('card_id',card,'description','Loja (2/3)','category_id',cat,'total',3000,'purchase_date','2026-11-03','notes','Pluggy','installments', jsonb_build_array(jsonb_build_object('number',1,'amount',3000,'invoice_month','2026-11-01'))))
  );
  n := import_bank_items(items); assert n = 3, 'importados: '||n;
  select count(*) into n from bank_imports; assert n = 4;
  select count(*) into n from bank_imports where status='ignorado'; assert n = 1;
  -- de novo: nada duplica
  n := import_bank_items(items); assert n = 0, 'reimportou';
  select count(*) into n from transactions where description in ('Mercado','Para poupança'); assert n = 2;
  select count(*) into n from card_purchases where description='Loja (2/3)'; assert n = 1;
  -- tudo ou nada: um item inválido desfaz o lote
  begin
    perform import_bank_items(jsonb_build_array(
      jsonb_build_object('external_id','t5','action','transacao','tx', jsonb_build_object('kind','despesa','description','ok','amount',100,'due_date','2026-11-07','paid_date','2026-11-07','account_id',acc)),
      jsonb_build_object('external_id','t6','action','transacao','tx', jsonb_build_object('kind','despesa','description','sem conta','amount',100,'due_date','2026-11-07','paid_date','2026-11-07'))));
    assert false, 'deveria falhar';
  exception when check_violation then null; end;
  select count(*) into n from bank_imports where external_id='t5'; assert n = 0, 'lote parcial gravado';
  begin perform import_bank_items('[{"external_id":"t7","action":"apagar"}]'); assert false; exception when raise_exception then null; end;
  -- quitar: pagamento do banco marca como paga uma conta pendente do app
  insert into transactions (kind, description, amount, due_date) values ('despesa','Luz pendente',18900,'2026-11-10');
  n := import_bank_items(jsonb_build_array(jsonb_build_object('external_id','q1','action','quitar',
        'transaction_id',(select id from transactions where description='Luz pendente'),'paid_date','2026-11-09','account_id',acc)));
  assert n = 1;
  select count(*) into n from transactions where description='Luz pendente' and paid_date='2026-11-09' and account_id=acc; assert n = 1, 'não quitou';
  select count(*) into n from bank_imports where external_id='q1' and transaction_id is not null; assert n = 1;
  begin
    perform import_bank_items(jsonb_build_array(jsonb_build_object('external_id','q2','action','quitar',
        'transaction_id',(select id from transactions where description='Luz pendente'),'paid_date','2026-11-09','account_id',acc)));
    assert false, 'quitou duas vezes';
  exception when raise_exception then null; end;
  -- excluir o lançamento importado não faz ele voltar (o registro fica)
  delete from transactions where description = 'Mercado';
  select count(*) into n from bank_imports where external_id='t1' and transaction_id is null; assert n = 1;
  -- excluir o cartão solta o mapeamento sem apagar a conexão
  delete from credit_cards where id = card;
  select count(*) into n from bank_link_accounts where external_id='card-1' and card_id is null; assert n = 1;
  raise notice 'conexões bancárias ok';
end $$;

-- outra pessoa não vê nem usa
select set_config('request.jwt.claim.sub','dddddddd-0000-0000-0000-000000000004', false);
do $$
declare n int; a_acc uuid;
begin
  select count(*) into n from bank_links; assert n = 0, 'D vê conexões de C';
  select count(*) into n from bank_link_accounts; assert n = 0;
  select count(*) into n from bank_imports; assert n = 0;
  -- mesmo id externo para outra pessoa é independente
  n := import_bank_items('[{"external_id":"t1","action":"ignorar"}]'); assert n = 0;
  select count(*) into n from bank_imports; assert n = 1;
  reset role; select id into a_acc from accounts where name='Itaú' limit 1; set role authenticated;
  begin
    perform import_bank_items(jsonb_build_array(jsonb_build_object('external_id','z','action','transacao','tx',
      jsonb_build_object('kind','despesa','description','x','amount',1,'due_date','2026-11-01','paid_date','2026-11-01','account_id',a_acc))));
    assert false, 'D lançou na conta de C';
  exception when foreign_key_violation then null; end;
  begin
    perform import_bank_items(jsonb_build_array(jsonb_build_object('external_id','z2','action','quitar',
      'transaction_id',(select id from transactions where description='Luz pendente' limit 1),'paid_date','2026-11-09')));
    assert false, 'D quitou lançamento de C';
  exception when raise_exception then null; end;
  raise notice 'isolamento das conexões ok';
end $$;
reset role; set role anon;
do $$ begin
  begin perform 1 from bank_links; assert false, 'anon leu'; exception when insufficient_privilege then null; end;
  begin perform import_bank_items('[]'); assert false, 'anon executou'; exception when insufficient_privilege then null; end;
  raise notice 'anon bloqueado nas conexões ok';
end $$;
