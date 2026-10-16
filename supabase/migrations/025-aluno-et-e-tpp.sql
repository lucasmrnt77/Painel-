-- 025: Base de leads — ajustes pedidos pelo Emi
--  * Quem comprou o Expert Trader vira aluno: deixa de ser contado nos lançamentos seguintes.
--    Conta no lançamento em que comprou (e nos anteriores). Comprar só o TPP não tira a pessoa da contagem.
--  * Aba TPP → Expert Trader: quem comprou TPP, se depois comprou ET, em quanto tempo e em quantos lançamentos;
--    quantos compram ET direto e quantos passam antes pelo TPP.
BEGIN;

DROP MATERIALIZED VIEW IF EXISTS public.v_bd_participacoes CASCADE;  -- leva junto v_bd_pessoas e as views de estatística

CREATE MATERIALIZED VIEW public.v_bd_participacoes AS
WITH base AS (
  SELECT telefone, edicao_id, min(data) AS data FROM public.bd_leads WHERE telefone IS NOT NULL GROUP BY 1, 2
  UNION ALL
  SELECT telefone_pessoa, edicao_id, min(data) FROM public.v_bd_compras
   WHERE conta_compra AND telefone_pessoa IS NOT NULL GROUP BY 1, 2
), p AS (
  SELECT telefone, edicao_id, min(data) AS data FROM base GROUP BY 1, 2
), compras AS (
  SELECT telefone_pessoa AS telefone, edicao_id,
         bool_or(produto = 'ET') AS comprou_et, bool_or(produto = 'TPP') AS comprou_tpp,
         sum(valor_usd) AS valor_usd
    FROM public.v_bd_compras WHERE conta_compra AND telefone_pessoa IS NOT NULL GROUP BY 1, 2
), virou_aluno AS (   -- primeiro lançamento em que comprou o Expert Trader
  SELECT c.telefone, min(e.inicio) AS inicio
    FROM compras c JOIN public.bd_edicoes e ON e.id = c.edicao_id
   WHERE c.comprou_et GROUP BY 1
)
SELECT p.telefone, p.edicao_id, e.codigo AS edicao, e.inicio, e.tem_leads, e.tem_compras, p.data,
       row_number() OVER (PARTITION BY p.telefone ORDER BY e.inicio)::int AS participacao,
       coalesce(c.comprou_et, false) AS comprou_et,
       coalesce(c.comprou_tpp, false) AS comprou_tpp,
       c.valor_usd
  FROM p JOIN public.bd_edicoes e ON e.id = p.edicao_id
  LEFT JOIN compras c ON c.telefone = p.telefone AND c.edicao_id = p.edicao_id
  LEFT JOIN virou_aluno a ON a.telefone = p.telefone
 WHERE a.inicio IS NULL OR e.inicio <= a.inicio;   -- depois de comprar o ET, já é aluno: não conta mais
CREATE UNIQUE INDEX v_bd_participacoes_pk ON public.v_bd_participacoes (telefone, edicao_id);

CREATE MATERIALIZED VIEW public.v_bd_pessoas AS
WITH emails AS (
  SELECT DISTINCT ON (telefone) telefone, email FROM (
    SELECT telefone, email, data FROM public.bd_leads WHERE telefone IS NOT NULL AND coalesce(email, '') <> ''
    UNION ALL
    SELECT telefone_pessoa, email, data FROM public.v_bd_compras WHERE telefone_pessoa IS NOT NULL AND coalesce(email, '') <> ''
  ) x ORDER BY telefone, data DESC NULLS LAST
)
SELECT p.telefone,
       public.bd_pais_do_telefone(p.telefone) AS pais,
       count(*)::int AS n_lancamentos,
       string_agg(p.edicao, ', ' ORDER BY p.inicio) AS lancamentos,
       (array_agg(p.edicao ORDER BY p.inicio))[1] AS primeiro,
       (array_agg(p.edicao ORDER BY p.inicio DESC))[1] AS ultimo,
       bool_or(p.comprou_et) AS comprou_et,
       bool_or(p.comprou_tpp) AS comprou_tpp,
       string_agg(p.edicao, ', ' ORDER BY p.inicio) FILTER (WHERE p.comprou_et) AS compras_et,
       string_agg(p.edicao, ', ' ORDER BY p.inicio) FILTER (WHERE p.comprou_tpp) AS compras_tpp,
       min(p.participacao) FILTER (WHERE p.comprou_et) AS comprou_et_na_participacao,
       sum(p.valor_usd) AS valor_usd,
       max(m.email) AS email
  FROM public.v_bd_participacoes p
  LEFT JOIN emails m ON m.telefone = p.telefone
 GROUP BY p.telefone;
