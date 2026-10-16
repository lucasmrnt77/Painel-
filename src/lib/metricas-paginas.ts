import "server-only";
import { db } from "./supabase";

export type LinhaFunil = {
  site: string; // "General" | "Trader" | "—"
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
  const ordemSite = (s: string) => (s === "General" ? 0 : s === "Trader" ? 1 : 2);
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

