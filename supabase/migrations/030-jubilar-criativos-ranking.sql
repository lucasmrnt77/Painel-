-- 030: Página Jubilar, tabela de criativos e ranking de variação × país.
--
--  * Jubilar: cópia da General com domínio próprio (eventojubilar.metodoconsistente.com). Manda os mesmos dados da
--    General, com pagina_captura "Jub-Uruguay"/"Jub-Argentina"/"Jub-Otro" e site "jubilar". As inscrições continuam
--    como "nunca_operou"; o site (General/Trader/Jubilar) sai do payload original. Visitas aceitam o site Jubilar.
--  * public.sites_captura: endereço de cada página e o link que divide o tráfego entre /v1, /v2… (aba Links).
--  * public.criativos: criativo (nome do anúncio na Meta ou utm_content) → página e variação. Um link marcado
--    "por criativo" (links.por_criativo) manda cada clique para a página do criativo. Criativo novo entra sozinho na
--    tabela; [T] → Trader, [G] → General, [JG] → Jubilar pelo prefixo do nome (dá para mudar no painel).
--  * public.v_metricas_landing_pais: visitas, leads e qualificados por site × variação × país (AR, UY, CL, Outros).
--  * lancamentos.ads_lancamento: nome do lançamento na base da Paola (custo por lead no ranking).
BEGIN;

-- ── Site de cada inscrição (General / Trader / Jubilar) ─────────────────────────────────────────
-- p_landing: em lançamentos antigos a variante da página ficou no landing ("Jub-Uruguay" = Jubilar de setembro)
CREATE OR REPLACE FUNCTION public.site_da_inscricao(p_pagina_captura text, p_payload jsonb, p_landing text DEFAULT NULL)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO '' AS $$
  SELECT CASE
    WHEN lower(coalesce(p_payload ->> 'site', '')) = 'jubilar'
      OR lower(coalesce(p_payload ->> 'pagina_captura', '')) LIKE 'jub%'
      OR lower(coalesce(p_landing, '')) LIKE 'jub%' THEN 'Jubilar'
    WHEN p_pagina_captura = 'trader'       THEN 'Trader'
    WHEN p_pagina_captura = 'nunca_operou' THEN 'General'
    ELSE '—'
  END
$$;

