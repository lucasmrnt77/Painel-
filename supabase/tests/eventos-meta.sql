-- 009: eventos_meta — reserva única por evento e bloqueio de anon.
BEGIN;
SET LOCAL ROLE service_role;
INSERT INTO public.eventos_meta (landing, acao, event_name, event_id, telefone_chave, pais, qualificado)
VALUES ('general', 'qualificacao', 'Lead Qualificado', 'evt-00000001', '99123456', 'UY', true);
DO $$ BEGIN
  BEGIN
    INSERT INTO public.eventos_meta (landing, acao, event_name, event_id) VALUES ('general', 'qualificacao', 'Lead Qualificado', 'evt-00000001');
    RAISE EXCEPTION 'duplicado deveria falhar';
  EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;
UPDATE public.eventos_meta SET status = 'enviado', meta_http = 200, tentativas = 1, enviado_em = now() WHERE event_id = 'evt-00000001';
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN
    PERFORM 1 FROM public.eventos_meta;
    RAISE EXCEPTION 'anon não deveria ler';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
\echo eventos-meta OK
