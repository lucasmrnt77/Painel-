import "server-only";
import { db } from "./supabase";

export type Edicao = {
  id: number; codigo: string; nome: string; inicio: string; lancamento_id: number | null;
  tem_leads: boolean; tem_compras: boolean; observacao: string | null;
};

export type LinhaConversao = {
  participacao: string; participantes: number; compraram_et: number; compraram_tpp: number;
  compraram_algum?: number; taxa_et: number | null; taxa_tpp: number | null; taxa_algum?: number | null;
};

export type LinhaConversaoEdicao = LinhaConversao & { edicao: string; inicio: string };

export type LinhaTotal = {
  lancamentos: string; pessoas: number; compraram_et: number; compraram_tpp: number; compraram_algum: number;
  taxa_et: number | null; taxa_tpp: number | null; taxa_algum: number | null;
};

export type ContagemEdicao = {
  edicao_id: number; leads: number; leads_ok: number; leads_revisar: number; leads_invalidos: number;
  compras: number; compras_validas: number; compras_sem_telefone: number;
};

export type Combinacao = {
  lancamentos: string; n_lancamentos: number; pessoas: number; compraram_et: number; compraram_tpp: number; taxa_algum: number | null;
};

export type RepeticaoEdicao = {
  edicao: string; inicio: string; pessoas: number; em_outros: number; ja_vinham_de_antes: number; pct_em_outros: number | null;
};

export type Revisar = {
  telefone_original: string; motivo: string | null; sugestao: string | null; origem_sugestao: string | null;
  motivo_sugestao: string | null; ocorrencias: number; e_comprador: boolean; edicoes: string;
};

const ORDEM: Record<string, number> = { "1": 1, "2": 2, "3": 3, "+3": 4 };
const ordenar = <T extends { participacao?: string; lancamentos?: string }>(xs: T[]) =>
  [...xs].sort((a, b) => (ORDEM[a.participacao ?? a.lancamentos ?? ""] ?? 9) - (ORDEM[b.participacao ?? b.lancamentos ?? ""] ?? 9));

export async function edicoes(): Promise<Edicao[]> {
  const { data, error } = await db().from("bd_edicoes").select("*").order("inicio");
  if (error) throw new Error(error.message);
  return (data ?? []) as Edicao[];
}

export async function conversaoPorParticipacao(): Promise<LinhaConversao[]> {
  const { data, error } = await db().from("v_bd_conversao_participacao").select("*");
  if (error) throw new Error(error.message);
  return ordenar((data ?? []) as LinhaConversao[]);
}

export async function conversaoPorEdicao(): Promise<LinhaConversaoEdicao[]> {
  const { data, error } = await db().from("v_bd_conversao_edicao").select("*").order("inicio");
  if (error) throw new Error(error.message);
  const xs = (data ?? []) as LinhaConversaoEdicao[];
  return xs.sort((a, b) => a.inicio.localeCompare(b.inicio) || (ORDEM[a.participacao] ?? 9) - (ORDEM[b.participacao] ?? 9));
}

export async function conversaoPorTotal(): Promise<LinhaTotal[]> {
  const { data, error } = await db().from("v_bd_conversao_total").select("*");
  if (error) throw new Error(error.message);
  return ordenar((data ?? []) as LinhaTotal[]);
}

/** Pessoas que estiveram em mais de 1 lançamento, agrupadas pela combinação de lançamentos. */
export async function combinacoes(): Promise<Combinacao[]> {
  const { data, error } = await db().from("v_bd_combinacoes").select("*")
    .order("pessoas", { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as Combinacao[];
}

/** Em cada lançamento: quantas pessoas também estiveram em outro. */
export async function repeticaoPorEdicao(): Promise<RepeticaoEdicao[]> {
  const { data, error } = await db().from("v_bd_repeticao_edicao").select("*").order("inicio");
  if (error) throw new Error(error.message);
  return (data ?? []) as RepeticaoEdicao[];
}

export async function contagensPorEdicao(): Promise<ContagemEdicao[]> {
  const { data, error } = await db().rpc("bd_contagens");
  if (error) throw new Error(error.message);
  return (data ?? []) as ContagemEdicao[];
}

export async function telefonesParaRevisar(limite = 100, so: "compradores" | "todos" = "compradores"): Promise<{ itens: Revisar[]; total: number }> {
  let q = db().from("v_bd_revisar").select("*", { count: "exact" })
    .order("e_comprador", { ascending: false }).order("ocorrencias", { ascending: false }).limit(limite);
  if (so === "compradores") q = q.eq("e_comprador", true);
  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  return { itens: (data ?? []) as Revisar[], total: count ?? 0 };
}

/** Filtro de exportação: quantos lançamentos a pessoa participou. */
export const FILTROS_N = [
  { valor: "todos", rotulo: "Todos (1 ou mais)" },
  { valor: "1", rotulo: "Só 1 lançamento" },
  { valor: "2", rotulo: "2 lançamentos" },
  { valor: "3", rotulo: "3 lançamentos" },
  { valor: "4+", rotulo: "Mais de 3" },
] as const;

export const FILTROS_COMPRA = [
  { valor: "todos", rotulo: "Compradores e não compradores" },
  { valor: "nao", rotulo: "Nunca compraram" },
  { valor: "et", rotulo: "Compraram Expert Trader" },
  { valor: "tpp", rotulo: "Compraram TPP" },
  { valor: "tpp-sem-et", rotulo: "Compraram TPP e não ET" },
] as const;
