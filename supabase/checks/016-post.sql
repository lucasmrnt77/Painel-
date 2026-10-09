-- Rodar DEPOIS de 016-meta-saude.sql. Esperado: tudo_ok = true.
SELECT (to_regclass('public.meta_saude') IS NOT NULL
  AND NOT has_table_privilege('anon', 'public.meta_saude', 'SELECT')
  AND has_table_privilege('service_role', 'public.meta_saude', 'INSERT')) AS tudo_ok;
