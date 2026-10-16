import "server-only";
import { cache } from "react";
import { db } from "./supabase";
import { grupoConfigurado, listarGrupo } from "./grupo";
import { chaveTelefone } from "./telefone";
import { FUSO_GRUPO } from "./grupo-filtros";

/**
 * Campanha OP Futuros (grupo gratuito) cruzada com o grupo de WhatsApp.
 *
 * Inscrições: Supabase da página captura-grupo (tabela inscripciones, só leitura).
 * Membros: membros_grupo do lançamento tipo grupo_gratuito, alimentado pelo webhook do Sendflow
 * (e pela importação manual da lista de membros, na aba Inscritos x grupo).
 * O cruzamento é pelos últimos 8 dígitos do telefone (mesma regra de public.telefone_chave).
 *
 * Quem entrou antes de o webhook ser ligado não aparece como membro. Por isso, enquanto não houver
 * importação da lista de membros, as taxas contam só as inscrições feitas depois do primeiro evento
 * do webhook ("corte").
 */
export const SLUG_OP = "op-futuros";

export type StatusOp = "no_grupo" | "aguardando" | "fora_do_grupo" | "saiu";

export type LeadOp = {
  id: number;
  telefone: string;
  email: string | null;
  pais: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  inscrito_em: string;
  envios: number;
  status: StatusOp;
  entrou_em: string | null;
  saiu_em: string | null;
  grupo_nome: string | null;
  minutos_ate_entrar: number | null;
  conta: boolean; // entra nas taxas (depois do corte)
};

export type MembroOp = {
  id: number;
  telefone: string;
  grupo_nome: string | null;
  grupo_id: string;
  no_grupo: boolean;
  primeira_entrada_em: string | null;
  saiu_em: string | null;
  inscrito: boolean;
};

export type ResumoOp = {
  inscritos: number; // todos os inscritos da página
  base: number; // inscritos que contam nas taxas (depois do corte)
  no_grupo: number;
  aguardando: number;
  fora_do_grupo: number;
  saiu: number;
  envios_total: number;
  pct_no_grupo: number | null;
  mediana_minutos_ate_entrar: number | null;
  membros_no_grupo: number;
  membros_sem_inscricao: number;
  entradas_hoje: number;
  entradas_7d: number;
  ultima_entrada_em: string | null;
};

export type DadosOp = {
  ok: boolean; // false = página do grupo não configurada ou leitura falhou
  erro: string | null;
  lancamentoId: number | null;
  minutosReenvio: number;
  corte: string | null; // null = conta todo mundo (lista de membros importada)
  webhookLigado: boolean;
  leads: LeadOp[];
  membros: MembroOp[];
  resumo: ResumoOp;
};

type InscripcionG = {
  id: number; telefono: string; email: string | null; pais: string | null; creado_en: string; envios: number | null;
  utm_source: string | null; utm_campaign: string | null; utm_content: string | null;
};

type MembroBanco = {
  id: number; telefone: string; telefone_chave: string; grupo_id: string; grupo_nome: string | null; no_grupo: boolean;
  primeira_entrada_em: string | null; saiu_em: string | null;
};

const PASSO = 1000;

async function todasInscricoesGrupo(): Promise<InscripcionG[]> {
  const out: InscripcionG[] = [];
  const colunas = "id,telefono,email,pais,creado_en,envios,utm_source,utm_campaign,utm_content";
  for (let de = 0; ; de += PASSO) {
    const q = new URLSearchParams({ select: colunas, order: "creado_en.desc" });
    const { linhas } = await listarGrupo<InscripcionG>("inscripciones", q, de, de + PASSO - 1);
    out.push(...linhas);
    if (linhas.length < PASSO || de > 200_000) break;
  }
  return out;
}

