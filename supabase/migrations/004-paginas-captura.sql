-- =====================================================================
-- 004-paginas-captura.sql — Página de captura (persona) por inscrição.
--
-- Cada lançamento usa duas páginas de captura:
--   'trader'        → página para quem já opera
--   'nunca_operou'  → página para quem nunca operou
-- A resposta de experiência do formulário dá o PERFIL REAL da pessoa:
--   experiencia = 'nunca…'      → 'nunca_operou'
--   outra resposta preenchida   → 'ja_opera'
-- Assim dá para ver, por exemplo, quantos que vieram pela página de
-- Trader nunca operaram.
--
-- * inscricoes.pagina_captura (pode ser corrigida depois — ex.: ao
--   reimportar a planilha informando a página).
-- * registrar_inscricao lê p_extras->>'pagina_captura'.
-- * importar_planilha ganha p_pagina_captura.
-- * v_leads / v_leads_analise ganham pagina_captura e perfil.
-- * v_resumo_paginas: números por lançamento × página.
-- =====================================================================
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'inscricoes' AND column_name = 'origem') THEN
    RAISE EXCEPTION '004-paginas-captura: rode 000 a 003 antes';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'inscricoes' AND column_name = 'pagina_captura') THEN
    RAISE EXCEPTION '004-paginas-captura: já aplicada — abortando';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- Normalizações
-- ---------------------------------------------------------------------
CREATE FUNCTION public.normalizar_pagina_captura(p text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p IS NULL OR btrim(p) = '' THEN NULL
    WHEN lower(btrim(p)) IN ('trader', 'traders', 'ja_opera', 'ja-opera', 'experiente', 'experientes', 'trading')
      THEN 'trader'
    WHEN lower(btrim(p)) IN ('nunca_operou', 'nunca-operou', 'nunca operou', 'nunca', 'iniciante', 'iniciantes', 'general', 'geral')
      THEN 'nunca_operou'
  END
$$;

CREATE FUNCTION public.perfil_experiencia(p text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p IS NULL OR btrim(p) = '' THEN NULL
    WHEN lower(btrim(p)) LIKE 'nunca%' OR lower(btrim(p)) LIKE 'never%' THEN 'nunca_operou'
    ELSE 'ja_opera'
  END
$$;

-- ---------------------------------------------------------------------
-- Coluna nova
-- ---------------------------------------------------------------------
ALTER TABLE public.inscricoes
  ADD COLUMN pagina_captura text,
  ADD CONSTRAINT inscricoes_pagina_captura_ok CHECK (pagina_captura IN ('trader', 'nunca_operou'));

CREATE INDEX inscricoes_lanc_pagina ON public.inscricoes (lancamento_id, pagina_captura);

-- Reimportação pode alterar grupo_informado e pagina_captura.
CREATE OR REPLACE FUNCTION public.inscricoes_so_planilha()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF (to_jsonb(NEW) - 'grupo_informado' - 'pagina_captura' - 'telefone' - 'telefone_chave')
     IS DISTINCT FROM (to_jsonb(OLD) - 'grupo_informado' - 'pagina_captura' - 'telefone' - 'telefone_chave') THEN
    RAISE EXCEPTION 'inscricoes: só grupo_informado e pagina_captura podem ser alterados';
  END IF;
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------
-- registrar_inscricao: mesma assinatura, agora grava pagina_captura
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_inscricao(
  p_lancamento_slug text,
  p_nome text,
  p_email text,
  p_telefone text,
  p_utm jsonb,
  p_pagina text,
  p_payload jsonb,
  p_extras jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_lanc  public.lancamentos%ROWTYPE;
  v_id    bigint;
BEGIN
  IF p_lancamento_slug IS NOT NULL AND btrim(p_lancamento_slug) <> '' THEN
    SELECT * INTO v_lanc FROM public.lancamentos WHERE slug = lower(btrim(p_lancamento_slug));
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'lancamento_inexistente');
    END IF;
  ELSE
    SELECT * INTO v_lanc FROM public.lancamentos WHERE ativo;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'sem_lancamento_ativo');
    END IF;
  END IF;

  IF public.telefone_chave(p_telefone) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'telefone_invalido');
  END IF;

  INSERT INTO public.inscricoes (
    lancamento_id, nome, email, telefone_original,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    pagina, payload, origem, experiencia, landing, pagina_obrigado, pagina_captura
  ) VALUES (
    v_lanc.id,
    nullif(btrim(p_nome), ''),
    nullif(lower(btrim(p_email)), ''),
    btrim(p_telefone),
    nullif(p_utm ->> 'utm_source', ''),
    nullif(p_utm ->> 'utm_medium', ''),
    nullif(p_utm ->> 'utm_campaign', ''),
    nullif(p_utm ->> 'utm_content', ''),
    nullif(p_utm ->> 'utm_term', ''),
    nullif(btrim(p_pagina), ''),
    coalesce(p_payload, '{}'::jsonb),
    'captura',
    nullif(btrim(p_extras ->> 'experiencia'), ''),
    nullif(btrim(p_extras ->> 'landing'), ''),
    nullif(btrim(p_extras ->> 'pagina_obrigado'), ''),
    public.normalizar_pagina_captura(p_extras ->> 'pagina_captura')
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'inscricao_id', v_id, 'lancamento', v_lanc.slug, 'link_grupo', v_lanc.link_grupo);
END $$;