CREATE UNIQUE INDEX v_bd_pessoas_pk ON public.v_bd_pessoas (telefone);
CREATE INDEX v_bd_pessoas_filtros ON public.v_bd_pessoas (n_lancamentos, comprou_et, comprou_tpp);

CREATE VIEW public.v_bd_conversao_participacao WITH (security_invoker = true) AS
SELECT CASE WHEN participacao >= 4 THEN '+3' ELSE participacao::text END AS participacao,
       count(*)::int AS participantes,
       count(*) FILTER (WHERE comprou_et)::int AS compraram_et,
       count(*) FILTER (WHERE comprou_tpp)::int AS compraram_tpp,
       count(*) FILTER (WHERE comprou_et OR comprou_tpp)::int AS compraram_algum,
       round(100.0 * count(*) FILTER (WHERE comprou_et) / nullif(count(*), 0), 2) AS taxa_et,
       round(100.0 * count(*) FILTER (WHERE comprou_tpp) / nullif(count(*), 0), 2) AS taxa_tpp,
       round(100.0 * count(*) FILTER (WHERE comprou_et OR comprou_tpp) / nullif(count(*), 0), 2) AS taxa_algum
  FROM public.v_bd_participacoes
 WHERE tem_leads AND tem_compras
 GROUP BY 1;

CREATE VIEW public.v_bd_conversao_edicao WITH (security_invoker = true) AS
SELECT edicao, inicio,
       CASE WHEN participacao >= 4 THEN '+3' ELSE participacao::text END AS participacao,
       count(*)::int AS participantes,
       count(*) FILTER (WHERE comprou_et)::int AS compraram_et,
       count(*) FILTER (WHERE comprou_tpp)::int AS compraram_tpp,
       round(100.0 * count(*) FILTER (WHERE comprou_et) / nullif(count(*), 0), 2) AS taxa_et,
       round(100.0 * count(*) FILTER (WHERE comprou_tpp) / nullif(count(*), 0), 2) AS taxa_tpp
  FROM public.v_bd_participacoes
 WHERE tem_leads AND tem_compras
 GROUP BY 1, 2, 3;

CREATE VIEW public.v_bd_conversao_total WITH (security_invoker = true) AS
SELECT CASE WHEN n_lancamentos >= 4 THEN '+3' ELSE n_lancamentos::text END AS lancamentos,
       count(*)::int AS pessoas,
       count(*) FILTER (WHERE comprou_et)::int AS compraram_et,
       count(*) FILTER (WHERE comprou_tpp)::int AS compraram_tpp,
       count(*) FILTER (WHERE comprou_et OR comprou_tpp)::int AS compraram_algum,
       round(100.0 * count(*) FILTER (WHERE comprou_et) / nullif(count(*), 0), 2) AS taxa_et,
       round(100.0 * count(*) FILTER (WHERE comprou_tpp) / nullif(count(*), 0), 2) AS taxa_tpp,
       round(100.0 * count(*) FILTER (WHERE comprou_et OR comprou_tpp) / nullif(count(*), 0), 2) AS taxa_algum
  FROM public.v_bd_pessoas
 GROUP BY 1;

CREATE VIEW public.v_bd_combinacoes WITH (security_invoker = true) AS
SELECT lancamentos, n_lancamentos,
       count(*)::int AS pessoas,
       count(*) FILTER (WHERE comprou_et)::int AS compraram_et,
       count(*) FILTER (WHERE comprou_tpp)::int AS compraram_tpp,
       round(100.0 * count(*) FILTER (WHERE comprou_et OR comprou_tpp) / nullif(count(*), 0), 2) AS taxa_algum
  FROM public.v_bd_pessoas
 WHERE n_lancamentos >= 2
 GROUP BY 1, 2;

CREATE VIEW public.v_bd_repeticao_edicao WITH (security_invoker = true) AS
SELECT p.edicao, p.inicio,
       count(*)::int AS pessoas,
       count(*) FILTER (WHERE s.n_lancamentos >= 2)::int AS em_outros,
       count(*) FILTER (WHERE p.participacao >= 2)::int AS ja_vinham_de_antes,
       round(100.0 * count(*) FILTER (WHERE s.n_lancamentos >= 2) / nullif(count(*), 0), 2) AS pct_em_outros
  FROM public.v_bd_participacoes p
  JOIN public.v_bd_pessoas s ON s.telefone = p.telefone
 GROUP BY 1, 2;

