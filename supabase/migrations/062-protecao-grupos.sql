-- 062: Proteção dos grupos contra suspensão (18/11/2026, depois das quedas do #57 e do #49).
--  * intrusos_grupo(): rajadas de 3+ números SEM inscrição no lançamento entrando no mesmo grupo
--    com menos de 2 min entre um e outro (no #49 foram 4 em 32 s, 5 min antes da suspensão).
--    Olha as entradas entre p_minutos atrás e 3 min atrás (dá tempo de a inscrição chegar).
--  * membros_grupo_contatos(): e-mail, telefone, página e hora de entrada de todos os membros de
--    um grupo — para resgatar a base quando o grupo cai.
--  * alertas: novo tipo 'intrusos_grupo'.
BEGIN;

ALTER TABLE public.alertas DROP CONSTRAINT IF EXISTS alertas_tipo_check;
ALTER TABLE public.alertas ADD CONSTRAINT alertas_tipo_check CHECK (tipo = ANY (ARRAY[
  'sem_entradas', 'entradas_retomadas', 'resumo', 'teste', 'sem_leads', 'leads_retomados', 'planilha_parada',
  'ads_sem_dados', 'ads_sem_gasto', 'ads_cpl_alto', 'ads_gasto_baixo',
  'ads_conta_bloqueada', 'ads_limite_reduzido', 'ads_ritmo_baixo',
  'ads_campanha_parada', 'ads_dia_abaixo', 'ads_orcamento_divergente', 'ads_conta_sem_gasto',
  'intrusos_grupo'
]));

CREATE OR REPLACE FUNCTION public.intrusos_grupo(p_lancamento bigint, p_minutos int DEFAULT 30)
RETURNS TABLE (grupo_id text, grupo_nome text, inicio timestamptz, fim timestamptz, telefones text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH sem AS (
    SELECT m.grupo_id, m.grupo_nome, m.telefone, m.primeira_entrada_em AS t
    FROM membros_grupo m
    WHERE m.lancamento_id = p_lancamento
      AND m.primeira_entrada_em >= now() - make_interval(mins => p_minutos)
      AND m.primeira_entrada_em <  now() - interval '3 minutes'
      AND NOT EXISTS (SELECT 1 FROM inscricoes i WHERE i.lancamento_id = p_lancamento AND i.telefone_chave = m.telefone_chave)
  ), marcado AS (
    SELECT *, CASE WHEN t - lag(t) OVER (PARTITION BY grupo_id ORDER BY t) <= interval '2 minutes' THEN 0 ELSE 1 END AS novo
    FROM sem
  ), ilhas AS (
    SELECT *, sum(novo) OVER (PARTITION BY grupo_id ORDER BY t) AS ilha FROM marcado
  )
  SELECT grupo_id, max(grupo_nome), min(t), max(t), array_agg(telefone ORDER BY t)
  FROM ilhas GROUP BY grupo_id, ilha HAVING count(*) >= 3;
$$;

CREATE OR REPLACE FUNCTION public.membros_grupo_contatos(p_grupo_id text)
RETURNS TABLE (email text, telefone text, pagina text, entrou_em timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH m AS (
    SELECT DISTINCT ON (telefone_chave) lancamento_id, telefone, telefone_chave, primeira_entrada_em
    FROM membros_grupo
    WHERE grupo_id = CASE WHEN p_grupo_id LIKE '%@g.us' THEN p_grupo_id ELSE p_grupo_id || '@g.us' END
    ORDER BY telefone_chave, primeira_entrada_em
  ), i AS (
    SELECT DISTINCT ON (x.telefone_chave) x.telefone_chave, nullif(trim(x.email), '') AS email, x.pagina_captura, x.experiencia
    FROM inscricoes x JOIN m ON m.lancamento_id = x.lancamento_id AND m.telefone_chave = x.telefone_chave
    ORDER BY x.telefone_chave, (coalesce(x.email, '') <> '') DESC, x.criado_em DESC
  ), b AS (
    SELECT DISTINCT ON (right(telefone, 8)) right(telefone, 8) AS k, trim(email) AS email
    FROM bd_leads WHERE coalesce(email, '') <> '' AND right(telefone, 8) IN (SELECT right(telefone, 8) FROM m)
    ORDER BY right(telefone, 8), criado_em DESC
  )
  SELECT coalesce(i.email, b.email, ''), m.telefone,
    CASE WHEN i.telefone_chave IS NULL THEN 'sem inscrição encontrada'
         WHEN i.pagina_captura = 'trader' THEN 'Trader' || CASE WHEN i.experiencia = 'nunca' THEN ' (nunca operou → General)' ELSE '' END
         ELSE 'General/Jubilados' END,
    m.primeira_entrada_em
  FROM m LEFT JOIN i USING (telefone_chave) LEFT JOIN b ON b.k = right(m.telefone, 8)
  ORDER BY m.primeira_entrada_em;
$$;

REVOKE ALL ON FUNCTION public.intrusos_grupo(bigint, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.membros_grupo_contatos(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.intrusos_grupo(bigint, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.membros_grupo_contatos(text) TO service_role;

COMMIT;
