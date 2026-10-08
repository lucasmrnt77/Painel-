-- =====================================================================
-- 015-alertas-so-erros.sql — o grupo de alertas só recebe problemas.
--
-- O alerta de "ninguém entrou" passa a ter prazo padrão de 24 h e o resumo
-- periódico vem desligado (resumos não vão mais para o WhatsApp — a regra
-- de quem vai para o grupo está em src/lib/politica-alertas.ts).
-- Aplica o novo padrão também aos lançamentos já cadastrados.
-- =====================================================================
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.testes_execucoes') IS NULL THEN
    RAISE EXCEPTION '015-alertas-so-erros: rode 000 a 014 antes';
  END IF;
END $$;

ALTER TABLE public.lancamentos ALTER COLUMN alerta_minutos_sem_entrada SET DEFAULT 1440;
ALTER TABLE public.lancamentos ALTER COLUMN resumo_minutos SET DEFAULT 0;

UPDATE public.lancamentos SET alerta_minutos_sem_entrada = 1440, resumo_minutos = 0;

COMMIT;
