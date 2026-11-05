-- 052: Medição precisa da conversão por página (a partir de 06/11/2026).
--
-- Problema: a visita tinha o país pelo IP (Vercel) e a inscrição pelo DDI do telefone. Por país, as duas
-- réguas não batiam (ex.: 25/10, Uruguai: 130 visitas e 70 inscrições = 54%).
-- Solução: cada visita ganha um código (as páginas mandam junto com o aviso de visita e gravam no cookie
-- tde_vid); a inscrição leva o mesmo código no payload (payload->>'visita_id'). A conversão passa a ser
-- medida pessoa a pessoa, com o país, a página e a campanha DA PRÓPRIA VISITA.
--
--  * visitas_sessao: uma linha por visita com código (país pelo IP, site, página, campanha do anúncio).
--  * registrar_visita: aceita p_visita e p_campanha; visita repetida com o mesmo código não conta 2 vezes.
--    Sem código (páginas antigas), segue igual a antes.
--  * v_leads_funil ganha inscricao_id (no fim; nada muda nas colunas existentes).
--  * metricas_landing_pais_precisa_periodo: mesmas colunas da metricas_landing_pais_periodo, só com
--    visitas que têm código e os leads ligados a elas (1ª inscrição da pessoa no lançamento).
--  * cobertura_medicao_periodo: quantos leads do período estão ligados a uma visita (saúde da medição).
-- Nada é apagado nem recalculado: os números antigos continuam como estavam.
BEGIN;

