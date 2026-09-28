-- Rodar ANTES de 000-base.sql. Esperado: pronto_para_migrar = true.
SELECT
  current_setting('server_version_num')::int >= 150000                        AS postgres_15_ou_mais,
  (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')) = 3 AS roles_supabase_ok,
  to_regclass('public.lancamentos') IS NULL
    AND to_regclass('public.inscricoes') IS NULL
    AND to_regclass('public.membros_grupo') IS NULL                           AS esquema_vazio,
  (current_setting('server_version_num')::int >= 150000
    AND (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')) = 3
    AND to_regclass('public.lancamentos') IS NULL
    AND to_regclass('public.inscricoes') IS NULL
    AND to_regclass('public.membros_grupo') IS NULL)                          AS pronto_para_migrar;
