-- 026: Nomenclatura única das páginas (General e Trader): /v1, /v2, /v3… e /gracias-v1, /gracias-v2…
--  * public.pagina_padrao(texto): traduz os nomes antigos para o padrão
--      /t1 → /v1 (Trader) · /gracias-a → /gracias-v1 · /gracias-trader-b → /gracias-v2 …
--    Os outros nomes (/, /v1, /gracias-video-general, Gen-Argentina…) ficam como estão.
--  * public.site_da_pagina(pagina_captura): "General" ou "Trader" — como as duas páginas usam os mesmos
--    endereços, as métricas passam a separar por site.
--  * visitas_pagina ganha a coluna site (o painel descobre pelo domínio de onde veio a visita).
--  * v_leads_funil, v_leads_analise e as métricas da aba Páginas usam os nomes padronizados.
BEGIN;

CREATE OR REPLACE FUNCTION public.pagina_padrao(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO '' AS $$
  SELECT CASE
    WHEN p ~ '^/t[0-9]+$'                      THEN '/v' || substr(p, 3)
    WHEN p ~ '^/gracias-(trader-)?[a-z]$'      THEN '/gracias-v' || (ascii(right(p, 1)) - 96)::text
    ELSE p
  END
$$;

CREATE OR REPLACE FUNCTION public.site_da_pagina(p_pagina_captura text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO '' AS $$
  SELECT CASE p_pagina_captura WHEN 'trader' THEN 'Trader' WHEN 'nunca_operou' THEN 'General' ELSE '—' END
$$;

-- Visitas: site (general/trader)
ALTER TABLE public.visitas_pagina ADD COLUMN IF NOT EXISTS site text NOT NULL DEFAULT 'General';
UPDATE public.visitas_pagina SET site = 'Trader' WHERE landing ~ '^/t[0-9]+$' AND site <> 'Trader';
ALTER TABLE public.visitas_pagina DROP CONSTRAINT IF EXISTS visitas_pagina_site_check;
ALTER TABLE public.visitas_pagina ADD CONSTRAINT visitas_pagina_site_check CHECK (site IN ('General', 'Trader'));
ALTER TABLE public.visitas_pagina DROP CONSTRAINT visitas_pagina_pkey;
ALTER TABLE public.visitas_pagina ADD PRIMARY KEY (dia, lancamento_id, site, landing, pais);

DROP FUNCTION IF EXISTS public.registrar_visita(text, text, text);
CREATE OR REPLACE FUNCTION public.registrar_visita(p_lancamento_slug text, p_landing text, p_pais text, p_site text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_lanc    bigint;
  v_landing text := btrim(coalesce(p_landing, ''));
  v_pais    text := coalesce(nullif(upper(left(btrim(coalesce(p_pais, '')), 2)), ''), '??');
  v_site    text := CASE WHEN lower(coalesce(p_site, '')) = 'trader' OR btrim(coalesce(p_landing, '')) ~ '^/t[0-9]+$' THEN 'Trader' ELSE 'General' END;
BEGIN
  IF v_landing !~ '^/[A-Za-z0-9_/-]{0,60}$' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'landing_invalida');
  END IF;
  IF p_lancamento_slug IS NOT NULL AND btrim(p_lancamento_slug) <> '' THEN
    SELECT id INTO v_lanc FROM public.lancamentos WHERE slug = lower(btrim(p_lancamento_slug));
  ELSE
    SELECT id INTO v_lanc FROM public.lancamentos WHERE ativo AND tipo = 'lancamento' LIMIT 1;
  END IF;
  IF v_lanc IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_lancamento');
  END IF;

  INSERT INTO public.visitas_pagina AS v (dia, lancamento_id, site, landing, pais, visitas)
  VALUES ((now() AT TIME ZONE 'America/Montevideo')::date, v_lanc, v_site, v_landing, v_pais, 1)
  ON CONFLICT (dia, lancamento_id, site, landing, pais) DO UPDATE SET visitas = v.visitas + 1;

  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.registrar_visita(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_visita(text, text, text, text) TO service_role;

-- Funil por pessoa: nomes padronizados + site (coluna nova no fim)
CREATE OR REPLACE VIEW public.v_leads_funil WITH (security_invoker = true) AS
WITH perfil AS (
  SELECT lancamento_id, telefone_chave,
         bool_or(resposta_dinheiro IS NOT NULL)                         AS respondeu,
         bool_or(faixa_etaria IS NOT NULL OR genero IS NOT NULL
                 OR resposta_dinheiro IS NOT NULL)                      AS comecou,
         bool_or(qualificado)                                           AS qualificado
    FROM public.inscricoes
   WHERE telefone_chave IS NOT NULL
   GROUP BY lancamento_id, telefone_chave
)
SELECT v.lancamento_id,
       coalesce(public.pagina_padrao(nullif(v.landing, '')), '(sem landing)')         AS landing,
       coalesce(public.pagina_padrao(nullif(v.pagina_obrigado, '')), '(sem gracias)') AS pagina_obrigado,
       coalesce(public.pais_do_telefone(v.telefone), 'Sem DDI')                      AS pais,
       v.no_grupo,
       coalesce(p.comecou, false)                                                    AS comecou,
       coalesce(p.respondeu, false)                                                  AS respondeu,
       p.qualificado,
       public.site_da_pagina(v.pagina_captura)                                       AS site
  FROM public.v_leads v
  LEFT JOIN perfil p ON p.lancamento_id = v.lancamento_id AND p.telefone_chave = v.telefone_chave;

DROP VIEW IF EXISTS public.v_metricas_landing;
DROP VIEW IF EXISTS public.v_metricas_gracias;
DROP VIEW IF EXISTS public.v_metricas_cruzado;

CREATE VIEW public.v_metricas_landing WITH (security_invoker = true) AS
WITH l AS (
  SELECT lancamento_id, site, landing,
         count(*)                                    AS leads,
         count(*) FILTER (WHERE comecou)             AS comecaram,
         count(*) FILTER (WHERE respondeu)           AS responderam,
         count(*) FILTER (WHERE qualificado)         AS qualificados,
         count(*) FILTER (WHERE qualificado = false) AS nao_qualificados,
         count(*) FILTER (WHERE no_grupo)            AS no_grupo
    FROM public.v_leads_funil GROUP BY 1, 2, 3
), vi AS (
  SELECT lancamento_id, site, public.pagina_padrao(landing) AS landing, sum(visitas)::bigint AS visitas
    FROM public.visitas_pagina GROUP BY 1, 2, 3
)
SELECT coalesce(l.lancamento_id, vi.lancamento_id) AS lancamento_id,
       coalesce(l.site, vi.site)                   AS site,
       coalesce(l.landing, vi.landing)             AS landing,
       coalesce(vi.visitas, 0)                     AS visitas,
       coalesce(l.leads, 0)                        AS leads,
       coalesce(l.comecaram, 0)                    AS comecaram,
       coalesce(l.responderam, 0)                  AS responderam,
       coalesce(l.qualificados, 0)                 AS qualificados,
       coalesce(l.nao_qualificados, 0)             AS nao_qualificados,
       coalesce(l.no_grupo, 0)                     AS no_grupo
  FROM l FULL JOIN vi ON vi.lancamento_id = l.lancamento_id AND vi.site = l.site AND vi.landing = l.landing;

CREATE VIEW public.v_metricas_gracias WITH (security_invoker = true) AS
SELECT lancamento_id, site, pagina_obrigado,
       count(*)                                    AS leads,
       count(*) FILTER (WHERE comecou)             AS comecaram,
       count(*) FILTER (WHERE respondeu)           AS responderam,
       count(*) FILTER (WHERE qualificado)         AS qualificados,
       count(*) FILTER (WHERE qualificado = false) AS nao_qualificados,
       count(*) FILTER (WHERE no_grupo)            AS no_grupo
  FROM public.v_leads_funil GROUP BY 1, 2, 3;

CREATE VIEW public.v_metricas_cruzado WITH (security_invoker = true) AS
SELECT lancamento_id, site, landing, pagina_obrigado,
       count(*)                            AS leads,
       count(*) FILTER (WHERE qualificado) AS qualificados,
       count(*) FILTER (WHERE no_grupo)    AS no_grupo
  FROM public.v_leads_funil GROUP BY 1, 2, 3, 4;

REVOKE ALL ON public.v_leads_funil, public.v_metricas_landing, public.v_metricas_gracias, public.v_metricas_cruzado
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_leads_funil, public.v_metricas_landing, public.v_metricas_gracias, public.v_metricas_cruzado
  TO service_role;

-- Análise: mesmos nomes padronizados (mesmas colunas, só muda o valor)
CREATE OR REPLACE VIEW public.v_leads_analise WITH (security_invoker = true) AS
 SELECT v.inscricao_id, v.lancamento_id, v.lancamento_slug, v.nome, v.email, v.telefone, v.telefone_chave,
    v.utm_source, v.utm_medium, v.utm_campaign, v.utm_content, v.utm_term, v.pagina, v.inscrito_em, v.n_envios,
    v.ultimo_envio_em, v.entrou_em, v.saiu_em, v.grupos, v.no_grupo, v.status, v.minutos_ate_entrar, v.origem,
    v.experiencia,
    public.pagina_padrao(v.landing) AS landing,
    public.pagina_padrao(v.pagina_obrigado) AS pagina_obrigado,
    v.pagina_captura, v.faixa_etaria, v.genero, v.resposta_dinheiro,
    l.nome AS lancamento_nome,
    COALESCE(pais_do_telefone(v.telefone), 'Sem DDI'::text) AS pais,
        CASE
            WHEN (v.utm_source IS NULL) THEN 'Direto / sem UTM'::text
            WHEN ((v.utm_source ~~ '[%'::text) OR (v.utm_medium ~~ '%|%'::text)) THEN 'Meta Ads'::text
            ELSE v.utm_source
        END AS canal,
    NULLIF(btrim(split_part(v.utm_source, '|'::text, 1)), ''::text) AS conjunto,
    COALESCE(NULLIF(btrim(split_part(v.utm_source, '|'::text, 2)), ''::text), NULLIF(btrim(split_part(v.utm_term, '|'::text, 1)), ''::text)) AS anuncio_nome,
    NULLIF(btrim(split_part(v.utm_medium, '|'::text, 1)), ''::text) AS posicionamento,
    NULLIF(btrim(split_part(v.utm_medium, '|'::text, 2)), ''::text) AS campanha_meta,
    NULLIF(btrim(split_part(v.utm_term, '|'::text, 2)), ''::text) AS anuncio_id,
    ((v.inscrito_em AT TIME ZONE 'America/Montevideo'::text))::date AS dia,
    (EXTRACT(hour FROM (v.inscrito_em AT TIME ZONE 'America/Montevideo'::text)))::integer AS hora,
    (EXTRACT(isodow FROM (v.inscrito_em AT TIME ZONE 'America/Montevideo'::text)))::integer AS dia_semana,
    perfil_experiencia(v.experiencia) AS perfil,
    normalizar_faixa_etaria(v.faixa_etaria) AS faixa_etaria_norm,
    normalizar_genero(v.genero) AS genero_norm
   FROM (v_leads v
     JOIN lancamentos l ON ((l.id = v.lancamento_id)));

COMMIT;
