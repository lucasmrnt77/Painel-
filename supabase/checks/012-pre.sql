-- Rodar ANTES de 012-links.sql. Esperado: pronto_para_migrar = true.
SELECT
  to_regclass('public.redir_grupos') IS NOT NULL AS ate_011_ok,
  to_regclass('public.links') IS NULL AS links_ausente,
  (to_regclass('public.redir_grupos') IS NOT NULL AND to_regclass('public.links') IS NULL) AS pronto_para_migrar;
