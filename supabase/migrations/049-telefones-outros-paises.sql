-- 049: Normalizador de telefones — países novos e resgate dos descartados (30/10/2026).
--
--  Regras novas (valem para todos os números que chegarem daqui em diante):
--   * Códigos de país reconhecidos: Nigéria 234 (+10 dígitos; tira o 0 do formato local, ex.: 2340808… → 234808…),
--     Irlanda 353, Ucrânia 380, Emirados Árabes 971, Holanda 31, Dinamarca 45, Austrália 61, Nova Zelândia 64, China 86.
--   * República Dominicana sem o 1 (809/829/849 + 7 dígitos) → 1 + número.
--   * Argentina com um "1" sobrando antes do 549 (1549…) → tira o 1.
--
--  Resgate: os números descartados automaticamente (046) que passam nas regras novas viram correção aprovada com
--  origem 'resgate' e motivo "resgatado do descarte: …" (o problema original continua em motivo_original).
--  No painel aparecem destacados em "Telefones corrigidos" e saem de "Telefones descartados".
--  O que continua sem regra fica como estava (descartado, guardado).
BEGIN;

CREATE OR REPLACE FUNCTION public.bd_pais_do_telefone(p_tel text)
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO '' AS $function$
  SELECT CASE
    WHEN p_tel IS NULL THEN NULL
    WHEN p_tel LIKE '598%' THEN 'Uruguay'  WHEN p_tel LIKE '595%' THEN 'Paraguay'
    WHEN p_tel LIKE '591%' THEN 'Bolivia'  WHEN p_tel LIKE '593%' THEN 'Ecuador'
    WHEN p_tel LIKE '506%' THEN 'Costa Rica' WHEN p_tel LIKE '507%' THEN 'Panamá'
    WHEN p_tel LIKE '972%' THEN 'Israel'   WHEN p_tel LIKE '351%' THEN 'Portugal'
    WHEN p_tel LIKE '234%' THEN 'Nigeria'  WHEN p_tel LIKE '353%' THEN 'Irlanda'
    WHEN p_tel LIKE '380%' THEN 'Ucrania'  WHEN p_tel LIKE '971%' THEN 'Emiratos Árabes'
    WHEN p_tel LIKE '1809%' OR p_tel LIKE '1829%' OR p_tel LIKE '1849%' THEN 'República Dominicana'
    WHEN p_tel LIKE '54%' THEN 'Argentina' WHEN p_tel LIKE '56%' THEN 'Chile'
    WHEN p_tel LIKE '55%' THEN 'Brasil'    WHEN p_tel LIKE '57%' THEN 'Colombia'
    WHEN p_tel LIKE '51%' THEN 'Perú'      WHEN p_tel LIKE '58%' THEN 'Venezuela'
    WHEN p_tel LIKE '52%' THEN 'México'    WHEN p_tel LIKE '34%' THEN 'España'
    WHEN p_tel LIKE '31%' THEN 'Países Bajos' WHEN p_tel LIKE '45%' THEN 'Dinamarca'
    WHEN p_tel LIKE '61%' THEN 'Australia' WHEN p_tel LIKE '64%' THEN 'Nueva Zelanda'
    WHEN p_tel LIKE '86%' THEN 'China'
    WHEN p_tel LIKE '1%'  THEN 'EE. UU./Canadá'
    ELSE 'Otro' END
$function$;

CREATE OR REPLACE FUNCTION public.bd_normalizar_com_codigo(d text, cod text, OUT telefone text, OUT status text, OUT motivo text, OUT sugestao text)
 RETURNS record LANGUAGE plpgsql IMMUTABLE SET search_path TO '' AS $function$
DECLARE
  n text;
  esperado int;
  op text[];
  tam jsonb := '{"598":11,"595":12,"591":11,"593":12,"506":11,"507":11,"505":11,"504":11,"503":11,
                 "502":11,"972":12,"351":12,"56":11,"57":12,"51":11,"58":12,"34":11,"39":12,"49":13,
                 "33":11,"44":12,"53":10,"1":11,
                 "234":13,"353":12,"380":12,"971":12,"31":11,"45":10,"61":11,"64":11,"86":13}';
