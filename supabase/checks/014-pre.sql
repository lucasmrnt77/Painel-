-- Rodar ANTES de 014-testes-automaticos.sql. Esperado: pronto_para_migrar = true.
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lancamentos' AND column_name = 'tipo') AS ate_013_ok,
  to_regclass('public.testes_execucoes') IS NULL AS tabela_ausente,
  (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lancamentos' AND column_name = 'tipo')
   AND to_regclass('public.testes_execucoes') IS NULL) AS pronto_para_migrar;
