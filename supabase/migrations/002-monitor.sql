-- =====================================================================
-- 002-monitor.sql — Monitor de tráfego do lançamento.
--
-- * Liga/desliga por lançamento (monitor_ativo / monitor_ligado_em).
-- * Alerta quando passa N minutos sem ninguém entrar no grupo
--   (repete a cada N minutos de silêncio) e avisa quando as entradas
--   voltam.
-- * Resumo periódico alinhado ao relógio (ex.: de hora em hora).
-- * alertas: registro de cada alerta + status do envio por WhatsApp.
--   A coluna "chave" é única e garante que o mesmo alerta nunca seja
--   criado/enviado duas vezes, mesmo se o cron rodar em duplicidade.
-- =====================================================================
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.v_leads') IS NULL THEN
    RAISE EXCEPTION '002-monitor: rode 000 e 001 antes';
  END IF;
  IF to_regclass('public.alertas') IS NOT NULL THEN
    RAISE EXCEPTION '002-monitor: já aplicada — abortando';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- Configuração do monitor no lançamento
-- ---------------------------------------------------------------------
ALTER TABLE public.lancamentos
  ADD COLUMN monitor_ativo               boolean NOT NULL DEFAULT false,
  ADD COLUMN monitor_ligado_em           timestamptz,
  ADD COLUMN alerta_minutos_sem_entrada  integer NOT NULL DEFAULT 20,
  ADD COLUMN resumo_minutos              integer NOT NULL DEFAULT 60,
  ADD COLUMN alerta_telefones            text[]  NOT NULL DEFAULT '{}',
  ADD CONSTRAINT lancamentos_alerta_minutos_ok CHECK (alerta_minutos_sem_entrada BETWEEN 5 AND 720),
  ADD CONSTRAINT lancamentos_resumo_minutos_ok CHECK (resumo_minutos = 0 OR resumo_minutos IN (15, 20, 30, 60, 120, 180, 240)),
  ADD CONSTRAINT lancamentos_monitor_ligado_ok CHECK (NOT monitor_ativo OR monitor_ligado_em IS NOT NULL),
  ADD CONSTRAINT lancamentos_telefones_ok CHECK (cardinality(alerta_telefones) <= 10);

-- ---------------------------------------------------------------------
-- alertas
-- ---------------------------------------------------------------------
CREATE TABLE public.alertas (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lancamento_id  bigint NOT NULL REFERENCES public.lancamentos (id),
  tipo           text NOT NULL CHECK (tipo IN ('sem_entradas', 'entradas_retomadas', 'resumo', 'teste')),
  chave          text NOT NULL UNIQUE,
  mensagem       text NOT NULL,
  dados          jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  envio_status   text NOT NULL DEFAULT 'pendente'
                   CHECK (envio_status IN ('pendente', 'enviado', 'parcial', 'falhou', 'sem_envio')),
  envio_detalhe  jsonb,
  enviado_em     timestamptz
);

CREATE INDEX alertas_lanc_criado ON public.alertas (lancamento_id, criado_em DESC);
CREATE INDEX eventos_sendflow_entrou ON public.eventos_sendflow (lancamento_id, recebido_em DESC) WHERE tipo = 'entrou';

-- Só o status do envio pode mudar depois de criado.
CREATE FUNCTION public.alertas_so_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'alertas não podem ser apagados';
  END IF;
  IF NEW.lancamento_id IS DISTINCT FROM OLD.lancamento_id
     OR NEW.tipo      IS DISTINCT FROM OLD.tipo
     OR NEW.chave     IS DISTINCT FROM OLD.chave
     OR NEW.mensagem  IS DISTINCT FROM OLD.mensagem
     OR NEW.dados     IS DISTINCT FROM OLD.dados
     OR NEW.criado_em IS DISTINCT FROM OLD.criado_em THEN
    RAISE EXCEPTION 'alertas: só o status do envio pode ser alterado';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER alertas_so_status
  BEFORE UPDATE OR DELETE ON public.alertas
  FOR EACH ROW EXECUTE FUNCTION public.alertas_so_status();

-- ---------------------------------------------------------------------
-- Números de uma janela [p_de, p_ate) do lançamento
-- ---------------------------------------------------------------------
CREATE FUNCTION public.monitor_janela(p_lancamento_id bigint, p_de timestamptz, p_ate timestamptz)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  WITH ins AS (
    SELECT DISTINCT i.telefone_chave
      FROM public.inscricoes i
     WHERE i.lancamento_id = p_lancamento_id
       AND i.criado_em >= p_de AND i.criado_em < p_ate
       AND i.telefone_chave IS NOT NULL
  ),
  ev AS (
    SELECT e.tipo, e.telefone_chave
      FROM public.eventos_sendflow e
     WHERE e.lancamento_id = p_lancamento_id
       AND e.recebido_em >= p_de AND e.recebido_em < p_ate
       AND e.tipo IN ('entrou', 'saiu')
  )
  SELECT jsonb_build_object(
    'de', p_de,
    'ate', p_ate,
    'inscricoes', (SELECT count(*) FROM ins),
    'entradas',   (SELECT count(DISTINCT telefone_chave) FROM ev WHERE tipo = 'entrou'),
    'saidas',     (SELECT count(DISTINCT telefone_chave) FROM ev WHERE tipo = 'saiu'),
    -- dos que se inscreveram na janela, quantos estão no grupo agora
    'inscritos_no_grupo', (
      SELECT count(*) FROM ins
       WHERE EXISTS (SELECT 1 FROM public.membros_grupo m
                      WHERE m.lancamento_id = p_lancamento_id
                        AND m.telefone_chave = ins.telefone_chave
                        AND m.no_grupo)
    )
  )
