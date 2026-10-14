-- 020: alerta do grupo gratuito (OP Futuros) por falta de LEADS na página, não de entradas no grupo.
BEGIN;
ALTER TABLE public.alertas DROP CONSTRAINT IF EXISTS alertas_tipo_check;
ALTER TABLE public.alertas ADD CONSTRAINT alertas_tipo_check
  CHECK (tipo IN ('sem_entradas', 'entradas_retomadas', 'resumo', 'teste', 'sem_leads', 'leads_retomados'));
UPDATE public.lancamentos SET nome = 'OP Futuros (grupo gratuito)' WHERE tipo = 'grupo_gratuito' AND nome = 'Grupo gratuito';
COMMIT;