async function todosMembros(lancamentoId: number): Promise<MembroBanco[]> {
  const out: MembroBanco[] = [];
  for (let de = 0; ; de += PASSO) {
    const { data, error } = await db()
      .from("membros_grupo")
      .select("id, telefone, telefone_chave, grupo_id, grupo_nome, no_grupo, primeira_entrada_em, saiu_em")
      .eq("lancamento_id", lancamentoId)
      .order("id")
      .range(de, de + PASSO - 1);
    if (error) throw new Error(`membros OP Futuros: ${error.message}`);
    out.push(...((data ?? []) as MembroBanco[]));
    if (!data || data.length < PASSO) break;
  }
  return out;
}

/** Primeiro evento do webhook e se já houve importação da lista de membros. */
async function corteDoWebhook(lancamentoId: number): Promise<{ primeiro: string | null; importou: boolean }> {
  const [p, i] = await Promise.all([
    db().from("eventos_sendflow").select("recebido_em").eq("lancamento_id", lancamentoId).in("tipo", ["entrou", "saiu"]).order("recebido_em").limit(1),
    db().from("eventos_sendflow").select("id", { count: "exact", head: true }).eq("lancamento_id", lancamentoId).eq("tipo", "importacao"),
  ]);
  const primeiro = (p.data?.[0] as { recebido_em?: string } | undefined)?.recebido_em ?? null;
  return { primeiro, importou: (i.count ?? 0) > 0 };
}

