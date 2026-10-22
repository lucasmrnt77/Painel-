-- 036: Gracias por landing no período — para a aba Páginas, com um teste aberto, mostrar as gracias
--  só dos leads que vieram das páginas do teste (antes somava as gracias do site inteiro).
--  Só uma função nova: nada muda nas views nem nas funções que já existem.
BEGIN;

CREATE OR REPLACE FUNCTION public.metricas_gracias_landing_periodo(p_lancamento bigint, p_de date, p_ate date)
RETURNS TABLE (site text, landing text, pagina_obrigado text, leads bigint, comecaram bigint, responderam bigint,
               qualificados bigint, nao_qualificados bigint, no_grupo bigint)
LANGUAGE sql STABLE SET search_path TO '' AS $$
  SELECT f.site, f.landing, f.pagina_obrigado, count(*),
         count(*) FILTER (WHERE f.comecou), count(*) FILTER (WHERE f.respondeu),
         count(*) FILTER (WHERE f.qualificado), count(*) FILTER (WHERE f.qualificado = false),
         count(*) FILTER (WHERE f.no_grupo)
    FROM public.v_leads_funil f
   WHERE f.lancamento_id = p_lancamento
     AND (p_de IS NULL OR public.dia_uy(f.inscrito_em) >= p_de)
     AND (p_ate IS NULL OR public.dia_uy(f.inscrito_em) <= p_ate)
   GROUP BY f.site, f.landing, f.pagina_obrigado
$$;

REVOKE ALL ON FUNCTION public.metricas_gracias_landing_periodo(bigint, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.metricas_gracias_landing_periodo(bigint, date, date) TO service_role;

COMMIT;
