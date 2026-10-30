-- 046: Telefones — correção e descarte automáticos (todos os lançamentos: a análise da base usa os anteriores).
--
--  bd_telefones_automatico() roda no cron da base (1x por hora), no "Recalcular" e na importação:
--   1) Cruzamento (033): número com erro que aparece completo em outro registro ou no grupo → corrigido.
--   2) Sugestões confiáveis da regra → aprovadas sozinhas:
--        · Argentina: veio só 15 + número (sem código de área) → 54911…
--        · Uruguai: número argentino digitado com o 598 → 549…
--   3) Todo o resto que ainda está com erro → DESCARTADO automaticamente, mas guardado:
--        · número de teste (dígitos repetidos/em sequência), poucos dígitos, dígitos a mais, formato desconhecido,
--        · Uruguai com um dígito a mais (a sugestão não é confiável: fica guardada como sugestão).
--      O descarte fica em bd_telefone_correcoes (situacao 'descartada', origem 'automatica') com o número
--      original, o motivo e a sugestão (quando houver). Dá para recuperar no painel (lista "Descartados").
--      Se o número completo aparecer depois (outro registro ou grupo), o cruzamento corrige sozinho.
--
--  Vale para todos os lançamentos da base (exceção autorizada à regra "só dezembro em diante").
--
--  v_bd_telefones_corrigidos: número como chegou × número corrigido, com o motivo (para análise).
--  v_bd_descartados: descartados (automáticos e manuais), com motivo e sugestão.
--  bd_recuperar_telefone(original): tira do descarte e volta para a revisão manual (não é descartado de novo).
BEGIN;

ALTER TABLE public.bd_telefone_correcoes ADD COLUMN IF NOT EXISTS motivo_original text;
COMMENT ON COLUMN public.bd_telefone_correcoes.origem IS 'manual | regra | ia | cruzamento | automatica';
COMMENT ON COLUMN public.bd_telefone_correcoes.motivo_original IS 'Problema que o normalizador encontrou no número como chegou';

-- ── Cruzamento: também pode corrigir um número que foi descartado automaticamente ─────────
CREATE OR REPLACE FUNCTION public.bd_cruzar_telefones()
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO '' SET statement_timeout TO '120s' AS $function$
DECLARE n int;
BEGIN
  WITH ruins AS (
    SELECT DISTINCT regexp_replace(telefone_original, '\D', '', 'g') AS o, tel_motivo
      FROM public.bd_leads WHERE tel_status IN ('invalido', 'revisar')
    UNION
    SELECT DISTINCT regexp_replace(coalesce(telefone_original, ''), '\D', '', 'g'), tel_motivo
      FROM public.bd_compras WHERE tel_status IN ('invalido', 'revisar') AND telefone_original IS NOT NULL
  ), alvo AS (
    SELECT r.o, r.tel_motivo FROM ruins r
     WHERE length(r.o) BETWEEN 9 AND 16
       AND coalesce(r.tel_motivo, '') NOT LIKE 'número de teste%'
       AND coalesce(r.tel_motivo, '') NOT LIKE 'descartado automaticamente: número de teste%'
       AND r.o !~ '(\d)\1{5,}' AND r.o !~ '(\d{2,3})\1\1'
       AND length(r.o) - CASE WHEN r.o LIKE '59%' THEN 3 ELSE 2 END >= 8
       -- sem decisão, ou só com o descarte automático (que o cruzamento pode desfazer)
       AND NOT EXISTS (SELECT 1 FROM public.bd_telefone_correcoes c
                        WHERE c.telefone_original = r.o AND NOT (c.situacao = 'descartada' AND c.origem = 'automatica'))
  ), bons AS (
    SELECT DISTINCT telefone FROM public.bd_leads WHERE tel_status IN ('ok', 'corrigido') AND telefone IS NOT NULL
    UNION
    SELECT DISTINCT telefone FROM public.bd_compras WHERE tel_status IN ('ok', 'corrigido') AND telefone IS NOT NULL
    UNION
    SELECT DISTINCT telefone FROM public.membros_grupo WHERE telefone IS NOT NULL
    UNION
    SELECT DISTINCT telefone FROM public.eventos_sendflow WHERE telefone IS NOT NULL
  ), cand AS (
    SELECT a.o, b.telefone
      FROM alvo a JOIN bons b ON right(b.telefone, 8) = right(a.o, 8)
     WHERE b.telefone <> a.o
       AND (
         (CASE WHEN a.o LIKE '59%' THEN left(b.telefone, 3) = left(a.o, 3) ELSE left(b.telefone, 2) = left(a.o, 2) END)
         OR (a.o LIKE '598%' AND b.telefone LIKE '549%' AND right(b.telefone, 10) = right(a.o, 10))
       )
    UNION
    SELECT a.o, v.c
      FROM alvo a
      CROSS JOIN LATERAL (SELECT '598' || left(substr(a.o, 4), i - 1) || substr(a.o, 4 + i) AS c
                            FROM generate_series(1, length(a.o) - 3) i) v
     WHERE a.o LIKE '5989%' AND length(a.o) = 12
       AND EXISTS (SELECT 1 FROM bons b WHERE b.telefone = v.c)
  ), unico AS (
    SELECT o, min(telefone) AS telefone FROM cand GROUP BY o HAVING count(DISTINCT telefone) = 1
  ), ins AS (
    INSERT INTO public.bd_telefone_correcoes (telefone_original, telefone, situacao, origem, motivo, motivo_original, atualizado_em)
    SELECT u.o, u.telefone, 'aprovada', 'cruzamento', 'número completo encontrado em outro registro da base ou no grupo',
           (SELECT max(a.tel_motivo) FROM alvo a WHERE a.o = u.o), now()
      FROM unico u
    ON CONFLICT (telefone_original) DO UPDATE
      SET telefone = EXCLUDED.telefone, situacao = 'aprovada', origem = 'cruzamento', motivo = EXCLUDED.motivo,
          motivo_original = coalesce(public.bd_telefone_correcoes.motivo_original, EXCLUDED.motivo_original), atualizado_em = now()
      WHERE public.bd_telefone_correcoes.situacao = 'descartada' AND public.bd_telefone_correcoes.origem = 'automatica'
    RETURNING telefone_original
  )
  SELECT count(*) INTO n FROM ins;
  IF n > 0 THEN PERFORM public.bd_renormalizar(NULL); END IF;
  RETURN jsonb_build_object('corrigidos', n);
