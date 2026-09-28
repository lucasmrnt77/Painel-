-- Teste de comportamento (roda como service_role, depois de 000 e 001).
\set ON_ERROR_STOP on
SET ROLE service_role;

INSERT INTO lancamentos (slug, nome, link_grupo, sendflow_ref, minutos_reenvio, ativo)
VALUES ('set-2026', 'Expert Trader Setembro', 'https://chat.whatsapp.com/XYZ', 'Expert Trader Set', 10, true),
       ('downsell', 'Downsell', NULL, 'camp-downsell', 10, false);

-- Inscrições: UY, AR, BR; duplicata; slug inexistente; telefone ruim
SELECT registrar_inscricao(NULL, 'Ana', 'ANA@x.com ', '099 123 456', '{"utm_source":"ig"}', '/captura', '{}');
SELECT registrar_inscricao(NULL, 'Beto', 'b@x.com', '11 15 1234-5678', '{}', NULL, '{}');
SELECT registrar_inscricao('set-2026', 'Caio', 'c@x.com', '(11) 91234-0000', '{}', NULL, '{}');
SELECT registrar_inscricao(NULL, 'Ana de novo', 'ana@x.com', '+598 99 123 456', '{}', NULL, '{}');
SELECT registrar_inscricao('nao-existe', 'X', 'x@x.com', '099000000', '{}', NULL, '{}') ->> 'erro' AS erro_slug;
SELECT registrar_inscricao(NULL, 'Y', 'y@x.com', '123', '{}', NULL, '{}') ->> 'erro' AS erro_tel;
SELECT registrar_inscricao(NULL, 'Dora', 'd@x.com', '099 777 888', '{}', NULL, '{}');
SELECT registrar_inscricao('downsell', 'Eva', 'e@x.com', '099 555 444', '{}', NULL, '{}');

-- Deixa Caio e Dora "antigos" (> 10 min). Inscricoes não aceitam UPDATE,
-- então reinsere com criado_em no passado via postgres.
RESET ROLE;
ALTER TABLE inscricoes DISABLE TRIGGER inscricoes_sem_update;
UPDATE inscricoes SET criado_em = now() - interval '30 minutes' WHERE nome IN ('Caio','Dora','Beto','Ana','Eva');
ALTER TABLE inscricoes ENABLE TRIGGER inscricoes_sem_update;
SET ROLE service_role;

-- Webhook: Ana entra (JID UY), Beto entra (AR 549), Caio entra e sai (BR sem o 9),
-- intruso entra sem inscrição, evento desconhecido, Eva entra no grupo do downsell por ref
SELECT sendflow_registrar_webhook('{"raw":1}', '[
 {"tipo":"entrou","tipo_original":"member.join","telefone":"59899123456","grupo_id":"g1","grupo_nome":"Expert Trader Set #1"},
 {"tipo":"entrou","telefone":"5491112345678","grupo_id":"g1","grupo_nome":"Expert Trader Set #1"},
 {"tipo":"entrou","telefone":"551112340000","grupo_id":"g2","grupo_nome":"Expert Trader Set #2"},
 {"tipo":"entrou","telefone":"59891000111","grupo_id":"g1","grupo_nome":"Expert Trader Set #1"},
 {"tipo":"coisa","telefone":null},
 {"tipo":"entrou","telefone":"59899555444","grupo_id":"gd","sendflow_ref":"camp-downsell"}
]');
SELECT sendflow_registrar_webhook('{"raw":2}', '[{"tipo":"saiu","telefone":"551112340000","grupo_id":"g2","grupo_nome":"Expert Trader Set #2"}]');
-- Beto entra de novo (idempotente)
SELECT sendflow_registrar_webhook('{"raw":3}', '[{"tipo":"entrou","telefone":"5491112345678","grupo_id":"g1"}]');

\echo '--- v_leads'
SELECT lancamento_slug, nome, email, telefone, n_envios, status, grupos FROM v_leads ORDER BY lancamento_slug, nome;
\echo '--- v_membros'
SELECT lancamento_slug, grupo_id, telefone, no_grupo, inscrito, nome FROM v_membros ORDER BY 1,2,3;
\echo '--- resumo'
SELECT slug, inscritos, no_grupo, aguardando, fora_do_grupo, saiu, telefone_invalido, envios_total, membros_no_grupo, membros_sem_inscricao, pct_inscritos_no_grupo FROM v_resumo_lancamentos ORDER BY slug;
\echo '--- serie'
SELECT * FROM v_serie_diaria ORDER BY 1,2;
\echo '--- eventos'
SELECT tipo, telefone, lancamento_id FROM eventos_sendflow ORDER BY id;

-- Asserts
DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM v_resumo_lancamentos WHERE slug = 'set-2026';
  ASSERT r.inscritos = 4,        'inscritos únicos set-2026 deveria ser 4 (Ana dedup), veio ' || r.inscritos;
  ASSERT r.no_grupo = 2,         'no_grupo deveria ser 2 (Ana, Beto)';
  ASSERT r.saiu = 1,             'saiu deveria ser 1 (Caio)';
  ASSERT r.fora_do_grupo = 1,    'fora_do_grupo deveria ser 1 (Dora)';
  ASSERT r.envios_total = 5,     'envios_total deveria ser 5';
  ASSERT r.membros_sem_inscricao = 1, 'um intruso sem inscrição';
  SELECT * INTO r FROM v_resumo_lancamentos WHERE slug = 'downsell';
  ASSERT r.no_grupo = 1,         'Eva no grupo do downsell via sendflow_ref';
  ASSERT (SELECT count(*) FROM eventos_sendflow WHERE tipo = 'desconhecido') = 1, 'um desconhecido';
  ASSERT (SELECT count(*) FROM membros_grupo) = 5, 'membros_grupo deveria ter 5 linhas';
END $$;

-- Append-only
DO $$
BEGIN
  BEGIN UPDATE eventos_sendflow SET tipo = 'saiu'; RAISE EXCEPTION 'UPDATE em eventos passou!';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE '%passou%' THEN RAISE; END IF;
  END;
  BEGIN DELETE FROM webhooks_sendflow; RAISE EXCEPTION 'DELETE em webhooks passou!';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE '%passou%' THEN RAISE; END IF;
  END;
END $$;

-- anon não enxerga nada
RESET ROLE;
SET ROLE anon;
DO $$
BEGIN
  BEGIN PERFORM 1 FROM v_leads; RAISE EXCEPTION 'anon leu v_leads!';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM registrar_inscricao(NULL,'a','a','099123456','{}',NULL,'{}'); RAISE EXCEPTION 'anon executou RPC!';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
\echo 'COMPORTAMENTO OK'
