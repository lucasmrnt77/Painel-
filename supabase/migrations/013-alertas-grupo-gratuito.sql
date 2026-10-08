-- =====================================================================
-- 013-alertas-grupo-gratuito.sql — o grupo gratuito também é monitorado.
--
-- O grupo gratuito vira um "lançamento" especial (tipo = 'grupo_gratuito'):
-- as entradas chegam pelo mesmo webhook do Sendflow (pela referência da
-- campanha) e o mesmo monitor avisa quando ninguém entra por X tempo.
-- Como é um grupo contínuo, os prazos de alerta passam a ir até 48 h e o
-- resumo pode ser a cada 6 h, 12 h ou 24 h.
-- =====================================================================
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.links') IS NULL THEN
    RAISE EXCEPTION '013-alertas-grupo-gratuito: rode 000 a 012 antes';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'lancamentos' AND column_name = 'tipo') THEN
    RAISE EXCEPTION '013-alertas-grupo-gratuito: já aplicada — abortando';
  END IF;
END $$;

ALTER TABLE public.lancamentos
  ADD COLUMN tipo text NOT NULL DEFAULT 'lancamento' CHECK (tipo IN ('lancamento', 'grupo_gratuito'));

-- Um grupo gratuito só, e ele nunca é o lançamento ativo
CREATE UNIQUE INDEX lancamentos_um_grupo_gratuito ON public.lancamentos (tipo) WHERE tipo = 'grupo_gratuito';
ALTER TABLE public.lancamentos
  ADD CONSTRAINT lancamentos_grupo_nao_ativo CHECK (tipo = 'lancamento' OR NOT ativo);

ALTER TABLE public.lancamentos DROP CONSTRAINT lancamentos_alerta_minutos_ok;
ALTER TABLE public.lancamentos
  ADD CONSTRAINT lancamentos_alerta_minutos_ok CHECK (alerta_minutos_sem_entrada BETWEEN 5 AND 2880);

ALTER TABLE public.lancamentos DROP CONSTRAINT lancamentos_resumo_minutos_ok;
ALTER TABLE public.lancamentos
  ADD CONSTRAINT lancamentos_resumo_minutos_ok CHECK (resumo_minutos = 0 OR resumo_minutos IN (15, 20, 30, 60, 120, 180, 240, 360, 720, 1440));

INSERT INTO public.lancamentos (slug, nome, tipo, ativo, minutos_reenvio, alerta_minutos_sem_entrada, resumo_minutos)
VALUES ('grupo-gratuito', 'Grupo gratuito', 'grupo_gratuito', false, 10, 180, 0);

COMMIT;
