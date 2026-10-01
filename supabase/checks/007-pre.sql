-- Rodar ANTES de 007-registros-evento.sql. Esperado: pronto_para_migrar = true.
SELECT
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'atualizar_estatisticas') AS ate_006_ok,
  to_regclass('public.registros_evento') IS NULL AS tabela_ausente,
  (EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'atualizar_estatisticas')
   AND to_regclass('public.registros_evento') IS NULL) AS pronto_para_migrar;
