import "server-only";
import { db } from "./supabase";

export type LinhaFunil = {
  chave: string;
  visitas: number | null; // só existe para landing
  leads: number;
  comecaram: number;
  responderam: number;
  qualificados: number;
  nao_qualificados: number;
  no_grupo: number;
};
export type Cruzado = { landing: string; pagina_obrigado: string; leads: number; qualificados: number; no_grupo: number };

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
    chave: r.landing, visitas: n(r.visitas), leads: n(r.leads), comecaram: n(r.comecaram), responderam: n(r.responderam),
    qualificados: n(r.qualificados), nao_qualificados: n(r.nao_qualificados), no_grupo: n(r.no_grupo),
  }));
  const gracias: LinhaFunil[] = (g.data ?? []).map((r) => ({
    chave: r.pagina_obrigado, visitas: null, leads: n(r.leads), comecaram: n(r.comecaram), responderam: n(r.responderam),
    qualificados: n(r.qualificados), nao_qualificados: n(r.nao_qualificados), no_grupo: n(r.no_grupo),
  }));
  const cruzado: Cruzado[] = (c.data ?? []).map((r) => ({
    landing: r.landing, pagina_obrigado: r.pagina_obrigado, leads: n(r.leads), qualificados: n(r.qualificados), no_grupo: n(r.no_grupo),
  }));
  const ordem = (a: LinhaFunil, b: LinhaFunil) => b.leads - a.leads || (b.visitas ?? 0) - (a.visitas ?? 0);
  return { landings: landings.sort(ordem), gracias: gracias.sort(ordem), cruzado };
}

/** Porcentagem com 1 casa; "—" quando não há base. */
export function pct(parte: number, total: number | null): string {
  return total ? `${((100 * parte) / total).toFixed(1)}%` : "—";
}
