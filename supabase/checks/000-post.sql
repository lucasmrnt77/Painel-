-- Rodar DEPOIS de 000-base.sql. Esperado: tudo_ok = true.
WITH t AS (
  SELECT
    (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND c.relname IN ('lancamentos','inscricoes','webhooks_sendflow','eventos_sendflow','membros_grupo')) AS tabelas,
    (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relrowsecurity
        AND c.relname IN ('lancamentos','inscricoes','webhooks_sendflow','eventos_sendflow','membros_grupo')) AS tabelas_com_rls,
    (SELECT count(*) FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND grantee IN ('anon','authenticated','PUBLIC')
        AND table_name IN ('lancamentos','inscricoes','webhooks_sendflow','eventos_sendflow','membros_grupo')) AS grants_expostos,
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('registrar_inscricao','sendflow_registrar_webhook','resolver_lancamento_sendflow','telefone_chave','telefone_digitos')
        AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))) AS funcoes_expostas,
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('registrar_inscricao','sendflow_registrar_webhook')
        AND has_function_privilege('service_role', p.oid, 'EXECUTE')) AS rpcs_service_role,
    (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal
        AND tgname IN ('webhooks_sendflow_append_only','eventos_sendflow_append_only','inscricoes_sem_update')) AS triggers,
    public.telefone_chave('099 123 456') = public.telefone_chave('+598 99 123 456')              AS chave_uy_ok,
    public.telefone_chave('11 15 1234-5678') = public.telefone_chave('5491112345678@s.whatsapp.net') AS chave_ar_ok,
    public.telefone_chave('(11) 91234-5678') = public.telefone_chave('551112345678')              AS chave_br_ok
)
SELECT t.*,
  (tabelas = 5 AND tabelas_com_rls = 5 AND grants_expostos = 0 AND funcoes_expostas = 0
   AND rpcs_service_role = 2 AND triggers = 3 AND chave_uy_ok AND chave_ar_ok AND chave_br_ok) AS tudo_ok
FROM t;
