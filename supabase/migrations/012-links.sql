-- =====================================================================
-- 012-links.sql — encurtador de links próprio (substitui o Rebrandly).
--
-- link.traderdelite.net/<slug> → um ou mais destinos.
-- * um destino: redireciona sempre para ele;
-- * vários destinos: divide os cliques pela porcentagem de cada um
--   (sorteio ponderado a cada clique; os pesos somam 100).
-- Cliques de robôs/prévias (WhatsApp, Facebook…) redirecionam mas não contam.
-- Só a service_role acessa.
-- =====================================================================
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.redir_grupos') IS NULL THEN
    RAISE EXCEPTION '012-links: rode 000 a 011 antes';
  END IF;
  IF to_regclass('public.links') IS NOT NULL THEN
    RAISE EXCEPTION '012-links: já aplicada — abortando';
  END IF;
END $$;

CREATE TABLE public.links (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug                 text NOT NULL CHECK (slug ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$'),
  titulo               text,
  ativo                boolean NOT NULL DEFAULT true,
  repassar_parametros  boolean NOT NULL DEFAULT true,
  cliques              bigint NOT NULL DEFAULT 0,
  origem               text NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual', 'rebrandly')),
  rebrandly_id         text,
  criado_em            timestamptz NOT NULL DEFAULT now(),
  atualizado_em        timestamptz NOT NULL DEFAULT now()
);
-- /GruposWpp e /gruposwpp são o mesmo link
CREATE UNIQUE INDEX links_slug_unico ON public.links (lower(slug));

CREATE TABLE public.link_destinos (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  link_id    bigint NOT NULL REFERENCES public.links(id) ON DELETE CASCADE,
  url        text NOT NULL CHECK (url ~ '^https?://[^\s]+$' AND length(url) <= 2000),
  peso       integer NOT NULL DEFAULT 100 CHECK (peso BETWEEN 0 AND 100),
  ordem      integer NOT NULL DEFAULT 0,
  cliques    bigint NOT NULL DEFAULT 0,
  criado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX link_destinos_link ON public.link_destinos (link_id, ordem, id);

CREATE TABLE public.link_cliques (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  link_id     bigint NOT NULL REFERENCES public.links(id) ON DELETE CASCADE,
  destino_id  bigint REFERENCES public.link_destinos(id) ON DELETE SET NULL,
  pais        text,
  referer     text
);
CREATE INDEX link_cliques_link ON public.link_cliques (link_id, criado_em DESC);
CREATE INDEX link_cliques_destino ON public.link_cliques (destino_id);

-- ---------------------------------------------------------------------
-- Um clique: acha o link, sorteia o destino pelos pesos e (se contar) soma.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.link_clique(p_slug text, p_contar boolean DEFAULT true, p_pais text DEFAULT NULL, p_referer text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  l public.links%ROWTYPE;
  d public.link_destinos%ROWTYPE;
  total integer;
  sorteio double precision;
  acumulado integer := 0;
BEGIN
  SELECT * INTO l FROM links WHERE lower(slug) = lower(p_slug);
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'nao_encontrado');
  END IF;
  IF NOT l.ativo THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'pausado');
  END IF;

  SELECT coalesce(sum(peso), 0) INTO total FROM link_destinos WHERE link_id = l.id AND peso > 0;

  IF total = 0 THEN
    -- sem pesos: o primeiro destino (se houver)
    SELECT * INTO d FROM link_destinos WHERE link_id = l.id ORDER BY ordem, id LIMIT 1;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'sem_destino');
    END IF;
  ELSE
    sorteio := random() * total;
    FOR d IN SELECT * FROM link_destinos WHERE link_id = l.id AND peso > 0 ORDER BY ordem, id LOOP
      acumulado := acumulado + d.peso;
      EXIT WHEN sorteio < acumulado;
    END LOOP;
  END IF;

  IF p_contar THEN
    UPDATE links SET cliques = cliques + 1 WHERE id = l.id;
    UPDATE link_destinos SET cliques = cliques + 1 WHERE id = d.id;
    INSERT INTO link_cliques (link_id, destino_id, pais, referer)
    VALUES (l.id, d.id, left(upper(nullif(p_pais, '')), 2), left(nullif(p_referer, ''), 300));
  END IF;

  RETURN jsonb_build_object('ok', true, 'url', d.url, 'link_id', l.id, 'destino_id', d.id,
                            'repassar_parametros', l.repassar_parametros);
END $$;

