-- 033: Telefones para revisar / inválidos
--  1) O cruzamento automático passa a usar também os números do grupo de WhatsApp (membros_grupo e
--     eventos_sendflow), que são números reais. E, no Uruguai com um dígito a mais (5989 + 9 dígitos),
--     testa tirar cada um dos dígitos: se só uma versão existe na base ou no grupo, corrige.
--  2) bd_aprovar_sugestoes(p_motivo): aprova as sugestões de um tipo de problema só (ex.: o "15" da Argentina).
--  3) v_bd_invalidos: números sem correção automática, para editar à mão no painel.
BEGIN;

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
    SELECT o, tel_motivo FROM ruins
     WHERE length(o) BETWEEN 9 AND 16
       AND coalesce(tel_motivo, '') NOT LIKE 'número de teste%'
       AND o !~ '(\d)\1{5,}' AND o !~ '(\d{2,3})\1\1'
       AND length(o) - CASE WHEN o LIKE '59%' THEN 3 ELSE 2 END >= 8
       AND NOT EXISTS (SELECT 1 FROM public.bd_telefone_correcoes c WHERE c.telefone_original = ruins.o)
  ), bons AS (
    SELECT DISTINCT telefone FROM public.bd_leads WHERE tel_status IN ('ok', 'corrigido') AND telefone IS NOT NULL
    UNION
    SELECT DISTINCT telefone FROM public.bd_compras WHERE tel_status IN ('ok', 'corrigido') AND telefone IS NOT NULL
    UNION -- números reais do grupo de WhatsApp
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
    -- Uruguai com um dígito a mais: cada versão sem um dos dígitos
    SELECT a.o, v.c
      FROM alvo a
      CROSS JOIN LATERAL (SELECT '598' || left(substr(a.o, 4), i - 1) || substr(a.o, 4 + i) AS c
                            FROM generate_series(1, length(a.o) - 3) i) v
     WHERE a.o LIKE '5989%' AND length(a.o) = 12
       AND EXISTS (SELECT 1 FROM bons b WHERE b.telefone = v.c)
  ), unico AS (
    SELECT o, min(telefone) AS telefone FROM cand GROUP BY o HAVING count(DISTINCT telefone) = 1
  ), ins AS (
    INSERT INTO public.bd_telefone_correcoes (telefone_original, telefone, situacao, origem, motivo, atualizado_em)
    SELECT o, telefone, 'aprovada', 'cruzamento', 'número completo encontrado em outro registro da base ou no grupo', now() FROM unico
    ON CONFLICT (telefone_original) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO n FROM ins;
  IF n > 0 THEN PERFORM public.bd_renormalizar(NULL); END IF;
  RETURN jsonb_build_object('corrigidos', n);
END $function$;

DROP FUNCTION IF EXISTS public.bd_aprovar_sugestoes();
CREATE FUNCTION public.bd_aprovar_sugestoes(p_motivo text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO '' SET statement_timeout TO '120s' AS $function$
DECLARE n int;
BEGIN
  INSERT INTO public.bd_telefone_correcoes (telefone_original, telefone, situacao, origem, motivo, atualizado_em)
  SELECT telefone_original, sugestao, 'aprovada', coalesce(origem_sugestao, 'regra'), coalesce(motivo_sugestao, motivo), now()
    FROM public.v_bd_revisar
   WHERE sugestao IS NOT NULL AND (p_motivo IS NULL OR motivo = p_motivo)
  ON CONFLICT (telefone_original) DO UPDATE
    SET telefone = EXCLUDED.telefone, situacao = 'aprovada', atualizado_em = now()
    WHERE public.bd_telefone_correcoes.situacao = 'sugerida';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM public.bd_renormalizar(NULL);
  RETURN jsonb_build_object('aprovadas', n);
END $function$;
REVOKE ALL ON FUNCTION public.bd_aprovar_sugestoes(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bd_aprovar_sugestoes(text) TO service_role;

-- Inválidos ainda sem decisão (sem correção aprovada nem descartada)
CREATE OR REPLACE VIEW public.v_bd_invalidos WITH (security_invoker = true) AS
SELECT t.o AS telefone_original,
       max(t.tel_motivo)                    AS motivo,
       count(*)::int                        AS ocorrencias,
       bool_or(t.compra)                    AS e_comprador,
       string_agg(DISTINCT t.edicao, ', ')  AS edicoes
  FROM (
    SELECT regexp_replace(l.telefone_original, '\D', '', 'g') AS o, l.tel_motivo, false AS compra, e.codigo AS edicao
      FROM public.bd_leads l JOIN public.bd_edicoes e ON e.id = l.edicao_id
     WHERE l.tel_status = 'invalido'
    UNION ALL
    SELECT regexp_replace(coalesce(c.telefone_original, ''), '\D', '', 'g'), c.tel_motivo, true, e.codigo
      FROM public.bd_compras c JOIN public.bd_edicoes e ON e.id = c.edicao_id
     WHERE c.tel_status = 'invalido' AND c.telefone_original IS NOT NULL
  ) t
 WHERE t.o <> ''
   AND NOT EXISTS (SELECT 1 FROM public.bd_telefone_correcoes k WHERE k.telefone_original = t.o AND k.situacao IN ('aprovada', 'descartada'))
 GROUP BY t.o;
REVOKE ALL ON public.v_bd_invalidos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_bd_invalidos TO service_role;

-- Resumo por tipo de problema (filtros do painel)
CREATE OR REPLACE VIEW public.v_bd_problemas_resumo WITH (security_invoker = true) AS
SELECT 'revisar'::text AS lista, motivo, count(*)::int AS numeros, count(*) FILTER (WHERE e_comprador)::int AS compradores
  FROM public.v_bd_revisar GROUP BY motivo
UNION ALL
SELECT 'invalido', motivo, count(*)::int, count(*) FILTER (WHERE e_comprador)::int
  FROM public.v_bd_invalidos GROUP BY motivo;
REVOKE ALL ON public.v_bd_problemas_resumo FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_bd_problemas_resumo TO service_role;

COMMIT;
