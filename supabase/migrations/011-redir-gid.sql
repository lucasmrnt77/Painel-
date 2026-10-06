-- =====================================================================
-- 011-redir-gid.sql — guarda o identificador do grupo no WhatsApp (gid).
-- As ações do Sendflow para grupos específicos usam o gid (sem @g.us),
-- não o ID interno do grupo na campanha.
-- =====================================================================
BEGIN;
DO $$
BEGIN
  IF to_regclass('public.redir_grupos') IS NULL THEN
    RAISE EXCEPTION '011-redir-gid: rode 010 antes';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'redir_grupos' AND column_name = 'sendflow_gid') THEN
    RAISE EXCEPTION '011-redir-gid: já aplicada — abortando';
  END IF;
END $$;
ALTER TABLE public.redir_grupos ADD COLUMN sendflow_gid text;
COMMIT;
