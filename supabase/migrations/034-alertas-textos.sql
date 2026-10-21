-- 034: Textos editáveis do Catálogo de alertas.
--  Para cada tipo de alerta, o painel pode guardar: o modelo da mensagem (com variáveis {…}),
--  o diagnóstico e a lista "o que olhar" (em português e espanhol). Campo vazio = usa o texto padrão do código.
BEGIN;

CREATE TABLE IF NOT EXISTS public.alertas_textos (
  tipo            text PRIMARY KEY CHECK (tipo ~ '^[a-z_]{2,60}$'),
  mensagem        text CHECK (mensagem IS NULL OR length(mensagem) <= 4000),
  diagnostico_pt  text CHECK (diagnostico_pt IS NULL OR length(diagnostico_pt) <= 2000),
  diagnostico_es  text CHECK (diagnostico_es IS NULL OR length(diagnostico_es) <= 2000),
  verificar_pt    text[],
  verificar_es    text[],
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.alertas_textos FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alertas_textos TO service_role;
ALTER TABLE public.alertas_textos ENABLE ROW LEVEL SECURITY;

COMMIT;
