import "server-only";
import { db } from "./supabase";

export const POR_PAGINA = 100;

export type Resumo = {
  lancamento_id: number;
  slug: string;
  nome: string;
  ativo: boolean;
  link_grupo: string | null;
  sendflow_ref: string | null;
  minutos_reenvio: number;
  criado_em: string;
  inscritos: number;
  no_grupo: number;
  aguardando: number;
  fora_do_grupo: number;
  saiu: number;
  telefone_invalido: number;
  envios_total: number;
  mediana_minutos_ate_entrar: number | null;
  membros_no_grupo: number;
  membros_sem_inscricao: number;
  pct_inscritos_no_grupo: number | null;
};

export type Lead = {
  inscricao_id: number;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  inscrito_em: string;
  n_envios: number;
  entrou_em: string | null;
  saiu_em: string | null;
  grupos: string | null;
  status: string;
  minutos_ate_entrar: number | null;
  pagina_captura: string | null;
  experiencia: string | null;
  faixa_etaria: string | null;
  genero: string | null;
  resposta_dinheiro: string | null;
};

export type Membro = {
  id: number;
  grupo_id: string;
  grupo_nome: string | null;
  telefone: string;
  no_grupo: boolean;
  primeira_entrada_em: string | null;
  ultima_entrada_em: string | null;
  saiu_em: string | null;
  inscrito: boolean;
  nome: string | null;
  email: string | null;
};

export type Webhook = {
  id: number;
  recebido_em: string;
  origem: string;
  payload: unknown;
  n_eventos: number;
};

export type Evento = {
  id: number;
  webhook_id: number;
  tipo: string;
  tipo_original: string | null;
  telefone: string | null;
  grupo_nome: string | null;
  grupo_id: string | null;
  lancamento_id: number | null;
};

function falhar(onde: string, error: { message: string } | null): never {
  throw new Error(`[${onde}] ${error?.message ?? "erro desconhecido"}`);
}

/** Remove caracteres que quebram o filtro or() do PostgREST. */
export function limparBusca(q: string | undefined): string {
  return (q ?? "").replace(/[^\p{L}\p{N}@.+\-_ ]/gu, "").trim().slice(0, 60);
}

export async function listarResumos(): Promise<Resumo[]> {
  const { data, error } = await db().from("v_resumo_lancamentos").select("*").order("criado_em", { ascending: false });
  if (error) falhar("resumos", error);
  return (data ?? []) as Resumo[];
}

export function escolherLancamento(resumos: Resumo[], slug?: string): Resumo | null {
  return resumos.find((r) => r.slug === slug) ?? resumos.find((r) => r.ativo) ?? resumos[0] ?? null;
}

export async function listarLeads(lancamentoId: number, filtro: { status?: string; q?: string; pagina?: number }) {
  const pagina = Math.max(1, filtro.pagina ?? 1);
  let consulta = db()
    .from("v_leads")
    .select("*", { count: "exact" })
    .eq("lancamento_id", lancamentoId)
    .order("inscrito_em", { ascending: false })
    .range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1);
  if (filtro.status) consulta = consulta.eq("status", filtro.status);
  const q = limparBusca(filtro.q);
  if (q) consulta = consulta.or(`nome.ilike.*${q}*,email.ilike.*${q}*,telefone.ilike.*${q.replace(/\D/g, "") || q}*`);
  const { data, error, count } = await consulta;
  if (error) falhar("leads", error);
  return { linhas: (data ?? []) as Lead[], total: count ?? 0, pagina };
}

export async function listarMembros(lancamentoId: number, filtro: { filtro?: string; q?: string; pagina?: number }) {
  const pagina = Math.max(1, filtro.pagina ?? 1);
  let consulta = db()
    .from("v_membros")
    .select("*", { count: "exact" })
    .eq("lancamento_id", lancamentoId)
    .order("atualizado_em", { ascending: false })
    .range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1);
  if (filtro.filtro === "no_grupo") consulta = consulta.eq("no_grupo", true);
  if (filtro.filtro === "saiu") consulta = consulta.eq("no_grupo", false);
  if (filtro.filtro === "sem_inscricao") consulta = consulta.eq("no_grupo", true).eq("inscrito", false);
  const q = limparBusca(filtro.q).replace(/\D/g, "");
  if (q) consulta = consulta.ilike("telefone", `%${q}%`);
  const { data, error, count } = await consulta;
  if (error) falhar("membros", error);
  return { linhas: (data ?? []) as Membro[], total: count ?? 0, pagina };
}

