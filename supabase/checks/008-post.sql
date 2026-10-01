-- Rodar DEPOIS de 008-perfil-pos-cadastro.sql. Esperado: tudo_ok = true.
WITH t AS (
  SELECT
    EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'registrar_perfil') AS funcao_ok,
    has_function_privilege('service_role', 'public.registrar_perfil(text, text, text, text, text)', 'EXECUTE') AS service_role_ok,
    (NOT has_function_privilege('anon', 'public.registrar_perfil(text, text, text, text, text)', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public.registrar_perfil(text, text, text, text, text)', 'EXECUTE')) AS anon_bloqueado,
    (has_column_privilege('service_role', 'public.inscricoes', 'faixa_etaria', 'UPDATE')
     AND has_column_privilege('service_role', 'public.inscricoes', 'genero', 'UPDATE')
     AND has_column_privilege('service_role', 'public.inscricoes', 'resposta_dinheiro', 'UPDATE')) AS colunas_ok
    -- o resto da linha continua protegido pelo trigger inscricoes_so_planilha (testado em tests/perfil.sql)
)
SELECT t.*, (funcao_ok AND service_role_ok AND anon_bloqueado AND colunas_ok) AS tudo_ok FROM t;
