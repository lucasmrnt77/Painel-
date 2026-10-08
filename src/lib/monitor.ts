import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "./supabase";
import { enviarWhatsapp } from "./whatsapp";
import { mensagemAlerta } from "./mensagens";
import { monitorVaiProWhatsapp } from "./politica-alertas";
import { grupoConfigurado, rpcGrupo } from "./grupo";

type Lanc = { id: number; nome: string; alerta_telefones: string[]; tipo?: string };

/**
 * O grupo gratuito recebe as inscrições em outro banco (página captura-grupo).
 * Para o alerta dizer se o tráfego parou, troca a contagem de inscrições da
 * janela pela de lá. Se não der para consultar, mantém como veio.
 */
async function comInscricoesDoGrupo(l: Lanc, dados: Record<string, unknown>) {
  const j = dados.janela as { de?: string; ate?: string } | undefined;
  if (l.tipo !== "grupo_gratuito" || !j?.de || !j?.ate || !grupoConfigurado()) return dados;
  try {
    const r = await rpcGrupo<{ total: number }>("painel_resumo", {
      p_desde: j.de, p_ate: j.ate, p_pais: null, p_source: null, p_campaign: null, p_content: null,
    });
    return { ...dados, janela: { ...j, inscricoes: r.total }, inscricoes_externas: true };
  } catch (e) {
    console.error("[monitor] inscrições do grupo gratuito", e);
    return dados;
  }
}

async function criarEEnviar(l: Lanc, tipo: string, chave: string, dadosOriginais: Record<string, unknown>) {
  const dados = await comInscricoesDoGrupo(l, dadosOriginais);
  const mensagem = mensagemAlerta(tipo, l.nome, dados);
  const { data: id, error } = await db().rpc("monitor_registrar_alerta", {
    p_lancamento_id: l.id, p_tipo: tipo, p_chave: chave, p_mensagem: mensagem, p_dados: dados,
  });
  if (error) throw new Error(`[monitor] registrar: ${error.message}`);
  if (id == null) return null; // já existia — outro disparo do cron cuidou dele

  // Só erros vão para o WhatsApp; resumos e "entradas retomadas" ficam só no painel
  const envio = monitorVaiProWhatsapp(tipo)
    ? await enviarWhatsapp(l.alerta_telefones ?? [], mensagem, tipo)
    : { status: "sem_envio" as const, detalhe: { motivo: "só no painel (não é erro)" } };
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
    .select("id, nome, alerta_telefones, tipo")
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
  const { data, error } = await db().from("lancamentos").select("id, nome, alerta_telefones, tipo").eq("id", lancamentoId).single();
  if (error || !data) throw new Error("lançamento não encontrado");
  return criarEEnviar(data as Lanc, "teste", `teste:${randomUUID()}`, {});
}