-- ---------------------------------------------------------------------
-- importar_planilha com página de captura
-- ---------------------------------------------------------------------
DROP FUNCTION public.importar_planilha(bigint, jsonb);

CREATE FUNCTION public.importar_planilha(p_lancamento_id bigint, p_linhas jsonb, p_pagina_captura text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_pagina text := public.normalizar_pagina_captura(p_pagina_captura);
  v_r      jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.lancamentos WHERE id = p_lancamento_id) THEN
    RAISE EXCEPTION 'lançamento % não existe', p_lancamento_id;
  END IF;
  IF p_pagina_captura IS NOT NULL AND v_pagina IS NULL THEN
    RAISE EXCEPTION 'página de captura inválida: %', p_pagina_captura;
  END IF;
  IF jsonb_typeof(p_linhas) <> 'array' OR jsonb_array_length(p_linhas) > 2000 THEN
    RAISE EXCEPTION 'p_linhas deve ser um array com até 2000 itens';
  END IF;

  WITH src AS (
    SELECT
      format('planilha:%s:%s', p_lancamento_id, x ->> 'chave') AS chave_importacao,
      (x ->> 'criado_em')::timestamptz                          AS criado_em,
      x ->> 'telefone'                                          AS telefone,
      nullif(x ->> 'experiencia', '')                           AS experiencia,
      nullif(x ->> 'utm_campaign', '')                          AS utm_campaign,
      nullif(x ->> 'utm_content', '')                           AS utm_content,
      nullif(x ->> 'utm_source', '')                            AS utm_source,
      nullif(x ->> 'utm_medium', '')                            AS utm_medium,
      nullif(x ->> 'utm_term', '')                              AS utm_term,
      nullif(x ->> 'landing', '')                               AS landing,
      nullif(x ->> 'pagina_obrigado', '')                       AS pagina_obrigado,
      (x ->> 'grupo')::boolean                                  AS grupo,
      x                                                         AS bruto,
      n                                                         AS ordem
    FROM jsonb_array_elements(p_linhas) WITH ORDINALITY AS t(x, n)
  ),
  validas AS (
    SELECT DISTINCT ON (chave_importacao)
           chave_importacao, criado_em, telefone, experiencia, utm_campaign, utm_content,
           utm_source, utm_medium, utm_term, landing, pagina_obrigado, bruto,
           bool_or(grupo) OVER (PARTITION BY chave_importacao) AS grupo
      FROM src
     WHERE public.telefone_chave(telefone) IS NOT NULL AND criado_em IS NOT NULL
     ORDER BY chave_importacao, ordem
  ),
  upd AS (
    UPDATE public.inscricoes i
       SET grupo_informado = s.grupo,
           pagina_captura  = coalesce(v_pagina, i.pagina_captura)
      FROM validas s
     WHERE i.chave_importacao = s.chave_importacao
       AND (i.grupo_informado IS DISTINCT FROM s.grupo
            OR (v_pagina IS NOT NULL AND i.pagina_captura IS DISTINCT FROM v_pagina))
    RETURNING 1
  ),
  ins AS (
    INSERT INTO public.inscricoes (
      lancamento_id, telefone_original, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
      payload, criado_em, origem, experiencia, landing, pagina_obrigado, grupo_informado, chave_importacao, pagina_captura
    )
    SELECT p_lancamento_id, s.telefone, s.utm_source, s.utm_medium, s.utm_campaign, s.utm_content, s.utm_term,
           s.bruto, s.criado_em, 'planilha', s.experiencia, s.landing, s.pagina_obrigado, s.grupo, s.chave_importacao, v_pagina
      FROM validas s
    ON CONFLICT (chave_importacao) DO NOTHING
    RETURNING 1
  )
  SELECT jsonb_build_object(
    'recebidas',   (SELECT count(*) FROM src),
    'invalidas',   (SELECT count(*) FROM src WHERE public.telefone_chave(telefone) IS NULL OR criado_em IS NULL),
    'repetidas',   (SELECT count(*) FROM src WHERE public.telefone_chave(telefone) IS NOT NULL AND criado_em IS NOT NULL)
                   - (SELECT count(*) FROM validas),
    'novas',       (SELECT count(*) FROM ins),
    'atualizadas', (SELECT count(*) FROM upd)
  ) INTO v_r;

  RETURN v_r;
