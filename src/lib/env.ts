import "server-only";

function obrigatoria(nome: string): string {
  const v = process.env[nome];
  if (!v || v.trim() === "") {
    throw new Error(`Variável de ambiente ${nome} não configurada`);
  }
  return v.trim();
}

export const env = {
  supabaseUrl: () => obrigatoria("SUPABASE_URL"),
  supabaseServiceRoleKey: () => obrigatoria("SUPABASE_SERVICE_ROLE_KEY"),
  painelSenha: () => obrigatoria("PAINEL_SENHA"),
  sessaoSegredo: () => obrigatoria("SESSAO_SEGREDO"),
  capturaToken: () => obrigatoria("CAPTURA_TOKEN"),
  sendflowWebhookToken: () => obrigatoria("SENDFLOW_WEBHOOK_TOKEN"),
  // Lista separada por vírgula de origens autorizadas a chamar /api/captura
  // direto do navegador. "*" libera qualquer origem. Vazio = sem CORS.
  capturaOrigens: () =>
    (process.env.CAPTURA_ORIGENS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
};