BEGIN
  IF cod IS NULL THEN
    IF d ~ '^0?(11\d{8}|[23]\d{9})$' THEN
      telefone := '549' || right(d, 10); motivo := 'sem código: formato argentino';
    ELSIF d ~ '^0?9\d{7}$' THEN
      telefone := '598' || right(d, 8); motivo := 'sem código: celular uruguaio';
    ELSIF d ~ '^(809|829|849)[2-9]\d{6}$' THEN
      telefone := '1' || d; motivo := 'República Dominicana: faltava o 1';
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
END $function$;

CREATE OR REPLACE FUNCTION public.bd_normalizar_telefone(p_raw text, p_pais text DEFAULT NULL::text, OUT telefone text, OUT status text, OUT motivo text, OUT sugestao text)
 RETURNS record LANGUAGE plpgsql STABLE SET search_path TO '' AS $function$
DECLARE
  s text := coalesce(p_raw, '');
  d text;
  bruto text := regexp_replace(coalesce(p_raw, ''), '\D', '', 'g');
  cod_pais text := public.bd_codigo_pais(p_pais);
  cod_num text;
  k text;
  r record;
  extra text;
  c public.bd_telefone_correcoes%ROWTYPE;
  codigos text[] := ARRAY['598','595','591','593','506','507','505','504','503','502','972','351',
                          '234','353','380','971',
                          '54','55','56','57','51','58','52','34','39','49','33','44','53',
                          '31','45','61','64','86','1'];
BEGIN
  s := regexp_replace(s, '@.*$', '');
  IF s ~ '\+.*\+' THEN
    s := regexp_replace(s, '^.*\+', '');
  ELSIF s ~ '\d\s*\+' AND regexp_replace(substring(s FROM '\+(.*)$'), '\D', '', 'g')
          LIKE regexp_replace(split_part(s, '+', 1), '\D', '', 'g') || '%' THEN
    s := substring(s FROM '\+(.*)$');
  END IF;
  s := split_part(regexp_replace(s, '[#,;/|]', '#', 'g'), '#', 1);
  d := regexp_replace(regexp_replace(s, '\D', '', 'g'), '^00', '');
  IF d = '' THEN status := 'invalido'; motivo := 'vazio'; RETURN; END IF;
  SELECT * INTO c FROM public.bd_telefone_correcoes WHERE telefone_original IN (bruto, d) AND situacao <> 'sugerida' LIMIT 1;
  IF FOUND THEN
    IF c.situacao = 'aprovada' AND c.telefone IS NOT NULL THEN
      telefone := c.telefone; status := 'corrigido'; motivo := coalesce(c.motivo, 'correção aprovada');
    ELSE
      status := 'invalido'; motivo := coalesce(c.motivo, 'descartado na revisão');
    END IF;
    RETURN;
  END IF;
  IF length(d) < 8 THEN status := 'invalido'; motivo := 'faltam dígitos (' || length(d) || ')'; RETURN; END IF;
  IF length(d) > 16 THEN status := 'invalido'; motivo := 'dígitos a mais (' || length(d) || ')'; RETURN; END IF;
  IF d ~ '(\d)\1{6,}' OR d ~ '(1234567|9876543)' OR d ~ '(\d{3})\1\1' THEN
    status := 'invalido'; motivo := 'número de teste (dígitos repetidos ou em sequência)'; RETURN;
  END IF;
  -- Argentina com um "1" sobrando antes do 549 (049)
  IF d ~ '^1549(11|[23])\d{8}$' THEN
    d := substr(d, 2); extra := 'Argentina: "1" sobrando antes do 549';
  END IF;
  IF length(d) >= 11 THEN
    FOREACH k IN ARRAY codigos LOOP
      IF d LIKE k || '%' THEN cod_num := k; EXIT; END IF;
    END LOOP;
    IF cod_num = '1' AND NOT (length(d) = 11 AND substr(d, 2, 1) BETWEEN '2' AND '9' AND substr(d, 5, 1) BETWEEN '2' AND '9') THEN
      cod_num := NULL;
    END IF;
  END IF;
  IF cod_num IS NULL AND cod_pais IS NULL THEN
    IF d LIKE '598%' AND length(d) >= 9 THEN cod_num := '598';
    ELSIF d LIKE '54%' AND length(d) >= 9 AND d !~ '^0?(11\d{8}|[23]\d{9})$' THEN cod_num := '54';
    END IF;
  END IF;
  SELECT * INTO r FROM public.bd_normalizar_com_codigo(d, coalesce(cod_pais, cod_num));
  IF r.telefone IS NULL AND cod_num IS NOT NULL AND cod_num IS DISTINCT FROM cod_pais THEN
    DECLARE r2 record;
    BEGIN
      SELECT * INTO r2 FROM public.bd_normalizar_com_codigo(d, cod_num);
      IF r2.telefone IS NOT NULL THEN r := r2; r.motivo := r2.motivo || ' (país informado diferente)'; END IF;
    END;
  END IF;
  telefone := r.telefone; motivo := r.motivo; sugestao := r.sugestao;
  IF telefone IS NOT NULL AND extra IS NOT NULL THEN motivo := extra; END IF;
  IF telefone IS NULL THEN
    status := coalesce(r.status, 'revisar');
  ELSIF telefone = bruto THEN
    status := 'ok'; motivo := NULL;
  ELSE
    status := 'corrigido';
  END IF;
