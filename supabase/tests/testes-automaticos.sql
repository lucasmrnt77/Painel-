-- Testes da 014: tabela de resultados dos testes automáticos.
BEGIN;
DO $$
DECLARE n int;
BEGIN
  INSERT INTO public.testes_execucoes (origem, ok, total, falhas) VALUES ('servidor', true, 150, 0);
  INSERT INTO public.testes_execucoes (origem, disparo, ok, total, falhas, detalhes)
    VALUES ('navegador', 'manual', false, 6, 1, '[{"teste":"x","motivo":"y"}]');
  SELECT count(*) INTO n FROM public.testes_execucoes;
  IF n <> 2 THEN RAISE EXCEPTION 'esperava 2 execuções, veio %', n; END IF;
  BEGIN
    INSERT INTO public.testes_execucoes (origem, ok) VALUES ('outra', true);
    RAISE EXCEPTION 'origem inválida passou';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.testes_execucoes (origem, ok, falhas) VALUES ('servidor', true, -1);
    RAISE EXCEPTION 'falhas negativas passaram';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF has_table_privilege('anon', 'public.testes_execucoes', 'SELECT') THEN RAISE EXCEPTION 'anon lê testes'; END IF;
  IF has_table_privilege('authenticated', 'public.testes_execucoes', 'INSERT') THEN RAISE EXCEPTION 'authenticated grava testes'; END IF;
  RAISE NOTICE 'testes-automaticos: OK';
END $$;
ROLLBACK;
