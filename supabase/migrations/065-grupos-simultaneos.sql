-- 065: Vários grupos recebendo cliques ao mesmo tempo (20/11/2026).
--  * Os grupos que caíram (#57, #49, #48, #46) foram os que encheram mais rápido (20 a 44 entradas/hora).
--    Com N grupos ao mesmo tempo, cada um recebe ~1/N das entradas.
--  * redir_funis.grupos_simultaneos (1 a 20, padrão 1 = como antes). Geral passa a 7.
--  * redir_clique: entre os N primeiros grupos ativos da fila, manda para o que tem MENOS cliques
--    (empate: sorteio). "Mesmo grupo sempre" (migração 063) continua valendo antes disso.
--  * Desempenho: a escolha é feita na mesma consulta (subconsulta sobre no máximo 20 linhas).
BEGIN;

ALTER TABLE public.redir_funis ADD COLUMN IF NOT EXISTS grupos_simultaneos int NOT NULL DEFAULT 1;
ALTER TABLE public.redir_funis DROP CONSTRAINT IF EXISTS redir_funis_grupos_simultaneos_check;
ALTER TABLE public.redir_funis ADD CONSTRAINT redir_funis_grupos_simultaneos_check CHECK (grupos_simultaneos BETWEEN 1 AND 20);
UPDATE public.redir_funis SET grupos_simultaneos = 7 WHERE slug = 'geral';

-- redir_clique: igual à 063, trocando só a escolha do grupo da vez
CREATE OR REPLACE FUNCTION public.redir_clique(p_funil text, p_origem text DEFAULT NULL::text, p_contar boolean DEFAULT true, p_ident text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  f public.redir_funis%ROWTYPE;
  g public.redir_grupos%ROWTYPE;
  verificar boolean := false;
  v_tel text;
  v_chave text;
BEGIN
  SELECT * INTO f FROM redir_funis WHERE slug = p_funil;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'funil_inexistente');
  END IF;

  -- Pessoa identificada pelo código da inscrição (só UUID; qualquer outra coisa é ignorada)
  IF p_ident ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT i.telefone_chave INTO v_tel FROM inscricoes i
     WHERE i.payload ? 'redir_id' AND i.payload ->> 'redir_id' = lower(p_ident)
     ORDER BY i.criado_em DESC LIMIT 1;
    IF v_tel IS NOT NULL AND EXISTS (SELECT 1 FROM redir_bloqueados b WHERE b.telefone_chave = v_tel) THEN
      IF p_contar THEN
        INSERT INTO redir_cliques (funil, grupo_id, origem) VALUES (p_funil, NULL, left(coalesce(p_origem || ' | ', '') || 'bloqueado', 200));
      END IF;
      RETURN jsonb_build_object('ok', true, 'link', NULL, 'grupo_id', NULL, 'reserva', false, 'verificar', false, 'bloqueado', true);
    END IF;
    v_chave := coalesce(v_tel, 'id:' || lower(p_ident));
    SELECT gr.* INTO g FROM redir_atribuicoes a JOIN redir_grupos gr ON gr.id = a.grupo_id
     WHERE a.funil = p_funil AND a.chave = v_chave AND gr.status IN ('ativo', 'cheio');
    IF FOUND THEN
      IF p_contar THEN
        INSERT INTO redir_cliques (funil, grupo_id, origem) VALUES (p_funil, g.id, left(coalesce(p_origem || ' | ', '') || 'mesmo grupo', 200));
      END IF;
      RETURN jsonb_build_object('ok', true, 'link', 'https://chat.whatsapp.com/' || g.codigo, 'grupo_id', g.id,
                                'reserva', false, 'verificar', false, 'mesmo_grupo', true);
    END IF;
  END IF;

  -- Entre os N primeiros grupos ativos da fila, o que tem menos cliques (N = redir_funis.grupos_simultaneos)
  SELECT * INTO g FROM redir_grupos
   WHERE id = (
     SELECT t.id FROM (
       SELECT id, cliques FROM redir_grupos
        WHERE funil = p_funil AND status = 'ativo'
        ORDER BY ordem, id
        LIMIT greatest(coalesce(f.grupos_simultaneos, 1), 1)
     ) t
     ORDER BY t.cliques, random()
     LIMIT 1)
   FOR UPDATE;

  IF NOT FOUND THEN
    IF p_contar THEN
      INSERT INTO redir_cliques (funil, grupo_id, origem) VALUES (p_funil, NULL, left(p_origem, 200));
      -- um aviso por meia hora, não um por clique
      IF NOT EXISTS (SELECT 1 FROM redir_eventos WHERE funil = p_funil AND tipo = 'sem_grupos' AND criado_em > now() - interval '30 minutes') THEN
        INSERT INTO redir_eventos (funil, tipo, alertar, detalhe) VALUES (p_funil, 'sem_grupos', true, jsonb_build_object('reserva', f.link_reserva));
      END IF;
    END IF;
    RETURN jsonb_build_object('ok', true, 'link', f.link_reserva, 'grupo_id', NULL, 'reserva', true, 'verificar', false);
  END IF;

  IF p_contar THEN
    UPDATE redir_grupos
       SET cliques = cliques + 1,
           cliques_desde_verificacao = cliques_desde_verificacao + 1,
           atualizado_em = now()
     WHERE id = g.id
     RETURNING * INTO g;

    IF g.cliques_desde_verificacao >= f.verificar_a_cada THEN
      verificar := true;
      UPDATE redir_grupos SET cliques_desde_verificacao = 0 WHERE id = g.id;
    END IF;

    IF g.cliques >= f.limite_cliques THEN
      UPDATE redir_grupos SET status = 'cheio', motivo = 'limite de cliques', atualizado_em = now() WHERE id = g.id;
      INSERT INTO redir_eventos (funil, grupo_id, tipo, alertar, detalhe)
      VALUES (p_funil, g.id, 'cheio', true, jsonb_build_object('cliques', g.cliques, 'limite', f.limite_cliques));
      verificar := false;
    END IF;

    INSERT INTO redir_cliques (funil, grupo_id, origem) VALUES (p_funil, g.id, left(p_origem, 200));

    IF v_chave IS NOT NULL THEN
      INSERT INTO redir_atribuicoes (funil, chave, grupo_id) VALUES (p_funil, v_chave, g.id)
      ON CONFLICT (funil, chave) DO UPDATE SET grupo_id = EXCLUDED.grupo_id, atualizado_em = now();
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'link', 'https://chat.whatsapp.com/' || g.codigo, 'grupo_id', g.id,
                            'reserva', false, 'verificar', verificar);
END $function$;
REVOKE ALL ON FUNCTION public.redir_clique(text, text, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redir_clique(text, text, boolean, text) TO service_role;


COMMIT;