-- País em 4 grupos (as páginas têm versão local para AR, UY e CL; o resto vê a internacional)
CREATE OR REPLACE FUNCTION public.pais_grupo(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO '' AS $$
  SELECT CASE
    WHEN upper(btrim(coalesce(p, ''))) IN ('AR', 'ARGENTINA') THEN 'AR'
    WHEN upper(btrim(coalesce(p, ''))) IN ('UY', 'URUGUAI', 'URUGUAY') THEN 'UY'
    WHEN upper(btrim(coalesce(p, ''))) IN ('CL', 'CHILE') THEN 'CL'
    ELSE 'Outros'
  END
$$;

-- v_leads ganha a coluna site (no fim)
CREATE OR REPLACE VIEW public.v_leads WITH (security_invoker = true) AS
 WITH envios AS (
         SELECT i.id, i.lancamento_id, i.nome, i.email, i.telefone_original, i.telefone, i.telefone_chave,
            i.utm_source, i.utm_medium, i.utm_campaign, i.utm_content, i.utm_term, i.pagina, i.payload, i.criado_em,
            i.origem, i.experiencia, i.landing, i.pagina_obrigado, i.grupo_informado, i.chave_importacao,
            i.pagina_captura, i.faixa_etaria, i.genero, i.resposta_dinheiro,
            COALESCE(i.telefone_chave, ('id:'::text || i.id)) AS pessoa,
            count(*) OVER w AS n_envios,
            max(i.criado_em) OVER w AS ultimo_envio_em,
            bool_or(i.grupo_informado) OVER w AS grupo_informado_pessoa,
            row_number() OVER (PARTITION BY i.lancamento_id, COALESCE(i.telefone_chave, ('id:'::text || i.id)) ORDER BY i.criado_em, i.id) AS ordem
           FROM public.inscricoes i
          WINDOW w AS (PARTITION BY i.lancamento_id, COALESCE(i.telefone_chave, ('id:'::text || i.id)))
        ), membro AS (
         SELECT m_1.lancamento_id, m_1.telefone_chave,
            bool_or(m_1.no_grupo) AS no_grupo,
            min(m_1.primeira_entrada_em) AS entrou_em,
            max(m_1.saiu_em) AS saiu_em,
            string_agg(DISTINCT m_1.grupo_nome, ', '::text) AS grupos
           FROM public.membros_grupo m_1
          GROUP BY m_1.lancamento_id, m_1.telefone_chave
        )
 SELECT e.id AS inscricao_id, e.lancamento_id, l.slug AS lancamento_slug, e.nome, e.email, e.telefone, e.telefone_chave,
    e.utm_source, e.utm_medium, e.utm_campaign, e.utm_content, e.utm_term, e.pagina,
    e.criado_em AS inscrito_em, e.n_envios, e.ultimo_envio_em, m.entrou_em, m.saiu_em, m.grupos,
    (COALESCE(m.no_grupo, false) OR ((m.telefone_chave IS NULL) AND COALESCE(e.grupo_informado_pessoa, false))) AS no_grupo,
        CASE
            WHEN (e.telefone_chave IS NULL) THEN 'telefone_invalido'::text
            WHEN m.no_grupo THEN 'no_grupo'::text
            WHEN (m.telefone_chave IS NOT NULL) THEN 'saiu'::text
            WHEN (e.grupo_informado_pessoa IS TRUE) THEN 'no_grupo'::text
            WHEN (e.grupo_informado_pessoa IS FALSE) THEN 'fora_do_grupo'::text
            WHEN ((now() - e.criado_em) < make_interval(mins => l.minutos_reenvio)) THEN 'aguardando'::text
            ELSE 'fora_do_grupo'::text
        END AS status,
        CASE
            WHEN (m.entrou_em IS NOT NULL) THEN round((EXTRACT(epoch FROM (m.entrou_em - e.criado_em)) / (60)::numeric), 1)
            ELSE NULL::numeric
        END AS minutos_ate_entrar,
    e.origem, e.experiencia, e.landing, e.pagina_obrigado, e.pagina_captura, e.faixa_etaria, e.genero, e.resposta_dinheiro,
    public.site_da_inscricao(e.pagina_captura, e.payload, e.landing) AS site
   FROM ((envios e
     JOIN public.lancamentos l ON ((l.id = e.lancamento_id)))
     LEFT JOIN membro m ON (((m.lancamento_id = e.lancamento_id) AND (m.telefone_chave = e.telefone_chave))))
  WHERE (e.ordem = 1);

-- Funil por pessoa: o site agora distingue a Jubilar
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
       v.site                                                                        AS site
  FROM public.v_leads v
  LEFT JOIN perfil p ON p.lancamento_id = v.lancamento_id AND p.telefone_chave = v.telefone_chave;

-- ── Visitas: site Jubilar ────────────────────────────────────────────────────────────────────────
ALTER TABLE public.visitas_pagina DROP CONSTRAINT IF EXISTS visitas_pagina_site_check;
ALTER TABLE public.visitas_pagina ADD CONSTRAINT visitas_pagina_site_check CHECK (site IN ('General', 'Trader', 'Jubilar'));

CREATE OR REPLACE FUNCTION public.registrar_visita(p_lancamento_slug text, p_landing text, p_pais text, p_site text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_lanc    bigint;
  v_landing text := btrim(coalesce(p_landing, ''));
  v_pais    text := coalesce(nullif(upper(left(btrim(coalesce(p_pais, '')), 2)), ''), '??');
  v_site    text := CASE
                      WHEN lower(coalesce(p_site, '')) = 'jubilar' THEN 'Jubilar'
                      WHEN lower(coalesce(p_site, '')) = 'trader' OR btrim(coalesce(p_landing, '')) ~ '^/t[0-9]+$' THEN 'Trader'
                      ELSE 'General'
                    END;
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

-- ── Ranking: site × variação × país ──────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_metricas_landing_pais WITH (security_invoker = true) AS
WITH l AS (
  SELECT lancamento_id, site, landing, public.pais_grupo(pais) AS pais,
         count(*)                            AS leads,
         count(*) FILTER (WHERE respondeu)   AS responderam,
         count(*) FILTER (WHERE qualificado) AS qualificados
    FROM public.v_leads_funil GROUP BY 1, 2, 3, 4
), vi AS (
  SELECT lancamento_id, site, public.pagina_padrao(landing) AS landing, public.pais_grupo(pais) AS pais, sum(visitas)::bigint AS visitas
    FROM public.visitas_pagina GROUP BY 1, 2, 3, 4
)
SELECT coalesce(l.lancamento_id, vi.lancamento_id) AS lancamento_id,
       coalesce(l.site, vi.site)                   AS site,
       coalesce(l.landing, vi.landing)             AS landing,
       coalesce(l.pais, vi.pais)                   AS pais,
       coalesce(vi.visitas, 0)                     AS visitas,
       coalesce(l.leads, 0)                        AS leads,
       coalesce(l.responderam, 0)                  AS responderam,
       coalesce(l.qualificados, 0)                 AS qualificados
  FROM l FULL JOIN vi ON vi.lancamento_id = l.lancamento_id AND vi.site = l.site AND vi.landing = l.landing AND vi.pais = l.pais;

-- ── Páginas e criativos ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sites_captura (
  site          text PRIMARY KEY CHECK (site IN ('general', 'trader', 'jubilar')),
  nome          text NOT NULL,
  url_base      text NOT NULL CHECK (url_base ~ '^https://[^\s/]+$'),
  link_divisao  text,           -- link da aba Links que divide entre /v1, /v2… (variação "divisão normal")
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.sites_captura (site, nome, url_base, link_divisao) VALUES
  ('general', 'General', 'https://eventogeneral.metodoconsistente.com', 'Lanzamiento-General'),
  ('trader',  'Trader',  'https://eventotrader.metodoconsistente.com',  'Lanzamiento-Trader'),
  ('jubilar', 'Jubilar', 'https://eventojubilar.metodoconsistente.com', 'Lanzamiento-Jubilar')
ON CONFLICT (site) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.criativos (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome             text NOT NULL CHECK (length(btrim(nome)) BETWEEN 1 AND 200),
  pagina           text REFERENCES public.sites_captura(site),
  variacao         text CHECK (variacao IS NULL OR variacao ~ '^/[A-Za-z0-9_-]{1,30}$'),  -- NULL = divisão normal
  automatico       boolean NOT NULL DEFAULT false,  -- página escolhida pelo prefixo do nome, ainda não revisada
  cliques          bigint NOT NULL DEFAULT 0,
  ultimo_clique_em timestamptz,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_em    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS criativos_nome_unico ON public.criativos (lower(btrim(nome)));

ALTER TABLE public.links ADD COLUMN IF NOT EXISTS por_criativo boolean NOT NULL DEFAULT false;
ALTER TABLE public.lancamentos ADD COLUMN IF NOT EXISTS ads_lancamento text;
UPDATE public.lancamentos SET ads_lancamento = 'setembro-26' WHERE id = 2 AND ads_lancamento IS NULL;
UPDATE public.lancamentos SET ads_lancamento = 'dezembro-26' WHERE id = 5 AND ads_lancamento IS NULL;

-- Página pelo prefixo do nome do anúncio: [T] Trader · [G] General · [JG] Jubilar
CREATE OR REPLACE FUNCTION public.pagina_do_criativo(p_nome text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO '' AS $$
  SELECT CASE
    WHEN p_nome ~* '^\s*\[(jg|jub[a-z]*)\]' THEN 'jubilar'
    WHEN p_nome ~* '^\s*\[t\]'               THEN 'trader'
    WHEN p_nome ~* '^\s*\[g\]'               THEN 'general'
  END
$$;

-- Um clique num link "por criativo": acha o criativo pelas chaves (nome do anúncio, utm_content) e devolve
-- a página. Criativo novo entra na tabela (com a página do prefixo, se houver). {usar:false} = segue o link normal.
CREATE OR REPLACE FUNCTION public.criativo_destino(p_slug text, p_chaves text[], p_contar boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_link public.links%ROWTYPE;
  v_c    public.criativos%ROWTYPE;
  v_s    public.sites_captura%ROWTYPE;
  k      text;
  v_novo text;
BEGIN
  SELECT * INTO v_link FROM public.links WHERE lower(slug) = lower(p_slug);
  IF NOT FOUND OR NOT v_link.por_criativo OR NOT v_link.ativo THEN
    RETURN jsonb_build_object('usar', false);
  END IF;

  FOREACH k IN ARRAY coalesce(p_chaves, '{}') LOOP
    k := btrim(coalesce(k, ''));
    CONTINUE WHEN k = '' OR length(k) > 200;
    SELECT * INTO v_c FROM public.criativos WHERE lower(btrim(nome)) = lower(k);
    IF FOUND THEN EXIT; END IF;
    v_novo := coalesce(v_novo, k);
  END LOOP;

  IF v_c.id IS NULL AND v_novo IS NOT NULL THEN
    INSERT INTO public.criativos (nome, pagina, automatico)
    VALUES (v_novo, public.pagina_do_criativo(v_novo), public.pagina_do_criativo(v_novo) IS NOT NULL)
    ON CONFLICT DO NOTHING
    RETURNING * INTO v_c;
  END IF;
  IF v_c.id IS NULL OR v_c.pagina IS NULL THEN
    RETURN jsonb_build_object('usar', false);
  END IF;

  IF p_contar THEN
    UPDATE public.criativos SET cliques = cliques + 1, ultimo_clique_em = now() WHERE id = v_c.id;
  END IF;
  SELECT * INTO v_s FROM public.sites_captura WHERE site = v_c.pagina;
  RETURN jsonb_build_object('usar', true, 'criativo', v_c.nome, 'pagina', v_c.pagina, 'variacao', v_c.variacao,
                            'url_base', v_s.url_base, 'link_divisao', v_s.link_divisao,
                            'repassar_parametros', v_link.repassar_parametros);
END $$;

-- Link da Jubilar dividindo entre /v1, /v2, /v3 (como o da General) e o link único dos anúncios
DO $$
DECLARE v_id bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.links WHERE lower(slug) = 'lanzamiento-jubilar') THEN
    INSERT INTO public.links (slug, titulo) VALUES ('Lanzamiento-Jubilar', 'Lanzamiento — página Jubilar (divide /v1, /v2, /v3)') RETURNING id INTO v_id;
    INSERT INTO public.link_destinos (link_id, url, peso, ordem) VALUES
      (v_id, 'https://eventojubilar.metodoconsistente.com/v1', 34, 0),
      (v_id, 'https://eventojubilar.metodoconsistente.com/v2', 33, 1),
      (v_id, 'https://eventojubilar.metodoconsistente.com/v3', 33, 2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.links WHERE lower(slug) = 'lanzamiento') THEN
    INSERT INTO public.links (slug, titulo, por_criativo)
    VALUES ('Lanzamiento', 'Link único dos anúncios: manda para a página do criativo (aba Criativos)', true) RETURNING id INTO v_id;
    -- Criativo sem página definida: divisão normal da General
    INSERT INTO public.link_destinos (link_id, url, peso, ordem) VALUES
      (v_id, 'https://eventogeneral.metodoconsistente.com/v1', 34, 0),
      (v_id, 'https://eventogeneral.metodoconsistente.com/v2', 33, 1),
      (v_id, 'https://eventogeneral.metodoconsistente.com/v3', 33, 2);
  END IF;
END $$;

REVOKE ALL ON public.sites_captura, public.criativos, public.v_metricas_landing_pais FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sites_captura, public.criativos TO service_role;
GRANT SELECT ON public.v_metricas_landing_pais TO service_role;
ALTER TABLE public.sites_captura ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.criativos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON FUNCTION public.criativo_destino(text, text[], boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.criativo_destino(text, text[], boolean) TO service_role;

COMMIT;
