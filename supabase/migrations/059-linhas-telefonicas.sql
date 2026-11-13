-- 059: Linhas telefônicas (13/11/2026) — cópia da tabela "Lineas Telefonicas" do Notion dentro do painel.
-- Cada chip precisa de recarga a cada 6 meses para não ser perdido: proxima_recarga = última recarga + 6 meses.
-- O lembrete é só no painel (aba Linhas): vencida / vence em até 15 dias. Sem WhatsApp.
-- PIN e PUK ficam aqui por decisão do Martín (13/11); só o service_role lê a tabela (o painel exige login).
BEGIN;

CREATE TABLE IF NOT EXISTS public.linhas_telefonicas (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  linha            text NOT NULL,
  celular          text,
  whatsapp         text,
  descricao        text,
  pin              text,
  puk              text,
  chip             text,
  estado           text NOT NULL DEFAULT 'ativa' CHECK (estado IN ('ativa', 'perdida')),
  ultima_recarga   date,
  proxima_recarga  date,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_em    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS linhas_telefonicas_linha ON public.linhas_telefonicas (regexp_replace(linha, '\D', '', 'g'));
ALTER TABLE public.linhas_telefonicas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.linhas_telefonicas FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.linhas_telefonicas TO service_role;

COMMIT;
