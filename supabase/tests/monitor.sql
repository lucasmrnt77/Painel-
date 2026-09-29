-- Testes do monitor (roda depois de comportamento.sql, como service_role).
\set ON_ERROR_STOP on
SET ROLE service_role;

-- set-2026 (id 1) é o ativo do teste de comportamento. Liga o monitor às 10:00.
RESET ROLE;
UPDATE lancamentos SET monitor_ativo = true, monitor_ligado_em = '2026-10-01 10:00-03',
       alerta_minutos_sem_entrada = 20, resumo_minutos = 60, alerta_telefones = '{59899000000}'
 WHERE id = 1;
-- Eventos de entrada em horários fixos (via postgres: webhook grava now())
INSERT INTO webhooks_sendflow (origem, payload, n_eventos) VALUES ('webhook', '{"t":1}', 2);
INSERT INTO eventos_sendflow (webhook_id, recebido_em, tipo, telefone_original, lancamento_id)
VALUES (currval('webhooks_sendflow_id_seq'), '2026-10-01 10:05-03', 'entrou', '59890000001', 1),
       (currval('webhooks_sendflow_id_seq'), '2026-10-01 10:10-03', 'entrou', '59890000002', 1);
SET ROLE service_role;

CREATE TEMP TABLE r AS SELECT 1 AS x;  -- só para ter uma tabela temporária de apoio
\echo '10:25 → 15 min sem entrada: nada'
SELECT tipo, chave FROM monitor_avaliar(1, '2026-10-01 10:25-03');
DO $$ BEGIN ASSERT (SELECT count(*) FROM monitor_avaliar(1, '2026-10-01 10:25-03')) = 0, 'não devia alertar aos 15 min'; END $$;

\echo '10:31 → 21 min: alerta sem_entradas #1'
SELECT tipo, chave, dados->>'minutos_sem_entrada' AS min FROM monitor_avaliar(1, '2026-10-01 10:31-03');
DO $$ DECLARE a record; BEGIN
  SELECT * INTO a FROM monitor_avaliar(1, '2026-10-01 10:31-03') WHERE tipo = 'sem_entradas';
  ASSERT a.chave LIKE 'sem_entradas:1:%:1', 'chave #1 errada: ' || a.chave;
  -- registra duas vezes: segunda deve ser ignorada (idempotente)
  ASSERT monitor_registrar_alerta(1, a.tipo, a.chave, 'm', a.dados) IS NOT NULL, 'primeira inserção falhou';
  ASSERT monitor_registrar_alerta(1, a.tipo, a.chave, 'm', a.dados) IS NULL, 'duplicou alerta!';
END $$;

\echo '10:45 → ainda 35 min: mesma chave (#1), nada novo'
DO $$ BEGIN
  ASSERT (SELECT chave FROM monitor_avaliar(1, '2026-10-01 10:45-03') WHERE tipo='sem_entradas') LIKE '%:1', 'devia continuar #1';
END $$;

\echo '10:51 → 41 min: repetição #2'
DO $$ DECLARE a record; BEGIN
  SELECT * INTO a FROM monitor_avaliar(1, '2026-10-01 10:51-03') WHERE tipo = 'sem_entradas';
  ASSERT a.chave LIKE '%:2', 'devia ser #2';
  PERFORM monitor_registrar_alerta(1, a.tipo, a.chave, 'm', a.dados);
END $$;

-- Os alertas foram "criados" em horários simulados: ajusta criado_em (via postgres)
RESET ROLE;
ALTER TABLE alertas DISABLE TRIGGER alertas_so_status;
UPDATE alertas SET criado_em = '2026-10-01 10:31-03' WHERE chave LIKE '%:1';
UPDATE alertas SET criado_em = '2026-10-01 10:51-03' WHERE chave LIKE '%:2';
ALTER TABLE alertas ENABLE TRIGGER alertas_so_status;
-- Alguém entra às 10:55
INSERT INTO eventos_sendflow (webhook_id, recebido_em, tipo, telefone_original, lancamento_id)
VALUES (currval('webhooks_sendflow_id_seq'), '2026-10-01 10:55-03', 'entrou', '59890000003', 1);
SET ROLE service_role;

\echo '10:57 → retomada, sem novo alerta de silêncio'
SELECT tipo, chave, dados->>'minutos_sem_entrada' AS min FROM monitor_avaliar(1, '2026-10-01 10:57-03');
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM monitor_avaliar(1, '2026-10-01 10:57-03') WHERE tipo='sem_entradas') = 0, 'não devia alertar silêncio';
  ASSERT (SELECT (dados->>'minutos_sem_entrada')::int FROM monitor_avaliar(1, '2026-10-01 10:57-03') WHERE tipo='entradas_retomadas') = 45, 'retomada devia citar 45 min';
END $$;

\echo '11:03 → resumo das 10:00–11:00 (3 entradas)'
SELECT tipo, chave, dados->'janela' AS janela FROM monitor_avaliar(1, '2026-10-01 11:03-03') WHERE tipo = 'resumo';
DO $$ BEGIN
  ASSERT (SELECT (dados->'janela'->>'entradas')::int FROM monitor_avaliar(1, '2026-10-01 11:03-03') WHERE tipo='resumo') = 3, 'resumo devia ter 3 entradas';
  ASSERT (SELECT count(*) FROM monitor_avaliar(1, '2026-10-01 11:15-03') WHERE tipo='resumo') = 0, 'resumo fora da janela de 10 min';
  ASSERT (SELECT count(*) FROM monitor_avaliar(1, '2026-10-01 10:05-03') WHERE tipo='resumo') = 0, 'resumo antes de ligar';
END $$;

-- Desligado: nada
SELECT monitor_definir(1, false);
DO $$ BEGIN ASSERT (SELECT count(*) FROM monitor_avaliar(1, '2026-10-01 12:00-03')) = 0, 'desligado não alerta'; END $$;
-- Religar atualiza monitor_ligado_em
SELECT monitor_definir(1, true);
DO $$ BEGIN ASSERT (SELECT monitor_ligado_em > now() - interval '1 minute' FROM lancamentos WHERE id=1), 'religar devia atualizar'; END $$;
SELECT monitor_definir(1, false);

-- Só status pode mudar
DO $$ BEGIN
  BEGIN UPDATE alertas SET mensagem = 'x'; RAISE EXCEPTION 'mudou mensagem!';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE '%mudou%' THEN RAISE; END IF; END;
  UPDATE alertas SET envio_status = 'enviado', enviado_em = now();
END $$;

SELECT monitor_situacao(1, '2026-10-01 11:03-03') -> 'ultimos_60' AS ultimos_60;
RESET ROLE;
\echo 'MONITOR OK'
