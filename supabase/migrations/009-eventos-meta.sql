-- =====================================================================
-- 009-eventos-meta.sql — registro dos eventos enviados à Meta.
--
-- O serviço tracking-eventos (projeto separado) grava aqui cada evento
-- (Lead General, Lead Qualificado, Lead Trader, Lead Trader Qualificado)
-- e o resultado do envio pela API de Conversões. Serve para:
-- * não enviar duas vezes o mesmo event_id (UNIQUE event_name + event_id);
-- * o painel mostrar a saúde dos eventos e alertar se pararem.
-- Só a service_role acessa.
-- =====================================================================
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'registrar_perfil') THEN
    RAISE EXCEPTION '009-eventos-meta: rode 000 a 008 antes';
  END IF;
  IF to_regclass('public.eventos_meta') IS NOT NULL THEN
    RAISE EXCEPTION '009-eventos-meta: já aplicada — abortando';
  END IF;
END $$;

CREATE TABLE public.eventos_meta (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  landing         text NOT NULL CHECK (landing IN ('general', 'trader')),
  acao            text NOT NULL CHECK (acao IN ('lead', 'qualificacao')),
  event_name      text NOT NULL,
  event_id        text NOT NULL,
  telefone_chave  text,
  pais            text,
  qualificado     boolean,
  teste           boolean NOT NULL DEFAULT false,
  status          text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'enviado', 'falhou')),
  meta_http       integer,
  meta_resposta   jsonb,
  tentativas      integer NOT NULL DEFAULT 0,
  enviado_em      timestamptz,
  CONSTRAINT eventos_meta_unico UNIQUE (event_name, event_id)
);

CREATE INDEX eventos_meta_criado ON public.eventos_meta (criado_em DESC);
CREATE INDEX eventos_meta_landing_acao ON public.eventos_meta (landing, acao, criado_em DESC);
CREATE INDEX eventos_meta_chave ON public.eventos_meta (telefone_chave);

ALTER TABLE public.eventos_meta ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.eventos_meta FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.eventos_meta TO service_role;

COMMIT;
