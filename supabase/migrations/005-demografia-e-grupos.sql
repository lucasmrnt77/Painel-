-- =====================================================================
-- 005-demografia-e-grupos.sql
--
-- * inscricoes ganha faixa_etaria, genero e resposta_dinheiro (perguntas
--   da página "Nunca operou": Edad, Genero, Respuesta_dinero).
-- * importar_planilha e registrar_inscricao passam a gravar esses campos.
-- * importar_entradas_grupo: importa a lista histórica de entradas nos
--   grupos (aba "Leads Grupo": Fecha, Hora, Telefono, Grupo) com a data
--   real de entrada — assim "no grupo" e "minutos até entrar" funcionam
--   para o histórico. Reimportar não duplica (chave por linha).
-- * v_leads / v_leads_analise / v_resumo_paginas com as colunas novas.
-- * analise_resumo(): a aba Análise agregada no banco (rápida com 20k+ leads).
-- =====================================================================
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'inscricoes' AND column_name = 'pagina_captura') THEN
    RAISE EXCEPTION '005-demografia-e-grupos: rode 000 a 004 antes';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'inscricoes' AND column_name = 'faixa_etaria') THEN
    RAISE EXCEPTION '005-demografia-e-grupos: já aplicada — abortando';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- Colunas novas
-- ---------------------------------------------------------------------
ALTER TABLE public.inscricoes
  ADD COLUMN faixa_etaria      text,
  ADD COLUMN genero            text,
  ADD COLUMN resposta_dinheiro text;

ALTER TABLE public.eventos_sendflow
  ADD COLUMN chave_importacao text,
  ADD CONSTRAINT eventos_sendflow_chave_importacao_unica UNIQUE (chave_importacao);

