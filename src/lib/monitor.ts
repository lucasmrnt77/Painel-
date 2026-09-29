import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "./supabase";
import { enviarWhatsapp } from "./whatsapp";
import { mensagemAlerta } from "./mensagens";

type Lanc = { id: number; nome: string; alerta_telefones: string[] };

async function criarEEnviar(l: Lanc, tipo: string, chave: string, dados: Record<string, unknown>) {
  const mensagem = mensagemAlerta(tipo, l.nome, dados);
  const { data: id, error } = await db().rpc("monitor_registrar_alerta", {
    p_lancamento_id: l.id, p_tipo: tipo, p_chave: chave, p_mensagem: mensagem, p_dados: dados,
  });
  if (error) throw new Error(`[monitor] registrar: ${error.message}`);
  if (id == null) return null; // já existia — outro disparo do cron cuidou dele

  const envio = await enviarWhatsapp(l.alerta_telefones ?? [], mensagem, tipo);
  const r = await db()
    .from("alertas")
    .update({ envio_status: envio.status, envio_detalhe: envio.detalhe, enviado_em: new Date().toISOString() })
    .eq("id", id);
  if (r.error) console.error("[monitor] marcar envio", r.error);
  return { id: id as number, tipo, envio: envio.status };
}

/** Roda uma rodada do monitor para todos os lançamentos com monitor ligado. */
export async function executarMonitor() {
  const { data, error } = await db()
    .from("lancamentos")
    .select("id, nome, alerta_telefones")
    .eq("monitor_ativo", true);
  if (error) throw new Error(`[monitor] lançamentos: ${error.message}`);

  const criados: unknown[] = [];
  for (const l of (data ?? []) as Lanc[]) {
    const av = await db().rpc("monitor_avaliar", { p_lancamento_id: l.id });
    if (av.error) throw new Error(`[monitor] avaliar: ${av.error.message}`);
    for (const a of (av.data ?? []) as { tipo: string; chave: string; dados: Record<string, unknown> }[]) {
      const c = await criarEEnviar(l, a.tipo, a.chave, a.dados);
      if (c) criados.push(c);
    }
  }
  return { lancamentos: (data ?? []).length, alertas: criados };
}

export async function enviarTeste(lancamentoId: number) {
  const { data, error } = await db().from("lancamentos").select("id, nome, alerta_telefones").eq("id", lancamentoId).single();
  if (error || !data) throw new Error("lançamento não encontrado");
  return criarEEnviar(data as Lanc, "teste", `teste:${randomUUID()}`, {});
}
