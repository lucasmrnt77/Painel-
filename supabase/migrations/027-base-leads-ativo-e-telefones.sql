-- 027: Base de leads — um lançamento ativo por vez + correção de telefones por cruzamento.
--
--  * bd_edicoes ganha "ativa" e "encerrada_em". Só UM lançamento pode estar ativo (índice único):
--    é o único cujas inscrições novas do painel entram sozinhas na base.
--    Antes, todo lançamento ligado a um lançamento do painel recebia (setembro e dezembro ao mesmo tempo).
--  * bd_ativar_edicao(id, lancamento_id?) ativa um lançamento (desativa o anterior) e traz as inscrições
--    dele que ainda não estavam na base. bd_encerrar_edicao(id) dá o lançamento por terminado.
--  * bd_cruzar_telefones(): telefone com erro (faltam dígitos, dígitos a mais, sem código de área...) que
--    aparece COMPLETO e válido em outro registro da base (mesmo país e mesmos 8 últimos dígitos, sem
--    ambiguidade) vira correção aprovada automaticamente. O painel roda junto com "Recalcular" e o cron da base.
BEGIN;

ALTER TABLE public.bd_edicoes ADD COLUMN IF NOT EXISTS ativa boolean NOT NULL DEFAULT false;
ALTER TABLE public.bd_edicoes ADD COLUMN IF NOT EXISTS encerrada_em timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS bd_edicoes_uma_ativa ON public.bd_edicoes (ativa) WHERE ativa;

-- Situação atual: dezembro/2026 é o lançamento em andamento; setembro/2026 terminou.
UPDATE public.bd_edicoes SET ativa = false, encerrada_em = coalesce(encerrada_em, now()) WHERE codigo = 'set-2026';
UPDATE public.bd_edicoes SET ativa = true, encerrada_em = NULL WHERE codigo = 'dez-2026';
UPDATE public.bd_edicoes SET observacao = 'Inscrições vieram do painel.' WHERE codigo = 'set-2026' AND observacao = 'Inscrições vêm do painel.';
UPDATE public.bd_edicoes SET observacao = NULL
 WHERE codigo = 'dez-2026' AND observacao LIKE 'Lançamento atual: inscrições entram sozinhas.%';

