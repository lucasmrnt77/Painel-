-- 028: alertas de gasto e custo por lead na Meta (dados da Paola em pc_ads_meta_anuncio_dia).
--  * ads_campanha_filtro: nome da campanha na Meta (ILIKE, ex.: '%Aquecimento de Conta%'). Vazio = sem alertas de anúncios.
--  * ads_cpl_maximo: limite do custo por lead (qualificado), padrão US$ 8 (regra do Emi).
ALTER TABLE public.lancamentos ADD COLUMN IF NOT EXISTS ads_campanha_filtro text;
ALTER TABLE public.lancamentos ADD COLUMN IF NOT EXISTS ads_cpl_maximo numeric NOT NULL DEFAULT 8;

-- A OP Futuros roda na campanha "[PC][LEADS][CBO][UY] Aquecimento de Conta"
UPDATE public.lancamentos SET ads_campanha_filtro = '%Aquecimento de Conta%'
 WHERE tipo = 'grupo_gratuito' AND ads_campanha_filtro IS NULL;
