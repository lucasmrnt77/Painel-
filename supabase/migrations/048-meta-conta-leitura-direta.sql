-- 048: Conta de anúncios lida direto da API da Meta (META_ADS_TOKEN, só leitura).
--
--  * meta_conta_leituras: cada rodada (a cada 30 min) guarda a situação da conta, o limite de gasto diário
--    definido pela Meta, a soma dos orçamentos e o gasto de hoje das campanhas ativas do lançamento.
--    A leitura anterior serve para perceber quando a Meta baixa o limite.
--  * alertas.tipo aceita os novos: ads_conta_bloqueada, ads_limite_reduzido, ads_ritmo_baixo.
--  * O "gasto mínimo a cada 30 min" digitado à mão (047) foi substituído pelo ritmo do orçamento lido da Meta:
--    a coluna lancamentos.ads_gasto_minimo_30min e a tabela ads_gasto_leituras ficam sem uso.
BEGIN;

CREATE TABLE IF NOT EXISTS public.meta_conta_leituras (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lancamento_id bigint NOT NULL REFERENCES public.lancamentos(id) ON DELETE CASCADE,
  lido_em       timestamptz NOT NULL,
  status        int NOT NULL,
  limite_diario numeric,
  orcamento_dia numeric NOT NULL,
  gasto_hoje    numeric NOT NULL,
  leitura       jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS meta_conta_leituras_lanc ON public.meta_conta_leituras (lancamento_id, lido_em DESC);
ALTER TABLE public.meta_conta_leituras ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.meta_conta_leituras FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_conta_leituras TO service_role;

ALTER TABLE public.alertas DROP CONSTRAINT IF EXISTS alertas_tipo_check;
ALTER TABLE public.alertas ADD CONSTRAINT alertas_tipo_check CHECK (tipo = ANY (ARRAY[
  'sem_entradas', 'entradas_retomadas', 'resumo', 'teste', 'sem_leads', 'leads_retomados', 'planilha_parada',
  'ads_sem_dados', 'ads_sem_gasto', 'ads_cpl_alto', 'ads_gasto_baixo',
  'ads_conta_bloqueada', 'ads_limite_reduzido', 'ads_ritmo_baixo'
]));

COMMENT ON COLUMN public.lancamentos.ads_gasto_minimo_30min IS 'Sem uso desde a 048 (substituído pelo ritmo do orçamento lido da Meta)';

COMMIT;
