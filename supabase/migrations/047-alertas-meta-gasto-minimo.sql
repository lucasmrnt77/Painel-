-- 047: Alertas das campanhas na Meta — gasto mínimo a cada 30 min e custo por lead a partir das 6h.
--
--  * lancamentos.ads_gasto_minimo_30min: mínimo que a Meta deve gastar a cada 30 min (NULL = alerta desligado).
--    Configurável no painel (Alertas → Configuração): ex.: US$ 50 no começo do lançamento, mais nas fases seguintes.
--  * lancamentos.ads_hora_inicio: hora local (UY/AR) a partir da qual o dia é avaliado (evita falso alarme
--    nas primeiras horas). Padrão 12 (como antes); dezembro/2026 = 6.
--  * ads_gasto_leituras: gasto acumulado de hoje em cada sincronização dos dados da Meta (o painel guarda a
--    cada rodada, a cada 30 min) — base da comparação "quanto gastou desde a sincronização anterior".
--  * alertas.tipo passa a aceitar os alertas de campanha (ads_*): a restrição antiga não tinha esses tipos.
--  * Dezembro/2026 (lançamento 5): campanhas com [DEZ26] no nome, custo máximo por lead US$ 6 (todos os leads
--    do dia: General + Jubilados + GenJub + Trader), avaliação a partir das 6h. Gasto mínimo fica vazio até ser
--    configurado no painel. O monitor do lançamento continua como está (ligar no painel).
BEGIN;

ALTER TABLE public.lancamentos ADD COLUMN IF NOT EXISTS ads_gasto_minimo_30min numeric
  CHECK (ads_gasto_minimo_30min IS NULL OR ads_gasto_minimo_30min > 0);
ALTER TABLE public.lancamentos ADD COLUMN IF NOT EXISTS ads_hora_inicio int NOT NULL DEFAULT 12
  CHECK (ads_hora_inicio BETWEEN 0 AND 23);

CREATE TABLE IF NOT EXISTS public.ads_gasto_leituras (
  lancamento_id bigint NOT NULL REFERENCES public.lancamentos(id) ON DELETE CASCADE,
  sync_em       timestamptz NOT NULL,          -- atualizado_em da sincronização (pc_ads_meta_anuncio_dia)
  dia           date NOT NULL,                 -- dia local (UY/AR)
  investimento  numeric NOT NULL,              -- gasto acumulado do dia nessa sincronização
  lido_em       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lancamento_id, sync_em)
);
CREATE INDEX IF NOT EXISTS ads_gasto_leituras_dia ON public.ads_gasto_leituras (lancamento_id, dia);
ALTER TABLE public.ads_gasto_leituras ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ads_gasto_leituras FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ads_gasto_leituras TO service_role;

ALTER TABLE public.alertas DROP CONSTRAINT IF EXISTS alertas_tipo_check;
ALTER TABLE public.alertas ADD CONSTRAINT alertas_tipo_check CHECK (tipo = ANY (ARRAY[
  'sem_entradas', 'entradas_retomadas', 'resumo', 'teste', 'sem_leads', 'leads_retomados', 'planilha_parada',
  'ads_sem_dados', 'ads_sem_gasto', 'ads_cpl_alto', 'ads_gasto_baixo'
]));

UPDATE public.lancamentos
   SET ads_campanha_filtro = coalesce(ads_campanha_filtro, '%[DEZ26]%'),
       ads_cpl_maximo = 6,
       ads_hora_inicio = 6
 WHERE id = 5;

COMMIT;
