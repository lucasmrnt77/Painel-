import "server-only";

/**
 * Envio de WhatsApp plugável.
 *
 * Hoje há um driver genérico por webhook: faz um POST JSON
 *   { "telefone": "5989...", "mensagem": "...", "tipo": "sem_entradas", "origem": "painel-sendflow" }
 * para WHATSAPP_WEBHOOK_URL (com Authorization: Bearer WHATSAPP_WEBHOOK_TOKEN, se definido).
 * Serve para Make/n8n/Zapier ou para um endpoint próprio da ferramenta escolhida.
 * Quando a ferramenta for definida (Unnichat, Z-API...), basta adicionar um driver aqui.
 *
 * Sem WHATSAPP_WEBHOOK_URL configurada, nada é enviado (status "sem_envio")
 * e o alerta continua visível no painel.
 */

export type ResultadoEnvio = {
  status: "enviado" | "parcial" | "falhou" | "sem_envio";
  detalhe: { telefone: string; ok: boolean; http?: number; erro?: string }[] | { motivo: string };
};

export function envioConfigurado(): boolean {
  return !!process.env.WHATSAPP_WEBHOOK_URL?.trim();
}

export async function enviarWhatsapp(telefones: string[], mensagem: string, tipo: string): Promise<ResultadoEnvio> {
  const url = process.env.WHATSAPP_WEBHOOK_URL?.trim();
  if (!url) return { status: "sem_envio", detalhe: { motivo: "WHATSAPP_WEBHOOK_URL não configurada" } };
  if (telefones.length === 0) return { status: "sem_envio", detalhe: { motivo: "nenhum telefone cadastrado no lançamento" } };

  const token = process.env.WHATSAPP_WEBHOOK_TOKEN?.trim();
  const resultados = await Promise.all(
    telefones.map(async (telefone) => {
      try {
        const r = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ telefone, mensagem, tipo, origem: "painel-sendflow" }),
          signal: AbortSignal.timeout(8000),
        });
        return { telefone, ok: r.ok, http: r.status };
      } catch (e) {
        return { telefone, ok: false, erro: e instanceof Error ? e.message : String(e) };
      }
    }),
  );
  const oks = resultados.filter((r) => r.ok).length;
  return {
    status: oks === resultados.length ? "enviado" : oks === 0 ? "falhou" : "parcial",
    detalhe: resultados,
  };
}
