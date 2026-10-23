-- 038: Regra de calificado da Trader no painel = mapa do funil (22/10/2026), igual ao serviço de tracking:
--  "Menos de 3 meses", "6 a 12 meses" e "de 1 año" qualificam; "Nunca hice" não; sem a informação, qualifica.
--  Só a função muda: nenhum dado gravado é alterado. Ela é usada nas métricas dos testes de página
--  (metricas_teste_periodo) para leads da Trader sem a decisão do serviço de tracking.
BEGIN;

CREATE OR REPLACE FUNCTION public.qualifica_trader(p_experiencia text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO '' AS $$
  SELECT NOT coalesce(lower(btrim(p_experiencia)) LIKE 'nunca%', false)
$$;

COMMIT;
