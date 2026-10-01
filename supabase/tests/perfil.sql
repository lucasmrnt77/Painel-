-- 008: respostas da página de obrigado.
BEGIN;
INSERT INTO public.lancamentos (nome, slug, ativo) VALUES ('Perfil teste', 'perfil-teste', false);
SELECT public.registrar_inscricao('perfil-teste', NULL, NULL, '+598 99 123 456', '{}'::jsonb, NULL, '{}'::jsonb, '{"pagina_captura":"Gen-Uruguay"}'::jsonb);
SET LOCAL ROLE service_role;
DO $$
DECLARE r jsonb; i record;
BEGIN
  r := public.registrar_perfil('perfil-teste', '59899123456', 'menor_25', 'hombre', 'Sí, podría hacerlo sin problema');
  IF NOT (r ->> 'ok')::boolean THEN RAISE EXCEPTION 'registrar_perfil falhou: %', r; END IF;
  SELECT * INTO i FROM public.inscricoes WHERE id = (r ->> 'inscricao_id')::bigint;
  IF i.faixa_etaria <> 'menor_25' OR i.genero <> 'hombre' OR i.resposta_dinheiro <> 'Sí, podría hacerlo sin problema' THEN
    RAISE EXCEPTION 'valores errados: % % %', i.faixa_etaria, i.genero, i.resposta_dinheiro;
  END IF;
  IF public.normalizar_faixa_etaria(i.faixa_etaria) <> 'até 24' OR public.normalizar_genero(i.genero) <> 'Homem' THEN
    RAISE EXCEPTION 'normalização inesperada';
  END IF;
  -- vazio não apaga
  r := public.registrar_perfil('perfil-teste', '099123456', '', NULL, NULL);
  SELECT * INTO i FROM public.inscricoes WHERE id = (r ->> 'inscricao_id')::bigint;
  IF i.genero <> 'hombre' THEN RAISE EXCEPTION 'vazio apagou valor'; END IF;
  -- telefone sem inscrição
  r := public.registrar_perfil('perfil-teste', '59891111111', '25_34', 'mujer', 'x');
  IF r ->> 'erro' <> 'inscricao_nao_encontrada' THEN RAISE EXCEPTION 'esperado inscricao_nao_encontrada: %', r; END IF;
  -- outros campos continuam bloqueados (trigger)
  BEGIN
    UPDATE public.inscricoes SET email = 'x@y.z' WHERE id = i.id;
    RAISE EXCEPTION 'email deveria estar bloqueado';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'inscricoes: só%' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;
DO $$ BEGIN
  BEGIN
    UPDATE public.inscricoes SET email = 'x@y.z' WHERE telefone_chave = public.telefone_chave('59899123456');
    RAISE EXCEPTION 'trigger deveria bloquear email';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'inscricoes: só%' THEN RAISE; END IF;
  END;
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN
    PERFORM public.registrar_perfil(NULL, '59899123456', 'x', 'x', 'x');
    RAISE EXCEPTION 'anon não deveria executar';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
\echo perfil OK
