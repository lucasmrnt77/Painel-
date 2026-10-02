-- Rodar DEPOIS de 009-eventos-meta.sql. Esperado: tudo_ok = true.
WITH t AS (
  SELECT
    to_regclass('public.eventos_meta') IS NOT NULL AS tabela_ok,
    (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.eventos_meta'::regclass) AS rls_ok,
    (has_table_privilege('service_role', 'public.eventos_meta', 'INSERT')
     AND has_table_privilege('service_role', 'public.eventos_meta', 'UPDATE')
     AND has_table_privilege('service_role', 'public.eventos_meta', 'SELECT')) AS service_role_ok,
    (NOT has_table_privilege('anon', 'public.eventos_meta', 'SELECT')
     AND NOT has_table_privilege('anon', 'public.eventos_meta', 'INSERT')
     AND NOT has_table_privilege('authenticated', 'public.eventos_meta', 'SELECT')) AS anon_bloqueado
)
SELECT t.*, (tabela_ok AND rls_ok AND service_role_ok AND anon_bloqueado) AS tudo_ok FROM t;
