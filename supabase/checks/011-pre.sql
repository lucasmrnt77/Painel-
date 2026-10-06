-- Rodar ANTES de 011-redir-gid.sql. Esperado: pronto_para_migrar = true.
SELECT
  to_regclass('public.redir_grupos') IS NOT NULL AS ate_010_ok,
  NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'redir_grupos' AND column_name = 'sendflow_gid') AS coluna_ausente,
  (to_regclass('public.redir_grupos') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'redir_grupos' AND column_name = 'sendflow_gid')) AS pronto_para_migrar;
