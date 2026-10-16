-- 022: Base de leads (histórico de todos os lançamentos) para estatísticas de compra.
--  * bd_edicoes: cada lançamento (edição). As de 2026 em diante podem apontar para um lançamento do painel.
--  * bd_leads: quem se inscreveu em cada edição (planilhas antigas + inscrições do painel, automático).
--  * bd_compras: quem comprou (Expert Trader e TPP) em cada edição.
--  * bd_normalizar_telefone: mesma regra para tudo (549 na Argentina, 5989 no Uruguai, etc.).
--    O que a regra não consegue consertar com segurança fica como "revisar" e fora das estatísticas.
--  * bd_telefone_correcoes: correções revisadas (manuais ou sugeridas e aprovadas).
--  * v_bd_participacoes e v_bd_pessoas são materializadas: bd_atualizar_base() recalcula (o painel chama
--    depois de importar/revisar, e o cron diário também).
--  * Views de estatística: v_bd_conversao_participacao, v_bd_conversao_edicao, v_bd_conversao_total.
BEGIN;

-- ── Edições ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bd_edicoes (
  id            bigserial PRIMARY KEY,
  codigo        text NOT NULL UNIQUE CHECK (codigo ~ '^[a-z0-9-]+$'),
  nome          text NOT NULL,
  inicio        date NOT NULL,
  lancamento_id bigint UNIQUE REFERENCES public.lancamentos(id) ON DELETE SET NULL,
  tem_leads     boolean NOT NULL DEFAULT true,   -- há lista de inscritos (entra no denominador)
  tem_compras   boolean NOT NULL DEFAULT true,   -- há lista de compradores (entra nas taxas)
  observacao    text,
  criado_em     timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.bd_edicoes (codigo, nome, inicio, lancamento_id, tem_leads, tem_compras, observacao) VALUES
  ('jul-2025', 'Julho 2025',     '2025-07-01', NULL, true,  false, 'Só a lista do grupo (Leads Julio). Sem compradores.'),
  ('out-2025', 'Outubro 2025',   '2025-10-01', NULL, false, true,  'Só compradores (sem lista de inscritos).'),
  ('dez-2025', 'Dezembro 2025',  '2025-11-22', NULL, true,  true,  'Página ET (PaginaCapturaCelulares) + página TPP (DatosPagDeCaptura).'),
  ('mar-2026', 'Março 2026',     '2026-02-08', NULL, true,  true,  NULL),
  ('mai-2026', 'Maio 2026',      '2026-04-14', NULL, true,  true,  NULL),
  ('set-2026', 'Setembro 2026',  '2026-07-12', 2,    true,  true,  'Inscrições vêm do painel.'),
  ('dez-2026', 'Dezembro 2026',  '2026-10-12', 5,    true,  false, 'Lançamento atual: inscrições entram sozinhas. Ligar "tem compras" quando as vendas forem importadas.')
ON CONFLICT (codigo) DO NOTHING;

-- ── Telefones ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bd_telefone_correcoes (
  telefone_original text PRIMARY KEY,          -- só dígitos, como chegou
  telefone          text,                      -- número certo (NULL = descartar)
  situacao          text NOT NULL DEFAULT 'sugerida' CHECK (situacao IN ('sugerida', 'aprovada', 'descartada')),
  origem            text NOT NULL DEFAULT 'manual',  -- manual | regra | ia
  motivo            text,
  atualizado_em     timestamptz NOT NULL DEFAULT now()
);

-- Código do país a partir do nome informado ("Argentina", "Otro: Chile", "EE. UU.", ...)
CREATE OR REPLACE FUNCTION public.bd_codigo_pais(p_pais text)
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO '' AS $$
  SELECT CASE regexp_replace(lower(translate(coalesce(p_pais, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')), '^\s*otro:\s*|[^a-z]', '', 'g')
    WHEN 'argentina' THEN '54' WHEN 'uruguay' THEN '598' WHEN 'uruguai' THEN '598'
    WHEN 'chile' THEN '56' WHEN 'brasil' THEN '55' WHEN 'brazil' THEN '55'
    WHEN 'paraguay' THEN '595' WHEN 'paraguai' THEN '595' WHEN 'bolivia' THEN '591'
    WHEN 'peru' THEN '51' WHEN 'ecuador' THEN '593' WHEN 'colombia' THEN '57' WHEN 'venezuela' THEN '58'
    WHEN 'mexico' THEN '52' WHEN 'estadosunidos' THEN '1' WHEN 'eeuu' THEN '1' WHEN 'usa' THEN '1'
    WHEN 'canada' THEN '1' WHEN 'espana' THEN '34' WHEN 'spain' THEN '34' WHEN 'costarica' THEN '506'
    WHEN 'panama' THEN '507' WHEN 'israel' THEN '972' WHEN 'nicaragua' THEN '505' WHEN 'guatemala' THEN '502'
    WHEN 'honduras' THEN '504' WHEN 'elsalvador' THEN '503' WHEN 'cuba' THEN '53' WHEN 'italia' THEN '39'
    WHEN 'alemania' THEN '49' WHEN 'francia' THEN '33' WHEN 'portugal' THEN '351' WHEN 'reinounido' THEN '44'
    ELSE NULL END
$$;

-- País (nome) a partir do número já normalizado
CREATE OR REPLACE FUNCTION public.bd_pais_do_telefone(p_tel text)
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO '' AS $$
  SELECT CASE
    WHEN p_tel IS NULL THEN NULL
    WHEN p_tel LIKE '598%' THEN 'Uruguay'  WHEN p_tel LIKE '595%' THEN 'Paraguay'
    WHEN p_tel LIKE '591%' THEN 'Bolivia'  WHEN p_tel LIKE '593%' THEN 'Ecuador'
    WHEN p_tel LIKE '506%' THEN 'Costa Rica' WHEN p_tel LIKE '507%' THEN 'Panamá'
    WHEN p_tel LIKE '972%' THEN 'Israel'   WHEN p_tel LIKE '351%' THEN 'Portugal'
    WHEN p_tel LIKE '54%' THEN 'Argentina' WHEN p_tel LIKE '56%' THEN 'Chile'
    WHEN p_tel LIKE '55%' THEN 'Brasil'    WHEN p_tel LIKE '57%' THEN 'Colombia'
    WHEN p_tel LIKE '51%' THEN 'Perú'      WHEN p_tel LIKE '58%' THEN 'Venezuela'
    WHEN p_tel LIKE '52%' THEN 'México'    WHEN p_tel LIKE '34%' THEN 'España'
    WHEN p_tel LIKE '1%'  THEN 'EE. UU./Canadá'
    ELSE 'Otro' END
$$;

-- Regra por país, sobre os dígitos já limpos. Status final (ok/corrigido) é decidido por quem chama.
CREATE OR REPLACE FUNCTION public.bd_normalizar_com_codigo(d text, cod text,
  OUT telefone text, OUT status text, OUT motivo text, OUT sugestao text)
 LANGUAGE plpgsql IMMUTABLE SET search_path TO '' AS $$
DECLARE
  n text;
  esperado int;
  tam jsonb := '{"598":11,"595":12,"591":11,"593":12,"506":11,"507":11,"505":11,"504":11,"503":11,
                 "502":11,"972":12,"351":12,"56":11,"57":12,"51":11,"58":12,"34":11,"39":12,"49":13,
                 "33":11,"44":12,"53":10,"1":11}';
BEGIN
  IF cod IS NULL THEN
    status := 'revisar'; motivo := 'sem código de país';
    IF d ~ '^0?9\d{7}$' THEN sugestao := '598' || right(d, 8);
    ELSIF d ~ '^0?[123]\d{9}$' THEN sugestao := '549' || right(d, 10);
    END IF;
    RETURN;
  END IF;

  -- ── Argentina: 549 + 10 dígitos, sem 0 nem 9 sobrando no meio ──
  IF cod = '54' THEN
    n := CASE WHEN d LIKE '54%' AND length(d) >= 11 THEN substr(d, 3) ELSE d END;
    n := regexp_replace(n, '^0+', '');
    IF n LIKE '549%' AND length(n) >= 13 THEN n := substr(n, 4);        -- 54 549 ...
    ELSIF n LIKE '54%' AND length(n) >= 12 THEN n := substr(n, 3); END IF;
    n := regexp_replace(n, '^0+', '');
    n := regexp_replace(n, '^9', '');
    n := regexp_replace(n, '^0+', '');
    IF length(n) = 10 AND n ~ '^(11|[23])' THEN
      telefone := '549' || n; motivo := 'Argentina: formato 549';
    ELSE
      status := 'revisar'; motivo := 'Argentina: ' || length(n) || ' dígitos depois do 549';
      IF length(n) = 12 THEN   -- o 15 depois do código de área (11 15 1234 5678)
        IF substr(n, 3, 2) = '15' AND (substr(n, 1, 2) || substr(n, 5)) ~ '^[123]\d{9}$' THEN sugestao := '549' || substr(n, 1, 2) || substr(n, 5);
        ELSIF substr(n, 4, 2) = '15' AND (substr(n, 1, 3) || substr(n, 6)) ~ '^[123]\d{9}$' THEN sugestao := '549' || substr(n, 1, 3) || substr(n, 6);
        ELSIF substr(n, 5, 2) = '15' AND (substr(n, 1, 4) || substr(n, 7)) ~ '^[123]\d{9}$' THEN sugestao := '549' || substr(n, 1, 4) || substr(n, 7);
        END IF;
        IF sugestao IS NOT NULL THEN motivo := 'Argentina: tem o 15 depois do código de área'; END IF;
      END IF;
    END IF;
    RETURN;
  END IF;

  -- ── Uruguai: 598 + 8 dígitos (celular 5989...), sem o 0 depois do 598 ──
  IF cod = '598' THEN
    n := CASE WHEN d LIKE '598%' AND length(d) >= 10 THEN substr(d, 4) ELSE d END;
    n := regexp_replace(n, '^0+', '');
    IF n LIKE '598%' AND length(n) >= 11 THEN n := regexp_replace(substr(n, 4), '^0+', ''); END IF;  -- 598 598 ...
    IF length(n) = 8 AND n ~ '^[924]' THEN
      telefone := '598' || n; motivo := 'Uruguai: formato 598';
    ELSE
      status := 'revisar'; motivo := 'Uruguai: ' || length(n) || ' dígitos depois do 598';
      IF n ~ '^9\d{8,}$' THEN sugestao := '598' || substr(n, 1, 8);
      -- marcou Uruguai mas digitou um número argentino (11 1234 5678)
      ELSIF n ~ '^(11|[23])\d{8}$' THEN sugestao := '549' || n; motivo := 'Uruguai: parece número argentino';
      END IF;
    END IF;
    RETURN;
  END IF;

  -- ── Demais países: código + tamanho esperado ──
  IF d NOT LIKE cod || '%' THEN
    d := cod || regexp_replace(d, '^0+', '');
  END IF;
  -- 0 depois do código (58 0424...) e código repetido (56 56 9...)
  d := cod || regexp_replace(substr(d, length(cod) + 1), '^0+', '');
  IF substr(d, length(cod) + 1) LIKE cod || '%' AND length(d) > coalesce((tam ->> cod)::int, 99) THEN
    d := cod || regexp_replace(substr(d, 2 * length(cod) + 1), '^0+', '');
  END IF;
  IF cod IN ('55', '52') THEN
    IF length(d) IN (12, 13) THEN telefone := d; END IF;
  ELSE
    esperado := (tam ->> cod)::int;
    IF esperado IS NULL OR length(d) = esperado THEN telefone := d; END IF;
  END IF;
  IF telefone IS NULL THEN
    status := 'revisar'; motivo := public.bd_pais_do_telefone(d) || ': tamanho ' || length(d);
  ELSE
    motivo := 'código do país';
  END IF;
END $$;

/*
 * Normaliza um telefone. Devolve (telefone, status, motivo, sugestao):
 *   ok        já estava certo
 *   corrigido a regra consertou com segurança (o original fica guardado)
 *   revisar   suspeito: não entra nas estatísticas até alguém aprovar (sugestao = palpite)
 *   invalido  não é telefone
 * Usa o país informado; se com ele o número não fecha e o próprio número traz outro código
 * de país válido, usa o do número (gente que marca "Uruguay" e escreve um número argentino).
 */
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
  -- Lixo comum: "598...,", "598...#96", "54+549...", "549...@s.whatsapp.net"
  s := regexp_replace(s, '@.*$', '');
  IF s ~ '\+.*\+' THEN s := regexp_replace(s, '^.*\+', ''); END IF;
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

  IF length(d) < 8 OR length(d) > 16 THEN status := 'invalido'; motivo := 'tamanho ' || length(d); RETURN; END IF;
  IF d ~ '(\d)\1{6,}' OR d ~ '(1234567|9876543)' THEN
    status := 'revisar'; motivo := 'parece número de teste (dígitos repetidos ou em sequência)'; RETURN;
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

-- ── Leads ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bd_leads (
  id                bigserial PRIMARY KEY,
  edicao_id         bigint NOT NULL REFERENCES public.bd_edicoes(id) ON DELETE CASCADE,
  fonte             text NOT NULL,
  data              timestamptz,
  telefone_original text NOT NULL,
  pais_informado    text,
  email             text,
  inscricao_id      bigint UNIQUE REFERENCES public.inscricoes(id) ON DELETE CASCADE,
  chave             text NOT NULL UNIQUE,      -- evita duplicar ao reimportar o mesmo arquivo
  telefone          text,                      -- normalizado (NULL se revisar/invalido)
  tel_status        text NOT NULL DEFAULT 'revisar',
  tel_motivo        text,
  tel_sugestao      text,
  criado_em         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bd_leads_tel ON public.bd_leads (telefone, edicao_id);
CREATE INDEX IF NOT EXISTS bd_leads_status ON public.bd_leads (tel_status);
CREATE INDEX IF NOT EXISTS bd_leads_email ON public.bd_leads (lower(email)) WHERE email IS NOT NULL AND email <> '';

-- ── Compras ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bd_compras (
  id                bigserial PRIMARY KEY,
  edicao_id         bigint NOT NULL REFERENCES public.bd_edicoes(id) ON DELETE CASCADE,
  produto           text NOT NULL CHECK (produto IN ('ET', 'TPP')),
  fonte             text NOT NULL,
  data              timestamptz,
  telefone_original text,
  telefone_alt      text,                      -- outro telefone informado (ex.: o "cru" do formulário)
  pais_informado    text,
  email             text,
  email_compra      text,
  estado            text,
  conta_compra      boolean NOT NULL DEFAULT true,  -- false = devolução, pagamento não encontrado...
  valor_usd         numeric,
  chave             text NOT NULL UNIQUE,
  telefone          text,
  tel_status        text NOT NULL DEFAULT 'revisar',
  tel_motivo        text,
  tel_sugestao      text,
  criado_em         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bd_compras_tel ON public.bd_compras (telefone, edicao_id);
CREATE INDEX IF NOT EXISTS bd_compras_email ON public.bd_compras (lower(email));

-- Normaliza ao gravar (e quando o telefone ou o país mudam)
CREATE OR REPLACE FUNCTION public.bd_aplicar_normalizacao()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE r record; r2 record;
BEGIN
  SELECT * INTO r FROM public.bd_normalizar_telefone(NEW.telefone_original, NEW.pais_informado);
  -- Compras: se o telefone principal não serve, tenta o alternativo
  -- (to_jsonb porque bd_leads não tem telefone_alt e o plpgsql reclamaria do campo)
  IF TG_TABLE_NAME = 'bd_compras' AND r.status IN ('revisar', 'invalido')
     AND coalesce(to_jsonb(NEW) ->> 'telefone_alt', '') <> '' THEN
    SELECT * INTO r2 FROM public.bd_normalizar_telefone(to_jsonb(NEW) ->> 'telefone_alt', NEW.pais_informado);
    IF r2.status IN ('ok', 'corrigido') THEN r := r2; END IF;
  END IF;
  NEW.telefone := r.telefone; NEW.tel_status := r.status; NEW.tel_motivo := r.motivo; NEW.tel_sugestao := r.sugestao;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS bd_leads_normalizar ON public.bd_leads;
CREATE TRIGGER bd_leads_normalizar BEFORE INSERT OR UPDATE OF telefone_original, pais_informado ON public.bd_leads
  FOR EACH ROW EXECUTE FUNCTION public.bd_aplicar_normalizacao();
DROP TRIGGER IF EXISTS bd_compras_normalizar ON public.bd_compras;
CREATE TRIGGER bd_compras_normalizar BEFORE INSERT OR UPDATE OF telefone_original, telefone_alt, pais_informado ON public.bd_compras
  FOR EACH ROW EXECUTE FUNCTION public.bd_aplicar_normalizacao();

-- Renormaliza tudo (depois de mudar a regra ou aprovar correções)
CREATE OR REPLACE FUNCTION public.bd_renormalizar(p_original text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO '' SET statement_timeout TO '120s' AS $$
DECLARE nl int; nc int;
BEGIN
  UPDATE public.bd_leads l SET telefone = r.telefone, tel_status = r.status, tel_motivo = r.motivo, tel_sugestao = r.sugestao
    FROM (SELECT x.id, n.* FROM public.bd_leads x
            CROSS JOIN LATERAL public.bd_normalizar_telefone(x.telefone_original, x.pais_informado) n
           WHERE p_original IS NULL OR regexp_replace(x.telefone_original, '\D', '', 'g') = p_original) r
   WHERE l.id = r.id
     AND (l.telefone, l.tel_status, l.tel_motivo, l.tel_sugestao) IS DISTINCT FROM (r.telefone, r.status, r.motivo, r.sugestao);
  GET DIAGNOSTICS nl = ROW_COUNT;
  UPDATE public.bd_compras SET telefone_original = telefone_original
   WHERE p_original IS NULL OR regexp_replace(coalesce(telefone_original, ''), '\D', '', 'g') = p_original
      OR regexp_replace(coalesce(telefone_alt, ''), '\D', '', 'g') = p_original;
  GET DIAGNOSTICS nc = ROW_COUNT;
  RETURN jsonb_build_object('leads', nl, 'compras', nc);
END $$;

-- ── Integração com o painel: inscrição nova entra sozinha na base ──────
CREATE OR REPLACE FUNCTION public.bd_lead_da_inscricao()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE e bigint;
BEGIN
  SELECT id INTO e FROM public.bd_edicoes WHERE lancamento_id = NEW.lancamento_id;
  IF e IS NULL THEN RETURN NEW; END IF;
  -- Nunca derruba a inscrição: se algo der errado aqui, só avisa no log
  BEGIN
    INSERT INTO public.bd_leads (edicao_id, fonte, data, telefone_original, pais_informado, email, inscricao_id, chave)
    VALUES (e, 'painel', NEW.criado_em, coalesce(NEW.telefone, NEW.telefone_original, ''), NULL, nullif(NEW.email, ''), NEW.id, 'inscricao:' || NEW.id)
    ON CONFLICT (inscricao_id) DO UPDATE SET telefone_original = EXCLUDED.telefone_original, email = EXCLUDED.email;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'bd_leads: inscrição % não entrou na base de leads: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS inscricoes_bd_leads ON public.inscricoes;
CREATE TRIGGER inscricoes_bd_leads AFTER INSERT OR UPDATE OF telefone ON public.inscricoes
  FOR EACH ROW EXECUTE FUNCTION public.bd_lead_da_inscricao();

-- Carga inicial das inscrições já existentes (setembro e dezembro)
INSERT INTO public.bd_leads (edicao_id, fonte, data, telefone_original, email, inscricao_id, chave)
SELECT e.id, 'painel', i.criado_em, coalesce(i.telefone, i.telefone_original, ''), nullif(i.email, ''), i.id, 'inscricao:' || i.id
  FROM public.inscricoes i JOIN public.bd_edicoes e ON e.lancamento_id = i.lancamento_id
ON CONFLICT DO NOTHING;

-- ── Importação (lotes de até 2000 linhas vindos do painel) ─────────────
CREATE OR REPLACE FUNCTION public.bd_importar_leads(p_linhas jsonb, p_edicao text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE ins int; tot int; sem_edicao int;
BEGIN
  WITH l AS (
    SELECT coalesce(nullif(trim(x->>'edicao'), ''), p_edicao) AS edicao,
           coalesce(nullif(trim(x->>'fonte'), ''), 'importação') AS fonte,
           nullif(trim(x->>'data'), '') AS data,
           trim(coalesce(x->>'telefone', '')) AS telefone,
           nullif(trim(x->>'pais'), '') AS pais,
           nullif(lower(trim(x->>'email')), '') AS email
      FROM jsonb_array_elements(p_linhas) x
  ), ok AS (
    SELECT l.*, e.id AS edicao_id FROM l JOIN public.bd_edicoes e ON e.codigo = l.edicao
     WHERE l.telefone ~ '\d{6}'
  ), r AS (
    INSERT INTO public.bd_leads (edicao_id, fonte, data, telefone_original, pais_informado, email, chave)
    SELECT edicao_id, fonte,
           CASE WHEN data ~ '^\d{4}-\d{2}-\d{2}' THEN (data::timestamp AT TIME ZONE 'America/Montevideo') END,
           telefone, pais, email,
           md5(edicao_id || '|' || fonte || '|' || telefone || '|' || coalesce(data, '') || '|' || coalesce(email, ''))
      FROM ok
    ON CONFLICT (chave) DO NOTHING
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM r), (SELECT count(*) FROM l),
         (SELECT count(*) FROM l WHERE NOT EXISTS (SELECT 1 FROM public.bd_edicoes e WHERE e.codigo = l.edicao))
    INTO ins, tot, sem_edicao;
  RETURN jsonb_build_object('recebidas', tot, 'inseridas', ins, 'sem_edicao', sem_edicao);
END $$;

CREATE OR REPLACE FUNCTION public.bd_importar_compras(p_linhas jsonb, p_edicao text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE ins int; tot int; sem_edicao int;
BEGIN
  WITH l AS (
    SELECT coalesce(nullif(trim(x->>'edicao'), ''), p_edicao) AS edicao,
           upper(trim(coalesce(x->>'produto', 'ET'))) AS produto,
           coalesce(nullif(trim(x->>'fonte'), ''), 'importação') AS fonte,
           nullif(trim(x->>'data'), '') AS data,
           nullif(trim(x->>'telefone'), '') AS telefone,
           nullif(trim(x->>'telefone_alt'), '') AS telefone_alt,
           nullif(trim(x->>'pais'), '') AS pais,
           nullif(lower(trim(x->>'email')), '') AS email,
           nullif(lower(trim(x->>'email_compra')), '') AS email_compra,
           nullif(trim(x->>'estado'), '') AS estado,
           lower(trim(coalesce(x->>'conta_compra', 'sim'))) NOT IN ('nao', 'não', 'no', 'false', '0') AS conta,
           CASE WHEN replace(trim(coalesce(x->>'valor_usd', '')), ',', '.') ~ '^-?\d+(\.\d+)?$'
                THEN replace(trim(x->>'valor_usd'), ',', '.')::numeric END AS valor
      FROM jsonb_array_elements(p_linhas) x
  ), ok AS (
    SELECT l.*, e.id AS edicao_id FROM l JOIN public.bd_edicoes e ON e.codigo = l.edicao
     WHERE l.produto IN ('ET', 'TPP') AND (l.telefone IS NOT NULL OR l.telefone_alt IS NOT NULL OR l.email IS NOT NULL)
  ), r AS (
    INSERT INTO public.bd_compras (edicao_id, produto, fonte, data, telefone_original, telefone_alt, pais_informado,
                                   email, email_compra, estado, conta_compra, valor_usd, chave)
    SELECT edicao_id, produto, fonte,
           CASE WHEN data ~ '^\d{4}-\d{2}-\d{2}' THEN (data::timestamp AT TIME ZONE 'America/Montevideo') END,
           telefone, telefone_alt, pais, email, email_compra, estado, conta, valor,
           md5(edicao_id || '|' || produto || '|' || fonte || '|' || coalesce(telefone, '') || '|' || coalesce(email, '') || '|' || coalesce(data, ''))
      FROM ok
    ON CONFLICT (chave) DO UPDATE SET estado = EXCLUDED.estado, conta_compra = EXCLUDED.conta_compra, valor_usd = EXCLUDED.valor_usd
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM r), (SELECT count(*) FROM l),
         (SELECT count(*) FROM l WHERE NOT EXISTS (SELECT 1 FROM public.bd_edicoes e WHERE e.codigo = l.edicao))
    INTO ins, tot, sem_edicao;
  RETURN jsonb_build_object('recebidas', tot, 'gravadas', ins, 'sem_edicao', sem_edicao);
END $$;

-- ── Views ───────────────────────────────────────────────────────────────
-- Comprador com telefone ruim: usa o telefone de um lead com o mesmo e-mail
CREATE OR REPLACE VIEW public.v_bd_compras WITH (security_invoker = true) AS
SELECT c.*,
       coalesce(c.telefone, (SELECT l.telefone FROM public.bd_leads l
                               WHERE l.telefone IS NOT NULL AND l.email IS NOT NULL
                                 AND lower(l.email) IN (lower(c.email), lower(c.email_compra))
                               ORDER BY l.edicao_id = c.edicao_id DESC, l.data DESC NULLS LAST LIMIT 1)) AS telefone_pessoa
  FROM public.bd_compras c;

-- Uma linha por pessoa × edição. Quem comprou numa edição participou dela.
-- Materializada (são ~100 mil pessoas): atualizar com bd_atualizar_base() depois de importar/revisar.
DROP MATERIALIZED VIEW IF EXISTS public.v_bd_pessoas;
DROP MATERIALIZED VIEW IF EXISTS public.v_bd_participacoes;
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
)
SELECT p.telefone, p.edicao_id, e.codigo AS edicao, e.inicio, e.tem_leads, e.tem_compras, p.data,
       row_number() OVER (PARTITION BY p.telefone ORDER BY e.inicio)::int AS participacao,
       coalesce(c.comprou_et, false) AS comprou_et,
       coalesce(c.comprou_tpp, false) AS comprou_tpp,
       c.valor_usd
  FROM p JOIN public.bd_edicoes e ON e.id = p.edicao_id
  LEFT JOIN compras c ON c.telefone = p.telefone AND c.edicao_id = p.edicao_id;
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

CREATE TABLE IF NOT EXISTS public.bd_atualizacoes (
  id bigserial PRIMARY KEY, atualizado_em timestamptz NOT NULL DEFAULT now(), duracao_ms int
);

-- Recalcula as views materializadas (sem travar quem estiver lendo)
CREATE OR REPLACE FUNCTION public.bd_atualizar_base()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' SET statement_timeout TO '120s' AS $$
DECLARE t0 timestamptz := clock_timestamp(); ms int;
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.v_bd_participacoes;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.v_bd_pessoas;
  ms := (extract(epoch FROM clock_timestamp() - t0) * 1000)::int;
  INSERT INTO public.bd_atualizacoes (duracao_ms) VALUES (ms);
  DELETE FROM public.bd_atualizacoes WHERE id < (SELECT max(id) - 50 FROM public.bd_atualizacoes);
  RETURN jsonb_build_object('ok', true, 'ms', ms);
END $$;

-- Probabilidade de comprar em cada participação (1ª, 2ª, 3ª, +3).
-- Só entram edições com lista de inscritos E de compradores.
CREATE OR REPLACE VIEW public.v_bd_conversao_participacao WITH (security_invoker = true) AS
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

-- O mesmo, quebrado por edição (para ver se o padrão se repete)
CREATE OR REPLACE VIEW public.v_bd_conversao_edicao WITH (security_invoker = true) AS
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

-- Pessoas por quantidade total de lançamentos e quantas já compraram
CREATE OR REPLACE VIEW public.v_bd_conversao_total WITH (security_invoker = true) AS
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

-- Telefones para revisar (agrupados pelo original)
CREATE OR REPLACE VIEW public.v_bd_revisar WITH (security_invoker = true) AS
SELECT regexp_replace(t.telefone_original, '\D', '', 'g') AS telefone_original,
       max(t.tel_motivo) AS motivo,
       coalesce(max(c.telefone) FILTER (WHERE c.situacao = 'sugerida'), max(t.tel_sugestao)) AS sugestao,
       max(c.origem) FILTER (WHERE c.situacao = 'sugerida') AS origem_sugestao,
       max(c.motivo) FILTER (WHERE c.situacao = 'sugerida') AS motivo_sugestao,
       count(*)::int AS ocorrencias,
       bool_or(t.compra) AS e_comprador,
       string_agg(DISTINCT t.edicao, ', ') AS edicoes
  FROM (
    SELECT l.telefone_original, l.tel_motivo, l.tel_sugestao, false AS compra, e.codigo AS edicao
      FROM public.bd_leads l JOIN public.bd_edicoes e ON e.id = l.edicao_id WHERE l.tel_status = 'revisar'
    UNION ALL
    SELECT c.telefone_original, c.tel_motivo, c.tel_sugestao, true, e.codigo
      FROM public.bd_compras c JOIN public.bd_edicoes e ON e.id = c.edicao_id WHERE c.tel_status = 'revisar'
  ) t
  LEFT JOIN public.bd_telefone_correcoes c ON c.telefone_original = regexp_replace(t.telefone_original, '\D', '', 'g')
 GROUP BY 1;

-- Contagens por edição (para a tabela "o que tem na base")
CREATE OR REPLACE FUNCTION public.bd_contagens()
 RETURNS TABLE (edicao_id bigint, leads int, leads_ok int, leads_revisar int, leads_invalidos int,
                compras int, compras_validas int, compras_sem_telefone int)
 LANGUAGE sql STABLE SET search_path TO '' AS $$
  SELECT e.id,
         coalesce(l.n, 0), coalesce(l.ok, 0), coalesce(l.rev, 0), coalesce(l.inv, 0),
         coalesce(c.n, 0), coalesce(c.validas, 0), coalesce(c.sem_tel, 0)
    FROM public.bd_edicoes e
    LEFT JOIN (SELECT edicao_id, count(*)::int n,
                      count(*) FILTER (WHERE tel_status IN ('ok', 'corrigido'))::int ok,
                      count(*) FILTER (WHERE tel_status = 'revisar')::int rev,
                      count(*) FILTER (WHERE tel_status = 'invalido')::int inv
                 FROM public.bd_leads GROUP BY 1) l ON l.edicao_id = e.id
    LEFT JOIN (SELECT edicao_id, count(*)::int n,
                      count(*) FILTER (WHERE conta_compra)::int validas,
                      count(*) FILTER (WHERE conta_compra AND telefone_pessoa IS NULL)::int sem_tel
                 FROM public.v_bd_compras GROUP BY 1) c ON c.edicao_id = e.id
$$;

-- Decisão da revisão: aprova um número (p_telefone) ou descarta (p_telefone NULL)
CREATE OR REPLACE FUNCTION public.bd_decidir_telefone(p_original text, p_telefone text, p_situacao text)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE r jsonb;
BEGIN
  IF p_situacao NOT IN ('aprovada', 'descartada') THEN RAISE EXCEPTION 'situação inválida'; END IF;
  INSERT INTO public.bd_telefone_correcoes (telefone_original, telefone, situacao, origem, motivo, atualizado_em)
  VALUES (p_original, p_telefone, p_situacao, 'manual', CASE WHEN p_situacao = 'aprovada' THEN 'revisado no painel' ELSE 'descartado no painel' END, now())
  ON CONFLICT (telefone_original) DO UPDATE
    SET telefone = EXCLUDED.telefone, situacao = EXCLUDED.situacao, motivo = EXCLUDED.motivo, atualizado_em = now();
  r := public.bd_renormalizar(p_original);
  RETURN r;
END $$;

-- Aprova todas as sugestões da regra (o 15 da Argentina, o dígito a mais no Uruguai...) e as da IA
CREATE OR REPLACE FUNCTION public.bd_aprovar_sugestoes()
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO '' SET statement_timeout TO '120s' AS $$
DECLARE n int;
BEGIN
  INSERT INTO public.bd_telefone_correcoes (telefone_original, telefone, situacao, origem, motivo, atualizado_em)
  SELECT telefone_original, sugestao, 'aprovada', coalesce(origem_sugestao, 'regra'), coalesce(motivo_sugestao, motivo), now()
    FROM public.v_bd_revisar WHERE sugestao IS NOT NULL
  ON CONFLICT (telefone_original) DO UPDATE
    SET telefone = EXCLUDED.telefone, situacao = 'aprovada', atualizado_em = now()
    WHERE public.bd_telefone_correcoes.situacao = 'sugerida';
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM public.bd_renormalizar(NULL);
  RETURN jsonb_build_object('aprovadas', n);
END $$;

-- ── Segurança: só o servidor do painel (service_role) acessa ───────────
ALTER TABLE public.bd_edicoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bd_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bd_compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bd_telefone_correcoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bd_atualizacoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bd_atualizacoes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.bd_atualizacoes TO service_role;
REVOKE ALL ON public.bd_edicoes, public.bd_leads, public.bd_compras, public.bd_telefone_correcoes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bd_edicoes, public.bd_leads, public.bd_compras, public.bd_telefone_correcoes TO service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;
REVOKE ALL ON public.v_bd_compras, public.v_bd_participacoes, public.v_bd_pessoas, public.v_bd_conversao_participacao,
              public.v_bd_conversao_edicao, public.v_bd_conversao_total, public.v_bd_revisar FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_bd_compras, public.v_bd_participacoes, public.v_bd_pessoas, public.v_bd_conversao_participacao,
               public.v_bd_conversao_edicao, public.v_bd_conversao_total, public.v_bd_revisar TO service_role;
REVOKE ALL ON FUNCTION public.bd_importar_leads(jsonb, text), public.bd_importar_compras(jsonb, text),
                       public.bd_renormalizar(text), public.bd_atualizar_base(), public.bd_contagens(),
                       public.bd_decidir_telefone(text, text, text), public.bd_aprovar_sugestoes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bd_importar_leads(jsonb, text), public.bd_importar_compras(jsonb, text),
                          public.bd_renormalizar(text), public.bd_atualizar_base(), public.bd_contagens(),
                          public.bd_decidir_telefone(text, text, text), public.bd_aprovar_sugestoes() TO service_role;

COMMIT;
