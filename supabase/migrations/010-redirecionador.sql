-- =====================================================================
-- 010-redirecionador.sql — redirecionador próprio de grupos por funil.
--
-- Cada funil (trader, geral) tem uma lista ordenada de grupos. O link
-- público /g/<funil> manda cada clique para o primeiro grupo "ativo":
-- * a cada N cliques (padrão 20) o app confere se o convite ainda vale;
-- * convite inválido → o grupo sai da fila (e, se ligado, o app pede ao
--   Sendflow um link novo; quando chega, o grupo volta para a fila);
-- * ao chegar no limite de cliques (padrão 600) → "cheio", vai para o próximo.
-- Só a service_role acessa.
-- =====================================================================
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.eventos_meta') IS NULL THEN
    RAISE EXCEPTION '010-redirecionador: rode 000 a 009 antes';
  END IF;
  IF to_regclass('public.redir_grupos') IS NOT NULL THEN
    RAISE EXCEPTION '010-redirecionador: já aplicada — abortando';
  END IF;
END $$;

CREATE TABLE public.redir_funis (
  slug                    text PRIMARY KEY CHECK (slug ~ '^[a-z0-9-]{2,30}$'),
  nome                    text NOT NULL,
  limite_cliques          integer NOT NULL DEFAULT 600 CHECK (limite_cliques BETWEEN 1 AND 100000),
  verificar_a_cada        integer NOT NULL DEFAULT 20  CHECK (verificar_a_cada BETWEEN 1 AND 10000),
  link_reserva            text CHECK (link_reserva IS NULL OR link_reserva ~ '^https://'),
  sendflow_release_id     text,
  auto_redefinir          boolean NOT NULL DEFAULT true,
  sendflow_consultado_em  timestamptz,
  criado_em               timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.redir_funis (slug, nome) VALUES ('trader', 'Trader'), ('geral', 'Geral');

CREATE TABLE public.redir_grupos (
  id                         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  funil                      text NOT NULL REFERENCES public.redir_funis(slug) ON DELETE CASCADE,
  ordem                      integer NOT NULL DEFAULT 0,
  nome                       text,
  codigo                     text NOT NULL CHECK (codigo ~ '^[A-Za-z0-9]{10,40}$'),
  sendflow_group_id          text,
  status                     text NOT NULL DEFAULT 'ativo'
                               CHECK (status IN ('ativo', 'cheio', 'invalido', 'redefinindo', 'pausado')),
  cliques                    integer NOT NULL DEFAULT 0,
  cliques_desde_verificacao  integer NOT NULL DEFAULT 0,
  verificacao                text CHECK (verificacao IN ('valido', 'invalido', 'inconclusivo')),
  verificado_em              timestamptz,
  titulo_whatsapp            text,
  redefinicao_pedida_em      timestamptz,
  motivo                     text,
  criado_em                  timestamptz NOT NULL DEFAULT now(),
  atualizado_em              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT redir_grupos_codigo_unico UNIQUE (funil, codigo)
);
CREATE INDEX redir_grupos_fila ON public.redir_grupos (funil, status, ordem, id);
CREATE UNIQUE INDEX redir_grupos_sendflow ON public.redir_grupos (funil, sendflow_group_id) WHERE sendflow_group_id IS NOT NULL;

CREATE TABLE public.redir_cliques (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  criado_em  timestamptz NOT NULL DEFAULT now(),
  funil      text NOT NULL,
  grupo_id   bigint REFERENCES public.redir_grupos(id) ON DELETE SET NULL,
  origem     text
);
CREATE INDEX redir_cliques_funil ON public.redir_cliques (funil, criado_em DESC);
CREATE INDEX redir_cliques_grupo ON public.redir_cliques (grupo_id);

CREATE TABLE public.redir_eventos (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  criado_em  timestamptz NOT NULL DEFAULT now(),
  funil      text NOT NULL,
  grupo_id   bigint REFERENCES public.redir_grupos(id) ON DELETE SET NULL,
  tipo       text NOT NULL,
  detalhe    jsonb NOT NULL DEFAULT '{}'::jsonb,
  alertar    boolean NOT NULL DEFAULT false,
  alertado_em timestamptz
);
CREATE INDEX redir_eventos_recentes ON public.redir_eventos (criado_em DESC);
CREATE INDEX redir_eventos_pendentes ON public.redir_eventos (criado_em) WHERE alertar AND alertado_em IS NULL;
CREATE INDEX redir_eventos_tipo ON public.redir_eventos (tipo, criado_em DESC);

-- ---------------------------------------------------------------------
-- Um clique: escolhe o grupo, soma o clique e diz se é hora de verificar.
-- FOR UPDATE no grupo da vez: cliques simultâneos não estouram o limite.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.redir_clique(p_funil text, p_origem text DEFAULT NULL, p_contar boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  f public.redir_funis%ROWTYPE;
  g public.redir_grupos%ROWTYPE;
  verificar boolean := false;
BEGIN
  SELECT * INTO f FROM redir_funis WHERE slug = p_funil;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'funil_inexistente');
  END IF;

  SELECT * INTO g FROM redir_grupos
   WHERE funil = p_funil AND status = 'ativo'
   ORDER BY ordem, id
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    IF p_contar THEN
      INSERT INTO redir_cliques (funil, grupo_id, origem) VALUES (p_funil, NULL, left(p_origem, 200));
      -- um aviso por meia hora, não um por clique
      IF NOT EXISTS (SELECT 1 FROM redir_eventos WHERE funil = p_funil AND tipo = 'sem_grupos' AND criado_em > now() - interval '30 minutes') THEN
        INSERT INTO redir_eventos (funil, tipo, alertar, detalhe) VALUES (p_funil, 'sem_grupos', true, jsonb_build_object('reserva', f.link_reserva));
      END IF;
    END IF;
    RETURN jsonb_build_object('ok', true, 'link', f.link_reserva, 'grupo_id', NULL, 'reserva', true, 'verificar', false);
  END IF;

  IF p_contar THEN
    UPDATE redir_grupos
       SET cliques = cliques + 1,
           cliques_desde_verificacao = cliques_desde_verificacao + 1,
           atualizado_em = now()
     WHERE id = g.id
     RETURNING * INTO g;

    IF g.cliques_desde_verificacao >= f.verificar_a_cada THEN
      verificar := true;
      UPDATE redir_grupos SET cliques_desde_verificacao = 0 WHERE id = g.id;
    END IF;

    IF g.cliques >= f.limite_cliques THEN
      UPDATE redir_grupos SET status = 'cheio', motivo = 'limite de cliques', atualizado_em = now() WHERE id = g.id;
      INSERT INTO redir_eventos (funil, grupo_id, tipo, alertar, detalhe)
      VALUES (p_funil, g.id, 'cheio', true, jsonb_build_object('cliques', g.cliques, 'limite', f.limite_cliques));
      verificar := false;
    END IF;

    INSERT INTO redir_cliques (funil, grupo_id, origem) VALUES (p_funil, g.id, left(p_origem, 200));
  END IF;

  RETURN jsonb_build_object('ok', true, 'link', 'https://chat.whatsapp.com/' || g.codigo, 'grupo_id', g.id,
                            'reserva', false, 'verificar', verificar);
END $$;

-- ---------------------------------------------------------------------
-- Resultado da verificação do convite.
-- inválido + grupo ainda na fila → sai da fila (status invalido).
-- ---------------------------------------------------------------------
CREATE FUNCTION public.redir_registrar_verificacao(p_grupo_id bigint, p_resultado text, p_titulo text DEFAULT NULL, p_detalhe text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  g public.redir_grupos%ROWTYPE;
  saiu boolean := false;
BEGIN
  IF p_resultado NOT IN ('valido', 'invalido', 'inconclusivo') THEN
    RAISE EXCEPTION 'resultado inválido: %', p_resultado;
  END IF;
  UPDATE redir_grupos
     SET verificacao = p_resultado,
         verificado_em = now(),
         titulo_whatsapp = coalesce(p_titulo, titulo_whatsapp),
         atualizado_em = now()
   WHERE id = p_grupo_id
   RETURNING * INTO g;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'grupo_inexistente');
  END IF;

  IF p_resultado = 'invalido' AND g.status = 'ativo' THEN
    UPDATE redir_grupos SET status = 'invalido', motivo = coalesce(p_detalhe, 'convite inválido'), atualizado_em = now()
     WHERE id = g.id;
    INSERT INTO redir_eventos (funil, grupo_id, tipo, alertar, detalhe)
    VALUES (g.funil, g.id, 'invalido', true, jsonb_build_object('codigo', g.codigo, 'cliques', g.cliques, 'detalhe', p_detalhe));
    saiu := true;
  END IF;

  RETURN jsonb_build_object('ok', true, 'saiu_da_fila', saiu, 'funil', g.funil, 'status', CASE WHEN saiu THEN 'invalido' ELSE g.status END,
                            'sendflow_group_id', g.sendflow_group_id);
END $$;

-- ---------------------------------------------------------------------
-- Link novo (vindo do Sendflow ou digitado): troca o código e volta para a fila.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.redir_trocar_codigo(p_grupo_id bigint, p_codigo text, p_origem text DEFAULT 'manual')
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  g public.redir_grupos%ROWTYPE;
  f public.redir_funis%ROWTYPE;
BEGIN
  SELECT * INTO g FROM redir_grupos WHERE id = p_grupo_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'erro', 'grupo_inexistente'); END IF;
  SELECT * INTO f FROM redir_funis WHERE slug = g.funil;
  UPDATE redir_grupos
     SET codigo = p_codigo,
         status = CASE WHEN g.status IN ('invalido', 'redefinindo') AND g.cliques < f.limite_cliques THEN 'ativo' ELSE g.status END,
         verificacao = NULL, verificado_em = NULL, cliques_desde_verificacao = 0,
         redefinicao_pedida_em = NULL, motivo = NULL, atualizado_em = now()
   WHERE id = g.id;
  INSERT INTO redir_eventos (funil, grupo_id, tipo, alertar, detalhe)
  VALUES (g.funil, g.id, 'link_novo', true, jsonb_build_object('de', g.codigo, 'para', p_codigo, 'origem', p_origem));
  RETURN jsonb_build_object('ok', true);
