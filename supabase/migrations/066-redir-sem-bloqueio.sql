-- 066: redirecionador sem bloqueio de números (20/11/2026)
-- 1) Tira o bloqueio (redir_bloqueados): quem se inscreveu nunca pode ver "grupos completos".
--    A tabela e redir_bloquear ficam, mas não são mais usadas.
-- 2) "Mesmo grupo": a pessoa volta sempre ao grupo em que entrou, MENOS se o convite dele não funciona mais
--    (grupo suspenso: cheio com verificacao = 'invalido', como #25, #58, #45). Aí recebe um grupo novo da fila.
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

  IF p_ident ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT i.telefone_chave INTO v_tel FROM inscricoes i
     WHERE i.payload ? 'redir_id' AND i.payload ->> 'redir_id' = lower(p_ident)
     ORDER BY i.criado_em DESC LIMIT 1;
    v_chave := coalesce(v_tel, 'id:' || lower(p_ident));
    SELECT gr.* INTO g FROM redir_atribuicoes a JOIN redir_grupos gr ON gr.id = a.grupo_id
     WHERE a.funil = p_funil AND a.chave = v_chave AND gr.status IN ('ativo', 'cheio')
       AND gr.verificacao IS DISTINCT FROM 'invalido';
    IF FOUND THEN
      IF p_contar THEN
        INSERT INTO redir_cliques (funil, grupo_id, origem) VALUES (p_funil, g.id, left(coalesce(p_origem || ' | ', '') || 'mesmo grupo', 200));
      END IF;
      RETURN jsonb_build_object('ok', true, 'link', 'https://chat.whatsapp.com/' || g.codigo, 'grupo_id', g.id,
                                'reserva', false, 'verificar', false, 'mesmo_grupo', true);
    END IF;
  END IF;

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
