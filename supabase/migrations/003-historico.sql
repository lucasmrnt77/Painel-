-- =====================================================================
-- 003-historico.sql — Histórico de leads (planilha) + campos de análise.
--
-- * inscricoes ganha: origem (captura|planilha), experiencia, landing,
--   pagina_obrigado, grupo_informado (coluna "Grupo" da planilha) e
--   chave_importacao (reimportar não duplica).
-- * Reimportar a planilha só pode atualizar grupo_informado.
-- * A coluna CHEQUEO da planilha (controle do fluxo de 10 min) não é
--   importada.
-- * registrar_inscricao aceita p_extras (experiencia, landing,
--   pagina_obrigado) vindos da página de captura.
-- * v_leads: para leads da planilha sem dados do Sendflow, o status vem
--   da coluna "Grupo" (TRUE = no_grupo, FALSE = fora_do_grupo).
-- * v_leads_analise: v_leads + país (pelo DDI) + UTMs do Meta quebradas
--   em conjunto / anúncio / posicionamento / campanha / id do anúncio.
-- =====================================================================
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.alertas') IS NULL THEN
    RAISE EXCEPTION '003-historico: rode 000, 001 e 002 antes';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'inscricoes' AND column_name = 'origem') THEN
    RAISE EXCEPTION '003-historico: já aplicada — abortando';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- Novas colunas em inscricoes
-- ---------------------------------------------------------------------
ALTER TABLE public.inscricoes
  ADD COLUMN origem           text NOT NULL DEFAULT 'captura',
  ADD COLUMN experiencia      text,
  ADD COLUMN landing          text,
  ADD COLUMN pagina_obrigado  text,
  ADD COLUMN grupo_informado  boolean,
  ADD COLUMN chave_importacao text,
  ADD CONSTRAINT inscricoes_origem_ok CHECK (origem IN ('captura', 'planilha')),
  ADD CONSTRAINT inscricoes_chave_importacao_ok CHECK ((origem = 'planilha') = (chave_importacao IS NOT NULL)),
  ADD CONSTRAINT inscricoes_chave_importacao_unica UNIQUE (chave_importacao);

CREATE INDEX inscricoes_lanc_origem ON public.inscricoes (lancamento_id, origem);

-- Antes: nenhum UPDATE. Agora: só grupo_informado (reimportação).
DROP TRIGGER inscricoes_sem_update ON public.inscricoes;

CREATE FUNCTION public.inscricoes_so_planilha()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF (to_jsonb(NEW) - 'grupo_informado' - 'telefone' - 'telefone_chave')
     IS DISTINCT FROM (to_jsonb(OLD) - 'grupo_informado' - 'telefone' - 'telefone_chave') THEN
    RAISE EXCEPTION 'inscricoes: só grupo_informado pode ser alterado';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER inscricoes_so_planilha
  BEFORE UPDATE ON public.inscricoes
  FOR EACH ROW EXECUTE FUNCTION public.inscricoes_so_planilha();