-- ---------------------------------------------------------------------
-- Criar/editar um link com os destinos, numa transação só.
-- p_destinos: [{ "id": opcional, "url": "...", "peso": 50 }, ...]
-- Destinos com id são atualizados (mantêm os cliques); sem id são novos;
-- os que não vierem são apagados. Com 1 destino o peso vira 100;
-- com 2 ou mais, os pesos precisam somar 100.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.link_salvar(p_id bigint, p_slug text, p_titulo text, p_ativo boolean,
                                   p_repassar boolean, p_destinos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_id bigint := p_id;
  n integer;
  soma integer;
  item jsonb;
  i integer := 0;
  manter bigint[] := '{}';
  did bigint;
BEGIN
  IF p_slug IS NULL OR p_slug !~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'O final do link só pode ter letras, números, "-", "_" e "." (até 80).');
  END IF;
  IF jsonb_typeof(p_destinos) IS DISTINCT FROM 'array' OR jsonb_array_length(p_destinos) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Informe pelo menos um destino.');
  END IF;
  n := jsonb_array_length(p_destinos);
  IF n > 20 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'No máximo 20 destinos por link.');
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_destinos) e
              WHERE coalesce(e->>'url', '') !~ '^https?://[^\s]+$' OR length(e->>'url') > 2000) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Todo destino precisa ser um endereço completo, começando com https://');
  END IF;
  IF n > 1 THEN
    SELECT sum(CASE WHEN (e->>'peso') ~ '^\d{1,3}$' THEN (e->>'peso')::int ELSE -1000 END) INTO soma
      FROM jsonb_array_elements(p_destinos) e;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_destinos) e
                WHERE (e->>'peso') !~ '^\d{1,3}$' OR (e->>'peso')::int > 100) THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'Cada porcentagem precisa ser um número de 0 a 100.');
    END IF;
    IF soma <> 100 THEN
      RETURN jsonb_build_object('ok', false, 'erro', format('As porcentagens precisam somar 100%% (agora somam %s%%).', soma));
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM links WHERE lower(slug) = lower(p_slug) AND id IS DISTINCT FROM p_id) THEN
    RETURN jsonb_build_object('ok', false, 'erro', format('Já existe um link /%s.', p_slug));
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO links (slug, titulo, ativo, repassar_parametros)
    VALUES (p_slug, nullif(trim(p_titulo), ''), coalesce(p_ativo, true), coalesce(p_repassar, true))
    RETURNING id INTO v_id;
  ELSE
    UPDATE links SET slug = p_slug, titulo = nullif(trim(p_titulo), ''), ativo = coalesce(p_ativo, ativo),
                     repassar_parametros = coalesce(p_repassar, repassar_parametros), atualizado_em = now()
     WHERE id = v_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'Link não encontrado.');
    END IF;
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(p_destinos) LOOP
    i := i + 1;
    did := NULL;
    IF (item->>'id') ~ '^\d+$' THEN
      UPDATE link_destinos
         SET url = item->>'url', peso = CASE WHEN n = 1 THEN 100 ELSE (item->>'peso')::int END, ordem = i
       WHERE id = (item->>'id')::bigint AND link_id = v_id
      RETURNING id INTO did;
    END IF;
    IF did IS NULL THEN
      INSERT INTO link_destinos (link_id, url, peso, ordem)
      VALUES (v_id, item->>'url', CASE WHEN n = 1 THEN 100 ELSE (item->>'peso')::int END, i)
      RETURNING id INTO did;
    END IF;
    manter := manter || did;
  END LOOP;
  DELETE FROM link_destinos WHERE link_id = v_id AND NOT (id = ANY (manter));

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;

-- ---------------------------------------------------------------------
-- Importação (Rebrandly): cria os que ainda não existem, pula os repetidos.
-- p_itens: [{ "slug": "...", "url": "...", "titulo": "...", "rebrandly_id": "..." }, ...]
-- ---------------------------------------------------------------------
CREATE FUNCTION public.links_importar(p_itens jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  item jsonb;
  novo bigint;
  criados integer := 0;
  existentes integer := 0;
  invalidos integer := 0;
BEGIN
  FOR item IN SELECT value FROM jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) LOOP
    IF coalesce(item->>'slug', '') !~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$'
       OR coalesce(item->>'url', '') !~ '^https?://[^\s]+$' OR length(item->>'url') > 2000 THEN
      invalidos := invalidos + 1;
      CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM links WHERE lower(slug) = lower(item->>'slug')) THEN
      existentes := existentes + 1;
      CONTINUE;
    END IF;
    INSERT INTO links (slug, titulo, origem, rebrandly_id)
    VALUES (item->>'slug', nullif(left(item->>'titulo', 200), ''), 'rebrandly', item->>'rebrandly_id')
    RETURNING id INTO novo;
    INSERT INTO link_destinos (link_id, url, peso, ordem) VALUES (novo, item->>'url', 100, 1);
    criados := criados + 1;
  END LOOP;
  RETURN jsonb_build_object('criados', criados, 'existentes', existentes, 'invalidos', invalidos);
END $$;

-- ---------------------------------------------------------------------
-- Lista para o painel: links + destinos + cliques (total, 24h, 7 dias).
-- ---------------------------------------------------------------------
CREATE FUNCTION public.links_resumo()
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'link', to_jsonb(l),
    'destinos', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                    'id', d.id, 'url', d.url, 'peso', d.peso, 'ordem', d.ordem, 'cliques', d.cliques,
                    'cliques_7d', (SELECT count(*) FROM link_cliques c WHERE c.destino_id = d.id AND c.criado_em > now() - interval '7 days')
                  ) ORDER BY d.ordem, d.id), '[]'::jsonb)
                  FROM link_destinos d WHERE d.link_id = l.id),
    'cliques_24h', (SELECT count(*) FROM link_cliques c WHERE c.link_id = l.id AND c.criado_em > now() - interval '24 hours'),
    'cliques_7d',  (SELECT count(*) FROM link_cliques c WHERE c.link_id = l.id AND c.criado_em > now() - interval '7 days'),
    'ultimo_clique', (SELECT max(c.criado_em) FROM link_cliques c WHERE c.link_id = l.id)
  ) ORDER BY l.ativo DESC, l.atualizado_em DESC, l.id DESC), '[]'::jsonb)
  FROM links l;
$$;

ALTER TABLE public.links         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.link_destinos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.link_cliques  ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.links, public.link_destinos, public.link_cliques FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.links, public.link_destinos, public.link_cliques TO service_role;

REVOKE ALL ON FUNCTION public.link_clique(text, boolean, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.link_salvar(bigint, text, text, boolean, boolean, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.links_importar(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.links_resumo() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_clique(text, boolean, text, text), public.link_salvar(bigint, text, text, boolean, boolean, jsonb),
                          public.links_importar(jsonb), public.links_resumo() TO service_role;

COMMIT;