$$;

-- ---------------------------------------------------------------------
-- Situação atual do monitor (lido pelo painel e pelo cron)
-- ---------------------------------------------------------------------
CREATE FUNCTION public.monitor_situacao(p_lancamento_id bigint, p_agora timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  WITH l AS (
    SELECT * FROM public.lancamentos WHERE id = p_lancamento_id
  ),
  ult AS (
    SELECT max(e.recebido_em) AS ultima_entrada_em
      FROM public.eventos_sendflow e
     WHERE e.lancamento_id = p_lancamento_id AND e.tipo = 'entrou' AND e.recebido_em <= p_agora
  )
  SELECT jsonb_build_object(
    'lancamento_id', l.id,
    'monitor_ativo', l.monitor_ativo,
    'monitor_ligado_em', l.monitor_ligado_em,
    'alerta_minutos_sem_entrada', l.alerta_minutos_sem_entrada,
    'resumo_minutos', l.resumo_minutos,
    'alerta_telefones', to_jsonb(l.alerta_telefones),
    'agora', p_agora,
    'ultima_entrada_em', ult.ultima_entrada_em,
    'minutos_desde_ultima_entrada',
      CASE WHEN ult.ultima_entrada_em IS NOT NULL
           THEN floor(extract(epoch FROM (p_agora - ult.ultima_entrada_em)) / 60) END,
    'ultimos_20', public.monitor_janela(l.id, p_agora - interval '20 minutes', p_agora),
    'ultimos_60', public.monitor_janela(l.id, p_agora - interval '60 minutes', p_agora)
  )
  FROM l, ult
$$;

-- ---------------------------------------------------------------------
-- Avaliação: quais alertas deveriam existir AGORA.
-- Pura (não grava nada). O app cria cada um via monitor_registrar_alerta,
-- que ignora chaves já existentes — idempotente.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.monitor_avaliar(p_lancamento_id bigint, p_agora timestamptz DEFAULT now())
RETURNS TABLE (tipo text, chave text, dados jsonb)
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE
  v_l          public.lancamentos%ROWTYPE;
  v_ultima     timestamptz;
  v_ref        timestamptz;
  v_min        numeric;
  v_n          integer;
  v_alerta     public.alertas%ROWTYPE;
  v_bucket     bigint;
  v_ini        timestamptz;
BEGIN
  SELECT * INTO v_l FROM public.lancamentos WHERE id = p_lancamento_id;
  IF NOT FOUND OR NOT v_l.monitor_ativo THEN
    RETURN;
  END IF;

  SELECT max(e.recebido_em) INTO v_ultima
    FROM public.eventos_sendflow e
   WHERE e.lancamento_id = v_l.id AND e.tipo = 'entrou' AND e.recebido_em <= p_agora;

  -- Silêncio conta a partir da última entrada ou de quando o monitor foi ligado
  v_ref := greatest(v_ultima, v_l.monitor_ligado_em);
  v_min := extract(epoch FROM (p_agora - v_ref)) / 60;
  v_n   := floor(v_min / v_l.alerta_minutos_sem_entrada);

  -- 1) Sem entradas (um alerta a cada N minutos de silêncio)
  IF v_n >= 1 THEN
    tipo  := 'sem_entradas';
    chave := format('sem_entradas:%s:%s:%s', v_l.id, floor(extract(epoch FROM v_ref)), v_n);
    dados := jsonb_build_object(
      'referencia', v_ref,
      'ultima_entrada_em', v_ultima,
      'minutos_sem_entrada', floor(v_min),
      'limiar', v_l.alerta_minutos_sem_entrada,
      'repeticao', v_n,
      'janela', public.monitor_janela(v_l.id, v_ref, p_agora)
    );
    RETURN NEXT;
  END IF;

  -- 2) Entradas retomadas depois do último alerta de silêncio
  SELECT * INTO v_alerta
    FROM public.alertas a
   WHERE a.lancamento_id = v_l.id AND a.tipo = 'sem_entradas'
   ORDER BY a.criado_em DESC, a.id DESC
   LIMIT 1;
  IF FOUND AND v_ultima IS NOT NULL AND v_ultima > v_alerta.criado_em THEN
    tipo  := 'entradas_retomadas';
    chave := format('retomada:%s', v_alerta.id);
    dados := jsonb_build_object(
      'alerta_id', v_alerta.id,
      'retomada_em', v_ultima,
      'minutos_sem_entrada',
        floor(extract(epoch FROM (v_ultima - (v_alerta.dados ->> 'referencia')::timestamptz)) / 60)
    );
    RETURN NEXT;
  END IF;

  -- 3) Resumo periódico alinhado ao relógio (ex.: 10:00, 11:00...)
  IF v_l.resumo_minutos > 0 THEN
    v_bucket := floor(extract(epoch FROM p_agora) / (v_l.resumo_minutos * 60));
    v_ini    := to_timestamp(v_bucket * v_l.resumo_minutos * 60);
    -- Só resume janelas que terminaram depois de o monitor ser ligado
    -- e só nos primeiros 10 min após o fechamento (não recupera resumos antigos)
    IF v_ini > v_l.monitor_ligado_em AND p_agora - v_ini < interval '10 minutes' THEN
      tipo  := 'resumo';
      chave := format('resumo:%s:%s', v_l.id, floor(extract(epoch FROM v_ini)));
      dados := jsonb_build_object(
        'janela', public.monitor_janela(v_l.id, v_ini - make_interval(mins => v_l.resumo_minutos), v_ini),
        'minutos', v_l.resumo_minutos
      );
      RETURN NEXT;
    END IF;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- Cria o alerta se a chave ainda não existe. Retorna o id ou NULL.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.monitor_registrar_alerta(
  p_lancamento_id bigint, p_tipo text, p_chave text, p_mensagem text, p_dados jsonb
)
RETURNS bigint
LANGUAGE sql
SET search_path = ''
AS $$
  INSERT INTO public.alertas (lancamento_id, tipo, chave, mensagem, dados)
  VALUES (p_lancamento_id, p_tipo, p_chave, p_mensagem, coalesce(p_dados, '{}'::jsonb))
  ON CONFLICT (chave) DO NOTHING
  RETURNING id
