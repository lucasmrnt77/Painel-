import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "./supabase";
import { enviarWhatsapp } from "./whatsapp";
import {
  casosEventos, conferirRegistros, conferirResposta, mensagemTestes, MAX_DETALHES, TELEFONES_TESTE,
  type Etapa, type Execucao, type Falha, type RegistroEvento, type RespostaServico,
} from "./testes-casos";

export type { Etapa, Execucao, Falha };

/**
 * Testes automáticos dos eventos da Meta (rodam 1x por dia pelo Cron e pelo botão
 * "Rodar agora" na aba Alertas). Tudo vai como TESTE: a Meta recebe com o código
 * de "Eventos de teste" e nada aparece nas campanhas.
 *
 * Variáveis:
 *   TRACKING_EVENTOS_URL  serviço de tracking (padrão https://tracking-eventos.vercel.app)
 *   TESTES_ORIGEM         origem liberada no serviço (padrão https://captura-grupo.vercel.app)
 *   CAPTURA_GRUPO_URL     página do grupo (padrão https://captura-grupo.vercel.app)
 *   TESTES_TOKEN          o mesmo valor na captura-grupo, aqui e no GitHub (teste no navegador)
 */

const env = (k: string, padrao = "") => (process.env[k]?.trim() || padrao).replace(/\/+$/, "");
const trackingUrl = () => env("TRACKING_EVENTOS_URL", "https://tracking-eventos.vercel.app");
const origem = () => env("TESTES_ORIGEM", "https://captura-grupo.vercel.app");
const grupoUrl = () => env("CAPTURA_GRUPO_URL", "https://captura-grupo.vercel.app");

const erroTexto = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function postar(url: string, corpo: unknown, headers: Record<string, string> = {}): Promise<RespostaServico> {
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "painel-sendflow-testes/1", ...headers },
      body: JSON.stringify(corpo),
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    let j: RespostaServico["corpo"] = null;
    try { j = await r.json(); } catch { /* sem JSON */ }
    return { http: r.status, corpo: j };
  } catch (e) {
    return { http: 0, corpo: { ok: false, erro: erroTexto(e) } };
  }
}

/** Roda as tarefas com no máximo `n` ao mesmo tempo. */
async function emParalelo<T>(itens: T[], n: number, f: (item: T, i: number) => Promise<void>) {
  let proximo = 0;
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, async () => {
    while (proximo < itens.length) {
      const i = proximo++;
      await f(itens[i], i);
    }
  }));
}

/** 1) Regras: todas as variações contra o serviço de tracking + 2) o que ele gravou. */
async function testarTracking(run: string): Promise<{ etapas: Etapa[]; falhas: Falha[] }> {
  const casos = casosEventos();
  const falhasRegra: Falha[] = [];
  const esperados: { eventId: string; evento: string }[] = [];
  const url = `${trackingUrl()}/api/evento`;
  const extra = { teste: true, url: "https://painel.traderdelite.net/alertas?teste=automatico" };

  await emParalelo(casos, 6, async (c, i) => {
    const eventId = `${run}-${String(i + 1).padStart(3, "0")}`;
    const r = await postar(url, { ...c.corpo, ...extra, event_id: eventId }, { origin: origem() });
    const motivo = conferirResposta(c, eventId, r);
    if (motivo) falhasRegra.push({ teste: `${c.grupo}: ${c.nome}`, motivo });
    if (c.evento && r.http === 200) esperados.push({ eventId, evento: c.evento });
  });

  // Mesmo event_id duas vezes: só pode virar 1 evento
  const dup = `${run}-dup`;
  const corpoDup = { landing: "general", acao: "qualificacao", telefone: TELEFONES_TESTE.UY, resposta: "si_puedo", ...extra, event_id: dup };
  const d1 = await postar(url, corpoDup, { origin: origem() });
  const d2 = await postar(url, corpoDup, { origin: origem() });
  if (d1.corpo?.evento !== "Lead Qualificado" || d2.corpo?.evento !== "Lead Qualificado") {
    falhasRegra.push({ teste: "Duplicado: mesmo event_id 2×", motivo: `respostas ${d1.http}/${d2.http}` });
  } else {
    esperados.push({ eventId: dup, evento: "Lead Qualificado" });
  }

  // O serviço envia à Meta depois de responder: espera os registros saírem de "pendente"
  let registros: RegistroEvento[] = [];
  let erroBanco: string | null = null;
  for (let tentativa = 0; tentativa < 12; tentativa++) {
    await new Promise((r) => setTimeout(r, tentativa === 0 ? 3000 : 2000));
    const { data, error } = await db()
      .from("eventos_meta")
      .select("event_name, event_id, status, teste, meta_resposta")
      .like("event_id", `${run}-%`)
      .limit(1000);
    if (error) { erroBanco = error.message; continue; }
    registros = (data ?? []) as RegistroEvento[];
    if (registros.length >= esperados.length && !registros.some((r) => r.status === "pendente")) break;
  }
  const falhasRegistro: Falha[] = erroBanco && registros.length === 0
    ? [{ teste: "Registro dos eventos", motivo: `não consegui ler eventos_meta: ${erroBanco}` }]
    : conferirRegistros(esperados, registros).map((m) => ({ teste: "Envio à Meta", motivo: m }));

  return {
    etapas: [
      { nome: "Regras do Lead Qualificado e eventos de Lead", total: casos.length + 1, falhas: falhasRegra.length },
      { nome: "Enviados e aceitos pela Meta (servidor)", total: esperados.length, falhas: falhasRegistro.length },
    ],
    falhas: [...falhasRegra, ...falhasRegistro],
  };
}

