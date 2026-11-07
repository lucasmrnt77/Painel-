-- 054: Alerta "conta da Meta sem gastar" no nível da conta (07/11/2026, pedido do Emi).
--  * Substitui o alerta por campanha (ads_campanha_parada): campanha nova agendada ou em análise disparava
--    alerta enquanto a conta gastava normal (06/11, 23:07: 5 alertas de campanhas "Escala 01").
--  * Agora: a soma das campanhas ativas do lançamento não gastou nada em ~2 h, de 8h em diante. Sem nada rodando, não avisa.
--  * ads_campanha_parada continua aceito só para o histórico.
BEGIN;
ALTER TABLE public.alertas DROP CONSTRAINT IF EXISTS alertas_tipo_check;
ALTER TABLE public.alertas ADD CONSTRAINT alertas_tipo_check CHECK (tipo = ANY (ARRAY[
  'sem_entradas', 'entradas_retomadas', 'resumo', 'teste', 'sem_leads', 'leads_retomados', 'planilha_parada',
  'ads_sem_dados', 'ads_sem_gasto', 'ads_cpl_alto', 'ads_gasto_baixo',
  'ads_conta_bloqueada', 'ads_limite_reduzido', 'ads_ritmo_baixo',
  'ads_campanha_parada', 'ads_dia_abaixo', 'ads_orcamento_divergente', 'ads_conta_sem_gasto'
]));
COMMIT;