END $function$;

-- ── Rodada automática ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bd_telefones_automatico()
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO '' SET statement_timeout TO '180s' AS $function$
DECLARE cruz jsonb; na int := 0; nd int := 0; v_o text;
BEGIN
  cruz := public.bd_cruzar_telefones();

  -- Números com erro (revisar/inválido) de todos os lançamentos, ainda sem nenhuma decisão
  CREATE TEMP TABLE _tel_auto ON COMMIT DROP AS
  SELECT t.o, max(t.status) AS status, max(t.motivo) AS motivo, max(t.sugestao) AS sugestao
    FROM (
      SELECT regexp_replace(l.telefone_original, '\D', '', 'g') AS o, l.tel_status AS status, l.tel_motivo AS motivo, l.tel_sugestao AS sugestao
        FROM public.bd_leads l
       WHERE l.tel_status IN ('revisar', 'invalido')
      UNION ALL
      SELECT regexp_replace(coalesce(c.telefone_original, ''), '\D', '', 'g'), c.tel_status, c.tel_motivo, c.tel_sugestao
        FROM public.bd_compras c
       WHERE c.tel_status IN ('revisar', 'invalido') AND c.telefone_original IS NOT NULL
    ) t
   WHERE t.o <> ''
     AND NOT EXISTS (SELECT 1 FROM public.bd_telefone_correcoes k WHERE k.telefone_original = t.o)
   GROUP BY t.o;

  -- Sugestões confiáveis → aprovadas
  WITH ins AS (
    INSERT INTO public.bd_telefone_correcoes (telefone_original, telefone, situacao, origem, motivo, motivo_original, atualizado_em)
    SELECT o, sugestao, 'aprovada', 'automatica', 'corrigido automaticamente: ' || motivo, motivo, now()
      FROM _tel_auto
     WHERE status = 'revisar' AND sugestao IS NOT NULL AND sugestao <> o
       AND (motivo LIKE 'Argentina: falta o código de área%' OR motivo LIKE 'Uruguai: parece número argentino%')
    ON CONFLICT (telefone_original) DO NOTHING
    RETURNING telefone_original
  )
  SELECT count(*) INTO na FROM ins;

  -- O resto → descartado automaticamente (guardado; a sugestão, se houver, fica em "telefone")
  WITH ins AS (
    INSERT INTO public.bd_telefone_correcoes (telefone_original, telefone, situacao, origem, motivo, motivo_original, atualizado_em)
    SELECT o, CASE WHEN sugestao <> o THEN sugestao END, 'descartada', 'automatica',
           'descartado automaticamente: ' || coalesce(motivo, 'formato desconhecido'), motivo, now()
      FROM _tel_auto
    ON CONFLICT (telefone_original) DO NOTHING
    RETURNING telefone_original
  )
  SELECT count(*) INTO nd FROM ins;

  -- Poucos números: recalcula só eles; muitos (1ª rodada): recalcula a base inteira de uma vez
  IF na + nd > 50 THEN
    PERFORM public.bd_renormalizar(NULL);
  ELSIF na + nd > 0 THEN
    FOR v_o IN SELECT a.o FROM _tel_auto a LOOP
      PERFORM public.bd_renormalizar(v_o);
    END LOOP;
  END IF;

  RETURN jsonb_build_object('cruzamento', cruz, 'aprovados', na, 'descartados', nd);
