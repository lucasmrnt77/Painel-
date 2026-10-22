-- 037: Lead = quem clicou em "unirme al grupo" na página de gracias (definição dos testes de dezembro).
--  * inscricoes.clicou_grupo_em: hora do 1º clique no botão do grupo (a página de gracias avisa o painel).
--    Só dados novos: nenhuma inscrição antiga é alterada.
--  * registrar_perfil ganha p_clicou (padrão false). As chamadas de hoje continuam iguais.
--  * metricas_teste_periodo: por site × página, no período:
--      inscritos (cadastro), leads (clicaram no grupo) e leads calificados (clicaram e qualificado = true).
--    Clique = clicou_grupo_em preenchido OU qualificado preenchido (a decisão de qualificado só é gravada
--    no clique do botão, então vale para quem clicou antes desta versão das páginas).
--    Calificado: a decisão do serviço de tracking; na Trader sem essa decisão (página principal),
--    a mesma regra do serviço pela experiência do cadastro (qualifica_trader).
BEGIN;

ALTER TABLE public.inscricoes ADD COLUMN IF NOT EXISTS clicou_grupo_em timestamptz;

CREATE OR REPLACE FUNCTION public.inscricoes_so_planilha()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE
  livres text[] := ARRAY['grupo_informado', 'pagina_captura', 'telefone', 'telefone_chave',
                         'faixa_etaria', 'genero', 'resposta_dinheiro', 'qualificado', 'clicou_grupo_em', 'atualizado_em'];
BEGIN
  IF (to_jsonb(NEW) - livres) IS DISTINCT FROM (to_jsonb(OLD) - livres) THEN
    RAISE EXCEPTION 'inscricoes: só grupo_informado, pagina_captura e as respostas de perfil podem ser alterados';
  END IF;
  RETURN NEW;
END $$;

DROP FUNCTION IF EXISTS public.registrar_perfil(text, text, text, text, text, boolean);
CREATE FUNCTION public.registrar_perfil(p_lancamento_slug text, p_telefone text, p_faixa_etaria text, p_genero text,
                                        p_resposta_dinheiro text, p_qualificado boolean DEFAULT NULL, p_clicou boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO '' AS $$
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
         resposta_dinheiro = coalesce(nullif(btrim(p_resposta_dinheiro), ''), resposta_dinheiro),
         qualificado       = coalesce(p_qualificado, qualificado),
         clicou_grupo_em   = CASE WHEN p_clicou THEN coalesce(clicou_grupo_em, now()) ELSE clicou_grupo_em END
   WHERE id = v_id;

  RETURN jsonb_build_object('ok', true, 'inscricao_id', v_id);
END $$;
REVOKE ALL ON FUNCTION public.registrar_perfil(text, text, text, text, text, boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_perfil(text, text, text, text, text, boolean, boolean) TO service_role;

-- Mesma regra do serviço de tracking (regras.ts → qualificaTrader): opera há 6 meses ou mais;
-- "nunca" e "menos de 3 meses" não; sem informação, qualifica.
CREATE OR REPLACE FUNCTION public.qualifica_trader(p_experiencia text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO '' AS $$
  SELECT CASE
    WHEN e IS NULL OR e = '' THEN true
    WHEN e LIKE 'nunca%' THEN false
    WHEN e LIKE '%menos%' THEN false
    WHEN e LIKE '6%' OR e LIKE '%6-12%' OR e LIKE '%6 a 12%' THEN true
    WHEN e LIKE '%ano%' OR e LIKE '%año%' OR e LIKE '1%' OR e LIKE '%mas de%' OR e LIKE '%más de%' THEN true
    ELSE true
  END
  FROM (SELECT lower(btrim(p_experiencia)) AS e) x
$$;

CREATE OR REPLACE FUNCTION public.metricas_teste_periodo(p_lancamento bigint, p_de date, p_ate date)
RETURNS TABLE (site text, landing text, inscritos bigint, leads bigint, leads_qualificados bigint)
LANGUAGE sql STABLE SET search_path TO '' AS $$
  WITH pessoa AS (
    SELECT i.telefone_chave,
           bool_or(i.clicou_grupo_em IS NOT NULL OR i.qualificado IS NOT NULL) AS clicou,
           bool_or(COALESCE(i.qualificado,
             CASE WHEN public.site_da_inscricao(i.pagina_captura, i.payload, i.landing) = 'Trader'
                  THEN public.qualifica_trader(i.experiencia) END)) AS qualificado
      FROM public.inscricoes i
     WHERE i.lancamento_id = p_lancamento AND i.telefone_chave IS NOT NULL
     GROUP BY i.telefone_chave
  )
  SELECT v.site, COALESCE(public.pagina_padrao(NULLIF(v.landing, '')), '(sem landing)'),
         count(*),
         count(*) FILTER (WHERE p.clicou),
         count(*) FILTER (WHERE p.clicou AND p.qualificado)
    FROM public.v_leads v
    LEFT JOIN pessoa p ON p.telefone_chave = v.telefone_chave
   WHERE v.lancamento_id = p_lancamento
     AND (p_de IS NULL OR public.dia_uy(v.inscrito_em) >= p_de)
     AND (p_ate IS NULL OR public.dia_uy(v.inscrito_em) <= p_ate)
   GROUP BY 1, 2
$$;
REVOKE ALL ON FUNCTION public.metricas_teste_periodo(bigint, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.metricas_teste_periodo(bigint, date, date) TO service_role;

COMMIT;
