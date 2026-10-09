-- Rodar DEPOIS de 017-funil-grupo-gratuito.sql. Esperado: tudo_ok = true.
SELECT EXISTS (SELECT 1 FROM public.redir_funis WHERE slug = 'grupo') AS tudo_ok;