END $function$;

-- ── Resgate dos descartados automaticamente (só os candidatos às regras novas) ───────────
CREATE TEMP TABLE _cand ON COMMIT DROP AS
SELECT k.telefone_original, k.motivo, k.motivo_original, k.telefone AS sug, k.atualizado_em
  FROM public.bd_telefone_correcoes k
 WHERE k.situacao = 'descartada' AND k.origem = 'automatica'
   AND (k.telefone_original ~ '^(234|353|380|971|31|61|64|86|1549|809|829|849)' OR k.telefone_original = '4550370419');

DELETE FROM public.bd_telefone_correcoes k USING _cand x WHERE k.telefone_original = x.telefone_original;

CREATE TEMP TABLE _res ON COMMIT DROP AS
SELECT x.telefone_original, n.telefone, n.motivo
  FROM _cand x CROSS JOIN LATERAL public.bd_normalizar_telefone(x.telefone_original, NULL) n
 WHERE n.telefone IS NOT NULL;

-- Resgatados: correção aprovada, origem 'resgate' (o problema original fica em motivo_original)
INSERT INTO public.bd_telefone_correcoes (telefone_original, telefone, situacao, origem, motivo, motivo_original, atualizado_em)
SELECT x.telefone_original, r.telefone, 'aprovada', 'resgate',
       'resgatado do descarte: ' || CASE WHEN r.motivo IS NULL OR r.motivo = 'código do país'
                                         THEN 'código do país (' || public.bd_pais_do_telefone(r.telefone) || ')' ELSE r.motivo END,
       coalesce(x.motivo_original, x.motivo), now()
  FROM _cand x JOIN _res r USING (telefone_original);

-- Dinamarca (45 + 8 dígitos: sem regra geral, 10 dígitos é ambíguo) — resgate pontual; o resto volta como estava
INSERT INTO public.bd_telefone_correcoes (telefone_original, telefone, situacao, origem, motivo, motivo_original, atualizado_em)
SELECT x.telefone_original,
       CASE WHEN x.telefone_original = '4550370419' THEN '4550370419' ELSE x.sug END,
       CASE WHEN x.telefone_original = '4550370419' THEN 'aprovada' ELSE 'descartada' END,
       CASE WHEN x.telefone_original = '4550370419' THEN 'resgate' ELSE 'automatica' END,
       CASE WHEN x.telefone_original = '4550370419' THEN 'resgatado do descarte: código do país (Dinamarca)' ELSE x.motivo END,
       coalesce(x.motivo_original, CASE WHEN x.telefone_original = '4550370419' THEN x.motivo END),
       CASE WHEN x.telefone_original = '4550370419' THEN now() ELSE x.atualizado_em END
  FROM _cand x WHERE NOT EXISTS (SELECT 1 FROM _res r WHERE r.telefone_original = x.telefone_original);

COMMENT ON COLUMN public.bd_telefone_correcoes.origem IS 'manual | regra | ia | cruzamento | automatica | resgate';

COMMIT;
-- Depois: SELECT public.bd_renormalizar(telefone_original) FROM public.bd_telefone_correcoes WHERE origem = 'resgate';
--         SELECT public.bd_atualizar_base();
-- (aplicada em 30/10/2026 em duas partes, 049a regras e 049b resgate: 17 números, 20 linhas da base, 1 comprador)
