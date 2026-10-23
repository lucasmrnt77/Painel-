-- 039: Página "General Jubilados" — cópia da General com domínio próprio (eventogeneraljubilados.metodoconsistente.com),
-- igual ao que foi feito com a Jubilar (030). Manda os mesmos dados da General, com site "genjub" e pagina_captura
-- "GenJub-Uruguay"/"GenJub-Argentina"/"GenJub-Otro". No painel aparece como "Gen-Jubilados", separada da General.
-- Leads continuam "nunca_operou" (mesma planilha e mesmo grupo da General). Só dados novos: nada antigo muda.
BEGIN;

CREATE OR REPLACE FUNCTION public.site_da_inscricao(p_pagina_captura text, p_payload jsonb, p_landing text DEFAULT NULL)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO '' AS $$
  SELECT CASE
    WHEN lower(coalesce(p_payload ->> 'site', '')) = 'genjub'
      OR lower(coalesce(p_payload ->> 'pagina_captura', '')) LIKE 'genjub%'
      OR lower(coalesce(p_landing, '')) LIKE 'genjub%' THEN 'Gen-Jubilados'
    WHEN lower(coalesce(p_payload ->> 'site', '')) = 'jubilar'
      OR lower(coalesce(p_payload ->> 'pagina_captura', '')) LIKE 'jub%'
      OR lower(coalesce(p_landing, '')) LIKE 'jub%' THEN 'Jubilar'
    WHEN p_pagina_captura = 'trader'       THEN 'Trader'
    WHEN p_pagina_captura = 'nunca_operou' THEN 'General'
    ELSE '—'
  END
$$;

ALTER TABLE public.visitas_pagina DROP CONSTRAINT IF EXISTS visitas_pagina_site_check;
ALTER TABLE public.visitas_pagina ADD CONSTRAINT visitas_pagina_site_check CHECK (site IN ('General', 'Trader', 'Jubilar', 'Gen-Jubilados'));

CREATE OR REPLACE FUNCTION public.registrar_visita(p_lancamento_slug text, p_landing text, p_pais text, p_site text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE
  v_lanc    bigint;
  v_landing text := btrim(coalesce(p_landing, ''));
  v_pais    text := coalesce(nullif(upper(left(btrim(coalesce(p_pais, '')), 2)), ''), '??');
  v_site    text := CASE
                      WHEN lower(coalesce(p_site, '')) = 'genjub' THEN 'Gen-Jubilados'
                      WHEN lower(coalesce(p_site, '')) = 'jubilar' THEN 'Jubilar'
                      WHEN lower(coalesce(p_site, '')) = 'trader' OR btrim(coalesce(p_landing, '')) ~ '^/t[0-9]+$' THEN 'Trader'
                      ELSE 'General'
                    END;
BEGIN
  IF v_landing !~ '^/[A-Za-z0-9_/-]{0,60}$' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'landing_invalida');
  END IF;
  IF p_lancamento_slug IS NOT NULL AND btrim(p_lancamento_slug) <> '' THEN
    SELECT id INTO v_lanc FROM public.lancamentos WHERE slug = lower(btrim(p_lancamento_slug));
  ELSE
    SELECT id INTO v_lanc FROM public.lancamentos WHERE ativo AND tipo = 'lancamento' LIMIT 1;
  END IF;
  IF v_lanc IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_lancamento');
  END IF;
  INSERT INTO public.visitas_pagina AS v (dia, lancamento_id, site, landing, pais, visitas)
  VALUES ((now() AT TIME ZONE 'America/Montevideo')::date, v_lanc, v_site, v_landing, v_pais, 1)
  ON CONFLICT (dia, lancamento_id, site, landing, pais) DO UPDATE SET visitas = v.visitas + 1;
  RETURN jsonb_build_object('ok', true);
END $$;

ALTER TABLE public.sites_captura DROP CONSTRAINT IF EXISTS sites_captura_site_check;
ALTER TABLE public.sites_captura ADD CONSTRAINT sites_captura_site_check CHECK (site IN ('general', 'trader', 'jubilar', 'genjub'));
INSERT INTO public.sites_captura (site, nome, url_base, link_divisao)
VALUES ('genjub', 'Gen-Jubilados', 'https://eventogeneraljubilados.metodoconsistente.com', NULL)
ON CONFLICT (site) DO NOTHING;

-- Prefixo do anúncio: [GJ] → General Jubilados ([JG] continua Jubilar)
CREATE OR REPLACE FUNCTION public.pagina_do_criativo(p_nome text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO '' AS $$
  SELECT CASE
    WHEN p_nome ~* '^\s*\[gj\]'               THEN 'genjub'
    WHEN p_nome ~* '^\s*\[(jg|jub[a-z]*)\]' THEN 'jubilar'
    WHEN p_nome ~* '^\s*\[t\]'               THEN 'trader'
    WHEN p_nome ~* '^\s*\[g\]'               THEN 'general'
  END
$$;

COMMIT;