$$;

-- ---------------------------------------------------------------------
-- Liga/desliga o monitor (garante monitor_ligado_em coerente).
-- ---------------------------------------------------------------------
CREATE FUNCTION public.monitor_definir(p_lancamento_id bigint, p_ativo boolean)
RETURNS void
LANGUAGE sql
SET search_path = ''
AS $$
  UPDATE public.lancamentos
     SET monitor_ativo = p_ativo,
         monitor_ligado_em = CASE
           WHEN p_ativo AND NOT monitor_ativo THEN now()
           WHEN p_ativo THEN monitor_ligado_em
           ELSE monitor_ligado_em
         END
   WHERE id = p_lancamento_id
$$;

-- ---------------------------------------------------------------------
-- Entradas/inscrições por hora (últimas 48h, horário UY)
-- ---------------------------------------------------------------------
CREATE VIEW public.v_serie_horaria WITH (security_invoker = true) AS
WITH ins AS (
  SELECT lancamento_id, date_trunc('hour', criado_em AT TIME ZONE 'America/Montevideo') AS hora,
         count(DISTINCT coalesce(telefone_chave, 'id:' || id)) AS inscricoes
    FROM public.inscricoes
   WHERE criado_em > now() - interval '48 hours'
   GROUP BY 1, 2
),
ev AS (
  SELECT lancamento_id, date_trunc('hour', recebido_em AT TIME ZONE 'America/Montevideo') AS hora,
         count(DISTINCT telefone_chave) FILTER (WHERE tipo = 'entrou') AS entradas,
         count(DISTINCT telefone_chave) FILTER (WHERE tipo = 'saiu')   AS saidas
    FROM public.eventos_sendflow
   WHERE recebido_em > now() - interval '48 hours'
     AND tipo IN ('entrou', 'saiu') AND lancamento_id IS NOT NULL
   GROUP BY 1, 2
)
SELECT coalesce(ins.lancamento_id, ev.lancamento_id) AS lancamento_id,
       coalesce(ins.hora, ev.hora)                   AS hora,
       coalesce(ins.inscricoes, 0)                   AS inscricoes,
       coalesce(ev.entradas, 0)                      AS entradas,
       coalesce(ev.saidas, 0)                        AS saidas
  FROM ins
  FULL JOIN ev ON ev.lancamento_id = ins.lancamento_id AND ev.hora = ins.hora;

-- ---------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------
ALTER TABLE public.alertas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.alertas, public.v_serie_horaria FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.alertas TO service_role;
GRANT SELECT ON public.v_serie_horaria TO service_role;

REVOKE ALL ON FUNCTION public.alertas_so_status()                                         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.monitor_janela(bigint, timestamptz, timestamptz)            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.monitor_situacao(bigint, timestamptz)                       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.monitor_avaliar(bigint, timestamptz)                        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.monitor_registrar_alerta(bigint, text, text, text, jsonb)   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.monitor_definir(bigint, boolean)                            FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.monitor_janela(bigint, timestamptz, timestamptz)          TO service_role;
GRANT EXECUTE ON FUNCTION public.monitor_situacao(bigint, timestamptz)                     TO service_role;
GRANT EXECUTE ON FUNCTION public.monitor_avaliar(bigint, timestamptz)                      TO service_role;
GRANT EXECUTE ON FUNCTION public.monitor_registrar_alerta(bigint, text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.monitor_definir(bigint, boolean)                          TO service_role;

COMMIT;
