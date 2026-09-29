-- Rodar ANTES de 004-paginas-captura.sql. Esperado: pronto_para_migrar = true.
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='inscricoes' AND column_name='origem') AS historico_ok,
  NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='inscricoes' AND column_name='pagina_captura') AS paginas_ausente,
  (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='inscricoes' AND column_name='origem')
   AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='inscricoes' AND column_name='pagina_captura')) AS pronto_para_migrar;
