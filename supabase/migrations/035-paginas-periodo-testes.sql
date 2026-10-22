-- 035: Aba Páginas filtrada por período (testes A/B de 3 dias: headline, estrutura, imagem).
--  * v_leads_funil ganha a coluna inscrito_em no fim (a 1ª inscrição da pessoa no lançamento).
--    Nada muda nos números que já existem: só uma coluna nova.
--  * metricas_landing_periodo / metricas_gracias_periodo / metricas_cruzado_periodo / metricas_landing_pais_periodo:
--    os mesmos números das views v_metricas_*, só com as pessoas que se inscreveram entre p_de e p_ate
--    e as visitas desses dias (datas no fuso de Montevidéu, igual às visitas). NULL = sem limite.
--  * leads_anuncio_periodo: o mesmo da v_leads_anuncio (leads por anúncio × página), só no período.
--  * testes_paginas: testes salvos por lançamento (nome + páginas + início + fim) para abrir num clique
--    só as páginas do teste, com os dados da página e da Meta do período.
BEGIN;

CREATE OR REPLACE VIEW public.v_leads_funil AS
 WITH perfil AS (
         SELECT inscricoes.lancamento_id,
            inscricoes.telefone_chave,
            bool_or(inscricoes.resposta_dinheiro IS NOT NULL) AS respondeu,
            bool_or(inscricoes.faixa_etaria IS NOT NULL OR inscricoes.genero IS NOT NULL OR inscricoes.resposta_dinheiro IS NOT NULL) AS comecou,
            bool_or(inscricoes.qualificado) AS qualificado
           FROM inscricoes
          WHERE inscricoes.telefone_chave IS NOT NULL
          GROUP BY inscricoes.lancamento_id, inscricoes.telefone_chave
        )
 SELECT v.lancamento_id,
    COALESCE(pagina_padrao(NULLIF(v.landing, ''::text)), '(sem landing)'::text) AS landing,
    COALESCE(pagina_padrao(NULLIF(v.pagina_obrigado, ''::text)), '(sem gracias)'::text) AS pagina_obrigado,
    COALESCE(pais_do_telefone(v.telefone), 'Sem DDI'::text) AS pais,
    v.no_grupo,
    COALESCE(p.comecou, false) AS comecou,
    COALESCE(p.respondeu, false) AS respondeu,
    p.qualificado,
    v.site,
    v.inscrito_em
   FROM v_leads v
     LEFT JOIN perfil p ON p.lancamento_id = v.lancamento_id AND p.telefone_chave = v.telefone_chave;

-- Dia da inscrição no fuso das visitas
CREATE OR REPLACE FUNCTION public.dia_uy(t timestamptz)
RETURNS date LANGUAGE sql IMMUTABLE SET search_path TO '' AS $$
  SELECT (t AT TIME ZONE 'America/Montevideo')::date
$$;

CREATE OR REPLACE FUNCTION public.metricas_landing_periodo(p_lancamento bigint, p_de date, p_ate date)
RETURNS TABLE (site text, landing text, visitas bigint, leads bigint, comecaram bigint, responderam bigint,
               qualificados bigint, nao_qualificados bigint, no_grupo bigint)
LANGUAGE sql STABLE SET search_path TO '' AS $$
  WITH f AS (
    SELECT * FROM public.v_leads_funil x
     WHERE x.lancamento_id = p_lancamento
       AND (p_de IS NULL OR public.dia_uy(x.inscrito_em) >= p_de)
       AND (p_ate IS NULL OR public.dia_uy(x.inscrito_em) <= p_ate)
  ), l AS (
    SELECT f.site, f.landing, count(*) AS leads,
           count(*) FILTER (WHERE f.comecou) AS comecaram,
           count(*) FILTER (WHERE f.respondeu) AS responderam,
           count(*) FILTER (WHERE f.qualificado) AS qualificados,
           count(*) FILTER (WHERE f.qualificado = false) AS nao_qualificados,
           count(*) FILTER (WHERE f.no_grupo) AS no_grupo
      FROM f GROUP BY f.site, f.landing
  ), vi AS (
    SELECT v.site, public.pagina_padrao(v.landing) AS landing, sum(v.visitas)::bigint AS visitas
      FROM public.visitas_pagina v
     WHERE v.lancamento_id = p_lancamento
       AND (p_de IS NULL OR v.dia >= p_de) AND (p_ate IS NULL OR v.dia <= p_ate)
     GROUP BY v.site, public.pagina_padrao(v.landing)
  )
  SELECT COALESCE(l.site, vi.site), COALESCE(l.landing, vi.landing), COALESCE(vi.visitas, 0), COALESCE(l.leads, 0),
         COALESCE(l.comecaram, 0), COALESCE(l.responderam, 0), COALESCE(l.qualificados, 0), COALESCE(l.nao_qualificados, 0),
         COALESCE(l.no_grupo, 0)
    FROM l FULL JOIN vi ON vi.site = l.site AND vi.landing = l.landing
$$;

CREATE OR REPLACE FUNCTION public.metricas_gracias_periodo(p_lancamento bigint, p_de date, p_ate date)
RETURNS TABLE (site text, pagina_obrigado text, leads bigint, comecaram bigint, responderam bigint,
               qualificados bigint, nao_qualificados bigint, no_grupo bigint)
