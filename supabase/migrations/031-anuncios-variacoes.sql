-- 031: Anúncio × variação da página (sem redirecionamento).
--  Os anúncios levam direto para a página e a variação (ex.: eventogeneral.metodoconsistente.com/v2).
--  A tabela criativos vira o registro "anúncio → página/variação" e guarda o histórico de cada troca
--  (criativos_historico), para o investimento de cada dia ir para a variação em que o anúncio estava.
--  v_leads_anuncio: leads e qualificados por anúncio (nome do anúncio do utm_source "conjunto|anúncio",
--  ou utm_content) × página × variação em que a pessoa entrou.
BEGIN;

-- Variação "/" (página principal) também vale como destino
ALTER TABLE public.criativos DROP CONSTRAINT IF EXISTS criativos_variacao_check;
ALTER TABLE public.criativos ADD CONSTRAINT criativos_variacao_check
  CHECK (variacao IS NULL OR variacao ~ '^/([A-Za-z0-9_-]{1,30})?$');

CREATE TABLE IF NOT EXISTS public.criativos_historico (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  criativo_id bigint NOT NULL REFERENCES public.criativos(id) ON DELETE CASCADE,
  pagina      text,
  variacao    text,
  desde       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS criativos_historico_criativo ON public.criativos_historico (criativo_id, desde);

CREATE OR REPLACE FUNCTION public.criativos_registrar_historico()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.pagina IS DISTINCT FROM OLD.pagina OR NEW.variacao IS DISTINCT FROM OLD.variacao THEN
    INSERT INTO public.criativos_historico (criativo_id, pagina, variacao) VALUES (NEW.id, NEW.pagina, NEW.variacao);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS criativos_historico ON public.criativos;
CREATE TRIGGER criativos_historico AFTER INSERT OR UPDATE ON public.criativos
  FOR EACH ROW EXECUTE FUNCTION public.criativos_registrar_historico();

-- Criativos que já existiam: histórico começa na data de criação
INSERT INTO public.criativos_historico (criativo_id, pagina, variacao, desde)
SELECT c.id, c.pagina, c.variacao, c.criado_em FROM public.criativos c
 WHERE NOT EXISTS (SELECT 1 FROM public.criativos_historico h WHERE h.criativo_id = c.id);

-- Nome do anúncio de uma inscrição: depois do último "|" do utm_source; sem isso, o utm_content
CREATE OR REPLACE FUNCTION public.anuncio_da_inscricao(p_utm_source text, p_utm_content text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO '' AS $$
  SELECT nullif(btrim(CASE WHEN coalesce(p_utm_source, '') LIKE '%|%'
                           THEN regexp_replace(p_utm_source, '^.*\|', '')
                           ELSE coalesce(p_utm_content, '') END), '')
$$;

CREATE OR REPLACE VIEW public.v_leads_anuncio WITH (security_invoker = true) AS
WITH perfil AS (
  SELECT lancamento_id, telefone_chave, bool_or(qualificado) AS qualificado, bool_or(resposta_dinheiro IS NOT NULL) AS respondeu
    FROM public.inscricoes WHERE telefone_chave IS NOT NULL GROUP BY 1, 2
)
SELECT v.lancamento_id,
       public.anuncio_da_inscricao(v.utm_source, v.utm_content)                    AS anuncio,
       v.site,
       coalesce(public.pagina_padrao(nullif(v.landing, '')), '(sem landing)')       AS landing,
       count(*)                                                                    AS leads,
       count(*) FILTER (WHERE p.respondeu)                                         AS responderam,
       count(*) FILTER (WHERE p.qualificado)                                       AS qualificados
  FROM public.v_leads v
  LEFT JOIN perfil p ON p.lancamento_id = v.lancamento_id AND p.telefone_chave = v.telefone_chave
 GROUP BY 1, 2, 3, 4;

REVOKE ALL ON public.criativos_historico, public.v_leads_anuncio FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.criativos_historico TO service_role;
GRANT SELECT ON public.v_leads_anuncio TO service_role;
ALTER TABLE public.criativos_historico ENABLE ROW LEVEL SECURITY;

-- O link único com redirecionamento não é mais usado nos anúncios (velocidade): desliga
UPDATE public.links SET por_criativo = false WHERE lower(slug) = 'lanzamiento';

COMMIT;
