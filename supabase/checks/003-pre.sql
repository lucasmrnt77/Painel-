-- Rodar ANTES de 003-historico.sql. Esperado: pronto_para_migrar = true.
SELECT
  to_regclass('public.alertas') IS NOT NULL AS monitor_ok,
  NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='inscricoes' AND column_name='origem') AS historico_ausente,
  (to_regclass('public.alertas') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='inscricoes' AND column_name='origem')) AS pronto_para_migrar;
