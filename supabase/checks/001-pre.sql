-- Rodar ANTES de 001-views.sql. Esperado: pronto_para_migrar = true.
SELECT
  to_regclass('public.inscricoes') IS NOT NULL AND to_regclass('public.membros_grupo') IS NOT NULL AS base_ok,
  to_regclass('public.v_leads') IS NULL                                                        AS views_ausentes,
  (to_regclass('public.inscricoes') IS NOT NULL AND to_regclass('public.membros_grupo') IS NOT NULL
   AND to_regclass('public.v_leads') IS NULL)                                                  AS pronto_para_migrar;