END $$;

-- Painel: resumo por funil (grupos + cliques de hoje e da última hora)
CREATE FUNCTION public.redir_resumo()
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'funil', to_jsonb(f),
    'grupos', (SELECT coalesce(jsonb_agg(to_jsonb(g) ORDER BY g.ordem, g.id), '[]'::jsonb) FROM redir_grupos g WHERE g.funil = f.slug),
    'cliques_hoje', (SELECT count(*) FROM redir_cliques c WHERE c.funil = f.slug
                      AND c.criado_em >= (date_trunc('day', now() AT TIME ZONE 'America/Montevideo') AT TIME ZONE 'America/Montevideo')),
    'cliques_1h', (SELECT count(*) FROM redir_cliques c WHERE c.funil = f.slug AND c.criado_em > now() - interval '1 hour'),
    'cliques_sem_grupo_hoje', (SELECT count(*) FROM redir_cliques c WHERE c.funil = f.slug AND c.grupo_id IS NULL
                      AND c.criado_em >= (date_trunc('day', now() AT TIME ZONE 'America/Montevideo') AT TIME ZONE 'America/Montevideo'))
  ) ORDER BY f.slug DESC), '[]'::jsonb)
  FROM redir_funis f;
$$;

ALTER TABLE public.redir_funis   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redir_grupos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redir_cliques ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redir_eventos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.redir_funis, public.redir_grupos, public.redir_cliques, public.redir_eventos FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.redir_funis, public.redir_grupos, public.redir_cliques, public.redir_eventos TO service_role;

REVOKE ALL ON FUNCTION public.redir_clique(text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.redir_registrar_verificacao(bigint, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.redir_trocar_codigo(bigint, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.redir_resumo() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redir_clique(text, text, boolean), public.redir_registrar_verificacao(bigint, text, text, text),
                          public.redir_trocar_codigo(bigint, text, text), public.redir_resumo() TO service_role;

COMMIT;
