import "server-only";
import { db } from "./supabase";
import { montarRanking } from "./criativos";
import { montarDesempenho, type Registro } from "./anuncios";

/**
 * O Supabase devolve no máximo 1000 linhas por consulta: busca tudo em páginas.
 * `consulta(de, ate)` precisa ter ordem estável (order) para as páginas não se repetirem.
 */
async function todas<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const PASSO = 1000;
  const linhas: T[] = [];
  for (let de = 0; de < 200_000; de += PASSO) {
    const { data, error } = await consulta(de, de + PASSO - 1);
    if (error) return { data: null, error };
    linhas.push(...(data ?? []));
    if (!data || data.length < PASSO) break;
  }
  return { data: linhas, error: null };
}

export type LinhaFunil = {
  site: string; // "General" | "Trader" | "Jubilar" | "—"
  chave: string;
  visitas: number | null; // só existe para landing
  leads: number;
  comecaram: number;
  responderam: number;
  qualificados: number;
  nao_qualificados: number;
  no_grupo: number;
};
export type Cruzado = { site: string; landing: string; pagina_obrigado: string; leads: number; qualificados: number; no_grupo: number };

export async function metricasPaginas(lancamentoId: number) {
  const [l, g, c] = await Promise.all([
    db().from("v_metricas_landing").select("*").eq("lancamento_id", lancamentoId),
    db().from("v_metricas_gracias").select("*").eq("lancamento_id", lancamentoId),
    db().from("v_metricas_cruzado").select("*").eq("lancamento_id", lancamentoId),
  ]);
  const erro = l.error ?? g.error ?? c.error;
  if (erro) throw new Error(`métricas das páginas: ${erro.message}`);
  const n = (v: unknown) => Number(v ?? 0);
  const landings: LinhaFunil[] = (l.data ?? []).map((r) => ({
    site: r.site ?? "—", chave: r.landing, visitas: n(r.visitas), leads: n(r.leads), comecaram: n(r.comecaram), responderam: n(r.responderam),
    qualificados: n(r.qualificados), nao_qualificados: n(r.nao_qualificados), no_grupo: n(r.no_grupo),
  }));
  const gracias: LinhaFunil[] = (g.data ?? []).map((r) => ({
    site: r.site ?? "—", chave: r.pagina_obrigado, visitas: null, leads: n(r.leads), comecaram: n(r.comecaram), responderam: n(r.responderam),
    qualificados: n(r.qualificados), nao_qualificados: n(r.nao_qualificados), no_grupo: n(r.no_grupo),
  }));
  const cruzado: Cruzado[] = (c.data ?? []).map((r) => ({
    site: r.site ?? "—", landing: r.landing, pagina_obrigado: r.pagina_obrigado, leads: n(r.leads), qualificados: n(r.qualificados), no_grupo: n(r.no_grupo),
  }));
  // General antes de Trader; dentro de cada site, na ordem do nome (/v1, /v2, /v3…), com os sem padrão no fim
  const ordemSite = (s: string) => (s === "General" ? 0 : s === "Jubilar" ? 1 : s === "Trader" ? 2 : 3);
  const ordem = (a: LinhaFunil, b: LinhaFunil) =>
    ordemSite(a.site) - ordemSite(b.site) || pesoNome(a.chave) - pesoNome(b.chave) || a.chave.localeCompare(b.chave, undefined, { numeric: true }) || b.leads - a.leads;
  return { landings: landings.sort(ordem), gracias: gracias.sort(ordem), cruzado };
}

/** Porcentagem com 1 casa; "—" quando não há base. */
export function pct(parte: number, total: number | null): string {
  return total ? `${((100 * parte) / total).toFixed(1)}%` : "—";
}

/** Nomes no padrão (/, /v1, /v2…, /gracias-v1…) primeiro; nomes antigos (Gen-Argentina, /pag1…) depois. */
export function pesoNome(nome: string): number {
  if (nome === "/") return 0;
  if (/^\/v\d+$/.test(nome) || /^\/gracias-v\d+$/.test(nome)) return 1;
  if (nome.startsWith("(")) return 3;
  return 2;
}


/**
 * Ranking variação × país (Trader, General e Jubilar): visitas/leads/qualificados do painel e o investimento da
 * base da Paola (pc_ads_meta_anuncio_dia) ligado à página pela aba Criativos (ou pelo prefixo [T]/[G]/[JG] do anúncio).
 */
