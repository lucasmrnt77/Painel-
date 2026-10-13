-- 019: botão "captação iniciada" por lançamento.
-- Enquanto estiver desligado, a Visão geral abre na campanha do grupo gratuito (OP Futuros);
-- ligado, abre no lançamento (para testes com dados reais e o período oficial).
BEGIN;
ALTER TABLE public.lancamentos ADD COLUMN IF NOT EXISTS captacao_iniciada boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.lancamentos.captacao_iniciada IS 'Liga a exibição do lançamento na Visão geral (testes reais e período oficial).';
COMMIT;
