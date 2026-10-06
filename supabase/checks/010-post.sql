-- Rodar DEPOIS de 010-redirecionador.sql. Esperado: tudo_ok = true.
WITH t AS (
  SELECT
    (SELECT count(*) FROM public.redir_funis WHERE slug IN ('trader', 'geral')) = 2 AS funis_ok,
    (SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN ('public.redir_funis'::regclass, 'public.redir_grupos'::regclass,
       'public.redir_cliques'::regclass, 'public.redir_eventos'::regclass)) AS rls_ok,
    (NOT has_table_privilege('anon', 'public.redir_grupos', 'SELECT')
     AND NOT has_function_privilege('anon', 'public.redir_clique(text,text,boolean)', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public.redir_clique(text,text,boolean)', 'EXECUTE')) AS anon_bloqueado,
    has_function_privilege('service_role', 'public.redir_clique(text,text,boolean)', 'EXECUTE') AS service_role_ok
)
SELECT t.*, (funis_ok AND rls_ok AND anon_bloqueado AND service_role_ok) AS tudo_ok FROM t;
