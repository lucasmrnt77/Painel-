-- Rodar DEPOIS de 004-paginas-captura.sql. Esperado: tudo_ok = true.
WITH t AS (
  SELECT
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='inscricoes' AND column_name='pagina_captura') AS coluna_ok,
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='v_leads_analise' AND column_name='perfil') AS analise_ok,
    to_regclass('public.v_resumo_paginas') IS NOT NULL AS resumo_ok,
    (SELECT count(*) FROM information_schema.role_table_grants
      WHERE table_schema='public' AND grantee IN ('anon','authenticated','PUBLIC')
        AND table_name IN ('v_leads','v_leads_analise','v_resumo_paginas','inscricoes')) AS grants_expostos,
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname='importar_planilha') AS versoes_importar,
    public.normalizar_pagina_captura('Traders') = 'trader' AND public.normalizar_pagina_captura('nunca-operou') = 'nunca_operou' AS normalizacao_ok,
    public.perfil_experiencia('nunca') = 'nunca_operou' AND public.perfil_experiencia('de-1-año') = 'ja_opera' AS perfil_ok,
    (SELECT count(*) FROM public.v_leads) = (SELECT count(*) FROM public.v_leads_analise) AS contagem_ok
)
SELECT t.*,
  (coluna_ok AND analise_ok AND resumo_ok AND grants_expostos = 0 AND versoes_importar = 1 AND normalizacao_ok AND perfil_ok AND contagem_ok) AS tudo_ok
FROM t;
