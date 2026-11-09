-- 055: Custo por lead NO GRUPO (09/11/2026, pedido do gestor de tráfego).
--  gasto na Meta (pc_ads_meta_anuncio_dia, lançamento de lancamentos.ads_lancamento) ÷ leads que entraram em um grupo.
--  Por dia (horário do Uruguai) e funil:
--    general   = página General
--    trader    = página Trader (inclui quem marcou "nunca operou" e entrou no grupo do General — veio dos anúncios do Trader)
--    jubilados = páginas Jubilar + General Jubilados (as campanhas [GEN/JUB] e [Jubilados] ficam no funil "jubilados" da Meta)
--  Lead = pessoa (1ª inscrição no lançamento), contada no dia em que se inscreveu. Só leitura.
BEGIN;
CREATE OR REPLACE FUNCTION public.custo_grupo_dia(p_lancamento bigint)
RETURNS TABLE(dia date, funil text, investimento numeric, leads bigint, no_grupo bigint)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH l0 AS (SELECT ads_lancamento FROM public.lancamentos WHERE id = p_lancamento),
  g AS (
    SELECT a.data::date AS dia,
           CASE lower(a.funil) WHEN 'general' THEN 'general' WHEN 'trader' THEN 'trader' ELSE 'jubilados' END AS funil,
           sum(a.investimento) AS investimento
      FROM public.pc_ads_meta_anuncio_dia a, l0
     WHERE a.lancamento = l0.ads_lancamento
     GROUP BY 1, 2
  ), l AS (
    SELECT public.dia_uy(f.inscrito_em) AS dia,
           CASE f.site WHEN 'General' THEN 'general' WHEN 'Trader' THEN 'trader' ELSE 'jubilados' END AS funil,
           count(*) AS leads, count(*) FILTER (WHERE f.no_grupo) AS no_grupo
      FROM public.v_leads_funil f
     WHERE f.lancamento_id = p_lancamento AND f.site IS NOT NULL
     GROUP BY 1, 2
  )
  SELECT coalesce(g.dia, l.dia), coalesce(g.funil, l.funil), coalesce(g.investimento, 0),
         coalesce(l.leads, 0), coalesce(l.no_grupo, 0)
    FROM g FULL JOIN l ON l.dia = g.dia AND l.funil = g.funil
   ORDER BY 1 DESC, 2
$$;
REVOKE ALL ON FUNCTION public.custo_grupo_dia(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.custo_grupo_dia(bigint) TO service_role;
COMMIT;