END $function$;

-- Tira do descarte: volta para a revisão manual. Fica marcado (sugerida/manual) para a rodada automática não descartar de novo.
CREATE OR REPLACE FUNCTION public.bd_recuperar_telefone(p_original text)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO '' AS $function$
BEGIN
  UPDATE public.bd_telefone_correcoes
     SET situacao = 'sugerida', origem = 'manual', motivo = coalesce(motivo_original, motivo), atualizado_em = now()
   WHERE telefone_original = p_original AND situacao = 'descartada';
  IF NOT FOUND THEN RAISE EXCEPTION 'número não está descartado'; END IF;
  RETURN public.bd_renormalizar(p_original);
END $function$;

-- ── Para análise: como chegou × como ficou ────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_bd_telefones_corrigidos WITH (security_invoker = true) AS
SELECT regexp_replace(l.telefone_original, '\D', '', 'g') AS telefone_original,
       l.telefone                                       AS telefone_corrigido,
       max(l.tel_motivo)                                AS motivo,
       max(k.motivo_original)                           AS motivo_original,
       coalesce(max(k.origem), 'regra')                 AS origem,
       count(*)::int                                    AS ocorrencias,
       string_agg(DISTINCT e.codigo, ', ')              AS edicoes,
       max(e.inicio)                                    AS ultimo_inicio
  FROM public.bd_leads l
  JOIN public.bd_edicoes e ON e.id = l.edicao_id
  LEFT JOIN public.bd_telefone_correcoes k ON k.telefone_original = regexp_replace(l.telefone_original, '\D', '', 'g') AND k.situacao = 'aprovada'
 WHERE l.tel_status = 'corrigido'
 GROUP BY 1, 2;

CREATE OR REPLACE VIEW public.v_bd_descartados WITH (security_invoker = true) AS
WITH usos AS ( -- descartado sempre fica como "invalido" nas linhas
  SELECT t.o, count(*) AS ocorrencias, bool_or(t.compra) AS e_comprador, string_agg(DISTINCT t.edicao, ', ') AS edicoes, max(t.inicio) AS ultimo_inicio
    FROM (
      SELECT regexp_replace(l.telefone_original, '\D', '', 'g') AS o, false AS compra, e.codigo AS edicao, e.inicio
        FROM public.bd_leads l JOIN public.bd_edicoes e ON e.id = l.edicao_id WHERE l.tel_status = 'invalido'
      UNION ALL
      SELECT regexp_replace(coalesce(c.telefone_original, ''), '\D', '', 'g'), true, e.codigo, e.inicio
        FROM public.bd_compras c JOIN public.bd_edicoes e ON e.id = c.edicao_id WHERE c.tel_status = 'invalido'
    ) t GROUP BY t.o
)
SELECT k.telefone_original,
       k.telefone                                 AS sugestao,
       coalesce(k.motivo_original, k.motivo)      AS motivo,
       k.origem,
       k.atualizado_em                            AS descartado_em,
       coalesce(u.ocorrencias, 0)::int            AS ocorrencias,
       coalesce(u.e_comprador, false)             AS e_comprador,
       coalesce(u.edicoes, '')                    AS edicoes,
       u.ultimo_inicio
  FROM public.bd_telefone_correcoes k
  LEFT JOIN usos u ON u.o = k.telefone_original
 WHERE k.situacao = 'descartada';

REVOKE ALL ON public.v_bd_telefones_corrigidos, public.v_bd_descartados FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_bd_telefones_corrigidos, public.v_bd_descartados TO service_role;
REVOKE ALL ON FUNCTION public.bd_telefones_automatico(), public.bd_recuperar_telefone(text), public.bd_cruzar_telefones()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bd_telefones_automatico(), public.bd_recuperar_telefone(text), public.bd_cruzar_telefones()
  TO service_role;

COMMIT;
