-- =====================================================================
-- 007-registros-evento.sql — tabela usada pela página de captura (v0).
--
-- A rota /api/registrar-usuario da página grava o telefone em
-- registros_evento (insert, busca por telefone e update de updated_at).
-- O Supabase antigo da página não existe mais; a tabela passa a viver
-- neste projeto. Só a service_role (servidor da página) acessa.
-- Não tem relação com as tabelas do painel: o painel recebe os leads
-- pela /api/captura.
-- =====================================================================
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'atualizar_estatisticas') THEN
    RAISE EXCEPTION '007-registros-evento: rode 000 a 006 antes';
  END IF;
  IF to_regclass('public.registros_evento') IS NOT NULL THEN
    RAISE EXCEPTION '007-registros-evento: já aplicada — abortando';
  END IF;
END $$;

CREATE TABLE public.registros_evento (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telefono             text NOT NULL UNIQUE,
  nombre               text NOT NULL DEFAULT '',
  email                text NOT NULL DEFAULT '',
  pais                 text NOT NULL DEFAULT '',
  conocimiento_trading text NOT NULL DEFAULT '',
  fuente               text NOT NULL DEFAULT '',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.registros_evento ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.registros_evento FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.registros_evento TO service_role;

COMMIT;
