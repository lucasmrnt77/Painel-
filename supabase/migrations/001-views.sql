-- =====================================================================
-- 001-views.sql — Views que o painel lê.
--
-- v_leads             uma linha por pessoa inscrita (dedup por telefone
--                     dentro do lançamento) com o status no grupo.
-- v_membros           quem está/esteve no grupo, marcando se veio da
--                     página de captura.
-- v_resumo_lancamentos KPIs por lançamento.
-- v_serie_diaria      inscrições x entradas x saídas por dia (UY).
--
-- Status em v_leads:
--   no_grupo          está no grupo agora
--   saiu              entrou e saiu (ou só temos a saída)
--   aguardando        ainda dentro da janela de minutos_reenvio
--   fora_do_grupo     passou da janela e não entrou → candidato a reenvio
-- =====================================================================
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.inscricoes') IS NULL OR to_regclass('public.membros_grupo') IS NULL THEN
    RAISE EXCEPTION '001-views: rode 000-base.sql antes';
  END IF;
  IF to_regclass('public.v_leads') IS NOT NULL THEN
    RAISE EXCEPTION '001-views: views já existem — abortando';
  END IF;
END $$;

CREATE VIEW public.v_leads WITH (security_invoker = true) AS
WITH envios AS (
  SELECT
    i.*,
    coalesce(i.telefone_chave, 'id:' || i.id) AS pessoa,
    count(*)        OVER w AS n_envios,
    max(i.criado_em) OVER w AS ultimo_envio_em,
    row_number()    OVER (PARTITION BY i.lancamento_id, coalesce(i.telefone_chave, 'id:' || i.id)
                          ORDER BY i.criado_em, i.id) AS ordem
  FROM public.inscricoes i
  WINDOW w AS (PARTITION BY i.lancamento_id, coalesce(i.telefone_chave, 'id:' || i.id))
),
membro AS (
  SELECT
    m.lancamento_id,
    m.telefone_chave,
    bool_or(m.no_grupo)                         AS no_grupo,
    min(m.primeira_entrada_em)                  AS entrou_em,
    max(m.saiu_em)                              AS saiu_em,
    string_agg(DISTINCT m.grupo_nome, ', ')     AS grupos
  FROM public.membros_grupo m
  GROUP BY m.lancamento_id, m.telefone_chave
)
SELECT
  e.id                AS inscricao_id,
  e.lancamento_id,
  l.slug              AS lancamento_slug,
  e.nome,
  e.email,
  e.telefone,
  e.telefone_chave,
  e.utm_source,
  e.utm_medium,
  e.utm_campaign,
  e.utm_content,
  e.utm_term,
  e.pagina,
  e.criado_em         AS inscrito_em,
  e.n_envios,
  e.ultimo_envio_em,
  m.entrou_em,
  m.saiu_em,
  m.grupos,
  coalesce(m.no_grupo, false) AS no_grupo,
  CASE
    WHEN e.telefone_chave IS NULL                                        THEN 'telefone_invalido'
    WHEN m.no_grupo                                                      THEN 'no_grupo'
    WHEN m.telefone_chave IS NOT NULL                                    THEN 'saiu'
    WHEN now() - e.criado_em < make_interval(mins => l.minutos_reenvio)  THEN 'aguardando'
    ELSE 'fora_do_grupo'
  END AS status,
  CASE WHEN m.entrou_em IS NOT NULL
       THEN round((extract(epoch FROM (m.entrou_em - e.criado_em)) / 60)::numeric, 1)
  END AS minutos_ate_entrar
FROM envios e
JOIN public.lancamentos l ON l.id = e.lancamento_id
LEFT JOIN membro m
  ON m.lancamento_id = e.lancamento_id
 AND m.telefone_chave = e.telefone_chave
WHERE e.ordem = 1;

CREATE VIEW public.v_membros WITH (security_invoker = true) AS
SELECT
  m.id,
  m.lancamento_id,
  l.slug AS lancamento_slug,
  m.grupo_id,
  m.grupo_nome,
  m.telefone,
  m.telefone_chave,
  m.no_grupo,
  m.primeira_entrada_em,
  m.ultima_entrada_em,
  m.saiu_em,
  m.atualizado_em,
  ins.primeira_inscricao_em,
  ins.nome,
  ins.email,
  (ins.primeira_inscricao_em IS NOT NULL) AS inscrito
