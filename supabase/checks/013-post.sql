-- Rodar DEPOIS de 013-alertas-grupo-gratuito.sql. Esperado: tudo_ok = true.
SELECT (
  (SELECT count(*) FROM public.lancamentos WHERE tipo = 'grupo_gratuito' AND NOT ativo) = 1
  AND (SELECT count(*) FROM public.lancamentos WHERE ativo) <= 1
) AS tudo_ok;
