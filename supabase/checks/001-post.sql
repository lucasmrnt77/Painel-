-- Rodar DEPOIS de 001-views.sql. Esperado: tudo_ok = true.
WITH t AS (
  SELECT
    (SELECT count(*) FROM pg_views WHERE schemaname = 'public'
      AND viewname IN ('v_leads','v_membros','v_resumo_lancamentos','v_serie_diaria')) AS views,
    (SELECT count(*) FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND grantee IN ('anon','authenticated','PUBLIC')
        AND table_name IN ('v_leads','v_membros','v_resumo_lancamentos','v_serie_diaria')) AS grants_expostos,
    (SELECT count(*) FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND grantee = 'service_role' AND privilege_type = 'SELECT'
        AND table_name IN ('v_leads','v_membros','v_resumo_lancamentos','v_serie_diaria')) AS selects_service_role,
    (SELECT count(*) FROM public.v_resumo_lancamentos) = (SELECT count(*) FROM public.lancamentos) AS resumo_consistente
)
SELECT t.*,
  (views = 4 AND grants_expostos = 0 AND selects_service_role = 4 AND resumo_consistente) AS tudo_ok
FROM t;
