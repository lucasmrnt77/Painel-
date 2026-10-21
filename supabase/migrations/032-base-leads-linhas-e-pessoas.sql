-- 032: Base de leads — "linhas na planilha" × "pessoas únicas" por lançamento.
--  Motivo: os CSVs do Drive de 2025 (Leads Julio, Leads.csv, LeadsOctubre.csv, LeadsDiciembre.csv) foram
--  importados sem repetir número (a mesma pessoa inscrita 2+ vezes entrou 1 vez), enquanto as planilhas
--  das páginas (dez-2025, mar-2026, mai-2026) e o painel entraram linha por linha. A coluna "Inscritos"
--  misturava os dois critérios e não batia com as planilhas.
--  Agora: bd_fontes guarda quantas linhas cada planilha tinha; bd_contagens devolve
--  linhas_planilha (soma das planilhas) e pessoas (números diferentes + linhas sem telefone válido).
BEGIN;

CREATE TABLE IF NOT EXISTS public.bd_fontes (
  edicao_id       bigint NOT NULL REFERENCES public.bd_edicoes(id) ON DELETE CASCADE,
  fonte           text   NOT NULL,
  linhas_planilha int    NOT NULL CHECK (linhas_planilha >= 0),
  observacao      text,
  PRIMARY KEY (edicao_id, fonte)
);
REVOKE ALL ON public.bd_fontes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bd_fontes TO service_role;
ALTER TABLE public.bd_fontes ENABLE ROW LEVEL SECURITY;

-- CSVs do Drive (contados nos arquivos em 21/10/2026)
INSERT INTO public.bd_fontes (edicao_id, fonte, linhas_planilha, observacao)
SELECT e.id, v.fonte, v.linhas, v.obs
  FROM (VALUES
    ('jul-2025', 'Leads Julio (lista do grupo)',               2654, '110 linhas com número repetido'),
    ('jul-2025', 'Leads.csv (Drive · Julio 2025)',             2369, '1.901 números já estavam na lista do grupo'),
    ('out-2025', 'LeadsOctubre.csv (Drive · Octubre 2025)',    3530, '250 linhas com número repetido'),
    ('dez-2025', 'LeadsDiciembre.csv (Drive · Diciembre 2025)', 7848, '27 linhas com número repetido; 58 números já estavam nas planilhas das páginas')
  ) AS v(codigo, fonte, linhas, obs)
  JOIN public.bd_edicoes e ON e.codigo = v.codigo
ON CONFLICT (edicao_id, fonte) DO UPDATE SET linhas_planilha = EXCLUDED.linhas_planilha, observacao = EXCLUDED.observacao;

-- Planilhas das páginas: entraram linha por linha (cada linha da planilha = 1 linha na base)
INSERT INTO public.bd_fontes (edicao_id, fonte, linhas_planilha)
SELECT edicao_id, fonte, count(*)::int FROM public.bd_leads
 WHERE fonte <> 'painel' GROUP BY 1, 2
ON CONFLICT (edicao_id, fonte) DO NOTHING;

-- Por planilha: linhas na planilha, linhas na base, números diferentes
CREATE OR REPLACE VIEW public.v_bd_fontes WITH (security_invoker = true) AS
SELECT l.edicao_id, l.fonte,
       coalesce(f.linhas_planilha, count(*)::int)         AS linhas_planilha,
       count(*)::int                                     AS linhas_base,
       count(DISTINCT l.telefone)::int                   AS numeros,
       count(*) FILTER (WHERE l.telefone IS NULL)::int    AS sem_telefone,
       f.observacao
  FROM public.bd_leads l
  LEFT JOIN public.bd_fontes f ON f.edicao_id = l.edicao_id AND f.fonte = l.fonte
 GROUP BY l.edicao_id, l.fonte, f.linhas_planilha, f.observacao;
REVOKE ALL ON public.v_bd_fontes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_bd_fontes TO service_role;

DROP FUNCTION IF EXISTS public.bd_contagens();
CREATE FUNCTION public.bd_contagens()
 RETURNS TABLE (edicao_id bigint, leads int, linhas_planilha int, pessoas int, leads_ok int, leads_revisar int, leads_invalidos int,
                compras int, compras_validas int, compras_sem_telefone int)
 LANGUAGE sql STABLE SET search_path TO '' AS $$
  SELECT e.id,
         coalesce(l.n, 0), coalesce(fo.linhas, 0), coalesce(l.pessoas, 0),
         coalesce(l.ok, 0), coalesce(l.rev, 0), coalesce(l.inv, 0),
         coalesce(c.n, 0), coalesce(c.validas, 0), coalesce(c.sem_tel, 0)
    FROM public.bd_edicoes e
    LEFT JOIN (SELECT edicao_id, count(*)::int n,
                      (count(DISTINCT telefone) + count(*) FILTER (WHERE telefone IS NULL))::int pessoas,
                      count(*) FILTER (WHERE tel_status IN ('ok', 'corrigido'))::int ok,
                      count(*) FILTER (WHERE tel_status = 'revisar')::int rev,
                      count(*) FILTER (WHERE tel_status = 'invalido')::int inv
                 FROM public.bd_leads GROUP BY 1) l ON l.edicao_id = e.id
    LEFT JOIN (SELECT edicao_id, sum(linhas_planilha)::int linhas FROM public.v_bd_fontes GROUP BY 1) fo ON fo.edicao_id = e.id
    LEFT JOIN (SELECT edicao_id, count(*)::int n,
                      count(*) FILTER (WHERE conta_compra)::int validas,
                      count(*) FILTER (WHERE conta_compra AND telefone_pessoa IS NULL)::int sem_tel
                 FROM public.v_bd_compras GROUP BY 1) c ON c.edicao_id = e.id
$$;
REVOKE ALL ON FUNCTION public.bd_contagens() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bd_contagens() TO service_role;

COMMIT;
