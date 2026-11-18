-- 063: Redirecionador — a mesma pessoa cai sempre no mesmo grupo + bloqueio de intrusos (18/11/2026).
--  * As páginas de captura geram um código aleatório por inscrição (redir_id, sem dado pessoal), mandam junto
--    com o lead (fica em inscricoes.payload) e o botão do grupo abre /<funil>?i=<código>.
--  * redir_clique(p_ident): com o código, acha o telefone da inscrição. Se esse telefone já foi mandado a um
--    grupo do funil que continua ativo ou cheio, volta para o MESMO grupo (sem contar clique de novo no grupo).
--    Se o grupo dele caiu (inválido/pausado), segue a fila normal e grava o novo grupo.
--    Inscrição ainda não gravada: usa o próprio código como chave.
--  * redir_bloqueados: telefones que entraram como intrusos (alerta intrusos_grupo). Se se inscreverem
--    para pegar o link, o redirecionador mostra "grupos completos".
--  * Sem código (links antigos, mensagens de recuperação): exatamente como antes.
--  * Desempenho: duas buscas por índice dentro da mesma chamada (sem ida extra ao banco).
BEGIN;

CREATE INDEX IF NOT EXISTS inscricoes_redir_id ON public.inscricoes ((payload ->> 'redir_id')) WHERE payload ? 'redir_id';

CREATE TABLE IF NOT EXISTS public.redir_atribuicoes (
  funil      text NOT NULL,
  chave      text NOT NULL,          -- telefone_chave, ou 'id:<código>' se a inscrição ainda não chegou
  grupo_id   bigint REFERENCES public.redir_grupos(id) ON DELETE CASCADE,
  criado_em  timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (funil, chave)
);
ALTER TABLE public.redir_atribuicoes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.redir_bloqueados (
  telefone_chave text PRIMARY KEY,
  telefone   text,
  motivo     text,
  criado_em  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.redir_bloqueados ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.redir_atribuicoes, public.redir_bloqueados FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.redir_bloquear(p_telefones text[], p_motivo text)
RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH ins AS (
    INSERT INTO redir_bloqueados (telefone_chave, telefone, motivo)
    SELECT DISTINCT ON (telefone_chave(t)) telefone_chave(t), t, left(p_motivo, 300)
    FROM unnest(p_telefones) t WHERE telefone_chave(t) IS NOT NULL
    ON CONFLICT (telefone_chave) DO NOTHING RETURNING 1
  ) SELECT count(*)::int FROM ins;
$$;
REVOKE ALL ON FUNCTION public.redir_bloquear(text[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redir_bloquear(text[], text) TO service_role;

DROP FUNCTION IF EXISTS public.redir_clique(text, text, boolean);
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

  SELECT * INTO g FROM redir_grupos
   WHERE funil = p_funil AND status = 'ativo'
   ORDER BY ordem, id
   LIMIT 1
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
