-- 051: Orçamento planejado do dia no painel (05/11/2026).
--  lancamentos.ads_orcamento_planejado: o orçamento que a equipe planejou para o dia (US$). O painel compara a cada
--  30 min com a soma dos orçamentos das campanhas ativas na Meta e alerta (ads_orcamento_divergente) se não bater
--  (diferença > 5% ou US$ 5) em duas leituras seguidas. NULL = sem conferência.
--  ads_orcamento_planejado_hist: cada mudança do valor (auditoria simples, gravada por gatilho).
BEGIN;
ALTER TABLE public.lancamentos ADD COLUMN IF NOT EXISTS ads_orcamento_planejado numeric
  CHECK (ads_orcamento_planejado IS NULL OR ads_orcamento_planejado > 0);

CREATE TABLE IF NOT EXISTS public.ads_orcamento_planejado_hist (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lancamento_id bigint NOT NULL REFERENCES public.lancamentos(id) ON DELETE CASCADE,
  de            numeric,
  para          numeric,
  alterado_em   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ads_orcamento_planejado_hist ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ads_orcamento_planejado_hist FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.ads_orcamento_planejado_hist TO service_role;

CREATE OR REPLACE FUNCTION public.ads_orcamento_planejado_log()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
  IF NEW.ads_orcamento_planejado IS DISTINCT FROM OLD.ads_orcamento_planejado THEN
    INSERT INTO public.ads_orcamento_planejado_hist (lancamento_id, de, para)
    VALUES (NEW.id, OLD.ads_orcamento_planejado, NEW.ads_orcamento_planejado);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS lancamentos_orcamento_planejado_log ON public.lancamentos;
CREATE TRIGGER lancamentos_orcamento_planejado_log AFTER UPDATE OF ads_orcamento_planejado ON public.lancamentos
  FOR EACH ROW EXECUTE FUNCTION public.ads_orcamento_planejado_log();

ALTER TABLE public.alertas DROP CONSTRAINT IF EXISTS alertas_tipo_check;
ALTER TABLE public.alertas ADD CONSTRAINT alertas_tipo_check CHECK (tipo = ANY (ARRAY[
  'sem_entradas', 'entradas_retomadas', 'resumo', 'teste', 'sem_leads', 'leads_retomados', 'planilha_parada',
  'ads_sem_dados', 'ads_sem_gasto', 'ads_cpl_alto', 'ads_gasto_baixo',
  'ads_conta_bloqueada', 'ads_limite_reduzido', 'ads_ritmo_baixo',
  'ads_campanha_parada', 'ads_dia_abaixo', 'ads_orcamento_divergente'
]));
COMMIT;
