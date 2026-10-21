import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "./supabase";
import { enviarWhatsapp } from "./whatsapp";
import { mensagemAlerta } from "./mensagens";
import { modelosAlertas } from "./textos-alertas";
import { monitorVaiProWhatsapp } from "./politica-alertas";
import { grupoConfigurado, rpcGrupo, ultimoLeadGrupo } from "./grupo";

type Lanc = {
  id: number; nome: string; alerta_telefones: string[]; tipo?: string;
  monitor_ligado_em?: string | null; alerta_minutos_sem_entrada?: number;
};
type Avaliacao = { tipo: string; chave: string; dados: Record<string, unknown> };

/**
 * Grupo gratuito (OP Futuros): o alerta olha os LEADS da página do grupo (banco da captura-grupo),
 * não as entradas no grupo. Um alerta a cada N minutos sem lead novo (padrão 24 h) e um aviso
 * "leads retomados" (só no painel) quando volta a entrar lead depois de um alerta.
 */
export async function avaliarGrupoPorLeads(l: Lanc, agora = new Date()): Promise<Avaliacao[]> {
  const limiar = Math.max(5, Number(l.alerta_minutos_sem_entrada) || 1440);
  const ultimo = await ultimoLeadGrupo();
  const ligado = l.monitor_ligado_em ? new Date(l.monitor_ligado_em) : null;
  const ref = [ultimo ? new Date(ultimo) : null, ligado].filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0];
  if (!ref) return [];
  const minutos = Math.floor((agora.getTime() - ref.getTime()) / 60000);
  const n = Math.floor(minutos / limiar);
  const saida: Avaliacao[] = [];
  if (n >= 1) {
    saida.push({
      tipo: "sem_leads",
      chave: `sem_leads:${l.id}:${Math.floor(ref.getTime() / 1000)}:${n}`,
      dados: { referencia: ref.toISOString(), ultimo_lead_em: ultimo, minutos_sem_lead: minutos, limiar, repeticao: n },
    });
  }
  const { data: ultimoAlerta } = await db()
    .from("alertas").select("id, criado_em, dados").eq("lancamento_id", l.id).eq("tipo", "sem_leads")
    .order("criado_em", { ascending: false }).limit(1).maybeSingle();
  const a = ultimoAlerta as { id: number; criado_em: string; dados: { referencia?: string } } | null;
  if (a && ultimo && new Date(ultimo) > new Date(a.criado_em)) {
    const desde = a.dados?.referencia ? new Date(a.dados.referencia) : new Date(a.criado_em);
    saida.push({
      tipo: "leads_retomados",
      chave: `leads_retomados:${a.id}`,
      dados: { alerta_id: a.id, retomada_em: ultimo, minutos_sem_lead: Math.floor((new Date(ultimo).getTime() - desde.getTime()) / 60000) },
    });
  }
  return saida;
}

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
  const mensagem = mensagemAlerta(tipo, l.nome, dados, await modelosAlertas());
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

const PLANILHA_PARADA_MIN = 15;

/**
 * Planilhas (planilha/unificada.gs) que pararam de buscar dados: um alerta por parada,
 * a partir de 15 min sem busca. Só para planilhas que buscaram nos últimos 3 dias
 * (as antigas/abandonadas não ficam alertando). Os leads seguem salvos no banco;
 * quando a planilha volta, ela recupera tudo sozinha.
 */
async function verificarPlanilhas(): Promise<unknown[]> {
  const agora = Date.now();
  const { data, error } = await db()
    .from("planilha_sync")
    .select("nome, lancamento_id, ultima_em")
    .eq("ativo", true)
    .lt("ultima_em", new Date(agora - PLANILHA_PARADA_MIN * 60_000).toISOString())
    .gt("ultima_em", new Date(agora - 3 * 86_400_000).toISOString());
  if (error) {
    console.error("[monitor] planilhas", error.message); // antes da migração 021
    return [];
  }
  const criados: unknown[] = [];
  for (const p of (data ?? []) as { nome: string; lancamento_id: number | null; ultima_em: string }[]) {
    if (p.lancamento_id == null) continue;
    const { data: l } = await db().from("lancamentos").select("id, nome, alerta_telefones, tipo").eq("id", p.lancamento_id).maybeSingle();
    if (!l) continue;
    const minutos = Math.floor((agora - new Date(p.ultima_em).getTime()) / 60_000);
    const c = await criarEEnviar(
      { ...(l as Lanc), nome: `Planilha "${p.nome}"` },
      "planilha_parada",
      `planilha_parada:${p.nome}:${Math.floor(new Date(p.ultima_em).getTime() / 1000)}`,
      { planilha: p.nome, ultima_em: p.ultima_em, minutos_parada: minutos },
    );
    if (c) criados.push(c);
  }
  return criados;
}

/** Roda uma rodada do monitor para todos os lançamentos com monitor ligado. */
export async function executarMonitor() {
  const { data, error } = await db()
    .from("lancamentos")
    .select("id, nome, alerta_telefones, tipo, monitor_ligado_em, alerta_minutos_sem_entrada")
    .eq("monitor_ativo", true);
  if (error) throw new Error(`[monitor] lançamentos: ${error.message}`);

  const criados: unknown[] = [];
  for (const l of (data ?? []) as Lanc[]) {
    let avaliacoes: Avaliacao[];
    if (l.tipo === "grupo_gratuito" && grupoConfigurado()) {
      avaliacoes = await avaliarGrupoPorLeads(l);
    } else {
      const av = await db().rpc("monitor_avaliar", { p_lancamento_id: l.id });
      if (av.error) throw new Error(`[monitor] avaliar: ${av.error.message}`);
      avaliacoes = (av.data ?? []) as Avaliacao[];
    }
    for (const a of avaliacoes) {
      const c = await criarEEnviar(l, a.tipo, a.chave, a.dados);
      if (c) criados.push(c);
    }
  }
  criados.push(...(await verificarPlanilhas()));
  return { lancamentos: (data ?? []).length, alertas: criados };
}

export async function enviarTeste(lancamentoId: number) {
  const { data, error } = await db().from("lancamentos").select("id, nome, alerta_telefones, tipo").eq("id", lancamentoId).single();
  if (error || !data) throw new Error("lançamento não encontrado");
  return criarEEnviar(data as Lanc, "teste", `teste:${randomUUID()}`, {});
}
