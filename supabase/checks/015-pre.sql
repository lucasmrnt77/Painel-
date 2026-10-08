-- Rodar ANTES de 015-alertas-so-erros.sql. Esperado: pronto_para_migrar = true.
SELECT to_regclass('public.testes_execucoes') IS NOT NULL AS pronto_para_migrar;
