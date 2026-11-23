import "server-only";
import { db } from "./supabase";

/**
 * Envio dos alertas por WhatsApp.
 *
 * Drivers, em ordem de prioridade:
 *
 * 1. Sendflow → grupo da equipe (recomendado)
 *    SENDFLOW_API_TOKEN + SENDFLOW_ACCOUNT_ID + SENDFLOW_ALERTAS_CAMPANHA_ID
 *    POST {SENDFLOW_API_URL}/sendapi/actions/send-text-message
 *         { accountId, releaseId, messageText }
 *    Manda a mensagem em todos os grupos da campanha de alertas (uma campanha
 *    no Sendflow só com o grupo da equipe de tráfego/captação).
 *
 * 2. Sendflow → mensagem direta
 *    SENDFLOW_API_TOKEN + SENDFLOW_ACCOUNT_ID (sem campanha de alertas)
 *    POST {SENDFLOW_API_URL}/sendapi/send-text-message/{accountId}
 *         { text, phoneNumber }  — um envio por telefone cadastrado no lançamento.
 *
 * 3. Webhook genérico (Make/n8n/outro)
 *    WHATSAPP_WEBHOOK_URL (+ WHATSAPP_WEBHOOK_TOKEN)
 *    POST { telefone, mensagem, tipo, origem }
 *
 * Sem nenhum configurado, o alerta fica só no painel (status "sem_envio").
 */

const SENDFLOW_URL_PADRAO = "https://southamerica-east1-whatsapp-ultimate.cloudfunctions.net";

export type ModoEnvio = "sendflow_grupo" | "sendflow_direto" | "webhook" | "nenhum";

type Detalhe = { destino: string; ok: boolean; http?: number; erro?: string; resposta?: unknown };

export type ResultadoEnvio = {
  /** "pendente" = na fila (limite de envios), sai nas próximas rodadas do cron */
  status: "enviado" | "parcial" | "falhou" | "sem_envio" | "pendente";
  detalhe: Detalhe[] | { motivo: string };
};

const env = (k: string) => process.env[k]?.trim() || "";

export function modoEnvio(): ModoEnvio {
  if (env("SENDFLOW_API_TOKEN") && env("SENDFLOW_ACCOUNT_ID")) {
    return env("SENDFLOW_ALERTAS_CAMPANHA_ID") ? "sendflow_grupo" : "sendflow_direto";
  }
  if (env("WHATSAPP_WEBHOOK_URL")) return "webhook";
  return "nenhum";
}

export function envioConfigurado(): boolean {
  return modoEnvio() !== "nenhum";
}

function sendflowBase() {
  return (env("SENDFLOW_API_URL") || SENDFLOW_URL_PADRAO).replace(/\/$/, "");
}

async function postJson(url: string, corpo: unknown, headers: Record<string, string>): Promise<Omit<Detalhe, "destino">> {
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(15000),
    });
    let resposta: unknown = null;
    const texto = await r.text();
    try {
      resposta = texto ? JSON.parse(texto) : null;
    } catch {
      resposta = texto.slice(0, 500);
    }
    return { ok: r.ok, http: r.status, resposta };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}

function consolidar(detalhes: Detalhe[]): ResultadoEnvio {
  const oks = detalhes.filter((d) => d.ok).length;
  return { status: oks === detalhes.length ? "enviado" : oks === 0 ? "falhou" : "parcial", detalhe: detalhes };
}

/** Limite de envios pela linha dos alertas (23/11/2026): no máximo 2 mensagens a cada 2 min. */
export const LIMITE_ENVIOS = 2;
export const JANELA_ENVIOS_SEG = 120;
const PAUSA_ENTRE_ENVIOS_MS = 3000;

/**
 * Todo alerta passa pela fila (tabela fila_whatsapp): sai na hora se houver vaga no limite,
 * senão fica "pendente" e o cron (a cada 2 min) manda os próximos, em ordem.
 */
export async function enviarWhatsapp(telefones: string[], mensagem: string, tipo: string): Promise<ResultadoEnvio> {
  if (modoEnvio() === "nenhum") return { status: "sem_envio", detalhe: { motivo: "nenhum envio de WhatsApp configurado" } };
  const { data, error } = await db().from("fila_whatsapp").insert({ telefones, mensagem, tipo }).select("id").single();
  if (error || !data) {
    console.error("[whatsapp] fila indisponível", error?.message);
    return { status: "pendente", detalhe: { motivo: `fila indisponível: ${error?.message ?? "sem id"}` } };
  }
  const enviados = await drenarFilaWhatsapp();
  return enviados.get((data as { id: number }).id)
    ?? { status: "pendente", detalhe: { motivo: `na fila: no máximo ${LIMITE_ENVIOS} alertas a cada ${JANELA_ENVIOS_SEG / 60} min` } };
}