export async function listarWebhooks(pagina = 1) {
  const p = Math.max(1, pagina);
  const porPagina = 30;
  const { data, error, count } = await db()
    .from("webhooks_sendflow")
    .select("*", { count: "exact" })
    .order("id", { ascending: false })
    .range((p - 1) * porPagina, p * porPagina - 1);
  if (error) falhar("webhooks", error);
  const webhooks = (data ?? []) as Webhook[];
  let eventos: Evento[] = [];
  if (webhooks.length) {
    const r = await db()
      .from("eventos_sendflow")
      .select("id, webhook_id, tipo, tipo_original, telefone, grupo_nome, grupo_id, lancamento_id")
      .in("webhook_id", webhooks.map((w) => w.id))
      .order("id");
    if (r.error) falhar("eventos", r.error);
    eventos = (r.data ?? []) as Evento[];
  }
  return { webhooks, eventos, total: count ?? 0, pagina: p, porPagina };
}

export async function serieDiaria(lancamentoId: number) {
  const { data, error } = await db()
    .from("v_serie_diaria")
    .select("dia, inscricoes, entradas, saidas, inscritos_no_grupo")
    .eq("lancamento_id", lancamentoId)
    .order("dia", { ascending: false })
    .limit(21);
  if (error) falhar("serie", error);
  return ((data ?? []) as { dia: string; inscricoes: number; entradas: number; saidas: number; inscritos_no_grupo: number }[]).reverse();
}

export type Janela = { de: string; ate: string; inscricoes: number; entradas: number; saidas: number; inscritos_no_grupo: number };

export type SituacaoMonitor = {
  lancamento_id: number;
  monitor_ativo: boolean;
  monitor_ligado_em: string | null;
  alerta_minutos_sem_entrada: number;
  resumo_minutos: number;
  alerta_telefones: string[];
  ultima_entrada_em: string | null;
  minutos_desde_ultima_entrada: number | null;
  ultimos_20: Janela;
  ultimos_60: Janela;
};

export type Alerta = {
  id: number;
  tipo: string;
  mensagem: string;
  criado_em: string;
  envio_status: string;
};

export async function situacaoMonitor(lancamentoId: number): Promise<SituacaoMonitor> {
  const { data, error } = await db().rpc("monitor_situacao", { p_lancamento_id: lancamentoId });
  if (error) falhar("monitor", error);
  return data as SituacaoMonitor;
}

export async function ultimosAlertas(lancamentoId: number, limite = 8): Promise<Alerta[]> {
  const { data, error } = await db()
    .from("alertas")
    .select("id, tipo, mensagem, criado_em, envio_status")
    .eq("lancamento_id", lancamentoId)
    .order("id", { ascending: false })
    .limit(limite);
  if (error) falhar("alertas", error);
  return (data ?? []) as Alerta[];
}

export async function serieHoraria(lancamentoId: number, horas = 24) {
  // v_serie_horaria.hora está no horário do Uruguai (UTC-3, sem horário de verão)
  const desde = new Date(Date.now() - horas * 3600_000 - 3 * 3600_000).toISOString();
  const { data, error } = await db()
    .from("v_serie_horaria")
    .select("hora, inscricoes, entradas, saidas")
    .eq("lancamento_id", lancamentoId)
    .gte("hora", desde.slice(0, 13) + ":00:00")
    .order("hora");
  if (error) falhar("serie_horaria", error);
  // Preenche as horas sem movimento com zero (horário UY = UTC-3)
  type H = { hora: string; inscricoes: number; entradas: number; saidas: number };
  const porHora = new Map(((data ?? []) as H[]).map((s) => [s.hora.slice(0, 13), s]));
  const agoraUY = Date.now() - 3 * 3600_000;
  return Array.from({ length: horas }, (_, i) => {
    const k = new Date(agoraUY - (horas - 1 - i) * 3600_000).toISOString().slice(0, 13);
    return porHora.get(k) ?? { hora: `${k}:00:00`, inscricoes: 0, entradas: 0, saidas: 0 };
  });
}

export type ConfigLancamento = {
  id: number;
  monitor_ativo: boolean;
  alerta_minutos_sem_entrada: number;
  resumo_minutos: number;
  alerta_telefones: string[];
};

export async function configsLancamentos(): Promise<Map<number, ConfigLancamento>> {
  const { data, error } = await db()
    .from("lancamentos")
    .select("id, monitor_ativo, alerta_minutos_sem_entrada, resumo_minutos, alerta_telefones");
  if (error) falhar("configs", error);
  return new Map(((data ?? []) as ConfigLancamento[]).map((c) => [c.id, c]));
}

export type ResumoPagina = {
  pagina_captura: string;
  leads: number;
  no_grupo: number;
  pct_no_grupo: number | null;
  perfil_nunca_operou: number;
  perfil_ja_opera: number;
  perfil_sem_resposta: number;
  fora_do_publico: number;
  pct_fora_do_publico: number | null;
  mediana_minutos_ate_entrar: number | null;
};

export async function resumoPaginas(lancamentoId: number): Promise<ResumoPagina[]> {
  const { data, error } = await db()
    .from("v_resumo_paginas")
    .select("*")
    .eq("lancamento_id", lancamentoId)
    .order("leads", { ascending: false });
  if (error) falhar("resumo_paginas", error);
  return (data ?? []) as ResumoPagina[];
}