FROM public.membros_grupo m
LEFT JOIN public.lancamentos l ON l.id = m.lancamento_id
LEFT JOIN LATERAL (
  SELECT i.criado_em AS primeira_inscricao_em, i.nome, i.email
  FROM public.inscricoes i
  WHERE i.lancamento_id = m.lancamento_id
    AND i.telefone_chave = m.telefone_chave
  ORDER BY i.criado_em, i.id
  LIMIT 1
) ins ON true;

CREATE VIEW public.v_resumo_lancamentos WITH (security_invoker = true) AS
SELECT
  l.id AS lancamento_id,
  l.slug,
  l.nome,
  l.ativo,
  l.link_grupo,
  l.sendflow_ref,
  l.minutos_reenvio,
  l.criado_em,
  coalesce(ld.inscritos, 0)          AS inscritos,
  coalesce(ld.no_grupo, 0)           AS no_grupo,
  coalesce(ld.aguardando, 0)         AS aguardando,
  coalesce(ld.fora_do_grupo, 0)      AS fora_do_grupo,
  coalesce(ld.saiu, 0)               AS saiu,
  coalesce(ld.telefone_invalido, 0)  AS telefone_invalido,
  coalesce(ld.envios_total, 0)       AS envios_total,
  ld.mediana_minutos_ate_entrar,
  coalesce(mb.membros_no_grupo, 0)   AS membros_no_grupo,
  coalesce(mb.membros_sem_inscricao, 0) AS membros_sem_inscricao,
  CASE WHEN coalesce(ld.inscritos, 0) > 0
       THEN round(100.0 * ld.no_grupo / ld.inscritos, 1)
  END AS pct_inscritos_no_grupo
FROM public.lancamentos l
LEFT JOIN (
  SELECT
    lancamento_id,
    count(*)                                          AS inscritos,
    count(*) FILTER (WHERE status = 'no_grupo')       AS no_grupo,
    count(*) FILTER (WHERE status = 'aguardando')     AS aguardando,
    count(*) FILTER (WHERE status = 'fora_do_grupo')  AS fora_do_grupo,
    count(*) FILTER (WHERE status = 'saiu')           AS saiu,
    count(*) FILTER (WHERE status = 'telefone_invalido') AS telefone_invalido,
    sum(n_envios)                                     AS envios_total,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY minutos_ate_entrar)
      FILTER (WHERE minutos_ate_entrar >= 0)          AS mediana_minutos_ate_entrar
  FROM public.v_leads
  GROUP BY lancamento_id
) ld ON ld.lancamento_id = l.id
LEFT JOIN (
  SELECT
    lancamento_id,
    count(DISTINCT telefone_chave) FILTER (WHERE no_grupo)                  AS membros_no_grupo,
    count(DISTINCT telefone_chave) FILTER (WHERE no_grupo AND NOT inscrito) AS membros_sem_inscricao
  FROM public.v_membros
  GROUP BY lancamento_id
) mb ON mb.lancamento_id = l.id;

CREATE VIEW public.v_serie_diaria WITH (security_invoker = true) AS
WITH ins AS (
  SELECT lancamento_id, (inscrito_em AT TIME ZONE 'America/Montevideo')::date AS dia, count(*) AS inscricoes
  FROM public.v_leads
  GROUP BY 1, 2
),
ent AS (
  SELECT lancamento_id, (recebido_em AT TIME ZONE 'America/Montevideo')::date AS dia,
         count(*) FILTER (WHERE tipo = 'entrou') AS entradas,
         count(*) FILTER (WHERE tipo = 'saiu')   AS saidas
  FROM public.eventos_sendflow
  WHERE tipo IN ('entrou', 'saiu') AND lancamento_id IS NOT NULL
  GROUP BY 1, 2
)
SELECT
  coalesce(ins.lancamento_id, ent.lancamento_id) AS lancamento_id,
  coalesce(ins.dia, ent.dia)                     AS dia,
  coalesce(ins.inscricoes, 0)                    AS inscricoes,
  coalesce(ent.entradas, 0)                      AS entradas,
  coalesce(ent.saidas, 0)                        AS saidas
FROM ins
FULL JOIN ent ON ent.lancamento_id = ins.lancamento_id AND ent.dia = ins.dia;

-- Permissões: REVOKE ALL antes do GRANT (default privileges do Supabase).
REVOKE ALL ON public.v_leads, public.v_membros, public.v_resumo_lancamentos, public.v_serie_diaria
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_leads, public.v_membros, public.v_resumo_lancamentos, public.v_serie_diaria
  TO service_role;

COMMIT;
