-- Rodar ANTES de 009-eventos-meta.sql. Esperado: pronto_para_migrar = true.
SELECT
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'registrar_perfil') AS ate_008_ok,
  to_regclass('public.eventos_meta') IS NULL AS tabela_ausente,
  (EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'registrar_perfil')
   AND to_regclass('public.eventos_meta') IS NULL) AS pronto_para_migrar;
