-- 042: quadro "variação × país" com quem entrou no grupo do WhatsApp (no_grupo), pedido de 28/10/2026.
-- Só acrescenta a coluna no_grupo (no fim) na view e na função por período; nada muda nas colunas atuais.

CREATE OR REPLACE VIEW public.v_metricas_landing_pais AS
 WITH l AS (
         SELECT v_leads_funil.lancamento_id,
            v_leads_funil.site,
            v_leads_funil.landing,
            public.pais_grupo(v_leads_funil.pais) AS pais,
            count(*) AS leads,
            count(*) FILTER (WHERE v_leads_funil.respondeu) AS responderam,
            count(*) FILTER (WHERE v_leads_funil.qualificado) AS qualificados,
            count(*) FILTER (WHERE v_leads_funil.no_grupo) AS no_grupo
           FROM public.v_leads_funil
          GROUP BY v_leads_funil.lancamento_id, v_leads_funil.site, v_leads_funil.landing, (public.pais_grupo(v_leads_funil.pais))
        ), vi AS (
         SELECT visitas_pagina.lancamento_id,
            visitas_pagina.site,
            public.pagina_padrao(visitas_pagina.landing) AS landing,
            public.pais_grupo(visitas_pagina.pais) AS pais,
            (sum(visitas_pagina.visitas))::bigint AS visitas
           FROM public.visitas_pagina
          GROUP BY visitas_pagina.lancamento_id, visitas_pagina.site, (public.pagina_padrao(visitas_pagina.landing)), (public.pais_grupo(visitas_pagina.pais))
        )
 SELECT COALESCE(l.lancamento_id, vi.lancamento_id) AS lancamento_id,
    COALESCE(l.site, vi.site) AS site,
    COALESCE(l.landing, vi.landing) AS landing,
    COALESCE(l.pais, vi.pais) AS pais,
    COALESCE(vi.visitas, (0)::bigint) AS visitas,
    COALESCE(l.leads, (0)::bigint) AS leads,
    COALESCE(l.responderam, (0)::bigint) AS responderam,
    COALESCE(l.qualificados, (0)::bigint) AS qualificados,
    COALESCE(l.no_grupo, (0)::bigint) AS no_grupo
   FROM (l
     FULL JOIN vi ON (((vi.lancamento_id = l.lancamento_id) AND (vi.site = l.site) AND (vi.landing = l.landing) AND (vi.pais = l.pais))));

-- A função muda o tipo de retorno (coluna nova): precisa recriar.
DROP FUNCTION public.metricas_landing_pais_periodo(bigint, date, date);
CREATE FUNCTION public.metricas_landing_pais_periodo(p_lancamento bigint, p_de date, p_ate date)
 RETURNS TABLE(site text, landing text, pais text, visitas bigint, leads bigint, responderam bigint, qualificados bigint, no_grupo bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  WITH l AS (
    SELECT f.site, f.landing, public.pais_grupo(f.pais) AS pais, count(*) AS leads,
           count(*) FILTER (WHERE f.respondeu) AS responderam,
           count(*) FILTER (WHERE f.qualificado) AS qualificados,
           count(*) FILTER (WHERE f.no_grupo) AS no_grupo
      FROM public.v_leads_funil f
     WHERE f.lancamento_id = p_lancamento
       AND (p_de IS NULL OR public.dia_uy(f.inscrito_em) >= p_de)
       AND (p_ate IS NULL OR public.dia_uy(f.inscrito_em) <= p_ate)
     GROUP BY f.site, f.landing, public.pais_grupo(f.pais)
  ), vi AS (
    SELECT v.site, public.pagina_padrao(v.landing) AS landing, public.pais_grupo(v.pais) AS pais, sum(v.visitas)::bigint AS visitas
      FROM public.visitas_pagina v
     WHERE v.lancamento_id = p_lancamento
       AND (p_de IS NULL OR v.dia >= p_de) AND (p_ate IS NULL OR v.dia <= p_ate)
     GROUP BY v.site, public.pagina_padrao(v.landing), public.pais_grupo(v.pais)
  )
  SELECT COALESCE(l.site, vi.site), COALESCE(l.landing, vi.landing), COALESCE(l.pais, vi.pais), COALESCE(vi.visitas, 0),
         COALESCE(l.leads, 0), COALESCE(l.responderam, 0), COALESCE(l.qualificados, 0), COALESCE(l.no_grupo, 0)
    FROM l FULL JOIN vi ON vi.site = l.site AND vi.landing = l.landing AND vi.pais = l.pais
$function$;

REVOKE ALL ON FUNCTION public.metricas_landing_pais_periodo(bigint, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.metricas_landing_pais_periodo(bigint, date, date) TO service_role;
