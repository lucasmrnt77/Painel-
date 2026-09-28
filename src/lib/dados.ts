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
    .select("dia, inscricoes, entradas, saidas")
    .eq("lancamento_id", lancamentoId)
    .order("dia");
  if (error) falhar("serie", error);
  return (data ?? []) as { dia: string; inscricoes: number; entradas: number; saidas: number }[];
}
