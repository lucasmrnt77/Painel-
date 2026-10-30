import "server-only";
import { db } from "./supabase";

export type Edicao = {
  id: number; codigo: string; nome: string; inicio: string; lancamento_id: number | null;
  tem_leads: boolean; tem_compras: boolean; observacao: string | null;
  ativa?: boolean; encerrada_em?: string | null;
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
  edicao_id: number; leads: number; linhas_planilha: number; pessoas: number;
  leads_ok: number; leads_revisar: number; leads_invalidos: number;
  compras: number; compras_validas: number; compras_sem_telefone: number;
};

/** Cada planilha/fonte de um lançamento: linhas que tinha e quantos números diferentes trouxe. */
export type FonteEdicao = {
  edicao_id: number; fonte: string; linhas_planilha: number; linhas_base: number; numeros: number; sem_telefone: number;
  observacao: string | null;
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

export async function fontesPorEdicao(): Promise<FonteEdicao[]> {
  const { data, error } = await db().from("v_bd_fontes").select("*").order("fonte");
  if (error) throw new Error(error.message);
  return (data ?? []) as FonteEdicao[];
}

export async function telefonesParaRevisar(limite = 100, so: "compradores" | "todos" = "todos", motivo?: string): Promise<{ itens: Revisar[]; total: number }> {
  let q = db().from("v_bd_revisar").select("*", { count: "exact" })
    .order("e_comprador", { ascending: false }).order("ocorrencias", { ascending: false }).order("telefone_original").limit(limite);
  if (so === "compradores") q = q.eq("e_comprador", true);
  if (motivo) q = q.eq("motivo", motivo);
  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  return { itens: (data ?? []) as Revisar[], total: count ?? 0 };
}

export type Invalido = { telefone_original: string; motivo: string | null; ocorrencias: number; e_comprador: boolean; edicoes: string };

/** Números inválidos ainda sem decisão (sem correção automática possível). */
export async function telefonesInvalidos(limite = 100, motivo?: string): Promise<{ itens: Invalido[]; total: number }> {
  let q = db().from("v_bd_invalidos").select("*", { count: "exact" })
    .order("e_comprador", { ascending: false }).order("ocorrencias", { ascending: false }).order("telefone_original").limit(limite);
  if (motivo) q = q.eq("motivo", motivo);
  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  return { itens: (data ?? []) as Invalido[], total: count ?? 0 };
}

/**
 * Correção automática de telefones (migração 046), em todos os lançamentos:
 * cruzamento → sugestões confiáveis aprovadas → o resto descartado (guardado, dá para recuperar).
 * Antes da migração 046 cai no cruzamento antigo (027/033).
 */
export async function corrigirTelefonesAutomatico(): Promise<void> {
  const { error } = await db().rpc("bd_telefones_automatico");
  if (!error) return;
  if (error.code !== "PGRST202") throw new Error(error.message);
  const r = await db().rpc("bd_cruzar_telefones");
  if (r.error && r.error.code !== "PGRST202") throw new Error(r.error.message);
}

export type Descartado = {
  telefone_original: string; sugestao: string | null; motivo: string | null; origem: string; descartado_em: string;
  ocorrencias: number; e_comprador: boolean; edicoes: string;
};

/** Números descartados (automático e manual), de todos os lançamentos. */
export async function telefonesDescartados(limite = 100): Promise<{ itens: Descartado[]; total: number }> {
  const { data, error, count } = await db().from("v_bd_descartados").select("*", { count: "exact" })
    .order("descartado_em", { ascending: false }).order("telefone_original").limit(limite);
  if (error) return { itens: [], total: 0 }; // antes da migração 046
  return { itens: (data ?? []) as Descartado[], total: count ?? 0 };
}

export type Corrigido = {
  telefone_original: string; telefone_corrigido: string; motivo: string | null; motivo_original: string | null;
  origem: string; ocorrencias: number; edicoes: string;
};

/** Como o número chegou × como ficou, de todos os lançamentos. */
export async function telefonesCorrigidos(limite = 200): Promise<{ itens: Corrigido[]; total: number }> {
  const { data, error, count } = await db().from("v_bd_telefones_corrigidos").select("*", { count: "exact" })
    .order("ocorrencias", { ascending: false }).order("telefone_original").limit(limite);
  if (error) return { itens: [], total: 0 };
  return { itens: (data ?? []) as Corrigido[], total: count ?? 0 };
}

/** Números que estavam descartados e foram resgatados por uma regra nova do normalizador (049). */
export async function telefonesResgatados(): Promise<Corrigido[]> {
  const { data, error } = await db().from("v_bd_telefones_corrigidos").select("*").eq("origem", "resgate")
    .order("telefone_original").limit(500);
  if (error) return [];
  return (data ?? []) as Corrigido[];
}

export type ResumoProblema = { lista: "revisar" | "invalido"; motivo: string | null; numeros: number; compradores: number };

export async function resumoProblemas(): Promise<ResumoProblema[]> {
  const { data, error } = await db().from("v_bd_problemas_resumo").select("*").order("numeros", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ResumoProblema[];
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

// ── TPP → Expert Trader ──────────────────────────────────────────────

export type JornadaResumo = {
  caminho: "et_direto" | "tpp_depois_et" | "so_tpp" | "mesmo_lancamento" | "et_antes_do_tpp";
  pessoas: number; dias_medio: number | null; dias_mediana: number | null; lancamentos_medio: number | null;
};
export type JornadaPorTpp = {
  lancamento: string; inicio: string; compraram_tpp: number; depois_compraram_et: number; taxa: number | null; ja_eram_alunos_et: number;
};
export type JornadaDistancia = { lancamentos_depois: string; pessoas: number; dias_mediana: number | null };
export type JornadaPessoa = {
  telefone: string; tpp_lancamento: string | null; tpp_data: string | null; et_lancamento: string | null; et_data: string | null;
  dias_ate_et: number | null; lancamentos_ate_et: number | null;
};

export async function jornada() {
  const [resumo, porTpp, distancia, pessoas] = await Promise.all([
    db().from("v_bd_jornada_resumo").select("*"),
    db().from("v_bd_jornada_por_tpp").select("*").order("inicio"),
    db().from("v_bd_jornada_distancia").select("*").order("lancamentos_depois"),
    db().from("v_bd_jornada_compra").select("telefone, tpp_lancamento, tpp_data, et_lancamento, et_data, dias_ate_et, lancamentos_ate_et")
      .eq("caminho", "tpp_depois_et").order("dias_ate_et").limit(500),
  ]);
  for (const r of [resumo, porTpp, distancia, pessoas]) if (r.error) throw new Error(r.error.message);
  return {
    resumo: (resumo.data ?? []) as JornadaResumo[],
    porTpp: (porTpp.data ?? []) as JornadaPorTpp[],
    distancia: (distancia.data ?? []) as JornadaDistancia[],
    pessoas: (pessoas.data ?? []) as JornadaPessoa[],
  };
}