-- ── TPP → Expert Trader: uma linha por comprador (TPP e/ou ET) ──
CREATE VIEW public.v_bd_jornada_compra WITH (security_invoker = true) AS
WITH c AS (
  SELECT c.telefone_pessoa AS telefone, c.produto, e.codigo, e.inicio,
         coalesce(c.data, e.inicio::timestamptz) AS dt
    FROM public.v_bd_compras c JOIN public.bd_edicoes e ON e.id = c.edicao_id
   WHERE c.conta_compra AND c.telefone_pessoa IS NOT NULL
), ordem AS (SELECT codigo, row_number() OVER (ORDER BY inicio) AS n FROM public.bd_edicoes),
tpp AS (SELECT DISTINCT ON (telefone) telefone, codigo, inicio, dt FROM c WHERE produto = 'TPP' ORDER BY telefone, dt),
et  AS (SELECT DISTINCT ON (telefone) telefone, codigo, inicio, dt FROM c WHERE produto = 'ET'  ORDER BY telefone, dt)
SELECT coalesce(t.telefone, x.telefone) AS telefone,
       t.codigo AS tpp_lancamento, t.dt AS tpp_data,
       x.codigo AS et_lancamento, x.dt AS et_data,
       CASE
         WHEN x.telefone IS NULL THEN 'so_tpp'
         WHEN t.telefone IS NULL THEN 'et_direto'
         WHEN t.inicio < x.inicio THEN 'tpp_depois_et'
         WHEN t.inicio = x.inicio THEN 'mesmo_lancamento'
         ELSE 'et_antes_do_tpp'
       END AS caminho,
       CASE WHEN t.telefone IS NOT NULL AND x.telefone IS NOT NULL AND t.inicio < x.inicio
            THEN round(extract(epoch FROM x.dt - t.dt) / 86400)::int END AS dias_ate_et,
       CASE WHEN t.telefone IS NOT NULL AND x.telefone IS NOT NULL AND t.inicio < x.inicio
            THEN (SELECT o2.n - o1.n FROM ordem o1, ordem o2 WHERE o1.codigo = t.codigo AND o2.codigo = x.codigo)::int END AS lancamentos_ate_et
  FROM tpp t FULL JOIN et x ON x.telefone = t.telefone;

-- Resumo por caminho
CREATE VIEW public.v_bd_jornada_resumo WITH (security_invoker = true) AS
SELECT caminho,
       count(*)::int AS pessoas,
       round(avg(dias_ate_et))::int AS dias_medio,
       (percentile_cont(0.5) WITHIN GROUP (ORDER BY dias_ate_et))::int AS dias_mediana,
       round(avg(lancamentos_ate_et), 2) AS lancamentos_medio
  FROM public.v_bd_jornada_compra
 GROUP BY 1;

-- Por lançamento do TPP: quantos depois compraram o ET
CREATE VIEW public.v_bd_jornada_por_tpp WITH (security_invoker = true) AS
SELECT j.tpp_lancamento AS lancamento, e.inicio,
       count(*)::int AS compraram_tpp,
       count(*) FILTER (WHERE j.caminho = 'tpp_depois_et')::int AS depois_compraram_et,
       round(100.0 * count(*) FILTER (WHERE j.caminho = 'tpp_depois_et') / nullif(count(*), 0), 2) AS taxa,
       count(*) FILTER (WHERE j.caminho IN ('mesmo_lancamento', 'et_antes_do_tpp'))::int AS ja_eram_alunos_et
  FROM public.v_bd_jornada_compra j JOIN public.bd_edicoes e ON e.codigo = j.tpp_lancamento
 GROUP BY 1, 2;

-- Quantos lançamentos depois do TPP compraram o ET
CREATE VIEW public.v_bd_jornada_distancia WITH (security_invoker = true) AS
SELECT CASE WHEN lancamentos_ate_et >= 3 THEN '3+' ELSE lancamentos_ate_et::text END AS lancamentos_depois,
       count(*)::int AS pessoas,
       (percentile_cont(0.5) WITHIN GROUP (ORDER BY dias_ate_et))::int AS dias_mediana
  FROM public.v_bd_jornada_compra
 WHERE caminho = 'tpp_depois_et'
 GROUP BY 1;

REVOKE ALL ON public.v_bd_participacoes, public.v_bd_pessoas, public.v_bd_conversao_participacao, public.v_bd_conversao_edicao,
              public.v_bd_conversao_total, public.v_bd_combinacoes, public.v_bd_repeticao_edicao, public.v_bd_jornada_compra,
              public.v_bd_jornada_resumo, public.v_bd_jornada_por_tpp, public.v_bd_jornada_distancia FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_bd_participacoes, public.v_bd_pessoas, public.v_bd_conversao_participacao, public.v_bd_conversao_edicao,
               public.v_bd_conversao_total, public.v_bd_combinacoes, public.v_bd_repeticao_edicao, public.v_bd_jornada_compra,
               public.v_bd_jornada_resumo, public.v_bd_jornada_por_tpp, public.v_bd_jornada_distancia TO service_role;

COMMIT;

SELECT public.bd_atualizar_base();
