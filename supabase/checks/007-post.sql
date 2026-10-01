-- Rodar DEPOIS de 007-registros-evento.sql. Esperado: tudo_ok = true.
WITH t AS (
  SELECT
    to_regclass('public.registros_evento') IS NOT NULL AS tabela_ok,
    (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.registros_evento'::regclass) AS rls_ok,
    (has_table_privilege('service_role', 'public.registros_evento', 'INSERT')
     AND has_table_privilege('service_role', 'public.registros_evento', 'UPDATE')
     AND has_table_privilege('service_role', 'public.registros_evento', 'SELECT')) AS service_role_ok,
    (NOT has_table_privilege('anon', 'public.registros_evento', 'SELECT')
     AND NOT has_table_privilege('authenticated', 'public.registros_evento', 'SELECT')
     AND NOT has_table_privilege('anon', 'public.registros_evento', 'INSERT')) AS anon_bloqueado
)
SELECT t.*, (tabela_ok AND rls_ok AND service_role_ok AND anon_bloqueado) AS tudo_ok FROM t;
