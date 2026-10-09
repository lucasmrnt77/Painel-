-- Rodar ANTES de 017-funil-grupo-gratuito.sql. Esperado: pronto_para_migrar = true.
SELECT to_regclass('public.redir_funis') IS NOT NULL AS pronto_para_migrar;
