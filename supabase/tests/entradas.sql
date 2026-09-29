-- Testes da demografia e da importação de entradas nos grupos (depois de paginas.sql).
\set ON_ERROR_STOP on
SET ROLE service_role;
INSERT INTO lancamentos (slug, nome) VALUES ('ent', 'Entradas');
DO $$
DECLARE r jsonb; v_id bigint := (SELECT id FROM lancamentos WHERE slug = 'ent');
BEGIN
  r := importar_planilha(v_id, '[
    {"chave":"a","criado_em":"2026-09-01T10:00:00-03:00","telefone":"59899100001","faixa_etaria":"55_64","genero":"mujer","resposta_dinheiro":"Sí, podría hacerlo sin problema","landing":"Jub-Uruguay"},
    {"chave":"b","criado_em":"2026-09-01T10:05:00-03:00","telefone":"5491100000002","faixa_etaria":"+65","genero":"Hombre"},
    {"chave":"c","criado_em":"2026-09-01T10:06:00-03:00","telefone":"59899100003"}]', 'nunca_operou');
  ASSERT (r->>'novas')::int = 3, 'três leads';
  -- sem lista do grupo: históricos sem Grupo ficam fora do grupo
  ASSERT (SELECT count(*) FROM v_leads WHERE lancamento_id = v_id AND status = 'fora_do_grupo') = 3, 'todos fora antes da lista';
  r := importar_entradas_grupo(v_id, '[
    {"chave":"1","entrou_em":"2026-09-01T10:12:00-03:00","telefone":"59899100001","grupo_nome":"La Semana #1"},
    {"chave":"1","entrou_em":"2026-09-01T10:12:00-03:00","telefone":"59899100001","grupo_nome":"La Semana #1"},
    {"chave":"2","entrou_em":"2026-09-02T09:00:00-03:00","telefone":"59899100001","grupo_nome":"La Semana #1"},
    {"chave":"3","entrou_em":"2026-09-01T11:05:00-03:00","telefone":"5491100000002","grupo_nome":null},
    {"chave":"4","entrou_em":"2026-09-01T11:00:00-03:00","telefone":"123","grupo_nome":"x"}]');
  ASSERT (r->>'validas')::int = 3 AND (r->>'novas')::int = 3, 'entradas: ' || r::text;
  r := importar_entradas_grupo(v_id, '[{"chave":"1","entrou_em":"2026-09-01T10:12:00-03:00","telefone":"59899100001","grupo_nome":"La Semana #1"}]');
  ASSERT (r->>'novas')::int = 0, 'reimportação não duplica';
  ASSERT (SELECT status || '/' || minutos_ate_entrar FROM v_leads WHERE lancamento_id = v_id AND telefone = '59899100001') = 'no_grupo/12.0', 'minutos até entrar';
  ASSERT (SELECT status || '/' || minutos_ate_entrar FROM v_leads WHERE lancamento_id = v_id AND telefone = '5491100000002') = 'no_grupo/60.0', 'b no grupo';
  ASSERT (SELECT status FROM v_leads WHERE lancamento_id = v_id AND telefone = '59899100003') = 'fora_do_grupo', 'c fora';
  ASSERT (SELECT faixa_etaria_norm || '/' || genero_norm FROM v_leads_analise WHERE lancamento_id = v_id AND telefone = '59899100001') = '55–64/Mulher', 'demografia a';
  ASSERT (SELECT faixa_etaria_norm || '/' || genero_norm FROM v_leads_analise WHERE lancamento_id = v_id AND telefone = '5491100000002') = '65+/Homem', 'demografia b';
  ASSERT (SELECT mediana_minutos_ate_entrar FROM v_resumo_paginas WHERE lancamento_id = v_id) = 36, 'mediana';
  ASSERT (analise_resumo(v_id, 'faixa_etaria', '{}')->>'total')::int = 3, 'analise total';
  ASSERT (analise_resumo(v_id, 'faixa_etaria', '{"genero_norm":"Mulher"}')->>'total')::int = 1, 'analise filtro';
  ASSERT (SELECT count(*) FROM jsonb_array_elements(analise_resumo(v_id, 'genero', '{}')->'grupos')) = 3, 'analise grupos';
  -- monitor não conta importação como entrada
  ASSERT (SELECT count(*) FROM eventos_sendflow WHERE lancamento_id = v_id AND tipo = 'entrou') = 0, 'importação não é entrada ao vivo';
END $$;
RESET ROLE;
\echo 'ENTRADAS OK'
SET ROLE service_role;
SELECT atualizar_estatisticas();
RESET ROLE;
\echo 'ESTATISTICAS OK'