LANGUAGE sql STABLE SET search_path TO '' AS $$
  SELECT f.site, f.pagina_obrigado, count(*),
         count(*) FILTER (WHERE f.comecou), count(*) FILTER (WHERE f.respondeu),
         count(*) FILTER (WHERE f.qualificado), count(*) FILTER (WHERE f.qualificado = false),
         count(*) FILTER (WHERE f.no_grupo)
    FROM public.v_leads_funil f
   WHERE f.lancamento_id = p_lancamento
     AND (p_de IS NULL OR public.dia_uy(f.inscrito_em) >= p_de)
     AND (p_ate IS NULL OR public.dia_uy(f.inscrito_em) <= p_ate)
   GROUP BY f.site, f.pagina_obrigado
$$;

CREATE OR REPLACE FUNCTION public.metricas_cruzado_periodo(p_lancamento bigint, p_de date, p_ate date)
RETURNS TABLE (site text, landing text, pagina_obrigado text, leads bigint, qualificados bigint, no_grupo bigint)
LANGUAGE sql STABLE SET search_path TO '' AS $$
  SELECT f.site, f.landing, f.pagina_obrigado, count(*),
         count(*) FILTER (WHERE f.qualificado), count(*) FILTER (WHERE f.no_grupo)
    FROM public.v_leads_funil f
   WHERE f.lancamento_id = p_lancamento
     AND (p_de IS NULL OR public.dia_uy(f.inscrito_em) >= p_de)
     AND (p_ate IS NULL OR public.dia_uy(f.inscrito_em) <= p_ate)
   GROUP BY f.site, f.landing, f.pagina_obrigado
$$;

CREATE OR REPLACE FUNCTION public.metricas_landing_pais_periodo(p_lancamento bigint, p_de date, p_ate date)
RETURNS TABLE (site text, landing text, pais text, visitas bigint, leads bigint, responderam bigint, qualificados bigint)
LANGUAGE sql STABLE SET search_path TO '' AS $$
  WITH l AS (
    SELECT f.site, f.landing, public.pais_grupo(f.pais) AS pais, count(*) AS leads,
           count(*) FILTER (WHERE f.respondeu) AS responderam,
           count(*) FILTER (WHERE f.qualificado) AS qualificados
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
         COALESCE(l.leads, 0), COALESCE(l.responderam, 0), COALESCE(l.qualificados, 0)
    FROM l FULL JOIN vi ON vi.site = l.site AND vi.landing = l.landing AND vi.pais = l.pais
$$;

CREATE OR REPLACE FUNCTION public.leads_anuncio_periodo(p_lancamento bigint, p_de date, p_ate date)
RETURNS TABLE (anuncio text, site text, landing text, leads bigint, responderam bigint, qualificados bigint)
LANGUAGE sql STABLE SET search_path TO '' AS $$
  WITH perfil AS (
    SELECT i.telefone_chave, bool_or(i.qualificado) AS qualificado, bool_or(i.resposta_dinheiro IS NOT NULL) AS respondeu
      FROM public.inscricoes i
     WHERE i.lancamento_id = p_lancamento AND i.telefone_chave IS NOT NULL
     GROUP BY i.telefone_chave
  )
  SELECT public.anuncio_da_inscricao(v.utm_source, v.utm_content), v.site,
         COALESCE(public.pagina_padrao(NULLIF(v.landing, '')), '(sem landing)'),
         count(*), count(*) FILTER (WHERE p.respondeu), count(*) FILTER (WHERE p.qualificado)
    FROM public.v_leads v
    LEFT JOIN perfil p ON p.telefone_chave = v.telefone_chave
   WHERE v.lancamento_id = p_lancamento
     AND (p_de IS NULL OR public.dia_uy(v.inscrito_em) >= p_de)
     AND (p_ate IS NULL OR public.dia_uy(v.inscrito_em) <= p_ate)
   GROUP BY 1, 2, 3
$$;

CREATE TABLE IF NOT EXISTS public.testes_paginas (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lancamento_id  bigint NOT NULL REFERENCES public.lancamentos(id) ON DELETE CASCADE,
  nome           text NOT NULL CHECK (length(btrim(nome)) BETWEEN 1 AND 80),
  paginas        text[] NOT NULL DEFAULT '{}' CHECK (cardinality(paginas) <= 30), -- "Trader/v1", "General/v2", "Jubilar"
  inicio         date NOT NULL,
  fim            date NOT NULL,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  CHECK (fim >= inicio)
);
CREATE INDEX IF NOT EXISTS testes_paginas_lancamento ON public.testes_paginas (lancamento_id, inicio);

REVOKE ALL ON public.testes_paginas FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.testes_paginas TO service_role;
ALTER TABLE public.testes_paginas ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON FUNCTION public.metricas_landing_periodo(bigint, date, date), public.metricas_gracias_periodo(bigint, date, date),
  public.metricas_cruzado_periodo(bigint, date, date), public.metricas_landing_pais_periodo(bigint, date, date), public.leads_anuncio_periodo(bigint, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.metricas_landing_periodo(bigint, date, date), public.metricas_gracias_periodo(bigint, date, date),
  public.metricas_cruzado_periodo(bigint, date, date), public.metricas_landing_pais_periodo(bigint, date, date), public.leads_anuncio_periodo(bigint, date, date) TO service_role;

COMMIT;
