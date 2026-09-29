-- Rodar DEPOIS de 003-historico.sql. Esperado: tudo_ok = true.
WITH t AS (
  SELECT
    (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='inscricoes'
       AND column_name IN ('origem','experiencia','landing','pagina_obrigado','grupo_informado','chave_importacao')) AS colunas_novas,
    (SELECT count(*) FROM public.inscricoes WHERE origem <> 'captura') AS inscricoes_nao_captura,
    to_regclass('public.v_leads_analise') IS NOT NULL AS view_analise,
    (SELECT count(*) FROM information_schema.role_table_grants
      WHERE table_schema='public' AND grantee IN ('anon','authenticated','PUBLIC')
        AND table_name IN ('v_leads','v_leads_analise','inscricoes')) AS grants_expostos,
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname='registrar_inscricao') AS versoes_registrar_inscricao,
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname IN ('importar_planilha','pais_do_telefone','registrar_inscricao')
        AND has_function_privilege('service_role', p.oid, 'EXECUTE')
        AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')) AS funcoes_ok,
    public.pais_do_telefone('59899123456') = 'Uruguai' AND public.pais_do_telefone('099123456') IS NULL AS pais_ok,
    (SELECT count(*) FROM public.v_leads) = (SELECT count(DISTINCT (lancamento_id, coalesce(telefone_chave, 'id:' || id))) FROM public.inscricoes) AS v_leads_ok
)
SELECT t.*,
  (colunas_novas = 6 AND inscricoes_nao_captura = 0 AND view_analise AND grants_expostos = 0
   AND versoes_registrar_inscricao = 1 AND funcoes_ok = 3 AND pais_ok AND v_leads_ok) AS tudo_ok
FROM t;
