-- Rodar DEPOIS de 015-alertas-so-erros.sql. Esperado: tudo_ok = true.
SELECT NOT EXISTS (SELECT 1 FROM public.lancamentos WHERE alerta_minutos_sem_entrada <> 1440 OR resumo_minutos <> 0) AS tudo_ok;
