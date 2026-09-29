-- Rodar ANTES de 002-monitor.sql. Esperado: pronto_para_migrar = true.
SELECT
  to_regclass('public.v_leads') IS NOT NULL AS base_ok,
  to_regclass('public.alertas') IS NULL     AS monitor_ausente,
  (to_regclass('public.v_leads') IS NOT NULL AND to_regclass('public.alertas') IS NULL) AS pronto_para_migrar;