-- ---------------------------------------------------------------------
-- Normalizações para análise
-- ---------------------------------------------------------------------
-- Funções puras de normalização: sem "SET search_path" de propósito, para o
-- Postgres conseguir "inlinar" (sem isso, a view de análise fica ~20x mais lenta).
-- Todos os nomes usados dentro delas são de pg_catalog ou qualificados com public.
CREATE FUNCTION public.normalizar_faixa_etaria(p text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  WITH x AS (SELECT lower(btrim(coalesce(p, ''))) AS v)
  SELECT CASE
    WHEN v = ''                                              THEN NULL
    WHEN v LIKE 'menor%' OR v LIKE '%-25' OR v LIKE '18%'    THEN 'até 24'
    WHEN v LIKE '25%'                                        THEN '25–34'
    WHEN v LIKE '35%'                                        THEN '35–44'
    WHEN v LIKE '45%'                                        THEN '45–54'
    WHEN v LIKE '55%'                                        THEN '55–64'
    WHEN v LIKE 'mayor%' OR v LIKE '+65%' OR v LIKE '65%'    THEN '65+'
    ELSE p
  END
  FROM x
$$;

CREATE FUNCTION public.normalizar_genero(p text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN p IS NULL OR btrim(p) = '' THEN NULL
    WHEN lower(btrim(p)) IN ('hombre', 'homem', 'masculino', 'male', 'm') THEN 'Homem'
    WHEN lower(btrim(p)) IN ('mujer', 'mulher', 'femenino', 'feminino', 'female', 'f') THEN 'Mulher'
    ELSE 'Outro'
  END
$$;

-- ---------------------------------------------------------------------
-- registrar_inscricao: grava também faixa_etaria / genero / resposta_dinheiro
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
    pagina, payload, origem, experiencia, landing, pagina_obrigado, pagina_captura,
    faixa_etaria, genero, resposta_dinheiro
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
    public.normalizar_pagina_captura(p_extras ->> 'pagina_captura'),
    nullif(btrim(p_extras ->> 'faixa_etaria'), ''),
    nullif(btrim(p_extras ->> 'genero'), ''),
    nullif(btrim(p_extras ->> 'resposta_dinheiro'), '')
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'inscricao_id', v_id, 'lancamento', v_lanc.slug, 'link_grupo', v_lanc.link_grupo);
END $$;

-- ---------------------------------------------------------------------
-- importar_planilha: mesma assinatura, grava os campos novos
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.importar_planilha(p_lancamento_id bigint, p_linhas jsonb, p_pagina_captura text DEFAULT NULL)
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
      nullif(x ->> 'faixa_etaria', '')                          AS faixa_etaria,
      nullif(x ->> 'genero', '')                                AS genero,
      nullif(x ->> 'resposta_dinheiro', '')                     AS resposta_dinheiro,
      (x ->> 'grupo')::boolean                                  AS grupo,
      x                                                         AS bruto,
      n                                                         AS ordem
    FROM jsonb_array_elements(p_linhas) WITH ORDINALITY AS t(x, n)
  ),
  validas AS (
    SELECT DISTINCT ON (chave_importacao)
           chave_importacao, criado_em, telefone, experiencia, utm_campaign, utm_content,
           utm_source, utm_medium, utm_term, landing, pagina_obrigado, faixa_etaria, genero, resposta_dinheiro, bruto,
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
      payload, criado_em, origem, experiencia, landing, pagina_obrigado, grupo_informado, chave_importacao, pagina_captura,
      faixa_etaria, genero, resposta_dinheiro
    )
    SELECT p_lancamento_id, s.telefone, s.utm_source, s.utm_medium, s.utm_campaign, s.utm_content, s.utm_term,
           s.bruto, s.criado_em, 'planilha', s.experiencia, s.landing, s.pagina_obrigado, s.grupo, s.chave_importacao, v_pagina,
           s.faixa_etaria, s.genero, s.resposta_dinheiro
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
-- importar_entradas_grupo: lista histórica de quem entrou nos grupos.
-- p_linhas: [{ chave, entrou_em (ISO), telefone, grupo_nome }]
-- ---------------------------------------------------------------------
CREATE FUNCTION public.importar_entradas_grupo(p_lancamento_id bigint, p_linhas jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_webhook_id bigint;
  v_r          jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.lancamentos WHERE id = p_lancamento_id) THEN
    RAISE EXCEPTION 'lançamento % não existe', p_lancamento_id;
  END IF;
  IF jsonb_typeof(p_linhas) <> 'array' OR jsonb_array_length(p_linhas) > 2000 THEN
    RAISE EXCEPTION 'p_linhas deve ser um array com até 2000 itens';
  END IF;

  INSERT INTO public.webhooks_sendflow (origem, payload, n_eventos)
  VALUES ('importacao', jsonb_build_object('importacao', 'entradas_grupo', 'linhas', jsonb_array_length(p_linhas)),
          jsonb_array_length(p_linhas))
  RETURNING id INTO v_webhook_id;

  WITH src AS (
    SELECT DISTINCT ON (format('grupo:%s:%s', p_lancamento_id, x ->> 'chave'))
      format('grupo:%s:%s', p_lancamento_id, x ->> 'chave')   AS chave_importacao,
      (x ->> 'entrou_em')::timestamptz                          AS entrou_em,
      x ->> 'telefone'                                          AS telefone,
      nullif(btrim(x ->> 'grupo_nome'), '')                     AS grupo_nome
    FROM jsonb_array_elements(p_linhas) AS x
    WHERE public.telefone_chave(x ->> 'telefone') IS NOT NULL AND (x ->> 'entrou_em') IS NOT NULL
    ORDER BY format('grupo:%s:%s', p_lancamento_id, x ->> 'chave')
  ),
  ev AS (
    INSERT INTO public.eventos_sendflow (
      webhook_id, recebido_em, tipo, tipo_original, telefone_original, grupo_id, grupo_nome, lancamento_id, chave_importacao
    )
    SELECT v_webhook_id, s.entrou_em, 'importacao', 'planilha_entradas_grupo', s.telefone, NULL, s.grupo_nome,
           p_lancamento_id, s.chave_importacao
      FROM src s
    ON CONFLICT (chave_importacao) DO NOTHING
    RETURNING id, recebido_em, telefone_chave, telefone, grupo_nome
  ),
  -- Um estado por (lançamento, grupo, telefone). grupo_id = nome do grupo
  -- (a lista não traz o id), '' quando a linha veio sem grupo.
  agg AS (
    SELECT coalesce(grupo_nome, '') AS grupo_id, grupo_nome, telefone_chave,
           max(telefone) AS telefone, min(recebido_em) AS primeira, max(recebido_em) AS ultima, max(id) AS ultimo_evento
      FROM ev
     GROUP BY coalesce(grupo_nome, ''), grupo_nome, telefone_chave
  ),
  up AS (
    INSERT INTO public.membros_grupo AS m (
      lancamento_id, grupo_id, grupo_nome, telefone_chave, telefone, no_grupo,
      primeira_entrada_em, ultima_entrada_em, saiu_em, ultimo_evento_id, atualizado_em
    )
    SELECT p_lancamento_id, a.grupo_id, a.grupo_nome, a.telefone_chave, a.telefone, true,
           a.primeira, a.ultima, NULL, a.ultimo_evento, now()
      FROM agg a
    ON CONFLICT ON CONSTRAINT membros_grupo_unico DO UPDATE SET
      primeira_entrada_em = least(m.primeira_entrada_em, EXCLUDED.primeira_entrada_em),
      ultima_entrada_em   = greatest(m.ultima_entrada_em, EXCLUDED.ultima_entrada_em),
      -- só volta a "no grupo" se a entrada importada for posterior à saída registrada
      no_grupo            = m.no_grupo OR m.saiu_em IS NULL OR EXCLUDED.ultima_entrada_em > m.saiu_em,
      atualizado_em       = now()
    RETURNING 1
  )
  SELECT jsonb_build_object(
    'recebidas',  jsonb_array_length(p_linhas),
    'validas',    (SELECT count(*) FROM src),
    'novas',      (SELECT count(*) FROM ev),
    'membros',    (SELECT count(*) FROM up)
  ) INTO v_r;

  RETURN v_r;