END $$;

-- ---------------------------------------------------------------------
-- v_leads + pagina_captura (coluna nova no fim)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_leads WITH (security_invoker = true) AS
WITH envios AS (
  SELECT
    i.*,
    coalesce(i.telefone_chave, 'id:' || i.id) AS pessoa,
    count(*)                 OVER w AS n_envios,
    max(i.criado_em)         OVER w AS ultimo_envio_em,
    bool_or(i.grupo_informado) OVER w AS grupo_informado_pessoa,
    row_number() OVER (PARTITION BY i.lancamento_id, coalesce(i.telefone_chave, 'id:' || i.id)
                       ORDER BY i.criado_em, i.id) AS ordem
  FROM public.inscricoes i
  WINDOW w AS (PARTITION BY i.lancamento_id, coalesce(i.telefone_chave, 'id:' || i.id))
),
membro AS (
  SELECT
    m.lancamento_id,
    m.telefone_chave,
    bool_or(m.no_grupo)                     AS no_grupo,
    min(m.primeira_entrada_em)              AS entrou_em,
    max(m.saiu_em)                          AS saiu_em,
    string_agg(DISTINCT m.grupo_nome, ', ') AS grupos
  FROM public.membros_grupo m
  GROUP BY m.lancamento_id, m.telefone_chave
)
SELECT
  e.id                AS inscricao_id,
  e.lancamento_id,
  l.slug              AS lancamento_slug,
  e.nome,
  e.email,
  e.telefone,
  e.telefone_chave,
  e.utm_source,
  e.utm_medium,
  e.utm_campaign,
  e.utm_content,
  e.utm_term,
  e.pagina,
  e.criado_em         AS inscrito_em,
  e.n_envios,
  e.ultimo_envio_em,
  m.entrou_em,
  m.saiu_em,
  m.grupos,
  (coalesce(m.no_grupo, false)
   OR (m.telefone_chave IS NULL AND coalesce(e.grupo_informado_pessoa, false))) AS no_grupo,
  CASE
    WHEN e.telefone_chave IS NULL                                        THEN 'telefone_invalido'
    WHEN m.no_grupo                                                      THEN 'no_grupo'
    WHEN m.telefone_chave IS NOT NULL                                    THEN 'saiu'
    WHEN e.grupo_informado_pessoa IS TRUE                                THEN 'no_grupo'
    WHEN e.grupo_informado_pessoa IS FALSE                               THEN 'fora_do_grupo'
    WHEN now() - e.criado_em < make_interval(mins => l.minutos_reenvio)  THEN 'aguardando'
    ELSE 'fora_do_grupo'
  END AS status,
  CASE WHEN m.entrou_em IS NOT NULL
       THEN round((extract(epoch FROM (m.entrou_em - e.criado_em)) / 60)::numeric, 1)
  END AS minutos_ate_entrar,
  e.origem,
  e.experiencia,
  e.landing,
  e.pagina_obrigado,
  e.pagina_captura
FROM envios e
JOIN public.lancamentos l ON l.id = e.lancamento_id
LEFT JOIN membro m
  ON m.lancamento_id = e.lancamento_id
 AND m.telefone_chave = e.telefone_chave
WHERE e.ordem = 1;

-- v_leads_analise: recriada para incluir as colunas novas
DROP VIEW public.v_leads_analise;

