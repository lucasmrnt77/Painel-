-- =====================================================================
-- 018-metricas-paginas.sql — métricas por página de captura e de gracias.
--
-- * inscricoes.qualificado: decisão do serviço de tracking (Lead Qualificado
--   sim/não), gravada pela página de gracias. A regra continua só no tracking.
-- * registrar_perfil ganha p_qualificado (vazio não apaga o que já existe).
-- * visitas_pagina: visitas por dia × lançamento × landing × país
--   (a landing avisa ao abrir; uma por sessão do navegador).
-- * v_metricas_landing / v_metricas_gracias: visitas → leads → responderam
--   → qualificados → entraram no grupo.
-- * lançamento "teste-paginas" (inativo) para os testes não sujarem os reais.
-- =====================================================================
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.redir_funis') IS NULL THEN
    RAISE EXCEPTION '018-metricas-paginas: rode 000 a 017 antes';
  END IF;
  IF to_regclass('public.visitas_pagina') IS NOT NULL THEN
    RAISE EXCEPTION '018-metricas-paginas: já aplicada — abortando';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- Qualificado
-- ---------------------------------------------------------------------
ALTER TABLE public.inscricoes ADD COLUMN qualificado boolean;

CREATE OR REPLACE FUNCTION public.inscricoes_so_planilha()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  livres text[] := ARRAY['grupo_informado', 'pagina_captura', 'telefone', 'telefone_chave',
                         'faixa_etaria', 'genero', 'resposta_dinheiro', 'qualificado'];
BEGIN
  IF (to_jsonb(NEW) - livres) IS DISTINCT FROM (to_jsonb(OLD) - livres) THEN
    RAISE EXCEPTION 'inscricoes: só grupo_informado, pagina_captura e as respostas de perfil podem ser alterados';
  END IF;
  RETURN NEW;
END $$;

DROP FUNCTION public.registrar_perfil(text, text, text, text, text);

CREATE FUNCTION public.registrar_perfil(
  p_lancamento_slug text,
  p_telefone text,
  p_faixa_etaria text,
  p_genero text,
  p_resposta_dinheiro text,
  p_qualificado boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_lanc  bigint;
  v_chave text := public.telefone_chave(p_telefone);
  v_id    bigint;
BEGIN
  IF v_chave IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'telefone_invalido');
  END IF;

  IF p_lancamento_slug IS NOT NULL AND btrim(p_lancamento_slug) <> '' THEN
    SELECT id INTO v_lanc FROM public.lancamentos WHERE slug = lower(btrim(p_lancamento_slug));
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'lancamento_inexistente');
    END IF;
  ELSE
    SELECT id INTO v_lanc FROM public.lancamentos WHERE ativo LIMIT 1;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'sem_lancamento_ativo');
    END IF;
  END IF;

  SELECT id INTO v_id
    FROM public.inscricoes
   WHERE lancamento_id = v_lanc AND telefone_chave = v_chave
   ORDER BY criado_em DESC, id DESC
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'inscricao_nao_encontrada');
  END IF;

  UPDATE public.inscricoes
     SET faixa_etaria      = coalesce(nullif(btrim(p_faixa_etaria), ''), faixa_etaria),
         genero            = coalesce(nullif(btrim(p_genero), ''), genero),
         resposta_dinheiro = coalesce(nullif(btrim(p_resposta_dinheiro), ''), resposta_dinheiro),
         qualificado       = coalesce(p_qualificado, qualificado)
   WHERE id = v_id;

  RETURN jsonb_build_object('ok', true, 'inscricao_id', v_id);
END $$;

