import "server-only";
import { db } from "./supabase";

export type LinhaAnalise = {
  lancamento_id: number;
  lancamento_nome: string;
  status: string;
  no_grupo: boolean;
  origem: string;
  pais: string;
  canal: string;
  experiencia: string | null;
  landing: string | null;
  pagina_obrigado: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  conjunto: string | null;
  anuncio_nome: string | null;
  posicionamento: string | null;
  campanha_meta: string | null;
  dia: string;
  hora: number;
  dia_semana: number;
  pagina_captura: string | null;
  perfil: string | null;
};

const COLUNAS =
  "lancamento_id, lancamento_nome, status, no_grupo, origem, pais, canal, experiencia, landing, pagina_obrigado, utm_campaign, utm_content, conjunto, anuncio_nome, posicionamento, campanha_meta, dia, hora, dia_semana, pagina_captura, perfil";

export async function carregarAnalise(lancamentoId: number | null): Promise<LinhaAnalise[]> {
  const todas: LinhaAnalise[] = [];
  const passo = 1000;
  for (let de = 0; de < 200_000; de += passo) {
    let q = db().from("v_leads_analise").select(COLUNAS).order("inscricao_id").range(de, de + passo - 1);
    if (lancamentoId != null) q = q.eq("lancamento_id", lancamentoId);
    const { data, error } = await q;
    if (error) throw new Error(`[analise] ${error.message}`);
    todas.push(...((data ?? []) as LinhaAnalise[]));
    if (!data || data.length < passo) break;
  }
  return todas;
}

const DIAS = ["", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

export const ROTULO_PAGINA: Record<string, string> = { trader: "Trader", nunca_operou: "Nunca operou", sem_pagina: "Sem página" };
export const ROTULO_PERFIL: Record<string, string> = { nunca_operou: "Nunca operou", ja_opera: "Já opera" };
export const rotuloPagina = (v: string | null) => ROTULO_PAGINA[v ?? "sem_pagina"] ?? v ?? "Sem página";
export const rotuloPerfil = (v: string | null) => (v ? ROTULO_PERFIL[v] ?? v : "Sem resposta");

export const DIMENSOES: Record<string, { rotulo: string; valor: (l: LinhaAnalise) => string; ordenarPorChave?: boolean }> = {
  pagina_captura: { rotulo: "Página de captura",  valor: (l) => rotuloPagina(l.pagina_captura) },
  perfil:         { rotulo: "Perfil real",        valor: (l) => rotuloPerfil(l.perfil) },
  pagina_perfil:  { rotulo: "Página × Perfil",    valor: (l) => `Página ${rotuloPagina(l.pagina_captura)} · ${rotuloPerfil(l.perfil)}`, ordenarPorChave: true },
  anuncio:        { rotulo: "Anúncio",            valor: (l) => l.utm_content ?? l.anuncio_nome ?? "—" },
  conjunto:       { rotulo: "Conjunto",           valor: (l) => l.conjunto ?? "—" },
  campanha_meta:  { rotulo: "Campanha (Meta)",    valor: (l) => l.campanha_meta ?? "—" },
  posicionamento: { rotulo: "Posicionamento",     valor: (l) => l.posicionamento ?? "—" },
  canal:          { rotulo: "Canal",              valor: (l) => l.canal },
  pais:           { rotulo: "País",               valor: (l) => l.pais },
  experiencia:    { rotulo: "Experiência",        valor: (l) => l.experiencia ?? "—" },
  landing:        { rotulo: "Landing",            valor: (l) => l.landing ?? "—" },
  pagina_obrigado:{ rotulo: "Página de obrigado", valor: (l) => l.pagina_obrigado ?? "—" },
  dia:            { rotulo: "Dia",                valor: (l) => l.dia, ordenarPorChave: true },
  hora:           { rotulo: "Hora do dia",        valor: (l) => `${String(l.hora).padStart(2, "0")}h`, ordenarPorChave: true },
  dia_semana:     { rotulo: "Dia da semana",      valor: (l) => `${l.dia_semana} ${DIAS[l.dia_semana]}`, ordenarPorChave: true },
  lancamento:     { rotulo: "Lançamento",         valor: (l) => l.lancamento_nome },
};

export const FILTROS = ["pagina_captura", "perfil", "pais", "canal", "experiencia", "landing", "pagina_obrigado", "posicionamento", "origem"] as const;
export type Filtros = Partial<Record<(typeof FILTROS)[number] | "de" | "ate", string>>;

/** Valor exibido/filtrado de cada filtro. */
export function valorFiltro(l: LinhaAnalise, k: (typeof FILTROS)[number]): string {
  if (k === "pagina_captura") return rotuloPagina(l.pagina_captura);
  if (k === "perfil") return rotuloPerfil(l.perfil);
  return String((l as Record<string, unknown>)[k] ?? "—");
}

export function aplicarFiltros(linhas: LinhaAnalise[], f: Filtros): LinhaAnalise[] {
  return linhas.filter((l) => {
    for (const k of FILTROS) {
      const v = f[k];
      if (v && valorFiltro(l, k) !== v) return false;
    }
    if (f.de && l.dia < f.de) return false;
    if (f.ate && l.dia > f.ate) return false;
    return true;
  });
}

export function opcoesFiltro(linhas: LinhaAnalise[], k: (typeof FILTROS)[number]): string[] {
  const c = new Map<string, number>();
  for (const l of linhas) {
    const v = valorFiltro(l, k);
    c.set(v, (c.get(v) ?? 0) + 1);
  }
  return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
}

export type Grupo = { chave: string; leads: number; noGrupo: number; pct: number; share: number };

export function agrupar(linhas: LinhaAnalise[], dim: string): Grupo[] {
  const d = DIMENSOES[dim] ?? DIMENSOES.anuncio;
  const m = new Map<string, { leads: number; noGrupo: number }>();
  for (const l of linhas) {
    const k = d.valor(l);
    const g = m.get(k) ?? { leads: 0, noGrupo: 0 };
    g.leads++;
    if (l.no_grupo) g.noGrupo++;
    m.set(k, g);
  }
  const total = linhas.length || 1;
  const out = [...m.entries()].map(([chave, g]) => ({
    chave, leads: g.leads, noGrupo: g.noGrupo, pct: (100 * g.noGrupo) / g.leads, share: (100 * g.leads) / total,
  }));
  return d.ordenarPorChave ? out.sort((a, b) => a.chave.localeCompare(b.chave)) : out.sort((a, b) => b.leads - a.leads);
}
