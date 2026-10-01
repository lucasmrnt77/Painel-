-- Rodar ANTES de 008-perfil-pos-cadastro.sql. Esperado: pronto_para_migrar = true.
SELECT
  to_regclass('public.registros_evento') IS NOT NULL AS ate_007_ok,
  NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'registrar_perfil') AS funcao_ausente,
  (to_regclass('public.registros_evento') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'registrar_perfil')) AS pronto_para_migrar;
