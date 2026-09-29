-- Testes da importação da planilha (depois de comportamento e monitor).
\set ON_ERROR_STOP on
SET ROLE service_role;
INSERT INTO lancamentos (slug, nome) VALUES ('hist', 'Histórico');
CREATE TEMP TABLE hid AS SELECT id FROM lancamentos WHERE slug = 'hist';

DO $$
DECLARE r jsonb; v_id bigint := (SELECT id FROM hid);
  lote jsonb := '[
    {"chave":"a","criado_em":"2026-07-12T05:06:40-03:00","telefone":"541159120671","grupo":false,"experiencia":"nunca","utm_source":"[ADV][AR] Conj|[T] Anuncio1","utm_medium":"Instagram_Feed|[RA] Camp","utm_term":"[T] Anuncio1|999","utm_content":"1"},
    {"chave":"a","criado_em":"2026-07-12T05:06:40-03:00","telefone":"541159120671","grupo":true},
    {"chave":"b","criado_em":"2026-07-12T06:00:00-03:00","telefone":"59899111222","grupo":false,"utm_source":"WhatsApp","utm_medium":"GruposAnteriores"},
    {"chave":"c","criado_em":"2026-07-13T06:00:00-03:00","telefone":"59899111222","grupo":true},
    {"chave":"d","criado_em":"2026-07-13T07:00:00-03:00","telefone":"123","grupo":true}
  ]';
BEGIN
  r := importar_planilha(v_id, lote);
  ASSERT (r->>'novas')::int = 3 AND (r->>'invalidas')::int = 1, 'primeira: ' || r::text;
  r := importar_planilha(v_id, lote);
  ASSERT (r->>'novas')::int = 0 AND (r->>'atualizadas')::int = 0, 'reimportação devia ser neutra: ' || r::text;
  -- a (duplicada) ficou TRUE; b+c mesma pessoa → bool_or TRUE
  ASSERT (SELECT count(*) FROM v_leads WHERE lancamento_id = v_id) = 2, 'duas pessoas';
  ASSERT (SELECT bool_and(status = 'no_grupo') FROM v_leads WHERE lancamento_id = v_id), 'ambas no grupo';
  -- muda o grupo de b e c para FALSE → fora_do_grupo
  r := importar_planilha(v_id, '[{"chave":"b","criado_em":"2026-07-12T06:00:00-03:00","telefone":"59899111222","grupo":false},
                                 {"chave":"c","criado_em":"2026-07-13T06:00:00-03:00","telefone":"59899111222","grupo":false}]');
  ASSERT (r->>'atualizadas')::int = 1, 'só c mudou: ' || r::text;
  ASSERT (SELECT status FROM v_leads WHERE lancamento_id = v_id AND telefone = '59899111222') = 'fora_do_grupo', 'devia ficar fora';
  -- dados do Sendflow prevalecem sobre a planilha
  PERFORM sendflow_registrar_webhook('{}', '[{"tipo":"entrou","telefone":"59899111222"}]', 'webhook', v_id);
  ASSERT (SELECT status FROM v_leads WHERE lancamento_id = v_id AND telefone = '59899111222') = 'no_grupo', 'Sendflow devia prevalecer';
  -- análise
  ASSERT (SELECT conjunto || '/' || anuncio_nome || '/' || posicionamento || '/' || campanha_meta || '/' || anuncio_id || '/' || canal || '/' || pais
            FROM v_leads_analise WHERE lancamento_id = v_id AND telefone = '541159120671')
         = '[ADV][AR] Conj/[T] Anuncio1/Instagram_Feed/[RA] Camp/999/Meta Ads/Argentina', 'dimensões erradas';
  ASSERT (SELECT canal FROM v_leads_analise WHERE lancamento_id = v_id AND telefone = '59899111222') = 'WhatsApp', 'canal WhatsApp';
  -- captura com extras
  r := registrar_inscricao('hist', 'Z', 'z@x.com', '+598 99 333 444', '{}', '/p', '{}', '{"experiencia":"nunca","landing":"Trader-Uruguay"}');
  ASSERT (SELECT experiencia || landing || origem FROM inscricoes WHERE id = (r->>'inscricao_id')::bigint) = 'nuncaTrader-Uruguaycaptura', 'extras';
  -- só grupo/chequeo podem mudar
  BEGIN UPDATE inscricoes SET grupo_informado = true WHERE id = (r->>'inscricao_id')::bigint;
  EXCEPTION WHEN insufficient_privilege THEN RAISE EXCEPTION 'service_role devia poder atualizar grupo_informado'; END;
  BEGIN UPDATE inscricoes SET nome = 'x' WHERE id = (r->>'inscricao_id')::bigint; RAISE EXCEPTION 'nome mudou!';
  EXCEPTION WHEN insufficient_privilege THEN NULL; WHEN raise_exception THEN IF SQLERRM LIKE '%mudou%' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
\echo 'HISTORICO OK'
