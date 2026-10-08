-- Testes do grupo gratuito no monitor (rodar depois do 013 num banco de teste)
\set ON_ERROR_STOP 1
BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE g public.lancamentos%ROWTYPE; r jsonb; n int;
BEGIN
  SELECT * INTO g FROM lancamentos WHERE tipo = 'grupo_gratuito';
  ASSERT g.id IS NOT NULL AND NOT g.ativo, 'grupo gratuito criado e inativo';

  -- não pode virar o lançamento ativo
  BEGIN
    UPDATE lancamentos SET ativo = true WHERE id = g.id;
    RAISE EXCEPTION 'deveria ter falhado';
  EXCEPTION WHEN check_violation OR unique_violation THEN NULL;
  END;

  -- prazos longos
  UPDATE lancamentos SET alerta_minutos_sem_entrada = 2880, resumo_minutos = 1440, sendflow_ref = 'Grupo Gratuito Oficial',
                         monitor_ativo = true, monitor_ligado_em = now() - interval '5 hours'
   WHERE id = g.id;

  -- evento da campanha do grupo cai no grupo gratuito, não no lançamento ativo
  ASSERT public.resolver_lancamento_sendflow('Grupo Gratuito Oficial', NULL, NULL) = g.id, 'ref da campanha resolve para o grupo';

  -- 3 h sem entrada com limiar de 3 h → alerta sem_entradas
  UPDATE lancamentos SET alerta_minutos_sem_entrada = 180 WHERE id = g.id;
  SELECT count(*) INTO n FROM monitor_avaliar(g.id) a WHERE a.tipo = 'sem_entradas';
  ASSERT n = 1, 'sem entradas há 5 h com limiar de 3 h gera alerta';

  RAISE NOTICE 'alertas-grupo: todos os testes passaram';
END $$;
ROLLBACK;
