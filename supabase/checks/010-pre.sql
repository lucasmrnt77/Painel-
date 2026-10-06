-- Rodar ANTES de 010-redirecionador.sql. Esperado: pronto_para_migrar = true.
SELECT
  to_regclass('public.eventos_meta') IS NOT NULL AS ate_009_ok,
  to_regclass('public.redir_grupos') IS NULL AS tabelas_ausentes,
  (to_regclass('public.eventos_meta') IS NOT NULL AND to_regclass('public.redir_grupos') IS NULL) AS pronto_para_migrar;
