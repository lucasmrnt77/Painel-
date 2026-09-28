-- =====================================================================
-- 000-base.sql — Painel Sendflow (projeto Supabase NOVO, separado do
-- sistema de pagamentos).
--
-- Cria: lancamentos, inscricoes (página de captura), webhooks_sendflow
-- (payload bruto), eventos_sendflow (eventos normalizados) e
-- membros_grupo (estado atual de quem está no grupo), mais as funções
-- de normalização de telefone e as RPCs chamadas pelo app.
--
-- Rodar no SQL Editor do Supabase, inteiro, uma única vez.
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- Guard (dentro da transação): aborta se o banco já tiver o esquema.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.lancamentos') IS NOT NULL
     OR to_regclass('public.inscricoes') IS NOT NULL
     OR to_regclass('public.membros_grupo') IS NOT NULL
     OR to_regclass('public.eventos_sendflow') IS NOT NULL
     OR to_regclass('public.webhooks_sendflow') IS NOT NULL THEN
    RAISE EXCEPTION '000-base: esquema já existe neste banco — abortando';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- Telefones
-- telefone_digitos: só dígitos (ou NULL).
-- telefone_chave: últimos 8 dígitos. É a chave de cruzamento entre o
-- número digitado no formulário e o número que o WhatsApp informa.
-- Funciona para UY (099 123 456 x 59899123456), AR (11 15 1234-5678 x
-- 5491112345678) e BR (com ou sem o 9º dígito).
-- ---------------------------------------------------------------------
CREATE FUNCTION public.telefone_digitos(p text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT nullif(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '')
$$;

CREATE FUNCTION public.telefone_chave(p text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT CASE
           WHEN length(public.telefone_digitos(p)) >= 8
             THEN right(public.telefone_digitos(p), 8)
         END
$$;

-- ---------------------------------------------------------------------
-- lancamentos
-- ---------------------------------------------------------------------
CREATE TABLE public.lancamentos (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug             text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  nome             text NOT NULL CHECK (btrim(nome) <> ''),
  link_grupo       text,
  -- Identificação da campanha no Sendflow. Casa com o id da campanha,
  -- com o id do grupo ou com o INÍCIO do nome do grupo.
  sendflow_ref     text UNIQUE,
  minutos_reenvio  integer NOT NULL DEFAULT 10 CHECK (minutos_reenvio BETWEEN 1 AND 1440),
  ativo            boolean NOT NULL DEFAULT false,
  criado_em        timestamptz NOT NULL DEFAULT now()
);

-- No máximo um lançamento ativo por vez.
CREATE UNIQUE INDEX lancamentos_um_ativo ON public.lancamentos (ativo) WHERE ativo;

-- ---------------------------------------------------------------------
-- inscricoes (página de captura). Guarda TODOS os envios; a view
-- v_leads deduplica por telefone dentro do lançamento.
-- ---------------------------------------------------------------------
CREATE TABLE public.inscricoes (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lancamento_id      bigint NOT NULL REFERENCES public.lancamentos (id),
  nome               text,
  email              text,
  telefone_original  text NOT NULL,
  telefone           text GENERATED ALWAYS AS (public.telefone_digitos(telefone_original)) STORED,
  telefone_chave     text GENERATED ALWAYS AS (public.telefone_chave(telefone_original)) STORED,
  utm_source         text,
  utm_medium         text,
  utm_campaign       text,
  utm_content        text,
  utm_term           text,
  pagina             text,
  payload            jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX inscricoes_lanc_chave ON public.inscricoes (lancamento_id, telefone_chave, criado_em);
CREATE INDEX inscricoes_criado_em  ON public.inscricoes (criado_em);

-- ---------------------------------------------------------------------
-- webhooks_sendflow: payload bruto de cada chamada (append-only).
-- ---------------------------------------------------------------------
CREATE TABLE public.webhooks_sendflow (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recebido_em  timestamptz NOT NULL DEFAULT now(),
  origem       text NOT NULL CHECK (origem IN ('webhook', 'importacao')),
  payload      jsonb NOT NULL,
  n_eventos    integer NOT NULL DEFAULT 0
);

CREATE INDEX webhooks_sendflow_recebido ON public.webhooks_sendflow (recebido_em DESC);

-- ---------------------------------------------------------------------
-- eventos_sendflow: um evento normalizado por pessoa (append-only).
-- ---------------------------------------------------------------------
CREATE TABLE public.eventos_sendflow (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  webhook_id         bigint NOT NULL REFERENCES public.webhooks_sendflow (id),
  recebido_em        timestamptz NOT NULL DEFAULT now(),
  tipo               text NOT NULL CHECK (tipo IN ('entrou', 'saiu', 'importacao', 'desconhecido')),
  tipo_original      text,
  telefone_original  text,
  telefone           text GENERATED ALWAYS AS (public.telefone_digitos(telefone_original)) STORED,
  telefone_chave     text GENERATED ALWAYS AS (public.telefone_chave(telefone_original)) STORED,
  grupo_id           text,
  grupo_nome         text,
  sendflow_ref       text,
  lancamento_id      bigint REFERENCES public.lancamentos (id),
  -- Só evento 'desconhecido' pode vir sem telefone válido.
  CONSTRAINT eventos_sendflow_telefone_ok
    CHECK (tipo = 'desconhecido' OR public.telefone_chave(telefone_original) IS NOT NULL)
);

CREATE INDEX eventos_sendflow_recebido ON public.eventos_sendflow (recebido_em DESC);
CREATE INDEX eventos_sendflow_chave    ON public.eventos_sendflow (lancamento_id, telefone_chave);

-- ---------------------------------------------------------------------
-- membros_grupo: estado atual por (lançamento, grupo, telefone).
-- Mantido exclusivamente pela RPC sendflow_registrar_webhook.
-- ---------------------------------------------------------------------
CREATE TABLE public.membros_grupo (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lancamento_id        bigint REFERENCES public.lancamentos (id),
  grupo_id             text NOT NULL DEFAULT '',
  grupo_nome           text,
  telefone_chave       text NOT NULL,
  telefone             text NOT NULL,
  no_grupo             boolean NOT NULL,
  primeira_entrada_em  timestamptz,
  ultima_entrada_em    timestamptz,
  saiu_em              timestamptz,
  ultimo_evento_id     bigint NOT NULL REFERENCES public.eventos_sendflow (id),
  atualizado_em        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT membros_grupo_unico UNIQUE NULLS NOT DISTINCT (lancamento_id, grupo_id, telefone_chave)
);

CREATE INDEX membros_grupo_lanc_chave ON public.membros_grupo (lancamento_id, telefone_chave);

-- ---------------------------------------------------------------------
-- Append-only
-- ---------------------------------------------------------------------
CREATE FUNCTION public.bloquear_alteracao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Tabela % é append-only (% não permitido)', TG_TABLE_NAME, TG_OP;
END $$;

CREATE TRIGGER webhooks_sendflow_append_only
  BEFORE UPDATE OR DELETE ON public.webhooks_sendflow
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_alteracao();

CREATE TRIGGER eventos_sendflow_append_only
  BEFORE UPDATE OR DELETE ON public.eventos_sendflow
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_alteracao();

-- inscricoes: sem UPDATE (DELETE liberado para limpar testes).
CREATE TRIGGER inscricoes_sem_update
  BEFORE UPDATE ON public.inscricoes
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_alteracao();

-- ---------------------------------------------------------------------
-- Resolução de lançamento para eventos do Sendflow:
-- 1) sendflow_ref = ref da campanha, id do grupo, ou prefixo do nome
--    do grupo (o mais longo vence); 2) senão, o lançamento ativo.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.resolver_lancamento_sendflow(p_ref text, p_grupo_id text, p_grupo_nome text)
RETURNS bigint
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT coalesce(
    (SELECT l.id
       FROM public.lancamentos l
      WHERE l.sendflow_ref IS NOT NULL
        AND (   l.sendflow_ref = p_ref
             OR l.sendflow_ref = p_grupo_id
             OR (p_grupo_nome IS NOT NULL
                 AND lower(p_grupo_nome) LIKE lower(replace(replace(replace(l.sendflow_ref, '\', '\\'), '%', '\%'), '_', '\_')) || '%'))
      ORDER BY length(l.sendflow_ref) DESC
      LIMIT 1),
    (SELECT l.id FROM public.lancamentos l WHERE l.ativo LIMIT 1)
  )
$$;

-- ---------------------------------------------------------------------
-- RPC: registrar inscrição da página de captura.
-- p_lancamento_slug NULL → usa o lançamento ativo.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.registrar_inscricao(
  p_lancamento_slug text,
  p_nome text,
  p_email text,
  p_telefone text,
  p_utm jsonb,
  p_pagina text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_lanc  public.lancamentos%ROWTYPE;
  v_id    bigint;
  v_chave text;
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

  v_chave := public.telefone_chave(p_telefone);
  IF v_chave IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'telefone_invalido');
  END IF;

  INSERT INTO public.inscricoes (
    lancamento_id, nome, email, telefone_original,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    pagina, payload
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
    coalesce(p_payload, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'ok', true,
    'inscricao_id', v_id,
    'lancamento', v_lanc.slug,
    'link_grupo', v_lanc.link_grupo
  );
END $$;

-- ---------------------------------------------------------------------
-- RPC: registrar um webhook do Sendflow (ou uma importação manual).
-- p_eventos: array de objetos
--   { tipo, tipo_original, telefone, grupo_id, grupo_nome, sendflow_ref }
-- p_lancamento_id: força o lançamento (usado na importação manual).
-- Grava o bruto, os eventos e atualiza membros_grupo — tudo atômico.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.sendflow_registrar_webhook(
  p_payload jsonb,
  p_eventos jsonb,
  p_origem text DEFAULT 'webhook',
  p_lancamento_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_webhook_id  bigint;
  v_ev          jsonb;
  v_tipo        text;
  v_lanc        bigint;
  v_evento_id   bigint;
  v_chave       text;
  v_digitos     text;
  v_grupo       text;
  v_agora       timestamptz := now();
  v_aplicados   integer := 0;
  v_ignorados   integer := 0;
BEGIN
  IF p_origem NOT IN ('webhook', 'importacao') THEN
    RAISE EXCEPTION 'origem inválida: %', p_origem;
  END IF;
  IF p_eventos IS NULL OR jsonb_typeof(p_eventos) <> 'array' THEN
    RAISE EXCEPTION 'p_eventos deve ser um array';
  END IF;
  IF p_lancamento_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.lancamentos WHERE id = p_lancamento_id) THEN
    RAISE EXCEPTION 'lançamento % não existe', p_lancamento_id;
  END IF;

  INSERT INTO public.webhooks_sendflow (origem, payload, n_eventos)
  VALUES (p_origem, coalesce(p_payload, '{}'::jsonb), jsonb_array_length(p_eventos))
  RETURNING id INTO v_webhook_id;

  FOR v_ev IN SELECT * FROM jsonb_array_elements(p_eventos) LOOP
    v_tipo    := coalesce(v_ev ->> 'tipo', 'desconhecido');
    v_chave   := public.telefone_chave(v_ev ->> 'telefone');
    v_digitos := public.telefone_digitos(v_ev ->> 'telefone');
    v_grupo   := coalesce(nullif(v_ev ->> 'grupo_id', ''), '');

    IF v_tipo NOT IN ('entrou', 'saiu', 'importacao', 'desconhecido') THEN
      v_tipo := 'desconhecido';
    END IF;
    -- Sem telefone válido não dá para aplicar: vira 'desconhecido'.
    IF v_chave IS NULL THEN
      v_tipo := 'desconhecido';
    END IF;

    v_lanc := coalesce(
      p_lancamento_id,
      public.resolver_lancamento_sendflow(v_ev ->> 'sendflow_ref', v_ev ->> 'grupo_id', v_ev ->> 'grupo_nome')
    );

    INSERT INTO public.eventos_sendflow (
      webhook_id, recebido_em, tipo, tipo_original, telefone_original,
      grupo_id, grupo_nome, sendflow_ref, lancamento_id
    ) VALUES (
      v_webhook_id, v_agora, v_tipo, v_ev ->> 'tipo_original', v_ev ->> 'telefone',
      nullif(v_ev ->> 'grupo_id', ''), nullif(v_ev ->> 'grupo_nome', ''),
      nullif(v_ev ->> 'sendflow_ref', ''), v_lanc
    )
    RETURNING id INTO v_evento_id;

    IF v_tipo IN ('entrou', 'importacao') THEN
      INSERT INTO public.membros_grupo AS m (
        lancamento_id, grupo_id, grupo_nome, telefone_chave, telefone, no_grupo,
        primeira_entrada_em, ultima_entrada_em, saiu_em, ultimo_evento_id, atualizado_em
      ) VALUES (
        v_lanc, v_grupo, nullif(v_ev ->> 'grupo_nome', ''), v_chave, v_digitos, true,
        v_agora, v_agora, NULL, v_evento_id, v_agora
      )
      ON CONFLICT ON CONSTRAINT membros_grupo_unico DO UPDATE SET
        no_grupo            = true,
        grupo_nome          = coalesce(EXCLUDED.grupo_nome, m.grupo_nome),
        telefone            = EXCLUDED.telefone,
        primeira_entrada_em = coalesce(m.primeira_entrada_em, EXCLUDED.primeira_entrada_em),
        ultima_entrada_em   = EXCLUDED.ultima_entrada_em,
        saiu_em             = NULL,
        ultimo_evento_id    = EXCLUDED.ultimo_evento_id,
        atualizado_em       = EXCLUDED.atualizado_em;
      v_aplicados := v_aplicados + 1;

    ELSIF v_tipo = 'saiu' THEN
      INSERT INTO public.membros_grupo AS m (
        lancamento_id, grupo_id, grupo_nome, telefone_chave, telefone, no_grupo,
        primeira_entrada_em, ultima_entrada_em, saiu_em, ultimo_evento_id, atualizado_em
      ) VALUES (
        v_lanc, v_grupo, nullif(v_ev ->> 'grupo_nome', ''), v_chave, v_digitos, false,
        NULL, NULL, v_agora, v_evento_id, v_agora
      )
      ON CONFLICT ON CONSTRAINT membros_grupo_unico DO UPDATE SET
        no_grupo         = false,
        grupo_nome       = coalesce(EXCLUDED.grupo_nome, m.grupo_nome),
        saiu_em          = EXCLUDED.saiu_em,
        ultimo_evento_id = EXCLUDED.ultimo_evento_id,
        atualizado_em    = EXCLUDED.atualizado_em;
      v_aplicados := v_aplicados + 1;

    ELSE
      v_ignorados := v_ignorados + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'webhook_id', v_webhook_id,
    'aplicados', v_aplicados,
    'ignorados', v_ignorados
  );
END $$;

-- ---------------------------------------------------------------------
-- Segurança: nada exposto para anon/authenticated. O app usa a
-- service_role apenas no servidor. RLS ligado sem políticas.
-- ---------------------------------------------------------------------
ALTER TABLE public.lancamentos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inscricoes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhooks_sendflow  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eventos_sendflow   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membros_grupo      ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.lancamentos, public.inscricoes, public.webhooks_sendflow,
              public.eventos_sendflow, public.membros_grupo
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lancamentos TO service_role;
GRANT SELECT, INSERT, DELETE         ON public.inscricoes TO service_role;
GRANT SELECT, INSERT                 ON public.webhooks_sendflow, public.eventos_sendflow TO service_role;
GRANT SELECT                         ON public.membros_grupo TO service_role;

REVOKE ALL ON FUNCTION public.telefone_digitos(text)                                   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.telefone_chave(text)                                     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bloquear_alteracao()                                     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolver_lancamento_sendflow(text, text, text)           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.registrar_inscricao(text, text, text, text, jsonb, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sendflow_registrar_webhook(jsonb, jsonb, text, bigint)   FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.telefone_digitos(text)                                   TO service_role;
GRANT EXECUTE ON FUNCTION public.telefone_chave(text)                                     TO service_role;
GRANT EXECUTE ON FUNCTION public.resolver_lancamento_sendflow(text, text, text)           TO service_role;
GRANT EXECUTE ON FUNCTION public.registrar_inscricao(text, text, text, text, jsonb, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.sendflow_registrar_webhook(jsonb, jsonb, text, bigint)   TO service_role;

COMMIT;