/** 3) Página do grupo: o servidor manda o "Lead" pela API de Conversões. */
async function testarGrupo(run: string): Promise<{ etapas: Etapa[]; falhas: Falha[] }> {
  const nome = "Página do grupo: Lead pela API de Conversões";
  const token = process.env.TESTES_TOKEN?.trim();
  if (!token) return { etapas: [{ nome, total: 1, falhas: 1 }], falhas: [{ teste: nome, motivo: "TESTES_TOKEN não configurado no painel" }] };
  const eventId = `${run}-grupo`;
  const r = await postar(`${grupoUrl()}/api/inscribir`, {
    email: "qa@teste.com", telefono: "099009001", pais: "UY", event_id: eventId, teste: true,
    website: "teste-automatico", // campo-armadilha: se a página estiver numa versão antiga, ela finge sucesso e NÃO grava
    url: "https://captura-grupo.vercel.app/?teste=automatico",
  }, { "x-teste-token": token });
  const corpo = r.corpo as { ok?: boolean; erro?: string; teste?: { event_id?: string; meta?: { ok?: boolean; motivo?: string; resposta?: { events_received?: number } } } } | null;
  let motivo: string | null = null;
  if (r.http === 403) motivo = "TESTES_TOKEN diferente na captura-grupo";
  else if (r.http !== 200 || !corpo?.ok) motivo = `HTTP ${r.http} ${corpo?.erro ?? ""}`.trim();
  else if (!corpo.teste) motivo = "a página não tem o modo teste (publicar a versão nova da captura-grupo)";
  else if (corpo.teste.event_id !== eventId) motivo = "event_id devolvido diferente do enviado";
  else if (!corpo.teste.meta?.ok) motivo = `Meta não aceitou (${corpo.teste.meta?.motivo ?? "erro"})`;
  else if (Number(corpo.teste.meta.resposta?.events_received) !== 1) motivo = "Meta não confirmou o recebimento";
  return { etapas: [{ nome, total: 1, falhas: motivo ? 1 : 0 }], falhas: motivo ? [{ teste: nome, motivo }] : [] };
}

/** 4) Configuração do serviço de tracking. */
async function testarSaude(): Promise<{ etapas: Etapa[]; falhas: Falha[] }> {
  const nome = "Serviço de tracking configurado";
  let motivo: string | null = null;
  try {
    const r = await fetch(`${trackingUrl()}/api/evento`, { cache: "no-store", signal: AbortSignal.timeout(10000) });
    const j = (await r.json()) as { ok?: boolean; meta_configurada?: boolean; registro_configurado?: boolean };
    if (!j.ok) motivo = `HTTP ${r.status}`;
    else if (!j.meta_configurada) motivo = "pixel/token da Meta não configurados";
    else if (!j.registro_configurado) motivo = "registro no painel não configurado";
  } catch (e) {
    motivo = `fora do ar: ${erroTexto(e)}`;
  }
  return { etapas: [{ nome, total: 1, falhas: motivo ? 1 : 0 }], falhas: motivo ? [{ teste: nome, motivo }] : [] };
}

function novoRun() {
  const agora = new Date().toISOString().slice(0, 16).replace(/\D/g, "");
  return `qa-${agora}-${randomBytes(2).toString("hex")}`;
}

/** Apaga eventos de teste e execuções antigas (o registro não cresce sem fim). */
async function limpar() {
  const dias = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
  await Promise.allSettled([
    db().from("eventos_meta").delete().eq("teste", true).like("event_id", "qa-%").lt("criado_em", dias(30)),
    db().from("testes_execucoes").delete().lt("criado_em", dias(120)),
  ]);
}