END $$;

-- ---------------------------------------------------------------------
-- Views: v_leads (+3 colunas no fim), v_leads_analise e v_resumo_paginas
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
  e.pagina_captura,
  e.faixa_etaria,
  e.genero,
  e.resposta_dinheiro
FROM envios e
JOIN public.lancamentos l ON l.id = e.lancamento_id
LEFT JOIN membro m
  ON m.lancamento_id = e.lancamento_id
 AND m.telefone_chave = e.telefone_chave
WHERE e.ordem = 1;

DROP VIEW public.v_resumo_paginas;
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
  public.perfil_experiencia(v.experiencia)                        AS perfil,
  public.normalizar_faixa_etaria(v.faixa_etaria)                  AS faixa_etaria_norm,
  public.normalizar_genero(v.genero)                              AS genero_norm
FROM public.v_leads v
JOIN public.lancamentos l ON l.id = v.lancamento_id;

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
  count(*) FILTER (WHERE (a.pagina_captura = 'trader' AND a.perfil = 'nunca_operou')
                      OR (a.pagina_captura = 'nunca_operou' AND a.perfil = 'ja_opera')) AS fora_do_publico,
  round(100.0 * count(*) FILTER (WHERE (a.pagina_captura = 'trader' AND a.perfil = 'nunca_operou')
                                    OR (a.pagina_captura = 'nunca_operou' AND a.perfil = 'ja_opera'))
        / nullif(count(*) FILTER (WHERE a.perfil IS NOT NULL), 0), 1) AS pct_fora_do_publico,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY a.minutos_ate_entrar)
    FILTER (WHERE a.minutos_ate_entrar >= 0)                       AS mediana_minutos_ate_entrar
FROM public.v_leads_analise a
GROUP BY a.lancamento_id, coalesce(a.pagina_captura, 'sem_pagina');

-- Mesmo motivo (inlining) para as funções puras já existentes usadas nas views.
ALTER FUNCTION public.telefone_digitos(text)   RESET search_path;
ALTER FUNCTION public.pais_do_telefone(text)   RESET search_path;
ALTER FUNCTION public.perfil_experiencia(text) RESET search_path;

