-- 060: Decisão por anúncio (18/11/2026) — tudo que um anúncio já trouxe, somado desde o primeiro dia:
-- verba e visitas (base da Meta, pc_ads_meta_anuncio_dia) e, do painel, leads, qualificados (o mesmo evento
-- que vai para a Meta) e quem entrou no grupo. O lead chega ao anúncio pelo id no utm_term ("… | <ad_id>"),
-- a mesma regra das visões pc_ da Paola. Só lê; não altera nenhuma tabela.
BEGIN;
CREATE OR REPLACE FUNCTION public.decisao_anuncios(p_lancamento bigint)
RETURNS TABLE(ad_id text, funil text, pais text, campanha text, publico text, criativo text, ad_status text,
              investimento numeric, visitas bigint, primeiro_dia date, ultimo_dia date,
              leads bigint, qualificados bigint, no_grupo bigint, qualificados_no_grupo bigint)
LANGUAGE sql STABLE SET search_path = '' AS $$
  WITH l AS (
    SELECT x.id, x.ads_lancamento FROM public.lancamentos x WHERE x.id = p_lancamento
  ), ads AS (
    SELECT a.ad_id, max(a.funil) AS funil, max(a.pais) AS pais, max(a.campanha) AS campanha, max(a.publico) AS publico,
           max(a.criativo) AS criativo, (array_agg(a.ad_status ORDER BY a.data DESC, a.atualizado_em DESC))[1] AS ad_status,
           sum(a.investimento)::numeric AS investimento, sum(a.visitou_pagina)::bigint AS visitas,
           min(a.data) AS primeiro_dia, max(a.data) AS ultimo_dia
      FROM public.pc_ads_meta_anuncio_dia a JOIN l ON a.lancamento = l.ads_lancamento
     GROUP BY a.ad_id
  ), ins AS (
    SELECT coalesce(substring(i.utm_term FROM '\|\s*([0-9]+)\s*$'),
                    CASE WHEN i.utm_term ~ '^\s*[0-9]+\s*$' THEN btrim(i.utm_term) END) AS ad_id,
           i.telefone_chave, i.criado_em
      FROM public.pc_inscricoes_validas i WHERE i.lancamento_id = p_lancamento
  ), x AS (
    SELECT ins.ad_id,
           EXISTS (SELECT 1 FROM public.eventos_meta e
                    WHERE e.telefone_chave = ins.telefone_chave AND e.acao = 'qualificacao' AND e.qualificado AND NOT e.teste
                      AND e.criado_em BETWEEN ins.criado_em - interval '10 minutes' AND ins.criado_em + interval '1 day') AS qual,
           EXISTS (SELECT 1 FROM public.membros_grupo m
                    WHERE m.lancamento_id = p_lancamento AND m.telefone_chave = ins.telefone_chave) AS grupo
      FROM ins WHERE ins.ad_id IS NOT NULL
  ), c AS (
    SELECT x.ad_id, count(*) AS leads, count(*) FILTER (WHERE x.qual) AS qualificados,
           count(*) FILTER (WHERE x.grupo) AS no_grupo, count(*) FILTER (WHERE x.qual AND x.grupo) AS qualificados_no_grupo
      FROM x GROUP BY x.ad_id
  )
  SELECT ads.ad_id, ads.funil, ads.pais, ads.campanha, ads.publico, ads.criativo, ads.ad_status,
         ads.investimento, ads.visitas, ads.primeiro_dia, ads.ultimo_dia,
         coalesce(c.leads, 0), coalesce(c.qualificados, 0), coalesce(c.no_grupo, 0), coalesce(c.qualificados_no_grupo, 0)
    FROM ads LEFT JOIN c ON c.ad_id = ads.ad_id
$$;
REVOKE ALL ON FUNCTION public.decisao_anuncios(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decisao_anuncios(bigint) TO service_role;
COMMIT;
