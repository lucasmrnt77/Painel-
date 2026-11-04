-- 050: Alertas da Meta sem falso alarme (04/11/2026).
--  * ads_ritmo_baixo passa a comparar com a curva real de gasto da conta (mediana dos últimos 7 dias na mesma
--    hora), confirmado em 2 leituras seguidas — a divisão linear das 24 h alertava toda manhã. Só código.
--  * Tipos novos: ads_campanha_parada (campanha sem gastar ~2 h enquanto as outras gastam) e
--    ads_dia_abaixo (dia anterior fechou abaixo de 75% do orçamento).
BEGIN;
ALTER TABLE public.alertas DROP CONSTRAINT IF EXISTS alertas_tipo_check;
ALTER TABLE public.alertas ADD CONSTRAINT alertas_tipo_check CHECK (tipo = ANY (ARRAY[
  'sem_entradas', 'entradas_retomadas', 'resumo', 'teste', 'sem_leads', 'leads_retomados', 'planilha_parada',
  'ads_sem_dados', 'ads_sem_gasto', 'ads_cpl_alto', 'ads_gasto_baixo',
  'ads_conta_bloqueada', 'ads_limite_reduzido', 'ads_ritmo_baixo',
  'ads_campanha_parada', 'ads_dia_abaixo'
]));
CREATE INDEX IF NOT EXISTS meta_conta_leituras_lido ON public.meta_conta_leituras (lancamento_id, lido_em);
COMMIT;