CREATE TABLE IF NOT EXISTS public.visitas_sessao (
  id            uuid PRIMARY KEY,
  lancamento_id bigint NOT NULL REFERENCES public.lancamentos(id) ON DELETE CASCADE,
  dia           date NOT NULL,
  site          text NOT NULL,
  landing       text NOT NULL,
  pais          text NOT NULL,
  campanha      text,
  criado_em     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS visitas_sessao_lanc_dia ON public.visitas_sessao (lancamento_id, dia);
ALTER TABLE public.visitas_sessao ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.visitas_sessao FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visitas_sessao TO service_role;

CREATE INDEX IF NOT EXISTS inscricoes_visita_id ON public.inscricoes ((payload->>'visita_id'))
  WHERE payload ? 'visita_id';

DROP FUNCTION IF EXISTS public.registrar_visita(text, text, text, text);
CREATE FUNCTION public.registrar_visita(p_lancamento_slug text, p_landing text, p_pais text, p_site text DEFAULT NULL,
                                        p_visita uuid DEFAULT NULL, p_campanha text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_lanc    bigint;
  v_landing text := btrim(coalesce(p_landing, ''));
  v_pais    text := coalesce(nullif(upper(left(btrim(coalesce(p_pais, '')), 2)), ''), '??');
  v_dia     date := (now() AT TIME ZONE 'America/Montevideo')::date;
  v_site    text := CASE
                      WHEN lower(coalesce(p_site, '')) = 'genjub' THEN 'Gen-Jubilados'
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
  IF p_visita IS NOT NULL THEN
    INSERT INTO public.visitas_sessao (id, lancamento_id, dia, site, landing, pais, campanha)
    VALUES (p_visita, v_lanc, v_dia, v_site, v_landing, v_pais, nullif(left(btrim(coalesce(p_campanha, '')), 200), ''))
    ON CONFLICT (id) DO NOTHING;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', true, 'repetida', true); -- mesmo código: não conta de novo
    END IF;
  END IF;
  INSERT INTO public.visitas_pagina AS v (dia, lancamento_id, site, landing, pais, visitas)
  VALUES (v_dia, v_lanc, v_site, v_landing, v_pais, 1)
  ON CONFLICT (dia, lancamento_id, site, landing, pais) DO UPDATE SET visitas = v.visitas + 1;
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.registrar_visita(text, text, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_visita(text, text, text, text, uuid, text) TO service_role;

-- v_leads_funil: mesma definição + inscricao_id no fim
CREATE OR REPLACE VIEW public.v_leads_funil AS
 WITH perfil AS (
         SELECT inscricoes.lancamento_id,
            inscricoes.telefone_chave,
            bool_or((inscricoes.resposta_dinheiro IS NOT NULL)) AS respondeu,
            bool_or(((inscricoes.faixa_etaria IS NOT NULL) OR (inscricoes.genero IS NOT NULL) OR (inscricoes.resposta_dinheiro IS NOT NULL))) AS comecou,
            bool_or(COALESCE(inscricoes.qualificado,
                CASE
                    WHEN ((inscricoes.lancamento_id >= 4) AND (inscricoes.pagina_captura = 'trader'::text) AND (inscricoes.experiencia IS NOT NULL)) THEN qualifica_trader(inscricoes.experiencia)
                    ELSE NULL::boolean
                END)) AS qualificado
           FROM inscricoes
          WHERE (inscricoes.telefone_chave IS NOT NULL)
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
    v.inscrito_em,
    v.inscricao_id
   FROM (v_leads v
     LEFT JOIN perfil p ON (((p.lancamento_id = v.lancamento_id) AND (p.telefone_chave = v.telefone_chave))));

CREATE OR REPLACE FUNCTION public.metricas_landing_pais_precisa_periodo(p_lancamento bigint, p_de date, p_ate date)
RETURNS TABLE(site text, landing text, pais text, visitas bigint, leads bigint, responderam bigint, qualificados bigint, no_grupo bigint)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH vs AS (
    SELECT s.id::text AS id, s.site, public.pagina_padrao(s.landing) AS landing, public.pais_grupo(s.pais) AS pais
      FROM public.visitas_sessao s
     WHERE s.lancamento_id = p_lancamento
       AND (p_de IS NULL OR s.dia >= p_de) AND (p_ate IS NULL OR s.dia <= p_ate)
  ), l AS (
    SELECT vs.site, vs.landing, vs.pais, count(*) AS leads,
           count(*) FILTER (WHERE f.respondeu) AS responderam,
           count(*) FILTER (WHERE f.qualificado) AS qualificados,
           count(*) FILTER (WHERE f.no_grupo) AS no_grupo
      FROM public.v_leads_funil f
      JOIN public.inscricoes i ON i.id = f.inscricao_id AND i.payload ? 'visita_id'
      JOIN vs ON vs.id = i.payload->>'visita_id'
     WHERE f.lancamento_id = p_lancamento
     GROUP BY vs.site, vs.landing, vs.pais
  ), vi AS (
    SELECT vs.site, vs.landing, vs.pais, count(*)::bigint AS visitas FROM vs GROUP BY vs.site, vs.landing, vs.pais
  )
  SELECT COALESCE(l.site, vi.site), COALESCE(l.landing, vi.landing), COALESCE(l.pais, vi.pais), COALESCE(vi.visitas, 0),
         COALESCE(l.leads, 0), COALESCE(l.responderam, 0), COALESCE(l.qualificados, 0), COALESCE(l.no_grupo, 0)
    FROM l FULL JOIN vi ON vi.site = l.site AND vi.landing = l.landing AND vi.pais = l.pais
$$;
REVOKE ALL ON FUNCTION public.metricas_landing_pais_precisa_periodo(bigint, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.metricas_landing_pais_precisa_periodo(bigint, date, date) TO service_role;

-- Saúde da medição: leads (1ª inscrição) do período e quantos estão ligados a uma visita com código
CREATE OR REPLACE FUNCTION public.cobertura_medicao_periodo(p_lancamento bigint, p_de date, p_ate date)
RETURNS TABLE(leads bigint, ligados bigint)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT count(*)::bigint,
         count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.visitas_sessao s WHERE s.id::text = i.payload->>'visita_id'))::bigint
    FROM public.v_leads v
    JOIN public.inscricoes i ON i.id = v.inscricao_id
   WHERE v.lancamento_id = p_lancamento
     AND (p_de IS NULL OR public.dia_uy(v.inscrito_em) >= p_de)
     AND (p_ate IS NULL OR public.dia_uy(v.inscrito_em) <= p_ate)
$$;
REVOKE ALL ON FUNCTION public.cobertura_medicao_periodo(bigint, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cobertura_medicao_periodo(bigint, date, date) TO service_role;

COMMIT;
