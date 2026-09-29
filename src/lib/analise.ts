import "server-only";
import { db } from "./supabase";

/** Dimensões da aba Análise (a agregação acontece no banco: public.analise_resumo). */
export const DIMENSOES: Record<string, { rotulo: string; ordenarPorChave?: boolean }> = {
  pagina_captura:  { rotulo: "Página de captura" },
  perfil:          { rotulo: "Perfil real" },
  pagina_perfil:   { rotulo: "Página × Perfil", ordenarPorChave: true },
  faixa_etaria:    { rotulo: "Faixa etária", ordenarPorChave: true },
  genero:          { rotulo: "Gênero" },
  dinheiro:        { rotulo: "Disponibilidade de dinheiro" },
  variante:        { rotulo: "Variante da página" },
  anuncio:         { rotulo: "Anúncio" },
  conjunto:        { rotulo: "Conjunto" },
  campanha_meta:   { rotulo: "Campanha (Meta)" },
  posicionamento:  { rotulo: "Posicionamento" },
  canal:           { rotulo: "Canal" },
  pais:            { rotulo: "País" },
  experiencia:     { rotulo: "Experiência" },
  landing:         { rotulo: "Landing" },
  pagina_obrigado: { rotulo: "Página de obrigado" },
  dia:             { rotulo: "Dia", ordenarPorChave: true },
  hora:            { rotulo: "Hora do dia", ordenarPorChave: true },
  dia_semana:      { rotulo: "Dia da semana", ordenarPorChave: true },
  lancamento:      { rotulo: "Lançamento" },
};

export const FILTROS = [
  "pagina_captura", "perfil", "faixa_etaria_norm", "genero_norm", "pais", "canal",
  "experiencia", "landing", "pagina_obrigado", "posicionamento", "origem",
] as const;
export type Filtros = Partial<Record<(typeof FILTROS)[number] | "de" | "ate", string>>;

export type Grupo = { chave: string; leads: number; noGrupo: number; pct: number; share: number };

export type ResumoAnalise = {
  totalBase: number;
  total: number;
  noGrupo: number;
  grupos: Grupo[];
  opcoes: Partial<Record<(typeof FILTROS)[number], string[]>>;
};

const ORDEM_FAIXA = ["até 24", "25–34", "35–44", "45–54", "55–64", "65+"];

export async function carregarAnalise(lancamentoId: number | null, dimensao: string, filtros: Filtros): Promise<ResumoAnalise> {
  const { data, error } = await db().rpc("analise_resumo", {
    p_lancamento_id: lancamentoId,
    p_dimensao: dimensao,
    p_filtros: filtros,
  });
  if (error) throw new Error(`[analise] ${error.message}`);
  const r = data as {
    total_base: number; total: number; no_grupo: number;
    grupos: { chave: string | null; leads: number; no_grupo: number }[];
    opcoes: ResumoAnalise["opcoes"];
  };
  const total = r.total || 1;
  const grupos = r.grupos.map((g) => ({
    chave: g.chave ?? "—",
    leads: g.leads,
    noGrupo: g.no_grupo,
    pct: (100 * g.no_grupo) / g.leads,
    share: (100 * g.leads) / total,
  }));
  if (dimensao === "faixa_etaria") {
    const pos = (k: string) => (ORDEM_FAIXA.includes(k) ? ORDEM_FAIXA.indexOf(k) : 99);
    grupos.sort((a, b) => pos(a.chave) - pos(b.chave));
  } else if (DIMENSOES[dimensao]?.ordenarPorChave) {
    grupos.sort((a, b) => a.chave.localeCompare(b.chave));
  } else {
    grupos.sort((a, b) => b.leads - a.leads);
  }
  return { totalBase: r.total_base, total: r.total, noGrupo: r.no_grupo, grupos, opcoes: r.opcoes ?? {} };
}
