-- 007: registros_evento — o mesmo uso da rota registrar-usuario.
BEGIN;
SET LOCAL ROLE service_role;
INSERT INTO public.registros_evento (telefono, conocimiento_trading, fuente) VALUES ('59899123456', 'menos-3-meses', 'trading');
DO $$ BEGIN
  IF (SELECT count(*) FROM public.registros_evento WHERE telefono = '59899123456') <> 1 THEN RAISE EXCEPTION 'insert falhou'; END IF;
END $$;
UPDATE public.registros_evento SET updated_at = now() WHERE telefono = '59899123456';
RESET ROLE;
DO $$ BEGIN
  BEGIN
    INSERT INTO public.registros_evento (telefono) VALUES ('59899123456');
    RAISE EXCEPTION 'duplicado deveria falhar';
  EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN
    PERFORM 1 FROM public.registros_evento;
    RAISE EXCEPTION 'anon não deveria ler';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
\echo registros OK
