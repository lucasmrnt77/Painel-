-- 057: Caminhos da recuperação separados por funil (General × Trader), 09/11/2026.
-- O fluxo do General usa as mesmas letras (A–J) que o do Trader. O funil vem da página em que a pessoa se
-- inscreveu (como no resto da aba Recuperação): Trader = página Trader; General = General, Jubilados e General/Jubilados.
-- Se o bloco HTTP mandar "fluxo": "general" | "trader", vale o que veio no aviso (mais preciso que a página).
-- p_funil: 'General' | 'Trader' | NULL (os dois somados).
BEGIN;
DROP FUNCTION IF EXISTS public.recuperacao_caminhos_resumo(bigint, date, date);
CREATE FUNCTION public.recuperacao_caminhos_resumo(p_lancamento bigint, p_de date, p_ate date, p_funil text DEFAULT NULL)
RETURNS TABLE(caminho text, tipo text, receberam bigint, clicaram bigint, entraram bigint, ja_estavam bigint, mediana_horas numeric)
LANGUAGE sql STABLE SET search_path = '' AS $$
  WITH env AS (
    SELECT c.telefone_chave, c.caminho, c.tipo, c.criado_em
      FROM public.recuperacao_caminhos c
      LEFT JOIN public.v_leads l ON l.lancamento_id = c.lancamento_id AND l.telefone_chave = c.telefone_chave
     WHERE c.lancamento_id = p_lancamento AND c.etapa = 'enviado'
       AND (p_de IS NULL OR public.dia_uy(c.criado_em) >= p_de) AND (p_ate IS NULL OR public.dia_uy(c.criado_em) <= p_ate)
       AND (p_funil IS NULL OR (CASE WHEN lower(c.fluxo) = 'trader' THEN 'Trader' WHEN lower(c.fluxo) = 'general' THEN 'General'
                                      WHEN l.site = 'Trader' THEN 'Trader' ELSE 'General' END) = p_funil)
  ), cli AS (
    SELECT DISTINCT c.telefone_chave, c.caminho FROM public.recuperacao_caminhos c
     WHERE c.lancamento_id = p_lancamento AND c.etapa = 'clicou'
  ), m AS (
    SELECT g.telefone_chave, min(g.primeira_entrada_em) AS entrou_em
      FROM public.membros_grupo g WHERE g.lancamento_id = p_lancamento GROUP BY 1
  ), x AS (
    SELECT env.*, (cli.telefone_chave IS NOT NULL) AS clicou, m.entrou_em
      FROM env
      LEFT JOIN cli ON cli.telefone_chave = env.telefone_chave AND cli.caminho = env.caminho
      LEFT JOIN m ON m.telefone_chave = env.telefone_chave
  )
  SELECT x.caminho, min(x.tipo), count(*),
         count(*) FILTER (WHERE x.clicou),
         count(*) FILTER (WHERE x.entrou_em > x.criado_em),
         count(*) FILTER (WHERE x.entrou_em <= x.criado_em),
         round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM x.entrou_em - x.criado_em) / 3600)
                FILTER (WHERE x.entrou_em > x.criado_em))::numeric, 1)
    FROM x GROUP BY x.caminho ORDER BY x.caminho
$$;
REVOKE ALL ON FUNCTION public.recuperacao_caminhos_resumo(bigint, date, date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recuperacao_caminhos_resumo(bigint, date, date, text) TO service_role;
COMMIT;
