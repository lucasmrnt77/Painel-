-- =====================================================================
-- 016-meta-saude.sql — "Saúde na Meta": números da própria Meta sobre o pixel.
--
-- Todo dia (e pelo botão "Atualizar agora") o painel pede ao serviço de
-- tracking os dados da Dataset Quality API (deduplicação por event_id,
-- cobertura da API de Conversões, qualidade de correspondência) e o volume
-- de eventos das últimas 24 h, e grava aqui com os problemas encontrados.
-- Só a service_role acessa.
-- =====================================================================
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.testes_execucoes') IS NULL THEN
    RAISE EXCEPTION '016-meta-saude: rode 000 a 015 antes';
  END IF;
  IF to_regclass('public.meta_saude') IS NOT NULL THEN
    RAISE EXCEPTION '016-meta-saude: já aplicada — abortando';
  END IF;
END $$;

CREATE TABLE public.meta_saude (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  disparo       text NOT NULL DEFAULT 'agendado' CHECK (disparo IN ('agendado', 'manual')),
  ok            boolean NOT NULL,
  problemas     jsonb NOT NULL DEFAULT '[]'::jsonb,  -- ["Lead General: só 30% ..."]
  avisos        jsonb NOT NULL DEFAULT '[]'::jsonb,
  dados         jsonb NOT NULL DEFAULT '{}'::jsonb,  -- resposta normalizada do serviço de tracking
  envio_status  text
);

CREATE INDEX meta_saude_criado ON public.meta_saude (criado_em DESC);

ALTER TABLE public.meta_saude ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.meta_saude FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_saude TO service_role;

COMMIT;
