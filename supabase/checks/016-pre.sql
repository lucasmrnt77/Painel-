-- Rodar ANTES de 016-meta-saude.sql. Esperado: pronto_para_migrar = true.
SELECT (to_regclass('public.testes_execucoes') IS NOT NULL AND to_regclass('public.meta_saude') IS NULL) AS pronto_para_migrar;
