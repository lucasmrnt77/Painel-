-- 056: Recuperação — qual caminho do fluxo do Unnichat cada pessoa recebeu (09/11/2026).
--
-- O fluxo tem um Randomizador com 10 caminhos (A–J): A–E = template com botão "QUIERO SABER" (o link do grupo só vem
-- depois do clique), F–J = template com o link do grupo direto. O Unnichat não conta quem entrou no grupo; o painel
-- sabe (membros_grupo), mas não sabia qual caminho cada pessoa recebeu.
--  * Bloco "Requisição HTTP" no Unnichat → POST /api/recuperacao/caminho com { telefone, caminho, tipo, etapa }:
--      etapa "enviado": logo depois do Randomizador, antes do template (todo contato que caiu no caminho)
--      etapa "clicou":  na saída do botão "QUIERO SABER" (só A–E)
--  * recuperacao_caminhos: um registro por pessoa × caminho × etapa (repetir não duplica).
--  * recuperacao_caminhos_resumo: por caminho — receberam, clicaram, entraram no grupo DEPOIS do envio, mediana de horas.
BEGIN;

CREATE TABLE IF NOT EXISTS public.recuperacao_caminhos (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lancamento_id  bigint NOT NULL REFERENCES public.lancamentos(id) ON DELETE CASCADE,
  telefone       text NOT NULL,
  telefone_chave text NOT NULL,
  caminho        text NOT NULL CHECK (caminho ~ '^[A-Z]$'),
  tipo           text NOT NULL CHECK (tipo IN ('botao', 'link')),
  etapa          text NOT NULL CHECK (etapa IN ('enviado', 'clicou')),
  fluxo          text,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recuperacao_caminhos_unico UNIQUE (lancamento_id, telefone_chave, caminho, etapa)
);
CREATE INDEX IF NOT EXISTS recuperacao_caminhos_lanc ON public.recuperacao_caminhos (lancamento_id, caminho);
ALTER TABLE public.recuperacao_caminhos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recuperacao_caminhos FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recuperacao_caminhos TO service_role;

-- Mesma chave de telefone das inscrições e da recuperação
CREATE OR REPLACE FUNCTION public.recuperacao_caminhos_chave()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.telefone_chave := COALESCE(public.telefone_chave(NEW.telefone), NEW.telefone);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.recuperacao_caminhos_chave() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS recuperacao_caminhos_chave ON public.recuperacao_caminhos;
CREATE TRIGGER recuperacao_caminhos_chave BEFORE INSERT ON public.recuperacao_caminhos
  FOR EACH ROW EXECUTE FUNCTION public.recuperacao_caminhos_chave();

-- Resumo por caminho no período (dia do envio, horário do Uruguai).
-- "Entrou no grupo" = 1ª entrada num grupo do lançamento DEPOIS do envio desse caminho (quem já estava antes não conta).
CREATE OR REPLACE FUNCTION public.recuperacao_caminhos_resumo(p_lancamento bigint, p_de date, p_ate date)
RETURNS TABLE(caminho text, tipo text, receberam bigint, clicaram bigint, entraram bigint, ja_estavam bigint, mediana_horas numeric)
LANGUAGE sql STABLE SET search_path = '' AS $$
  WITH env AS (
    SELECT c.telefone_chave, c.caminho, c.tipo, c.criado_em
      FROM public.recuperacao_caminhos c
     WHERE c.lancamento_id = p_lancamento AND c.etapa = 'enviado'
       AND (p_de IS NULL OR public.dia_uy(c.criado_em) >= p_de) AND (p_ate IS NULL OR public.dia_uy(c.criado_em) <= p_ate)
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
REVOKE ALL ON FUNCTION public.recuperacao_caminhos_resumo(bigint, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recuperacao_caminhos_resumo(bigint, date, date) TO service_role;

COMMIT;
