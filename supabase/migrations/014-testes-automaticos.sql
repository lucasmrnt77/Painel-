-- =====================================================================
-- 014-testes-automaticos.sql — resultado dos testes diários dos eventos.
--
-- Todo dia o painel testa os eventos da Meta e grava o resultado aqui:
-- * origem 'servidor': regras do Lead Qualificado no serviço de tracking
--   (todas as variações) e o envio da página do grupo pela API de Conversões;
-- * origem 'navegador': o pixel e o servidor com o MESMO event_id
--   (deduplicação), rodado num navegador de verdade (GitHub Actions).
-- Só a service_role acessa.
-- =====================================================================
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'lancamentos' AND column_name = 'tipo') THEN
    RAISE EXCEPTION '014-testes-automaticos: rode 000 a 013 antes';
  END IF;
  IF to_regclass('public.testes_execucoes') IS NOT NULL THEN
    RAISE EXCEPTION '014-testes-automaticos: já aplicada — abortando';
  END IF;
END $$;

CREATE TABLE public.testes_execucoes (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  origem        text NOT NULL CHECK (origem IN ('servidor', 'navegador')),
  disparo       text NOT NULL DEFAULT 'agendado' CHECK (disparo IN ('agendado', 'manual')),
  ok            boolean NOT NULL,
  total         integer NOT NULL DEFAULT 0 CHECK (total >= 0),
  falhas        integer NOT NULL DEFAULT 0 CHECK (falhas >= 0),
  duracao_ms    integer,
  -- [{ "nome": "Regras do Lead Qualificado", "total": 145, "falhas": 0 }, ...]
  resumo        jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- até 50 falhas: [{ "teste": "...", "motivo": "..." }]
  detalhes      jsonb NOT NULL DEFAULT '[]'::jsonb,
  envio_status  text
);

CREATE INDEX testes_execucoes_criado ON public.testes_execucoes (origem, criado_em DESC);

ALTER TABLE public.testes_execucoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.testes_execucoes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.testes_execucoes TO service_role;

-- Os eventos de teste ficam marcados (teste = true); a limpeza diária apaga os antigos
GRANT DELETE ON public.eventos_meta TO service_role;

COMMIT;
