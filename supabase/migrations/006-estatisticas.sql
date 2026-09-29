-- =====================================================================
-- 006-estatisticas.sql — atualizar estatísticas depois de importações.
--
-- Depois de importar dezenas de milhares de linhas de uma vez, o Postgres
-- ainda não tem estatísticas das tabelas e pode escolher planos muito
-- lentos (vimos a Visão geral passar de 0,1 s para 78 s). O painel chama
-- esta função ao fim de cada importação. Ela só roda ANALYZE nas tabelas
-- do painel; SECURITY DEFINER porque ANALYZE exige ser dono da tabela.
-- =====================================================================
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'importar_entradas_grupo') THEN
    RAISE EXCEPTION '006-estatisticas: rode 000 a 005 antes';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'atualizar_estatisticas') THEN
    RAISE EXCEPTION '006-estatisticas: já aplicada — abortando';
  END IF;
END $$;

CREATE FUNCTION public.atualizar_estatisticas()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  ANALYZE public.inscricoes;
  ANALYZE public.membros_grupo;
  ANALYZE public.eventos_sendflow;
  ANALYZE public.webhooks_sendflow;
END $$;

REVOKE ALL ON FUNCTION public.atualizar_estatisticas() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atualizar_estatisticas() TO service_role;

COMMIT;
