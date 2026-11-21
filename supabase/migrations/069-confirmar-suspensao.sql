-- 069: confirmar antes de avisar (21/11/2026)
-- Convite que para de funcionar quase sempre é link redefinido (troca de permissões), não suspensão.
-- O grupo sai da fila na hora, mas o alerta só vai depois que o painel consultar a lista de grupos do
-- Sendflow: link novo → troca sozinho, sem alerta; mesmo link / Sendflow marca suspenso → alerta.
ALTER TABLE public.redir_grupos ADD COLUMN IF NOT EXISTS suspensao_pendente_desde timestamptz;

CREATE OR REPLACE FUNCTION public.redir_registrar_verificacao(p_grupo_id bigint, p_resultado text, p_titulo text DEFAULT NULL::text, p_detalhe text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  g public.redir_grupos%ROWTYPE;
  saiu boolean := false;
BEGIN
  IF p_resultado NOT IN ('valido', 'invalido', 'inconclusivo') THEN
    RAISE EXCEPTION 'resultado inválido: %', p_resultado;
  END IF;
  UPDATE redir_grupos
     SET verificacao = p_resultado,
         verificado_em = now(),
         titulo_whatsapp = coalesce(p_titulo, titulo_whatsapp),
         suspensao_pendente_desde = CASE WHEN p_resultado = 'valido' THEN NULL ELSE suspensao_pendente_desde END,
         atualizado_em = now()
   WHERE id = p_grupo_id
   RETURNING * INTO g;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'grupo_inexistente');
  END IF;

  IF p_resultado = 'invalido' AND g.status = 'ativo' THEN
    UPDATE redir_grupos SET status = 'invalido', motivo = coalesce(p_detalhe, 'convite inválido'),
           suspensao_pendente_desde = coalesce(suspensao_pendente_desde, now()), atualizado_em = now()
     WHERE id = g.id;
    -- registrado no painel; o alerta só sai depois da confirmação (redirecionador.ts → confirmarSuspensoes)
    INSERT INTO redir_eventos (funil, grupo_id, tipo, alertar, detalhe)
    VALUES (g.funil, g.id, 'invalido', false, jsonb_build_object('codigo', g.codigo, 'cliques', g.cliques, 'detalhe', p_detalhe, 'aguardando_confirmacao', true));
    saiu := true;
  END IF;

  RETURN jsonb_build_object('ok', true, 'saiu_da_fila', saiu, 'funil', g.funil, 'status', CASE WHEN saiu THEN 'invalido' ELSE g.status END,
                            'sendflow_group_id', g.sendflow_group_id);
END $function$;