-- ---------------------------------------------------------------------
-- Visitas
-- ---------------------------------------------------------------------
CREATE TABLE public.visitas_pagina (
  dia            date   NOT NULL,
  lancamento_id  bigint NOT NULL REFERENCES public.lancamentos(id) ON DELETE CASCADE,
  landing        text   NOT NULL CHECK (landing ~ '^/[A-Za-z0-9_/-]{0,60}$'),
  pais           text   NOT NULL DEFAULT '??',
  visitas        bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (dia, lancamento_id, landing, pais)
);
CREATE INDEX visitas_pagina_lanc ON public.visitas_pagina (lancamento_id, landing);
ALTER TABLE public.visitas_pagina ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.registrar_visita(p_lancamento_slug text, p_landing text, p_pais text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_lanc    bigint;
  v_landing text := btrim(coalesce(p_landing, ''));
  v_pais    text := coalesce(nullif(upper(left(btrim(coalesce(p_pais, '')), 2)), ''), '??');
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

  INSERT INTO public.visitas_pagina AS v (dia, lancamento_id, landing, pais, visitas)
  VALUES ((now() AT TIME ZONE 'America/Montevideo')::date, v_lanc, v_landing, v_pais, 1)
  ON CONFLICT (dia, lancamento_id, landing, pais) DO UPDATE SET visitas = v.visitas + 1;

  RETURN jsonb_build_object('ok', true);
END $$;

-- ---------------------------------------------------------------------
-- Métricas: uma linha por pessoa (v_leads) + respostas/qualificação da pessoa
-- ---------------------------------------------------------------------
CREATE VIEW public.v_leads_funil WITH (security_invoker = true) AS
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
       coalesce(nullif(v.landing, ''), '(sem landing)')            AS landing,
       coalesce(nullif(v.pagina_obrigado, ''), '(sem gracias)')    AS pagina_obrigado,
       coalesce(public.pais_do_telefone(v.telefone), 'Sem DDI')    AS pais,
       v.no_grupo,
       coalesce(p.comecou, false)                                  AS comecou,
       coalesce(p.respondeu, false)                                AS respondeu,
       p.qualificado
  FROM public.v_leads v
  LEFT JOIN perfil p ON p.lancamento_id = v.lancamento_id AND p.telefone_chave = v.telefone_chave;

CREATE VIEW public.v_metricas_landing WITH (security_invoker = true) AS
WITH l AS (
  SELECT lancamento_id, landing,
         count(*)                                   AS leads,
         count(*) FILTER (WHERE comecou)            AS comecaram,
         count(*) FILTER (WHERE respondeu)          AS responderam,
         count(*) FILTER (WHERE qualificado)        AS qualificados,
         count(*) FILTER (WHERE qualificado = false) AS nao_qualificados,
         count(*) FILTER (WHERE no_grupo)           AS no_grupo
    FROM public.v_leads_funil GROUP BY 1, 2
), vi AS (
  SELECT lancamento_id, landing, sum(visitas)::bigint AS visitas
    FROM public.visitas_pagina GROUP BY 1, 2
)
SELECT coalesce(l.lancamento_id, vi.lancamento_id) AS lancamento_id,
       coalesce(l.landing, vi.landing)             AS landing,
       coalesce(vi.visitas, 0)                     AS visitas,
       coalesce(l.leads, 0)                        AS leads,
       coalesce(l.comecaram, 0)                    AS comecaram,
       coalesce(l.responderam, 0)                  AS responderam,
       coalesce(l.qualificados, 0)                 AS qualificados,
       coalesce(l.nao_qualificados, 0)             AS nao_qualificados,
       coalesce(l.no_grupo, 0)                     AS no_grupo
  FROM l FULL JOIN vi ON vi.lancamento_id = l.lancamento_id AND vi.landing = l.landing;

CREATE VIEW public.v_metricas_gracias WITH (security_invoker = true) AS
SELECT lancamento_id, pagina_obrigado,
       count(*)                                    AS leads,
       count(*) FILTER (WHERE comecou)             AS comecaram,
       count(*) FILTER (WHERE respondeu)           AS responderam,
       count(*) FILTER (WHERE qualificado)         AS qualificados,
       count(*) FILTER (WHERE qualificado = false) AS nao_qualificados,
       count(*) FILTER (WHERE no_grupo)            AS no_grupo
  FROM public.v_leads_funil GROUP BY 1, 2;

-- Cruzamento landing × gracias (para ver a divisão de tráfego real)
CREATE VIEW public.v_metricas_cruzado WITH (security_invoker = true) AS
SELECT lancamento_id, landing, pagina_obrigado,
       count(*)                            AS leads,
       count(*) FILTER (WHERE qualificado) AS qualificados,
       count(*) FILTER (WHERE no_grupo)    AS no_grupo
  FROM public.v_leads_funil GROUP BY 1, 2, 3;

-- ---------------------------------------------------------------------
-- Lançamento de testes (fica inativo; só recebe quando a página manda
-- lancamento=teste-paginas, isto é, com ?tde_teste=1)
-- ---------------------------------------------------------------------
INSERT INTO public.lancamentos (slug, nome, ativo)
SELECT 'teste-paginas', 'Testes das páginas', false
WHERE NOT EXISTS (SELECT 1 FROM public.lancamentos WHERE slug = 'teste-paginas');

-- ---------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------
REVOKE ALL ON public.visitas_pagina FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visitas_pagina TO service_role;
REVOKE ALL ON public.v_leads_funil, public.v_metricas_landing, public.v_metricas_gracias, public.v_metricas_cruzado
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_leads_funil, public.v_metricas_landing, public.v_metricas_gracias, public.v_metricas_cruzado
  TO service_role;
GRANT UPDATE (qualificado) ON public.inscricoes TO service_role;

REVOKE ALL ON FUNCTION public.registrar_perfil(text, text, text, text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.registrar_visita(text, text, text)                    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_perfil(text, text, text, text, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.registrar_visita(text, text, text)                    TO service_role;

COMMIT;
