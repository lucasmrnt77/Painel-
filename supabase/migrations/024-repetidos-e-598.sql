-- 024: Base de leads
--  * Número argentino digitado com o 598 do Uruguai: a regra deixa de corrigir sozinha e manda para revisão
--    com a sugestão 549. Só ficam corrigidos (como correção aprovada) os que têm prova: a inscrição veio de
--    anúncio da campanha da Argentina (UTM). Os demais aparecem em "Telefones para revisar".
--  * v_bd_combinacoes: pessoas que estiveram em mais de 1 lançamento, por combinação de lançamentos.
--  * v_bd_repeticao_edicao: em cada lançamento, quantos também estiveram em outro.
BEGIN;

-- 1) Guarda como aprovados os que têm prova (anúncio da Argentina), antes de mudar a regra
INSERT INTO public.bd_telefone_correcoes (telefone_original, telefone, situacao, origem, motivo)
SELECT DISTINCT ON (regexp_replace(l.telefone_original, '\D', '', 'g'))
       regexp_replace(l.telefone_original, '\D', '', 'g'), l.telefone, 'aprovada', 'regra',
       'número argentino digitado com o 598 (anúncio da Argentina)'
  FROM public.bd_leads l
  JOIN public.inscricoes i ON i.id = l.inscricao_id
 WHERE l.tel_motivo LIKE 'número argentino digitado com o 598%'
   AND (coalesce(i.utm_source, '') || coalesce(i.utm_medium, '') || coalesce(i.utm_campaign, '')) ILIKE '%argentin%'
ON CONFLICT (telefone_original) DO NOTHING;

-- 2) A regra passa a só sugerir
CREATE OR REPLACE FUNCTION public.bd_normalizar_com_codigo(d text, cod text,
  OUT telefone text, OUT status text, OUT motivo text, OUT sugestao text)
 LANGUAGE plpgsql IMMUTABLE SET search_path TO '' AS $$
DECLARE
  n text;
  esperado int;
  op text[];
  tam jsonb := '{"598":11,"595":12,"591":11,"593":12,"506":11,"507":11,"505":11,"504":11,"503":11,
                 "502":11,"972":12,"351":12,"56":11,"57":12,"51":11,"58":12,"34":11,"39":12,"49":13,
                 "33":11,"44":12,"53":10,"1":11}';
