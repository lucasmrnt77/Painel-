-- Rodar DEPOIS de 005-demografia-e-grupos.sql. Esperado: tudo_ok = true.
WITH t AS (
  SELECT
    (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='inscricoes'
       AND column_name IN ('faixa_etaria','genero','resposta_dinheiro')) AS colunas_novas,
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='v_leads_analise' AND column_name='faixa_etaria_norm') AS analise_ok,
    to_regclass('public.v_resumo_paginas') IS NOT NULL AS resumo_ok,
    (SELECT count(*) FROM information_schema.role_table_grants
      WHERE table_schema='public' AND grantee IN ('anon','authenticated','PUBLIC')
        AND table_name IN ('v_leads','v_leads_analise','v_resumo_paginas')) AS grants_expostos,
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname IN ('importar_entradas_grupo','normalizar_faixa_etaria','normalizar_genero','analise_resumo')
        AND has_function_privilege('service_role', p.oid, 'EXECUTE') AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')) AS funcoes_ok,
    public.normalizar_faixa_etaria('55 a 64 años') = '55–64' AND public.normalizar_faixa_etaria('mayor_65') = '65+'
      AND public.normalizar_genero('Mujer') = 'Mulher' AS normalizacao_ok,
    (SELECT count(*) FROM public.v_leads) = (SELECT count(*) FROM public.v_leads_analise) AS contagem_ok
)
SELECT t.*,
  (colunas_novas = 3 AND analise_ok AND resumo_ok AND grants_expostos = 0 AND funcoes_ok = 4 AND normalizacao_ok AND contagem_ok) AS tudo_ok
FROM t;