/** Manda os próximos da fila dentro do limite. Chamado a cada envio e pelo cron. */
export async function drenarFilaWhatsapp(): Promise<Map<number, ResultadoEnvio>> {
  const saida = new Map<number, ResultadoEnvio>();
  const { data, error } = await db().rpc("fila_whatsapp_reservar", { p_max: LIMITE_ENVIOS, p_janela_seg: JANELA_ENVIOS_SEG });
  if (error) { console.error("[whatsapp] reservar fila", error.message); return saida; }
  const lote = (data ?? []) as { id: number; telefones: string[] | null; mensagem: string; tipo: string | null }[];
  for (const [i, item] of lote.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, PAUSA_ENTRE_ENVIOS_MS));
    const r = await enviarAgora(item.telefones ?? [], item.mensagem, item.tipo ?? "");
    await db().from("fila_whatsapp").update({ enviado_em: new Date().toISOString(), status: r.status, detalhe: r.detalhe }).eq("id", item.id);
    saida.set(item.id, r);
  }
  return saida;
}

async function enviarAgora(telefones: string[], mensagem: string, tipo: string): Promise<ResultadoEnvio> {
  const modo = modoEnvio();

  if (modo === "sendflow_grupo") {
    const campanha = env("SENDFLOW_ALERTAS_CAMPANHA_ID");
    const r = await postJson(
      `${sendflowBase()}/sendapi/actions/send-text-message`,
      { accountId: env("SENDFLOW_ACCOUNT_ID"), releaseId: campanha, messageText: mensagem },
      { authorization: `Bearer ${env("SENDFLOW_API_TOKEN")}` },
    );
    return consolidar([{ destino: `campanha ${campanha}`, ...r }]);
  }

  if (modo === "sendflow_direto") {
    if (telefones.length === 0) return { status: "sem_envio", detalhe: { motivo: "nenhum telefone cadastrado no lançamento" } };
    const detalhes = await Promise.all(
      telefones.map(async (telefone) => ({
        destino: telefone,
        ...(await postJson(
          `${sendflowBase()}/sendapi/send-text-message/${encodeURIComponent(env("SENDFLOW_ACCOUNT_ID"))}`,
          { text: mensagem, phoneNumber: telefone },
          { authorization: `Bearer ${env("SENDFLOW_API_TOKEN")}` },
        )),
      })),
    );
    return consolidar(detalhes);
  }

  if (modo === "webhook") {
    if (telefones.length === 0) return { status: "sem_envio", detalhe: { motivo: "nenhum telefone cadastrado no lançamento" } };
    const token = env("WHATSAPP_WEBHOOK_TOKEN");
    const detalhes = await Promise.all(
      telefones.map(async (telefone) => ({
        destino: telefone,
        ...(await postJson(
          env("WHATSAPP_WEBHOOK_URL"),
          { telefone, mensagem, tipo, origem: "painel-sendflow" },
          token ? { authorization: `Bearer ${token}` } : {},
        )),
      })),
    );
    return consolidar(detalhes);
  }

  return { status: "sem_envio", detalhe: { motivo: "nenhum envio de WhatsApp configurado" } };
}

// ---------------------------------------------------------------------
// Ajuda para configurar: lista contas e campanhas da conta Sendflow
// ---------------------------------------------------------------------

export type ItemSendflow = { id: string; nome: string; extra?: string };

function extrairLista(dados: unknown): Record<string, unknown>[] {
  if (Array.isArray(dados)) return dados as Record<string, unknown>[];
  if (dados && typeof dados === "object") {
    for (const k of ["data", "items", "results", "accounts", "releases"]) {
      const v = (dados as Record<string, unknown>)[k];
      if (Array.isArray(v)) return v as Record<string, unknown>[];
    }
  }
  return [];
}

function primeiro(o: Record<string, unknown>, chaves: string[]): string {
  for (const k of chaves) {
    const v = o[k];
    if (typeof v === "string" || typeof v === "number") return String(v);
  }
  return "";
}

export async function listarSendflow(recurso: "accounts" | "releases"): Promise<{ itens: ItemSendflow[]; erro?: string }> {
  if (!env("SENDFLOW_API_TOKEN")) return { itens: [], erro: "SENDFLOW_API_TOKEN não configurado" };
  try {
    const r = await fetch(`${sendflowBase()}/sendapi/${recurso}`, {
      headers: { authorization: `Bearer ${env("SENDFLOW_API_TOKEN")}` },
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
    const texto = await r.text();
    if (/rate-limit/i.test(texto)) return { itens: [], erro: "O Sendflow limitou as consultas por um momento. Espere 1 minuto e clique de novo." };
    if (!r.ok) return { itens: [], erro: `HTTP ${r.status}: ${texto.slice(0, 200)}` };
    const lista = extrairLista(JSON.parse(texto));
    return {
      itens: lista.slice(0, 100).map((o) => ({
        id: primeiro(o, ["id", "_id", "accountId", "releaseId", "uid"]),
        nome: primeiro(o, ["name", "nome", "title", "titulo", "phoneNumber", "number", "numero"]),
        extra: primeiro(o, ["phoneNumber", "number", "status", "createdAt"]),
      })),
    };
  } catch (e) {
    return { itens: [], erro: e instanceof Error ? e.message : String(e) };
  }
}
