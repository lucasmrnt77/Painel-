import "server-only";
import { db } from "./supabase";
import { montarRanking } from "./criativos";

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
    db().from("v_metricas_landing_pais").select("site, landing, pais, visitas, leads, qualificados").eq("lancamento_id", lancamentoId),
    db().from("criativos").select("nome, pagina, variacao"),
    adsLanc
      ? db().from("pc_ads_meta_anuncio_dia").select("criativo, pais, investimento").eq("lancamento", adsLanc).gt("investimento", 0).limit(20000)
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
