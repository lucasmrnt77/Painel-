-- =====================================================================
-- 017-funil-grupo-gratuito.sql — funil "grupo" no redirecionador.
--
-- A página do grupo gratuito passa a mandar as pessoas para /g/grupo:
-- o redirecionador distribui entre os grupos da campanha "OP - FUTUROS"
-- do Sendflow, troca de grupo quando enche e pede link novo se o convite cair.
-- =====================================================================
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.redir_funis') IS NULL THEN
    RAISE EXCEPTION '017-funil-grupo-gratuito: rode 010 antes';
  END IF;
END $$;

INSERT INTO public.redir_funis (slug, nome, sendflow_release_id, auto_redefinir)
VALUES ('grupo', 'Grupo gratuito', 'SrEfziHO0TXxyu4cCLbY', true)
ON CONFLICT (slug) DO NOTHING;

COMMIT;
