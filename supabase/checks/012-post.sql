-- Rodar DEPOIS de 012-links.sql. Esperado: tudo_ok = true.
SELECT (
  to_regclass('public.links') IS NOT NULL
  AND to_regclass('public.link_destinos') IS NOT NULL
  AND to_regclass('public.link_cliques') IS NOT NULL
  AND to_regprocedure('public.link_clique(text,boolean,text,text)') IS NOT NULL
  AND to_regprocedure('public.link_salvar(bigint,text,text,boolean,boolean,jsonb)') IS NOT NULL
  AND to_regprocedure('public.links_importar(jsonb)') IS NOT NULL
  AND to_regprocedure('public.links_resumo()') IS NOT NULL
  AND NOT has_table_privilege('anon', 'public.links', 'SELECT')
  AND NOT has_function_privilege('anon', 'public.link_clique(text,boolean,text,text)', 'EXECUTE')
) AS tudo_ok;
