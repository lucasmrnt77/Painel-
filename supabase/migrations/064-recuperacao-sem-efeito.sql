-- 064: Alerta "recuperação sem efeito" (19/11/2026, linha do Unnichat bloqueada em 18/11 ~22h sem ninguém perceber).
--  * Com a linha bloqueada, o Unnichat responde 200 (aceita) e a Meta recusa depois: o painel não via erro.
--  * recuperacao_sem_efeito(): conta os envios de recuperação feitos DEPOIS do último envio que resultou em
--    entrada no grupo (até 2 h depois). Com 100 ou mais e nenhuma entrada, devolve uma linha → alerta urgente.
--    Só envios com mais de 30 min (tempo de a pessoa entrar). Janela de 3 dias.
--  * Limite 100 (decisão de 19/11): no histórico de 15–18/11, sequências normais sem entrada chegaram a 78 envios;
--    os 2 bloqueios reais tiveram 168 e 376. Com 40 seriam ~6 alarmes falsos em 4 dias.
--  * alertas: novo tipo 'recuperacao_sem_efeito'.
BEGIN;

ALTER TABLE public.alertas DROP CONSTRAINT IF EXISTS alertas_tipo_check;
ALTER TABLE public.alertas ADD CONSTRAINT alertas_tipo_check CHECK (tipo = ANY (ARRAY[
  'sem_entradas', 'entradas_retomadas', 'resumo', 'teste', 'sem_leads', 'leads_retomados', 'planilha_parada',
  'ads_sem_dados', 'ads_sem_gasto', 'ads_cpl_alto', 'ads_gasto_baixo',
  'ads_conta_bloqueada', 'ads_limite_reduzido', 'ads_ritmo_baixo',
  'ads_campanha_parada', 'ads_dia_abaixo', 'ads_orcamento_divergente', 'ads_conta_sem_gasto',
  'intrusos_grupo', 'recuperacao_sem_efeito'
]));

CREATE OR REPLACE FUNCTION public.recuperacao_sem_efeito(p_lancamento bigint, p_minimo int DEFAULT 100)
RETURNS TABLE (desde timestamptz, ultimo timestamptz, envios int, ultima_entrada_em timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH e AS (
    SELECT r.enviado_em,
      EXISTS (SELECT 1 FROM membros_grupo m
               WHERE m.lancamento_id = r.lancamento_id AND m.telefone_chave = r.telefone_chave
                 AND m.primeira_entrada_em BETWEEN r.enviado_em AND r.enviado_em + interval '2 hours') AS entrou
    FROM recuperacao_envios r
    WHERE r.lancamento_id = p_lancamento
      AND r.enviado_em > now() - interval '3 days'
      AND r.enviado_em < now() - interval '30 minutes'
  ), anc AS (
    SELECT max(enviado_em) FILTER (WHERE entrou) AS a FROM e
  )
  SELECT min(e.enviado_em), max(e.enviado_em), count(*)::int, (SELECT a FROM anc)
  FROM e WHERE e.enviado_em > coalesce((SELECT a FROM anc), '-infinity'::timestamptz)
  HAVING count(*) >= p_minimo;
$$;
REVOKE ALL ON FUNCTION public.recuperacao_sem_efeito(bigint, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recuperacao_sem_efeito(bigint, int) TO service_role;

COMMIT;