-- Inscrição nova só entra no lançamento ATIVO. Correção de telefone de quem já está na base continua valendo.
CREATE OR REPLACE FUNCTION public.bd_lead_da_inscricao()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE e bigint;
BEGIN
  BEGIN
    IF EXISTS (SELECT 1 FROM public.bd_leads WHERE inscricao_id = NEW.id) THEN
      UPDATE public.bd_leads SET telefone_original = coalesce(NEW.telefone, NEW.telefone_original, ''), email = nullif(NEW.email, '')
       WHERE inscricao_id = NEW.id;
      RETURN NEW;
    END IF;
    SELECT id INTO e FROM public.bd_edicoes WHERE lancamento_id = NEW.lancamento_id AND ativa;
    IF e IS NULL THEN RETURN NEW; END IF;
    INSERT INTO public.bd_leads (edicao_id, fonte, data, telefone_original, pais_informado, email, inscricao_id, chave)
    VALUES (e, 'painel', NEW.criado_em, coalesce(NEW.telefone, NEW.telefone_original, ''), NULL, nullif(NEW.email, ''), NEW.id, 'inscricao:' || NEW.id)
    ON CONFLICT (inscricao_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- Nunca derruba a inscrição
    RAISE WARNING 'bd_leads: inscrição % não entrou na base de leads: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END $$;

-- Ativa um lançamento (e desativa o que estava ativo). p_lancamento_id liga ao lançamento do painel, se ainda não estiver.
CREATE OR REPLACE FUNCTION public.bd_ativar_edicao(p_id bigint, p_lancamento_id bigint DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE v public.bd_edicoes%ROWTYPE; n int;
BEGIN
  SELECT * INTO v FROM public.bd_edicoes WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'lançamento não encontrado'; END IF;
  IF p_lancamento_id IS NOT NULL AND v.lancamento_id IS DISTINCT FROM p_lancamento_id THEN
    IF EXISTS (SELECT 1 FROM public.bd_edicoes WHERE lancamento_id = p_lancamento_id AND id <> p_id) THEN
      RAISE EXCEPTION 'esse lançamento do painel já está ligado a outro lançamento da base';
    END IF;
    UPDATE public.bd_edicoes SET lancamento_id = p_lancamento_id WHERE id = p_id;
    v.lancamento_id := p_lancamento_id;
  END IF;
  IF v.lancamento_id IS NULL THEN RAISE EXCEPTION 'escolha o lançamento do painel de onde vêm as inscrições'; END IF;

  UPDATE public.bd_edicoes SET ativa = false WHERE ativa AND id <> p_id;
  UPDATE public.bd_edicoes SET ativa = true, encerrada_em = NULL, tem_leads = true WHERE id = p_id;

  -- Inscrições desse lançamento que chegaram enquanto ele não estava ativo
  INSERT INTO public.bd_leads (edicao_id, fonte, data, telefone_original, email, inscricao_id, chave)
  SELECT p_id, 'painel', i.criado_em, coalesce(i.telefone, i.telefone_original, ''), nullif(i.email, ''), i.id, 'inscricao:' || i.id
    FROM public.inscricoes i WHERE i.lancamento_id = v.lancamento_id
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN jsonb_build_object('ativo', v.codigo, 'inscricoes_trazidas', n);
END $$;

-- Dá o lançamento por terminado: as inscrições novas deixam de entrar na base.
CREATE OR REPLACE FUNCTION public.bd_encerrar_edicao(p_id bigint)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
  UPDATE public.bd_edicoes SET ativa = false, encerrada_em = now() WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'lançamento não encontrado'; END IF;
  RETURN jsonb_build_object('encerrado', p_id);
END $$;

-- ── Telefones: corrige pelo número completo que já existe em outro registro ─────────────
CREATE OR REPLACE FUNCTION public.bd_cruzar_telefones()
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO '' SET statement_timeout TO '120s' AS $$
DECLARE n int;
BEGIN
  WITH ruins AS (
    SELECT DISTINCT regexp_replace(telefone_original, '\D', '', 'g') AS o, tel_motivo
      FROM public.bd_leads WHERE tel_status IN ('invalido', 'revisar')
    UNION
    SELECT DISTINCT regexp_replace(coalesce(telefone_original, ''), '\D', '', 'g'), tel_motivo
      FROM public.bd_compras WHERE tel_status IN ('invalido', 'revisar') AND telefone_original IS NOT NULL
  ), alvo AS (
    SELECT o, tel_motivo FROM ruins
     WHERE length(o) BETWEEN 9 AND 16
       AND coalesce(tel_motivo, '') NOT LIKE 'número de teste%'
       AND o !~ '(\d)\1{5,}' AND o !~ '(\d{2,3})\1\1'
       -- pelo menos 8 dígitos do número em si, além do código do país (senão o "final igual" é fraco)
       AND length(o) - CASE WHEN o LIKE '59%' THEN 3 ELSE 2 END >= 8
       AND NOT EXISTS (SELECT 1 FROM public.bd_telefone_correcoes c WHERE c.telefone_original = ruins.o)
  ), bons AS (
    SELECT DISTINCT telefone FROM public.bd_leads WHERE tel_status IN ('ok', 'corrigido') AND telefone IS NOT NULL
    UNION
    SELECT DISTINCT telefone FROM public.bd_compras WHERE tel_status IN ('ok', 'corrigido') AND telefone IS NOT NULL
  ), cand AS (
    SELECT a.o, a.tel_motivo, b.telefone
      FROM alvo a JOIN bons b ON right(b.telefone, 8) = right(a.o, 8)
     WHERE b.telefone <> a.o
       AND (
         -- mesmo país (código de 3 dígitos quando começa com 59, senão os 2 primeiros)
         (CASE WHEN a.o LIKE '59%' THEN left(b.telefone, 3) = left(a.o, 3) ELSE left(b.telefone, 2) = left(a.o, 2) END)
         -- número argentino digitado com o código do Uruguai: os 10 últimos dígitos batem
         OR (a.o LIKE '598%' AND b.telefone LIKE '549%' AND right(b.telefone, 10) = right(a.o, 10))
       )
  ), unico AS (
    SELECT o, min(telefone) AS telefone FROM cand GROUP BY o HAVING count(DISTINCT telefone) = 1
  ), ins AS (
    INSERT INTO public.bd_telefone_correcoes (telefone_original, telefone, situacao, origem, motivo, atualizado_em)
    SELECT o, telefone, 'aprovada', 'cruzamento', 'número completo encontrado em outro registro da base', now() FROM unico
    ON CONFLICT (telefone_original) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO n FROM ins;
  IF n > 0 THEN PERFORM public.bd_renormalizar(NULL); END IF;
  RETURN jsonb_build_object('corrigidos', n);
END $$;

REVOKE ALL ON FUNCTION public.bd_ativar_edicao(bigint, bigint), public.bd_encerrar_edicao(bigint), public.bd_cruzar_telefones()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bd_ativar_edicao(bigint, bigint), public.bd_encerrar_edicao(bigint), public.bd_cruzar_telefones()
  TO service_role;

COMMIT;
