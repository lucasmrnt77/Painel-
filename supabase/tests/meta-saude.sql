-- Testes da 016: registro da saúde na Meta.
BEGIN;
DO $$
BEGIN
  INSERT INTO public.meta_saude (ok, problemas) VALUES (false, '["x"]');
  INSERT INTO public.meta_saude (disparo, ok) VALUES ('manual', true);
  BEGIN
    INSERT INTO public.meta_saude (disparo, ok) VALUES ('outro', true);
    RAISE EXCEPTION 'disparo inválido passou';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF has_table_privilege('anon', 'public.meta_saude', 'SELECT') THEN RAISE EXCEPTION 'anon lê meta_saude'; END IF;
  RAISE NOTICE 'meta-saude: OK';
END $$;
ROLLBACK;
