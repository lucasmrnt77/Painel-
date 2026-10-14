-- 021: planilha unificada e incremental.
--  * inscricoes.atualizado_em: data da última mudança (perfil, qualificação...) para a planilha
--    buscar só o que mudou. A trava "inscricoes_so_planilha" passa a liberar essa coluna.
--  * planilha_sync: cada planilha registra quando buscou dados (o monitor avisa se parar).
--  * alertas: novo tipo 'planilha_parada'.
BEGIN;

ALTER TABLE public.inscricoes ADD COLUMN IF NOT EXISTS atualizado_em timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.inscricoes_so_planilha()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  livres text[] := ARRAY['grupo_informado', 'pagina_captura', 'telefone', 'telefone_chave',
                         'faixa_etaria', 'genero', 'resposta_dinheiro', 'qualificado', 'atualizado_em'];
BEGIN
  IF (to_jsonb(NEW) - livres) IS DISTINCT FROM (to_jsonb(OLD) - livres) THEN
    RAISE EXCEPTION 'inscricoes: só grupo_informado, pagina_captura e as respostas de perfil podem ser alterados';
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.tocar_atualizado_em()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END $function$;

-- Roda antes da trava (ordem alfabética dos gatilhos)
DROP TRIGGER IF EXISTS inscricoes_atualizado_em ON public.inscricoes;
CREATE TRIGGER inscricoes_atualizado_em BEFORE UPDATE ON public.inscricoes
  FOR EACH ROW EXECUTE FUNCTION public.tocar_atualizado_em();

CREATE INDEX IF NOT EXISTS inscricoes_lanc_atualizado ON public.inscricoes (lancamento_id, atualizado_em);
CREATE INDEX IF NOT EXISTS membros_grupo_lanc_atualizado ON public.membros_grupo (lancamento_id, atualizado_em);

CREATE TABLE IF NOT EXISTS public.planilha_sync (
  nome          text PRIMARY KEY,
  lancamento_id bigint REFERENCES public.lancamentos(id),
  ultima_em     timestamptz NOT NULL DEFAULT now(),
  linhas        integer NOT NULL DEFAULT 0,
  completo      boolean NOT NULL DEFAULT false,
  ativo         boolean NOT NULL DEFAULT true
);
ALTER TABLE public.planilha_sync ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.planilha_sync FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.planilha_sync TO service_role;

ALTER TABLE public.alertas DROP CONSTRAINT IF EXISTS alertas_tipo_check;
ALTER TABLE public.alertas ADD CONSTRAINT alertas_tipo_check
  CHECK (tipo IN ('sem_entradas', 'entradas_retomadas', 'resumo', 'teste', 'sem_leads', 'leads_retomados', 'planilha_parada'));

COMMIT;