BEGIN
  IF cod IS NULL THEN
    IF d ~ '^0?(11\d{8}|[23]\d{9})$' THEN
      telefone := '549' || right(d, 10); motivo := 'sem código: formato argentino';
    ELSIF d ~ '^0?9\d{7}$' THEN
      telefone := '598' || right(d, 8); motivo := 'sem código: celular uruguaio';
    ELSE
      status := 'invalido'; motivo := 'sem código de país e formato desconhecido';
    END IF;
    RETURN;
  END IF;

  IF cod = '54' THEN
    n := CASE WHEN d LIKE '54%' THEN substr(d, 3) ELSE d END;
    n := regexp_replace(n, '^0+', '');
    IF n LIKE '549%' AND length(n) >= 13 THEN n := substr(n, 4);
    ELSIF n LIKE '54%' AND length(n) >= 12 THEN n := substr(n, 3); END IF;
    n := regexp_replace(n, '^0+', '');
    n := regexp_replace(n, '^9', '');
    n := regexp_replace(n, '^0+', '');
    IF length(n) = 11 AND n ~ '^11[09]' THEN
      n := '11' || substr(n, 4); motivo := 'Argentina: dígito a mais depois do 11';
    END IF;
    IF length(n) = 12 THEN
      op := ARRAY[]::text[];
      IF substr(n, 3, 2) = '15' AND (substr(n, 1, 2) || substr(n, 5)) ~ '^(11|[23])\d{8}$' THEN op := op || (substr(n, 1, 2) || substr(n, 5)); END IF;
      IF substr(n, 4, 2) = '15' AND (substr(n, 1, 3) || substr(n, 6)) ~ '^[23]\d{9}$' THEN op := op || (substr(n, 1, 3) || substr(n, 6)); END IF;
      IF substr(n, 5, 2) = '15' AND (substr(n, 1, 4) || substr(n, 7)) ~ '^[23]\d{9}$' THEN op := op || (substr(n, 1, 4) || substr(n, 7)); END IF;
      SELECT array_agg(DISTINCT x) INTO op FROM unnest(op) x;
      IF cardinality(op) = 1 THEN
        n := op[1]; motivo := 'Argentina: tirado o 15 depois do código de área';
      ELSIF cardinality(op) > 1 THEN
        status := 'revisar'; motivo := 'Argentina: tem 15, mas não dá para saber o código de área'; sugestao := '549' || op[1];
        RETURN;
      END IF;
    END IF;
    IF length(n) = 10 AND n ~ '^(11|[23])' THEN
      telefone := '549' || n; motivo := coalesce(motivo, 'Argentina: formato 549');
    ELSIF length(n) = 10 AND n ~ '^15\d{8}$' THEN
      status := 'revisar'; motivo := 'Argentina: falta o código de área (veio só 15 + número)'; sugestao := '54911' || substr(n, 3);
    ELSIF length(n) < 10 THEN
      status := 'invalido'; motivo := 'Argentina: faltam dígitos (' || length(n) || ' de 10)';
    ELSIF length(n) = 10 THEN
      status := 'invalido'; motivo := 'Argentina: código de área inválido';
    ELSE
      status := 'invalido'; motivo := 'Argentina: dígitos a mais (' || length(n) || ' de 10)';
    END IF;
    RETURN;
  END IF;

  IF cod = '598' THEN
    n := CASE WHEN d LIKE '598%' THEN substr(d, 4) ELSE d END;
    n := regexp_replace(n, '^0+', '');
    IF n LIKE '598%' AND length(n) >= 11 THEN n := regexp_replace(substr(n, 4), '^0+', ''); END IF;
    IF length(n) = 8 AND n ~ '^[924]' THEN
      telefone := '598' || n; motivo := 'Uruguai: formato 598';
    ELSIF n ~ '^(11\d{8}|[23]\d{9})$' THEN
      -- marcou Uruguai (598) mas parece número argentino: só sugere, alguém confirma
      status := 'revisar'; motivo := 'Uruguai: parece número argentino digitado com o 598'; sugestao := '549' || n;
    ELSIF n ~ '^9\d{8}$' THEN
      status := 'revisar'; motivo := 'Uruguai: um dígito a mais'; sugestao := '598' || substr(n, 1, 8);
    ELSIF length(n) < 8 THEN
      status := 'invalido'; motivo := 'Uruguai: faltam dígitos (' || length(n) || ' de 8)';
    ELSIF length(n) = 8 THEN
      status := 'invalido'; motivo := 'Uruguai: celular deveria começar com 9';
    ELSE
      status := 'invalido'; motivo := 'Uruguai: dígitos a mais (' || length(n) || ' de 8)';
    END IF;
    RETURN;
  END IF;

  IF d NOT LIKE cod || '%' THEN
    d := cod || regexp_replace(d, '^0+', '');
  END IF;
  d := cod || regexp_replace(substr(d, length(cod) + 1), '^0+', '');
  IF substr(d, length(cod) + 1) LIKE cod || '%' AND length(d) > coalesce((tam ->> cod)::int, 99) THEN
    d := cod || regexp_replace(substr(d, 2 * length(cod) + 1), '^0+', '');
  END IF;
  IF cod IN ('55', '52') THEN
    IF length(d) IN (12, 13) THEN telefone := d; END IF;
    esperado := 12;
  ELSE
    esperado := (tam ->> cod)::int;
    IF esperado IS NULL OR length(d) = esperado THEN telefone := d; END IF;
  END IF;
  IF telefone IS NULL THEN
    status := 'invalido';
    motivo := public.bd_pais_do_telefone(d) || CASE WHEN length(d) < esperado THEN ': faltam dígitos' ELSE ': dígitos a mais' END;
  ELSE
    motivo := 'código do país';
  END IF;
END $$;

SELECT public.bd_renormalizar(NULL);

-- 3) Quem esteve em mais de 1 lançamento
CREATE OR REPLACE VIEW public.v_bd_combinacoes WITH (security_invoker = true) AS
SELECT lancamentos, n_lancamentos,
       count(*)::int AS pessoas,
       count(*) FILTER (WHERE comprou_et)::int AS compraram_et,
       count(*) FILTER (WHERE comprou_tpp)::int AS compraram_tpp,
       round(100.0 * count(*) FILTER (WHERE comprou_et OR comprou_tpp) / nullif(count(*), 0), 2) AS taxa_algum
  FROM public.v_bd_pessoas
 WHERE n_lancamentos >= 2
 GROUP BY 1, 2;

CREATE OR REPLACE VIEW public.v_bd_repeticao_edicao WITH (security_invoker = true) AS
SELECT p.edicao, p.inicio,
       count(*)::int AS pessoas,
       count(*) FILTER (WHERE s.n_lancamentos >= 2)::int AS em_outros,
       count(*) FILTER (WHERE p.participacao >= 2)::int AS ja_vinham_de_antes,
       round(100.0 * count(*) FILTER (WHERE s.n_lancamentos >= 2) / nullif(count(*), 0), 2) AS pct_em_outros
  FROM public.v_bd_participacoes p
  JOIN public.v_bd_pessoas s ON s.telefone = p.telefone
 GROUP BY 1, 2;

REVOKE ALL ON public.v_bd_combinacoes, public.v_bd_repeticao_edicao FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_bd_combinacoes, public.v_bd_repeticao_edicao TO service_role;

COMMIT;

SELECT public.bd_atualizar_base();
