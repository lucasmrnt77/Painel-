-- Rodar DEPOIS de 002-monitor.sql. Esperado: tudo_ok = true.
WITH t AS (
  SELECT
    (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'lancamentos'
       AND column_name IN ('monitor_ativo','monitor_ligado_em','alerta_minutos_sem_entrada','resumo_minutos','alerta_telefones')) AS colunas_monitor,
    (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.alertas'::regclass) AS alertas_rls,
    (SELECT count(*) FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND grantee IN ('anon','authenticated','PUBLIC')
        AND table_name IN ('alertas','v_serie_horaria')) AS grants_expostos,
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('monitor_janela','monitor_situacao','monitor_avaliar','monitor_registrar_alerta','monitor_definir')
        AND has_function_privilege('service_role', p.oid, 'EXECUTE')
        AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')) AS funcoes_ok,
    (SELECT count(*) FROM public.lancamentos WHERE monitor_ativo) AS monitores_ligados
)
SELECT t.*,
  (colunas_monitor = 5 AND alertas_rls AND grants_expostos = 0 AND funcoes_ok = 5 AND monitores_ligados = 0) AS tudo_ok
FROM t;