function mediana(v: number[]): number | null {
  if (v.length === 0) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const VAZIO: ResumoOp = {
  inscritos: 0, base: 0, no_grupo: 0, aguardando: 0, fora_do_grupo: 0, saiu: 0, envios_total: 0, pct_no_grupo: null,
  mediana_minutos_ate_entrar: null, membros_no_grupo: 0, membros_sem_inscricao: 0, entradas_hoje: 0, entradas_7d: 0, ultima_entrada_em: null,
};

function inicioHojeUY(agora: Date): number {
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO_GRUPO, year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
  return new Date(`${dia}T00:00:00-03:00`).getTime();
}

/** Junta inscrições e membros (função pura, testável). */
export function cruzarOp(
  inscricoes: InscripcionG[], membrosBanco: MembroBanco[], opts: { minutosReenvio: number; corte: string | null; agora?: Date },
): { leads: LeadOp[]; membros: MembroOp[]; resumo: ResumoOp } {
  const agora = opts.agora ?? new Date();
  const corteMs = opts.corte ? new Date(opts.corte).getTime() : null;

  // Um telefone pode estar em mais de um grupo da campanha: vale quem está dentro; senão o mais recente
  const porChave = new Map<string, MembroBanco>();
  for (const m of membrosBanco) {
    const k = m.telefone_chave || chaveTelefone(m.telefone);
    if (!k) continue;
    const atual = porChave.get(k);
    if (!atual || (m.no_grupo && !atual.no_grupo) || (m.no_grupo === atual.no_grupo && (m.primeira_entrada_em ?? "") > (atual.primeira_entrada_em ?? ""))) porChave.set(k, m);
  }

  const chavesInscritas = new Set<string>();
  const leads: LeadOp[] = inscricoes.map((i) => {
    const k = chaveTelefone(i.telefono);
    if (k) chavesInscritas.add(k);
    const m = k ? porChave.get(k) : undefined;
    const inscritoMs = new Date(i.creado_en).getTime();
    let status: StatusOp;
    if (m?.no_grupo) status = "no_grupo";
    else if (m) status = "saiu";
    else status = agora.getTime() - inscritoMs < opts.minutosReenvio * 60_000 ? "aguardando" : "fora_do_grupo";
    const entrouMs = m?.primeira_entrada_em ? new Date(m.primeira_entrada_em).getTime() : null;
    return {
      id: i.id,
      telefone: i.telefono,
      email: i.email,
      pais: i.pais,
      utm_source: i.utm_source,
      utm_campaign: i.utm_campaign,
      utm_content: i.utm_content,
      inscrito_em: i.creado_en,
      envios: i.envios ?? 1,
      status,
      entrou_em: m?.primeira_entrada_em ?? null,
      saiu_em: m && !m.no_grupo ? m.saiu_em : null,
      grupo_nome: m?.grupo_nome ?? null,
      minutos_ate_entrar: entrouMs != null && entrouMs >= inscritoMs ? Math.round((entrouMs - inscritoMs) / 60_000) : null,
      conta: corteMs == null || inscritoMs >= corteMs,
    };
  });

  const membros: MembroOp[] = membrosBanco.map((m) => ({
    id: m.id,
    telefone: m.telefone,
    grupo_nome: m.grupo_nome,
    grupo_id: m.grupo_id,
    no_grupo: m.no_grupo,
    primeira_entrada_em: m.primeira_entrada_em,
    saiu_em: m.saiu_em,
    inscrito: chavesInscritas.has(m.telefone_chave || chaveTelefone(m.telefone) || ""),
  }));

  const base = leads.filter((l) => l.conta);
  const cont = (s: StatusOp) => base.filter((l) => l.status === s).length;
  const hoje = inicioHojeUY(agora);
  const sete = agora.getTime() - 7 * 86_400_000;
  const entradas = membrosBanco.map((m) => (m.primeira_entrada_em ? new Date(m.primeira_entrada_em).getTime() : null)).filter((x): x is number => x != null);
  const ultima = entradas.length ? new Date(Math.max(...entradas)).toISOString() : null;
  const noGrupo = cont("no_grupo") + cont("saiu"); // entrou em algum momento

  const resumo: ResumoOp = {
    inscritos: leads.length,
    base: base.length,
    no_grupo: cont("no_grupo"),
    aguardando: cont("aguardando"),
    fora_do_grupo: cont("fora_do_grupo"),
    saiu: cont("saiu"),
    envios_total: leads.reduce((s, l) => s + l.envios, 0),
    pct_no_grupo: base.length ? Math.round((1000 * noGrupo) / base.length) / 10 : null,
    mediana_minutos_ate_entrar: mediana(base.map((l) => l.minutos_ate_entrar).filter((x): x is number => x != null)),
    membros_no_grupo: membros.filter((m) => m.no_grupo).length,
    membros_sem_inscricao: membros.filter((m) => m.no_grupo && !m.inscrito).length,
    entradas_hoje: entradas.filter((x) => x >= hoje).length,
    entradas_7d: entradas.filter((x) => x >= sete).length,
    ultima_entrada_em: ultima,
  };
  return { leads, membros, resumo };
}

/** Carrega e cruza tudo (uma vez por requisição). */
export const dadosOp = cache(async (): Promise<DadosOp> => {
  const { data: lanc } = await db().from("lancamentos").select("id, minutos_reenvio").eq("tipo", "grupo_gratuito").maybeSingle();
  const l = lanc as { id: number; minutos_reenvio: number | null } | null;
  const base = { lancamentoId: l?.id ?? null, minutosReenvio: l?.minutos_reenvio ?? 10 };
  if (!grupoConfigurado()) {
    return { ok: false, erro: "Página do grupo não configurada no painel", ...base, corte: null, webhookLigado: false, leads: [], membros: [], resumo: VAZIO };
  }
  try {
    const [inscricoes, membrosBanco, c] = await Promise.all([
      todasInscricoesGrupo(),
      l ? todosMembros(l.id) : Promise.resolve([] as MembroBanco[]),
      l ? corteDoWebhook(l.id) : Promise.resolve({ primeiro: null, importou: false }),
    ]);
    const corte = c.importou ? null : c.primeiro;
    const webhookLigado = c.primeiro != null || c.importou;
    // Sem nenhum evento ainda: não há como saber quem entrou → ninguém entra nas taxas
    const corteEfetivo = webhookLigado ? corte : new Date().toISOString();
    const r = cruzarOp(inscricoes, membrosBanco, { minutosReenvio: base.minutosReenvio, corte: corteEfetivo });
    return { ok: true, erro: null, ...base, corte: webhookLigado ? corte : null, webhookLigado, ...r };
  } catch (e) {
    console.error("[op-futuros]", e);
    return { ok: false, erro: e instanceof Error ? e.message : String(e), ...base, corte: null, webhookLigado: false, leads: [], membros: [], resumo: VAZIO };
  }
});
