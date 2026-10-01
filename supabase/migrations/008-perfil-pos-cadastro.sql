-- =====================================================================
-- 008-perfil-pos-cadastro.sql — respostas da página de obrigado.
--
-- A página geral pergunta idade, gênero e capacidade de investimento
-- DEPOIS do cadastro (na página de obrigado). Esta migração:
-- * libera UPDATE de faixa_etaria, genero e resposta_dinheiro em inscricoes
--   (o trigger continua bloqueando todo o resto);
-- * cria registrar_perfil(): grava as respostas na inscrição mais recente
--   daquele telefone (por telefone_chave) no lançamento indicado ou ativo.
--   Respostas vazias não apagam o que já existe.
-- =====================================================================
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.registros_evento') IS NULL THEN
    RAISE EXCEPTION '008-perfil-pos-cadastro: rode 000 a 007 antes';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'registrar_perfil') THEN
    RAISE EXCEPTION '008-perfil-pos-cadastro: já aplicada — abortando';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.inscricoes_so_planilha()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  livres text[] := ARRAY['grupo_informado', 'pagina_captura', 'telefone', 'telefone_chave',
                         'faixa_etaria', 'genero', 'resposta_dinheiro'];
BEGIN
  IF (to_jsonb(NEW) - livres) IS DISTINCT FROM (to_jsonb(OLD) - livres) THEN
    RAISE EXCEPTION 'inscricoes: só grupo_informado, pagina_captura e as respostas de perfil podem ser alterados';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION public.registrar_perfil(
  p_lancamento_slug text,
  p_telefone text,
  p_faixa_etaria text,
  p_genero text,
  p_resposta_dinheiro text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_lanc  bigint;
  v_chave text := public.telefone_chave(p_telefone);
  v_id    bigint;
BEGIN
  IF v_chave IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'telefone_invalido');
  END IF;

  IF p_lancamento_slug IS NOT NULL AND btrim(p_lancamento_slug) <> '' THEN
    SELECT id INTO v_lanc FROM public.lancamentos WHERE slug = lower(btrim(p_lancamento_slug));
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'lancamento_inexistente');
    END IF;
  ELSE
    SELECT id INTO v_lanc FROM public.lancamentos WHERE ativo LIMIT 1;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'sem_lancamento_ativo');
    END IF;
  END IF;

  SELECT id INTO v_id
    FROM public.inscricoes
   WHERE lancamento_id = v_lanc AND telefone_chave = v_chave
   ORDER BY criado_em DESC, id DESC
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'inscricao_nao_encontrada');
  END IF;

  UPDATE public.inscricoes
     SET faixa_etaria      = coalesce(nullif(btrim(p_faixa_etaria), ''), faixa_etaria),
         genero            = coalesce(nullif(btrim(p_genero), ''), genero),
         resposta_dinheiro = coalesce(nullif(btrim(p_resposta_dinheiro), ''), resposta_dinheiro)
   WHERE id = v_id;

  RETURN jsonb_build_object('ok', true, 'inscricao_id', v_id);
END $$;

GRANT UPDATE (faixa_etaria, genero, resposta_dinheiro) ON public.inscricoes TO service_role;
REVOKE ALL ON FUNCTION public.registrar_perfil(text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_perfil(text, text, text, text, text) TO service_role;

COMMIT;