-- ---------------------------------------------------------------------
-- País pelo DDI (NULL quando o número veio sem código do país)
-- ---------------------------------------------------------------------
CREATE FUNCTION public.pais_do_telefone(p text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = ''
AS $$
  WITH d AS (SELECT public.telefone_digitos(p) AS t)
  SELECT CASE
    WHEN t IS NULL OR t LIKE '0%' OR length(t) < 10 THEN NULL
    WHEN t LIKE '598%' THEN 'Uruguai'
    WHEN t LIKE '595%' THEN 'Paraguai'
    WHEN t LIKE '593%' THEN 'Equador'
    WHEN t LIKE '591%' THEN 'Bolívia'
    WHEN t LIKE '506%' THEN 'Costa Rica'
    WHEN t LIKE '507%' THEN 'Panamá'
    WHEN t LIKE '502%' THEN 'Guatemala'
    WHEN t LIKE '503%' THEN 'El Salvador'
    WHEN t LIKE '504%' THEN 'Honduras'
    WHEN t LIKE '505%' THEN 'Nicarágua'
    WHEN t LIKE '54%'  THEN 'Argentina'
    WHEN t LIKE '55%'  THEN 'Brasil'
    WHEN t LIKE '56%'  THEN 'Chile'
    WHEN t LIKE '57%'  THEN 'Colômbia'
    WHEN t LIKE '58%'  THEN 'Venezuela'
    WHEN t LIKE '51%'  THEN 'Peru'
    WHEN t LIKE '52%'  THEN 'México'
    WHEN t LIKE '53%'  THEN 'Cuba'
    WHEN t LIKE '34%'  THEN 'Espanha'
    WHEN t LIKE '1%'   THEN 'EUA/Canadá'
    ELSE 'Outro'
  END
  FROM d
$$;

-- ---------------------------------------------------------------------
-- registrar_inscricao com p_extras
-- ---------------------------------------------------------------------
DROP FUNCTION public.registrar_inscricao(text, text, text, text, jsonb, text, jsonb);

CREATE FUNCTION public.registrar_inscricao(
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
    pagina, payload, origem, experiencia, landing, pagina_obrigado
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
    nullif(btrim(p_extras ->> 'pagina_obrigado'), '')
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'inscricao_id', v_id, 'lancamento', v_lanc.slug, 'link_grupo', v_lanc.link_grupo);
END $$;

-- ---------------------------------------------------------------------
-- Importação da planilha (lotes). Cada item de p_linhas:
--  { chave, criado_em (ISO), telefone, experiencia, utm_campaign,
--    utm_content, utm_source, utm_medium, utm_term, landing,
--    pagina_obrigado, grupo (bool) }
-- Linha nova → insere. Linha já importada → atualiza o grupo.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.importar_planilha(p_lancamento_id bigint, p_linhas jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_r jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.lancamentos WHERE id = p_lancamento_id) THEN
    RAISE EXCEPTION 'lançamento % não existe', p_lancamento_id;
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
  -- Linhas repetidas (mesma data, hora e telefone) viram uma só;
  -- fica a primeira, e se alguma delas diz que entrou no grupo, vale TRUE.
  validas AS (
    SELECT DISTINCT ON (chave_importacao)
           chave_importacao, criado_em, telefone, experiencia, utm_campaign, utm_content,
           utm_source, utm_medium, utm_term, landing, pagina_obrigado, bruto,
           bool_or(grupo) OVER (PARTITION BY chave_importacao)  AS grupo
      FROM src
     WHERE public.telefone_chave(telefone) IS NOT NULL AND criado_em IS NOT NULL
     ORDER BY chave_importacao, ordem
  ),
  upd AS (
    UPDATE public.inscricoes i
       SET grupo_informado = s.grupo
      FROM validas s
     WHERE i.chave_importacao = s.chave_importacao
       AND i.grupo_informado IS DISTINCT FROM s.grupo
    RETURNING 1
  ),
  ins AS (
    INSERT INTO public.inscricoes (
      lancamento_id, telefone_original, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
      payload, criado_em, origem, experiencia, landing, pagina_obrigado, grupo_informado, chave_importacao
    )
    SELECT p_lancamento_id, s.telefone, s.utm_source, s.utm_medium, s.utm_campaign, s.utm_content, s.utm_term,
           s.bruto, s.criado_em, 'planilha', s.experiencia, s.landing, s.pagina_obrigado, s.grupo, s.chave_importacao
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
-- v_leads: mesmo formato de antes + status da planilha + colunas novas
-- (colunas novas só no fim, para o CREATE OR REPLACE funcionar)
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
  e.pagina_obrigado
FROM envios e
JOIN public.lancamentos l ON l.id = e.lancamento_id
LEFT JOIN membro m
  ON m.lancamento_id = e.lancamento_id
 AND m.telefone_chave = e.telefone_chave
WHERE e.ordem = 1;

-- ---------------------------------------------------------------------
-- v_leads_analise: dimensões prontas para filtros e estatísticas.
-- UTMs do Meta no formato usado nas campanhas:
--   utm_source = "{conjunto}|{anúncio}"
--   utm_medium = "{posicionamento}|{campanha}"
--   utm_term   = "{anúncio}|{id do anúncio}"
-- ---------------------------------------------------------------------
CREATE VIEW public.v_leads_analise WITH (security_invoker = true) AS
SELECT
  v.*,
  l.nome                                                          AS lancamento_nome,
  coalesce(public.pais_do_telefone(v.telefone), 'Sem DDI')        AS pais,
  CASE
    WHEN v.utm_source IS NULL                         THEN 'Direto / sem UTM'
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
  extract(isodow FROM v.inscrito_em AT TIME ZONE 'America/Montevideo')::int AS dia_semana
FROM public.v_leads v
JOIN public.lancamentos l ON l.id = v.lancamento_id;

-- ---------------------------------------------------------------------
-- v_serie_diaria: + inscritos do dia que estão/entraram no grupo
-- (funciona também para o histórico da planilha, que não tem eventos)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_serie_diaria WITH (security_invoker = true) AS
WITH ins AS (
  SELECT lancamento_id, (inscrito_em AT TIME ZONE 'America/Montevideo')::date AS dia,
         count(*) AS inscricoes,
         count(*) FILTER (WHERE no_grupo) AS inscritos_no_grupo
  FROM public.v_leads
  GROUP BY 1, 2
),
ent AS (
  SELECT lancamento_id, (recebido_em AT TIME ZONE 'America/Montevideo')::date AS dia,
         count(*) FILTER (WHERE tipo = 'entrou') AS entradas,
         count(*) FILTER (WHERE tipo = 'saiu')   AS saidas
  FROM public.eventos_sendflow
  WHERE tipo IN ('entrou', 'saiu') AND lancamento_id IS NOT NULL
  GROUP BY 1, 2
)
SELECT
  coalesce(ins.lancamento_id, ent.lancamento_id) AS lancamento_id,
  coalesce(ins.dia, ent.dia)                     AS dia,
  coalesce(ins.inscricoes, 0)                    AS inscricoes,
  coalesce(ent.entradas, 0)                      AS entradas,
  coalesce(ent.saidas, 0)                        AS saidas,
  coalesce(ins.inscritos_no_grupo, 0)            AS inscritos_no_grupo
FROM ins
FULL JOIN ent ON ent.lancamento_id = ins.lancamento_id AND ent.dia = ins.dia;

-- ---------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------
REVOKE ALL ON public.v_leads, public.v_leads_analise, public.v_serie_diaria FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_leads, public.v_leads_analise, public.v_serie_diaria TO service_role;
GRANT UPDATE (grupo_informado) ON public.inscricoes TO service_role;

REVOKE ALL ON FUNCTION public.inscricoes_so_planilha()                                          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pais_do_telefone(text)                                            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.registrar_inscricao(text, text, text, text, jsonb, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.importar_planilha(bigint, jsonb)                                  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.pais_do_telefone(text)                                            TO service_role;
GRANT EXECUTE ON FUNCTION public.registrar_inscricao(text, text, text, text, jsonb, text, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.importar_planilha(bigint, jsonb)                                  TO service_role;

COMMIT;
