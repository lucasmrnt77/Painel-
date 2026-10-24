-- 041: "Lead Qualificado GeneralJubilados" (24/10) — a página General/Jubilados passa a mandar landing "genjub"
-- ao serviço de tracking (qualificado próprio, mesma regra da General; o lead continua "Lead General").
-- Só libera o novo valor no registro de eventos; nada antigo muda.
BEGIN;
ALTER TABLE public.eventos_meta DROP CONSTRAINT IF EXISTS eventos_meta_landing_check;
ALTER TABLE public.eventos_meta ADD CONSTRAINT eventos_meta_landing_check CHECK (landing IN ('general', 'trader', 'jubilados', 'genjub'));
COMMIT;
