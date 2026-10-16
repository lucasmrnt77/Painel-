-- 023: Base de leads — regras de telefone mais completas.
--  * Argentina: o 15 depois do código de área sai sozinho (quando só existe uma leitura possível);
--    0 ou 9 a mais logo depois do 11 sai sozinho; número argentino digitado com o 598 do Uruguai vira 549.
--  * Sem código de país: 10 dígitos começando com 11/2/3 = Argentina; 8-9 dígitos começando com 09/9 = Uruguai.
--  * "54+549...": quando a parte depois do "+" já repete o código, vale só ela.
--  * O que continua sem conserto vira "invalido" com o motivo (faltam dígitos, dígitos a mais, número
--    de teste). Só fica em "revisar" o que tem uma sugestão para alguém aprovar.
--  * Recalcula todos os telefones da base e as estatísticas.
BEGIN;

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
  -- ── Sem código de país e sem país informado: o público é AR/UY ──
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

  -- ── Argentina: 549 + 10 dígitos ──
  IF cod = '54' THEN
    -- nenhum código de área argentino começa com 5, então "54..." é sempre o código do país
    n := CASE WHEN d LIKE '54%' THEN substr(d, 3) ELSE d END;
    n := regexp_replace(n, '^0+', '');
    IF n LIKE '549%' AND length(n) >= 13 THEN n := substr(n, 4);
    ELSIF n LIKE '54%' AND length(n) >= 12 THEN n := substr(n, 3); END IF;
    n := regexp_replace(n, '^0+', '');
    n := regexp_replace(n, '^9', '');
    n := regexp_replace(n, '^0+', '');

    -- 11 dígitos: 0 ou 9 a mais logo depois do 11 (11 9 1234 5678, 11 0 1234 5678)
    IF length(n) = 11 AND n ~ '^11[09]' THEN
      n := '11' || substr(n, 4); motivo := 'Argentina: dígito a mais depois do 11';
    END IF;

    -- 12 dígitos: o 15 depois do código de área; só corrige se houver uma única leitura
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
      -- 15 + número, sem código de área: quase sempre Buenos Aires (11)
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

  -- ── Uruguai: 598 + 8 dígitos (celular 5989...) ──
  IF cod = '598' THEN
    n := CASE WHEN d LIKE '598%' THEN substr(d, 4) ELSE d END;
    n := regexp_replace(n, '^0+', '');
    IF n LIKE '598%' AND length(n) >= 11 THEN n := regexp_replace(substr(n, 4), '^0+', ''); END IF;
    IF length(n) = 8 AND n ~ '^[924]' THEN
      telefone := '598' || n; motivo := 'Uruguai: formato 598';
    ELSIF n ~ '^(11\d{8}|[23]\d{9})$' THEN
      -- marcou Uruguai (598) mas digitou um número argentino com código de área
      telefone := '549' || n; motivo := 'número argentino digitado com o 598';
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

  -- ── Demais países: código + tamanho esperado ──
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

CREATE OR REPLACE FUNCTION public.bd_normalizar_telefone(p_raw text, p_pais text DEFAULT NULL,
  OUT telefone text, OUT status text, OUT motivo text, OUT sugestao text)
 LANGUAGE plpgsql STABLE SET search_path TO '' AS $$
DECLARE
  s text := coalesce(p_raw, '');
  d text;
  bruto text := regexp_replace(coalesce(p_raw, ''), '\D', '', 'g');
  cod_pais text := public.bd_codigo_pais(p_pais);
  cod_num text;
  k text;
  r record;
  c public.bd_telefone_correcoes%ROWTYPE;
  codigos text[] := ARRAY['598','595','591','593','506','507','505','504','503','502','972','351',
                          '54','55','56','57','51','58','52','34','39','49','33','44','53','1'];
BEGIN
  -- Lixo comum: "598...,", "598...#96", "54+549...", "598+5037...", "549...@s.whatsapp.net"
  s := regexp_replace(s, '@.*$', '');
  -- "54+549...": o que vem depois do + já repete o código → vale só a parte depois do +
  IF s ~ '\+.*\+' THEN
    s := regexp_replace(s, '^.*\+', '');
  ELSIF s ~ '\d\s*\+' AND regexp_replace(substring(s FROM '\+(.*)$'), '\D', '', 'g')
          LIKE regexp_replace(split_part(s, '+', 1), '\D', '', 'g') || '%' THEN
    s := substring(s FROM '\+(.*)$');
  END IF;
  s := split_part(regexp_replace(s, '[#,;/|]', '#', 'g'), '#', 1);
  d := regexp_replace(regexp_replace(s, '\D', '', 'g'), '^00', '');

  IF d = '' THEN status := 'invalido'; motivo := 'vazio'; RETURN; END IF;

  -- Correção revisada tem prioridade sobre a regra
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

  -- Código que o próprio número traz (só para números completos)
  IF length(d) >= 11 THEN
    FOREACH k IN ARRAY codigos LOOP
      IF d LIKE k || '%' THEN cod_num := k; EXIT; END IF;
    END LOOP;
    -- "1..." só vale se for número dos EUA/Canadá de verdade (senão costuma ser ID do WhatsApp)
    IF cod_num = '1' AND NOT (length(d) = 11 AND substr(d, 2, 1) BETWEEN '2' AND '9' AND substr(d, 5, 1) BETWEEN '2' AND '9') THEN
      cod_num := NULL;
    END IF;
  END IF;
  -- Números curtos começando com 598/54 (sem o resto): tratar como desse país para dar o motivo certo
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
  IF telefone IS NULL THEN
    status := coalesce(r.status, 'revisar');
  ELSIF telefone = bruto THEN
    status := 'ok'; motivo := NULL;
  ELSE
    status := 'corrigido';
  END IF;
END $$;

-- Reaplica em toda a base e recalcula as estatísticas
SELECT public.bd_renormalizar(NULL);

COMMIT;

SELECT public.bd_atualizar_base();
