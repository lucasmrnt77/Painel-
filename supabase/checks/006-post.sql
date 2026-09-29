-- Rodar DEPOIS de 006-estatisticas.sql. Esperado: tudo_ok = true.
WITH t AS (
  SELECT
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'atualizar_estatisticas' AND p.prosecdef) AS funcao_ok,
    (SELECT has_function_privilege('service_role', 'public.atualizar_estatisticas()', 'EXECUTE')) AS service_role_ok,
    (SELECT NOT has_function_privilege('anon', 'public.atualizar_estatisticas()', 'EXECUTE')
        AND NOT has_function_privilege('authenticated', 'public.atualizar_estatisticas()', 'EXECUTE')) AS anon_bloqueado
)
SELECT t.*, (funcao_ok AND service_role_ok AND anon_bloqueado) AS tudo_ok FROM t;
