-- Rodar DEPOIS de 011-redir-gid.sql. Esperado: tudo_ok = true.
SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'redir_grupos' AND column_name = 'sendflow_gid') AS tudo_ok;