CREATE VIEW public.v_leads_analise WITH (security_invoker = true) AS
SELECT
  v.*,
  l.nome                                                          AS lancamento_nome,
  coalesce(public.pais_do_telefone(v.telefone), 'Sem DDI')        AS pais,
  CASE
    WHEN v.utm_source IS NULL                              THEN 'Direto / sem UTM'
    WHEN v.utm_source LIKE '[%' OR v.utm_medium LIKE '%|%' THEN 'Meta Ads'
    ELSE v.utm_source
  END                                                             AS canal,
  nullif(btrim(split_part(v.utm_source, '|', 1)), '')             AS conjunto,
  coalesce(nullif(btrim(split_part(v.utm_source, '|', 2)), ''),
           nullif(btrim(split_part(v.utm_term, '|', 1)), ''))     AS anuncio_nome,
  nullif(btrim(split_part(v.utm_medium, '|', 1)), '')             AS posicionamento,
  nullif(btrim(split_part(v.utm_medium, '|', 2)), '')             AS campanha_meta,
  nullif(btrim(split_part(v.utm_term, '|', 2)), '')               AS anuncio_id,
  (v.inscrito_em AT TIME ZONE 'America/Montevideo')::date         AS dia,
  extract(hour FROM v.inscrito_em AT TIME ZONE 'America/Montevideo')::int AS hora,
  extract(isodow FROM v.inscrito_em AT TIME ZONE 'America/Montevideo')::int AS dia_semana,
  public.perfil_experiencia(v.experiencia)                        AS perfil
FROM public.v_leads v
JOIN public.lancamentos l ON l.id = v.lancamento_id;

-- ---------------------------------------------------------------------
-- v_resumo_paginas: lançamento × página de captura
-- ---------------------------------------------------------------------
CREATE VIEW public.v_resumo_paginas WITH (security_invoker = true) AS
SELECT
  a.lancamento_id,
  coalesce(a.pagina_captura, 'sem_pagina')                         AS pagina_captura,
  count(*)                                                         AS leads,
  count(*) FILTER (WHERE a.no_grupo)                               AS no_grupo,
  round(100.0 * count(*) FILTER (WHERE a.no_grupo) / nullif(count(*), 0), 1) AS pct_no_grupo,
  count(*) FILTER (WHERE a.perfil = 'nunca_operou')                AS perfil_nunca_operou,
  count(*) FILTER (WHERE a.perfil = 'ja_opera')                    AS perfil_ja_opera,
  count(*) FILTER (WHERE a.perfil IS NULL)                         AS perfil_sem_resposta,
  -- pessoas cujo perfil não é o público da página
  count(*) FILTER (WHERE (a.pagina_captura = 'trader' AND a.perfil = 'nunca_operou')
                      OR (a.pagina_captura = 'nunca_operou' AND a.perfil = 'ja_opera')) AS fora_do_publico,
  round(100.0 * count(*) FILTER (WHERE (a.pagina_captura = 'trader' AND a.perfil = 'nunca_operou')
                                    OR (a.pagina_captura = 'nunca_operou' AND a.perfil = 'ja_opera'))
        / nullif(count(*) FILTER (WHERE a.perfil IS NOT NULL), 0), 1) AS pct_fora_do_publico
FROM public.v_leads_analise a
GROUP BY a.lancamento_id, coalesce(a.pagina_captura, 'sem_pagina');

-- ---------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------
REVOKE ALL ON public.v_leads, public.v_leads_analise, public.v_resumo_paginas FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_leads, public.v_leads_analise, public.v_resumo_paginas TO service_role;
GRANT UPDATE (pagina_captura) ON public.inscricoes TO service_role;

REVOKE ALL ON FUNCTION public.normalizar_pagina_captura(text)                                   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.perfil_experiencia(text)                                          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.importar_planilha(bigint, jsonb, text)                            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.registrar_inscricao(text, text, text, text, jsonb, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.normalizar_pagina_captura(text)                                   TO service_role;
GRANT EXECUTE ON FUNCTION public.perfil_experiencia(text)                                          TO service_role;
GRANT EXECUTE ON FUNCTION public.importar_planilha(bigint, jsonb, text)                            TO service_role;
GRANT EXECUTE ON FUNCTION public.registrar_inscricao(text, text, text, text, jsonb, text, jsonb, jsonb) TO service_role;

COMMIT;
