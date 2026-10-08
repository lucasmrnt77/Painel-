-- Rodar ANTES de 013-alertas-grupo-gratuito.sql. Esperado: pronto_para_migrar = true.
SELECT
  to_regclass('public.links') IS NOT NULL AS ate_012_ok,
  NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lancamentos' AND column_name = 'tipo') AS coluna_ausente,
  NOT EXISTS (SELECT 1 FROM public.lancamentos WHERE slug = 'grupo-gratuito') AS slug_livre,
  (to_regclass('public.links') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lancamentos' AND column_name = 'tipo')
   AND NOT EXISTS (SELECT 1 FROM public.lancamentos WHERE slug = 'grupo-gratuito')) AS pronto_para_migrar;