/** Roda os testes do servidor, grava e avisa no WhatsApp se algo falhar. */
export async function executarTestesServidor(disparo: Execucao["disparo"]): Promise<Execucao> {
  const inicio = Date.now();
  const run = novoRun();
  const partes = await Promise.all([testarSaude(), testarTracking(run), testarGrupo(run)]);
  const resumo = partes.flatMap((p) => p.etapas);
  const detalhes = partes.flatMap((p) => p.falhas);
  const exec: Execucao = {
    origem: "servidor", disparo,
    ok: detalhes.length === 0,
    total: resumo.reduce((s, e) => s + e.total, 0),
    falhas: detalhes.length,
    duracao_ms: Date.now() - inicio,
    resumo,
    detalhes: detalhes.slice(0, MAX_DETALHES),
  };
  await limpar();
  return registrarExecucao(exec);
}

/** Grava a execução (servidor ou navegador) e manda o aviso quando precisa. */
export async function registrarExecucao(exec: Execucao): Promise<Execucao> {
  const anterior = await ultimaExecucao(exec.origem);
  const { data, error } = await db().from("testes_execucoes").insert({
    origem: exec.origem, disparo: exec.disparo, ok: exec.ok, total: exec.total, falhas: exec.falhas,
    duracao_ms: exec.duracao_ms, resumo: exec.resumo, detalhes: exec.detalhes,
  }).select("id, criado_em").single();
  if (error) throw new Error(`não consegui gravar o resultado dos testes: ${error.message}`);
  const salvo = { ...exec, id: data.id as number, criado_em: data.criado_em as string };

  // Avisa quando falha; e uma vez quando volta a funcionar
  const voltou = exec.ok && anterior && !anterior.ok;
  if (!exec.ok || voltou) {
    const envio = await enviarWhatsapp(await telefonesAlerta(), mensagemTestes(salvo, !!voltou), "teste_eventos");
    await db().from("testes_execucoes").update({ envio_status: envio.status }).eq("id", salvo.id);
    salvo.envio_status = envio.status;
  }
  return salvo;
}

async function telefonesAlerta(): Promise<string[]> {
  const { data } = await db().from("lancamentos").select("alerta_telefones").eq("tipo", "grupo_gratuito").maybeSingle();
  return ((data?.alerta_telefones as string[] | null) ?? []).filter(Boolean);
}

export async function ultimaExecucao(o: Execucao["origem"]): Promise<Execucao | null> {
  const { data } = await db().from("testes_execucoes").select("*").eq("origem", o).order("criado_em", { ascending: false }).limit(1).maybeSingle();
  return (data as Execucao | null) ?? null;
}

export async function historicoTestes(limite = 14): Promise<Execucao[]> {
  const { data, error } = await db().from("testes_execucoes").select("*").order("criado_em", { ascending: false }).limit(limite);
  if (error) throw error;
  return (data ?? []) as Execucao[];
}

export type ProblemaTeste = { origem: Execucao["origem"]; texto: string; quando?: string };

/**
 * Problemas para sinalizar em todo o painel: última execução com falha, ou
 * testes que pararam de rodar (mais de 26 h sem resultado). Nunca derruba a página.
 */
export async function problemasTestes(): Promise<ProblemaTeste[]> {
  try {
    const { data, error } = await db().from("testes_execucoes").select("origem, ok, falhas, total, criado_em, detalhes")
      .order("criado_em", { ascending: false }).limit(20);
    if (error || !data) return [];
    const problemas: ProblemaTeste[] = [];
    for (const origem of ["servidor", "navegador"] as const) {
      const e = (data as Execucao[]).find((x) => x.origem === origem);
      if (!e) continue; // ainda não configurado
      const nome = origem === "servidor" ? "servidor" : "navegador (pixel)";
      if (!e.ok) {
        const primeira = e.detalhes[0];
        problemas.push({ origem, quando: e.criado_em, texto: `${e.falhas} de ${e.total} verificações falharam no ${nome}${primeira ? ` — ${primeira.teste}: ${primeira.motivo}` : ""}` });
      } else if (e.criado_em && Date.now() - new Date(e.criado_em).getTime() > 26 * 3_600_000) {
        problemas.push({ origem, quando: e.criado_em, texto: `os testes do ${nome} não rodam há mais de 1 dia` });
      }
    }
    return problemas;
  } catch {
    return [];
  }
}
