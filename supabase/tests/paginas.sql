-- Testes da página de captura (depois de historico.sql).
\set ON_ERROR_STOP on
SET ROLE service_role;
INSERT INTO lancamentos (slug, nome) VALUES ('pag', 'Páginas');
DO $$
DECLARE r jsonb; v_id bigint := (SELECT id FROM lancamentos WHERE slug = 'pag');
BEGIN
  -- planilha da página Trader importada SEM página (como antes da 004)
  r := importar_planilha(v_id, '[
    {"chave":"1","criado_em":"2026-09-01T10:00:00-03:00","telefone":"59899000001","experiencia":"nunca","grupo":true},
    {"chave":"2","criado_em":"2026-09-01T10:01:00-03:00","telefone":"59899000002","experiencia":"de-1-año","grupo":true},
    {"chave":"3","criado_em":"2026-09-01T10:02:00-03:00","telefone":"59899000003","experiencia":"6-12-meses","grupo":false}]');
  ASSERT (SELECT count(*) FROM inscricoes WHERE lancamento_id = v_id AND pagina_captura IS NULL) = 3, 'sem página';
  -- reimporta informando a página → preenche
  r := importar_planilha(v_id, '[
    {"chave":"1","criado_em":"2026-09-01T10:00:00-03:00","telefone":"59899000001","experiencia":"nunca","grupo":true},
    {"chave":"2","criado_em":"2026-09-01T10:01:00-03:00","telefone":"59899000002","experiencia":"de-1-año","grupo":true},
    {"chave":"3","criado_em":"2026-09-01T10:02:00-03:00","telefone":"59899000003","experiencia":"6-12-meses","grupo":false}]', 'Traders');
  ASSERT (r->>'atualizadas')::int = 3 AND (r->>'novas')::int = 0, 'devia atualizar 3: ' || r::text;
  -- planilha da página Nunca operou
  r := importar_planilha(v_id, '[
    {"chave":"4","criado_em":"2026-09-01T11:00:00-03:00","telefone":"59899000004","experiencia":"nunca","grupo":true},
    {"chave":"5","criado_em":"2026-09-01T11:01:00-03:00","telefone":"59899000005","experiencia":"menos-3-meses","grupo":false}]', 'nunca_operou');
  ASSERT (r->>'novas')::int = 2, 'duas novas';
  -- captura com página
  r := registrar_inscricao('pag', 'X', 'x@x.com', '59899000006', '{}', NULL, '{}', '{"pagina_captura":"trader","experiencia":"nunca"}');
  -- página inválida na importação
  BEGIN PERFORM importar_planilha(v_id, '[]', 'qualquer'); RAISE EXCEPTION 'aceitou página inválida';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE '%aceitou%' THEN RAISE; END IF; END;

  ASSERT (SELECT leads || '/' || no_grupo || '/' || perfil_nunca_operou || '/' || fora_do_publico || '/' || pct_fora_do_publico
            FROM v_resumo_paginas WHERE lancamento_id = v_id AND pagina_captura = 'trader') = '4/2/2/2/50.0',
         'resumo trader: ' || (SELECT row_to_json(x)::text FROM v_resumo_paginas x WHERE lancamento_id = v_id AND pagina_captura = 'trader');
  ASSERT (SELECT leads || '/' || fora_do_publico FROM v_resumo_paginas WHERE lancamento_id = v_id AND pagina_captura = 'nunca_operou') = '2/1',
         'resumo nunca_operou';
  ASSERT (SELECT perfil FROM v_leads_analise WHERE lancamento_id = v_id AND telefone = '59899000005') = 'ja_opera', 'perfil';
END $$;
RESET ROLE;
\echo 'PAGINAS OK'
