-- Rodar ANTES de 005-demografia-e-grupos.sql. Esperado: pronto_para_migrar = true.
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='inscricoes' AND column_name='pagina_captura') AS paginas_ok,
  NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='inscricoes' AND column_name='faixa_etaria') AS demografia_ausente,
  (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='inscricoes' AND column_name='pagina_captura')
   AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='inscricoes' AND column_name='faixa_etaria')) AS pronto_para_migrar;
