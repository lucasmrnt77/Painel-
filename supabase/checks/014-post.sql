-- Rodar DEPOIS de 014-testes-automaticos.sql. Esperado: tudo_ok = true.
SELECT (
  to_regclass('public.testes_execucoes') IS NOT NULL
  AND NOT has_table_privilege('anon', 'public.testes_execucoes', 'SELECT')
  AND has_table_privilege('service_role', 'public.testes_execucoes', 'INSERT')
  AND has_table_privilege('service_role', 'public.eventos_meta', 'DELETE')
) AS tudo_ok;
