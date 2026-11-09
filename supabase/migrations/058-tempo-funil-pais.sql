-- 058: Tempo na página por funil e país (09/11/2026, pedido do Emi).
-- Mesma base da 053 (visitas_sessao: tempo com a aba visível), agrupada por site (funil) × país e pelo site inteiro
-- (pais = 'Todos'), juntando todas as variações. A mediana é calculada no banco (não dá para somar medianas).
BEGIN;
CREATE OR REPLACE FUNCTION public.engajamento_funil_periodo(p_lancamento bigint, p_de date, p_ate date)
RETURNS TABLE(site text, pais text, visitas bigint, com_tempo bigint, saiu_rapido bigint, rolou_metade bigint,
              inscreveu bigint, mediana_segundos numeric, media_segundos numeric)
LANGUAGE sql STABLE SET search_path = '' AS $$
  WITH vs AS (
    SELECT s.site, public.pais_grupo(s.pais) AS pais, s.segundos, s.rolagem,
           EXISTS (SELECT 1 FROM public.inscricoes i
                    WHERE i.lancamento_id = s.lancamento_id AND i.payload ? 'visita_id' AND i.payload->>'visita_id' = s.id::text) AS inscrito
      FROM public.visitas_sessao s
     WHERE s.lancamento_id = p_lancamento
       AND (p_de IS NULL OR s.dia >= p_de) AND (p_ate IS NULL OR s.dia <= p_ate)
  )
  SELECT vs.site, coalesce(vs.pais, 'Todos'),
         count(*)::bigint,
         count(vs.segundos)::bigint,
         count(*) FILTER (WHERE vs.segundos < 5 AND NOT vs.inscrito)::bigint,
         count(*) FILTER (WHERE vs.rolagem >= 50)::bigint,
         count(*) FILTER (WHERE vs.inscrito)::bigint,
         round((percentile_cont(0.5) WITHIN GROUP (ORDER BY vs.segundos))::numeric, 1),
         round(avg(least(vs.segundos, 600))::numeric, 1)
    FROM vs
   GROUP BY GROUPING SETS ((vs.site, vs.pais), (vs.site))
$$;
REVOKE ALL ON FUNCTION public.engajamento_funil_periodo(bigint, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.engajamento_funil_periodo(bigint, date, date) TO service_role;
COMMIT;