export async function rankingPaginas(lancamentoId: number) {
  const { data: lanc } = await db().from("lancamentos").select("ads_lancamento").eq("id", lancamentoId).maybeSingle();
  const adsLanc = (lanc as { ads_lancamento?: string | null } | null)?.ads_lancamento ?? null;
  const [linhas, criativos, gastos] = await Promise.all([
    todas((de, ate) => db().from("v_metricas_landing_pais").select("site, landing, pais, visitas, leads, qualificados").eq("lancamento_id", lancamentoId)
      .order("site").order("landing").order("pais").range(de, ate)),
    db().from("criativos").select("nome, pagina, variacao"),
    adsLanc
      ? todas((de, ate) => db().from("pc_ads_meta_anuncio_dia").select("criativo, pais, investimento").eq("lancamento", adsLanc).gt("investimento", 0)
          .order("data").order("ad_id").range(de, ate))
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (linhas.error) return { erro: linhas.error.message, ranking: [], comGasto: false };
  const n = (v: unknown) => Number(v ?? 0);
  const ranking = montarRanking(
    (linhas.data ?? []).map((r) => ({ site: r.site ?? "—", landing: r.landing, pais: r.pais, visitas: n(r.visitas), leads: n(r.leads), qualificados: n(r.qualificados) })),
    ((gastos.data ?? []) as { criativo: string | null; pais: string | null; investimento: unknown }[])
      .filter((g) => g.criativo).map((g) => ({ criativo: g.criativo!, pais: g.pais ?? "", investimento: n(g.investimento) })),
    ((criativos.data ?? []) as { nome: string; pagina: "general" | "trader" | "jubilar" | null; variacao: string | null }[]),
  );
  return { erro: null, ranking, comGasto: !!adsLanc && (gastos.data ?? []).length > 0 };
}

/** Anúncio × variação: registro (com histórico), base da Paola (investimento, cliques, visualizações) e leads do painel. */
export async function desempenhoAnuncios(lancamentoId: number) {
  const { data: lanc } = await db().from("lancamentos").select("ads_lancamento").eq("id", lancamentoId).maybeSingle();
  const adsLanc = (lanc as { ads_lancamento?: string | null } | null)?.ads_lancamento ?? null;
  const [reg, hist, leads, meta] = await Promise.all([
    db().from("criativos").select("id, nome, pagina, variacao"),
    db().from("criativos_historico").select("pagina, variacao, desde, criativos(nome)"),
    todas((de, ate) => db().from("v_leads_anuncio").select("anuncio, site, landing, leads, qualificados").eq("lancamento_id", lancamentoId)
      .order("anuncio").order("site").order("landing").range(de, ate)),
    adsLanc
      ? todas((de, ate) => db().from("pc_ads_meta_anuncio_dia").select("criativo, data, investimento, cliques, visitou_pagina").eq("lancamento", adsLanc)
          .order("data").order("ad_id").range(de, ate))
      : Promise.resolve({ data: [], error: null }),
  ]);
  const erro = reg.error ?? hist.error ?? leads.error;
  if (erro) return { erro: erro.message, desempenho: null, registros: [] as Registro[], comMeta: false };
  const n = (v: unknown) => Number(v ?? 0);
  const registros = (reg.data ?? []) as Registro[];
  const desempenho = montarDesempenho(
    registros,
    ((hist.data ?? []) as unknown as { pagina: Registro["pagina"]; variacao: string | null; desde: string; criativos: { nome: string } | null }[])
      .filter((h) => h.criativos).map((h) => ({ nome: h.criativos!.nome, pagina: h.pagina, variacao: h.variacao, desde: h.desde })),
    ((meta.data ?? []) as { criativo: string | null; data: string; investimento: unknown; cliques: unknown; visitou_pagina: unknown }[])
      .filter((m) => m.criativo).map((m) => ({ criativo: m.criativo!, data: m.data, investimento: n(m.investimento), cliques: n(m.cliques), visualizacoes: n(m.visitou_pagina) })),
    ((leads.data ?? []) as { anuncio: string | null; site: string; landing: string; leads: unknown; qualificados: unknown }[])
      .filter((l) => l.anuncio).map((l) => ({ anuncio: l.anuncio!, site: l.site, landing: l.landing, leads: n(l.leads), qualificados: n(l.qualificados) })),
  );
  return { erro: null, desempenho, registros, comMeta: (meta.data ?? []).length > 0 };
}