-- ---------------------------------------------------------------------
-- analise_resumo: a aba Análise inteira numa chamada, agregada no banco.
--   p_dimensao: anuncio | conjunto | campanha_meta | posicionamento | canal |
--               pais | experiencia | landing | pagina_obrigado | dia | hora |
--               dia_semana | lancamento | pagina_captura | perfil |
--               pagina_perfil | faixa_etaria | genero | dinheiro | variante
--   p_filtros:  {"pagina_captura":"Trader", "pais":"Argentina", "de":"2026-09-01", ...}
--               (valores iguais aos rótulos exibidos)
-- Devolve { total, no_grupo, grupos:[{chave, leads, no_grupo}], opcoes:{filtro:[valores]} }.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.analise_resumo(p_lancamento_id bigint, p_dimensao text, p_filtros jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  WITH base AS (
    SELECT
      a.no_grupo,
      a.dia,
      CASE a.pagina_captura WHEN 'trader' THEN 'Trader' WHEN 'nunca_operou' THEN 'Nunca operou' ELSE 'Sem página' END AS pagina_captura,
      CASE a.perfil WHEN 'nunca_operou' THEN 'Nunca operou' WHEN 'ja_opera' THEN 'Já opera' ELSE 'Sem resposta' END AS perfil,
      coalesce(a.faixa_etaria_norm, 'Sem resposta') AS faixa_etaria_norm,
      coalesce(a.genero_norm, 'Sem resposta')       AS genero_norm,
      coalesce(a.pais, '—')            AS pais,
      coalesce(a.canal, '—')           AS canal,
      coalesce(a.experiencia, '—')     AS experiencia,
      coalesce(a.landing, '—')         AS landing,
      coalesce(a.pagina_obrigado, '—') AS pagina_obrigado,
      coalesce(a.posicionamento, '—')  AS posicionamento,
      coalesce(a.origem, '—')          AS origem,
      coalesce(a.utm_content, a.anuncio_nome, '—') AS anuncio,
      coalesce(a.conjunto, '—')        AS conjunto,
      coalesce(a.campanha_meta, '—')   AS campanha_meta,
      a.lancamento_nome,
      a.hora,
      a.dia_semana,
      coalesce(a.resposta_dinheiro, 'Sem resposta') AS dinheiro,
      CASE WHEN a.landing IS NULL OR a.landing = '/' THEN 'Sem variante'
           ELSE coalesce(substring(a.landing FROM '^/?([A-Za-zÀ-ÿ]+)[-_]'), a.landing) END AS variante
    FROM public.v_leads_analise a
    WHERE p_lancamento_id IS NULL OR a.lancamento_id = p_lancamento_id
  ),
  filtrada AS (
    SELECT * FROM base b
    WHERE (p_filtros ->> 'pagina_captura'    IS NULL OR b.pagina_captura    = p_filtros ->> 'pagina_captura')
      AND (p_filtros ->> 'perfil'            IS NULL OR b.perfil            = p_filtros ->> 'perfil')
      AND (p_filtros ->> 'faixa_etaria_norm' IS NULL OR b.faixa_etaria_norm = p_filtros ->> 'faixa_etaria_norm')
      AND (p_filtros ->> 'genero_norm'       IS NULL OR b.genero_norm       = p_filtros ->> 'genero_norm')
      AND (p_filtros ->> 'pais'              IS NULL OR b.pais              = p_filtros ->> 'pais')
      AND (p_filtros ->> 'canal'             IS NULL OR b.canal             = p_filtros ->> 'canal')
      AND (p_filtros ->> 'experiencia'       IS NULL OR b.experiencia       = p_filtros ->> 'experiencia')
      AND (p_filtros ->> 'landing'           IS NULL OR b.landing           = p_filtros ->> 'landing')
      AND (p_filtros ->> 'pagina_obrigado'   IS NULL OR b.pagina_obrigado   = p_filtros ->> 'pagina_obrigado')
      AND (p_filtros ->> 'posicionamento'    IS NULL OR b.posicionamento    = p_filtros ->> 'posicionamento')
      AND (p_filtros ->> 'origem'            IS NULL OR b.origem            = p_filtros ->> 'origem')
      AND (p_filtros ->> 'de'  IS NULL OR b.dia >= (p_filtros ->> 'de')::date)
      AND (p_filtros ->> 'ate' IS NULL OR b.dia <= (p_filtros ->> 'ate')::date)
  ),
  dim AS (
    SELECT f.no_grupo,
      CASE p_dimensao
        WHEN 'conjunto'        THEN f.conjunto
        WHEN 'campanha_meta'   THEN f.campanha_meta
        WHEN 'posicionamento'  THEN f.posicionamento
        WHEN 'canal'           THEN f.canal
        WHEN 'pais'            THEN f.pais
        WHEN 'experiencia'     THEN f.experiencia
        WHEN 'landing'         THEN f.landing
        WHEN 'pagina_obrigado' THEN f.pagina_obrigado
        WHEN 'dia'             THEN f.dia::text
        WHEN 'hora'            THEN lpad(f.hora::text, 2, '0') || 'h'
        WHEN 'dia_semana'      THEN f.dia_semana || ' ' || (ARRAY['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'])[f.dia_semana]
        WHEN 'lancamento'      THEN f.lancamento_nome
        WHEN 'pagina_captura'  THEN f.pagina_captura
        WHEN 'perfil'          THEN f.perfil
        WHEN 'pagina_perfil'   THEN 'Página ' || f.pagina_captura || ' · ' || f.perfil
        WHEN 'faixa_etaria'    THEN f.faixa_etaria_norm
        WHEN 'genero'          THEN f.genero_norm
        WHEN 'dinheiro'        THEN f.dinheiro
        WHEN 'variante'        THEN f.variante
        ELSE f.anuncio
      END AS chave
    FROM filtrada f
  ),
  grupos AS (
    SELECT chave, count(*) AS leads, count(*) FILTER (WHERE no_grupo) AS no_grupo
    FROM dim GROUP BY chave
  ),
  opcoes AS (
    SELECT k, jsonb_agg(v ORDER BY n DESC, v) AS valores
    FROM (
      SELECT k, v, count(*) AS n
      FROM base b
      CROSS JOIN LATERAL (VALUES
        ('pagina_captura', b.pagina_captura), ('perfil', b.perfil), ('faixa_etaria_norm', b.faixa_etaria_norm),
        ('genero_norm', b.genero_norm), ('pais', b.pais), ('canal', b.canal), ('experiencia', b.experiencia),
        ('landing', b.landing), ('pagina_obrigado', b.pagina_obrigado), ('posicionamento', b.posicionamento),
        ('origem', b.origem)
      ) AS t(k, v)
      GROUP BY k, v
    ) x
    GROUP BY k
  )
  SELECT jsonb_build_object(
    'total_base', (SELECT count(*) FROM base),
    'total',      (SELECT count(*) FROM filtrada),
    'no_grupo',   (SELECT count(*) FILTER (WHERE no_grupo) FROM filtrada),
    'grupos',     coalesce((SELECT jsonb_agg(jsonb_build_object('chave', chave, 'leads', leads, 'no_grupo', no_grupo)) FROM grupos), '[]'::jsonb),
    'opcoes',     coalesce((SELECT jsonb_object_agg(k, valores) FROM opcoes), '{}'::jsonb)
  )
$$;

-- ---------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------
REVOKE ALL ON public.v_leads, public.v_leads_analise, public.v_resumo_paginas FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_leads, public.v_leads_analise, public.v_resumo_paginas TO service_role;

REVOKE ALL ON FUNCTION public.normalizar_faixa_etaria(text)                                      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analise_resumo(bigint, text, jsonb)                                              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.normalizar_genero(text)                                            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.importar_entradas_grupo(bigint, jsonb)                             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.importar_planilha(bigint, jsonb, text)                             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.registrar_inscricao(text, text, text, text, jsonb, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.normalizar_faixa_etaria(text)                                      TO service_role;
GRANT EXECUTE ON FUNCTION public.analise_resumo(bigint, text, jsonb)                                              TO service_role;
GRANT EXECUTE ON FUNCTION public.normalizar_genero(text)                                            TO service_role;
GRANT EXECUTE ON FUNCTION public.importar_entradas_grupo(bigint, jsonb)                             TO service_role;
GRANT EXECUTE ON FUNCTION public.importar_planilha(bigint, jsonb, text)                             TO service_role;
GRANT EXECUTE ON FUNCTION public.registrar_inscricao(text, text, text, text, jsonb, text, jsonb, jsonb) TO service_role;

COMMIT;
