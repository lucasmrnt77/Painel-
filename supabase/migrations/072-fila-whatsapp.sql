-- 072 (23/11/2026): fila dos alertas de WhatsApp — no máximo 2 mensagens a cada 2 minutos.
-- Rajadas de alertas no mesmo número podem levar ao bloqueio da linha (22/11: 11 alertas em 10 min).
CREATE TABLE IF NOT EXISTS public.fila_whatsapp (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  tipo         text,
  telefones    text[] NOT NULL DEFAULT '{}',
  mensagem     text NOT NULL,
  reservado_em timestamptz,          -- quando entrou num lote de envio (conta para o limite)
  enviado_em   timestamptz,
  status       text,
  detalhe      jsonb
);
CREATE INDEX IF NOT EXISTS fila_whatsapp_pendentes ON public.fila_whatsapp (id) WHERE reservado_em IS NULL;
CREATE INDEX IF NOT EXISTS fila_whatsapp_reservados ON public.fila_whatsapp (reservado_em) WHERE reservado_em IS NOT NULL;
ALTER TABLE public.fila_whatsapp ENABLE ROW LEVEL SECURITY;

-- Reserva os próximos da fila respeitando o limite (p_max envios por janela de p_janela_seg).
-- Lock por transação: dois crons ao mesmo tempo nunca passam do limite.
CREATE OR REPLACE FUNCTION public.fila_whatsapp_reservar(p_max int DEFAULT 2, p_janela_seg int DEFAULT 120)
RETURNS SETOF public.fila_whatsapp
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE vagas int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('fila_whatsapp'));
  SELECT p_max - count(*) INTO vagas FROM fila_whatsapp
   WHERE reservado_em > now() - make_interval(secs => p_janela_seg);
  IF vagas <= 0 THEN RETURN; END IF;
  RETURN QUERY
  UPDATE fila_whatsapp f SET reservado_em = now()
   WHERE f.id IN (SELECT id FROM fila_whatsapp WHERE reservado_em IS NULL ORDER BY id LIMIT vagas)
  RETURNING f.*;
END $$;
REVOKE ALL ON FUNCTION public.fila_whatsapp_reservar(int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fila_whatsapp_reservar(int, int) TO service_role;
