import "server-only";
import { db } from "./supabase";
import { limparBusca, POR_PAGINA } from "./dados";
import { contagensTeste, desempenhoAnuncios, metricasPaginas } from "./metricas-paginas";
import { juntarEnvios, limitesUtc, montarResumo, PAISES_INSCRITOS, type Envio, type Extra, type LinhaResumo } from "./inscritos";
import type { Periodo } from "./periodo";

export type Inscrito = {
  inscricao_id: number;
  telefone: string | null;
  telefone_chave: string | null;
  email: string | null;
  nome: string | null;
  inscrito_em: string;
  n_envios: number;
  site: string | null;
  landing: string | null;
  pagina_obrigado: string | null;
  experiencia: string | null;
  faixa_etaria: string | null;
  genero: string | null;
  resposta_dinheiro: string | null;
  status: string;
  entrou_em: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  extra: Extra | null;
};

export type FiltroInscritos = { site?: string; landing?: string; pais?: string; q?: string; periodo: Periodo; pagina: number };

const CAMPOS =
  "inscricao_id, telefone, telefone_chave, email, nome, inscrito_em, n_envios, site, landing, pagina_obrigado, experiencia, faixa_etaria, genero, resposta_dinheiro, status, entrou_em, utm_source, utm_medium, utm_campaign, utm_content";

/** Inscrições (uma por pessoa, a 1ª no lançamento) com filtros de página, variação, país, período e busca. */
export async function listarInscritos(lancamentoId: number, f: FiltroInscritos) {
  const pagina = Math.max(1, f.pagina);
  let c = db().from("v_leads").select(CAMPOS, { count: "exact" }).eq("lancamento_id", lancamentoId)
    .order("inscrito_em", { ascending: false }).range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1);
  if (f.site) c = c.eq("site", f.site);
  if (f.landing) c = c.eq("landing", f.landing);
  const pais = PAISES_INSCRITOS.find((p) => p.valor === f.pais);
  if (pais) c = c.like("telefone", `${pais.prefixo}%`);
  else if (f.pais === "outros") for (const p of PAISES_INSCRITOS) c = c.not("telefone", "like", `${p.prefixo}%`);
  const { desde, antes } = limitesUtc(f.periodo);
  if (desde) c = c.gte("inscrito_em", desde);
  if (antes) c = c.lt("inscrito_em", antes);
  const q = limparBusca(f.q);
  if (q) c = c.or(`nome.ilike.*${q}*,email.ilike.*${q}*,telefone.ilike.*${q.replace(/\D/g, "") || q}*`);
  const { data, error, count } = await c;
  if (error) throw new Error(`[inscritos] ${error.message}`);
  const linhas = (data ?? []) as unknown as Omit<Inscrito, "extra">[];

  // O que não está na v_leads: calificado, clique no grupo e a origem exata que a página mandou (como na planilha)
  const chaves = [...new Set(linhas.map((l) => l.telefone_chave).filter((k): k is string => !!k))];
  let extras = new Map<string, Extra>();
  if (chaves.length) {
    const e = await db().from("inscricoes")
      .select("telefone_chave, criado_em, qualificado, clicou_grupo_em, pagina_obrigado, origem:payload->>pagina_captura")
      .eq("lancamento_id", lancamentoId).in("telefone_chave", chaves).limit(5000);
    if (e.error) throw new Error(`[inscritos] detalhes: ${e.error.message}`);
    extras = juntarEnvios((e.data ?? []) as unknown as Envio[]);
  }
  return {
    linhas: linhas.map((l) => ({ ...l, extra: (l.telefone_chave && extras.get(l.telefone_chave)) || null })) as Inscrito[],
    total: count ?? 0,
    pagina,
  };
}

/** Quantas inscrições por página (para os botões de filtro). */
export async function contarPorSite(lancamentoId: number, sites: string[], periodo: Periodo) {
  const { desde, antes } = limitesUtc(periodo);
  const contar = async (site?: string) => {
    let c = db().from("v_leads").select("inscricao_id", { count: "exact", head: true }).eq("lancamento_id", lancamentoId);
    if (site) c = c.eq("site", site);
    if (desde) c = c.gte("inscrito_em", desde);
    if (antes) c = c.lt("inscrito_em", antes);
    const { count } = await c;
    return count ?? 0;
  };
  const [todos, ...porSite] = await Promise.all([contar(), ...sites.map((s) => contar(s))]);
  return { todos, porSite: Object.fromEntries(sites.map((s, i) => [s, porSite[i]])) as Record<string, number> };
}

/**
 * Resumo por página × variação no período: visitas, inscrições, cliques no grupo e calificados,
 * e os cliques da Meta por página (anúncios do lançamento).
 */
export async function resumoPaginas(lancamentoId: number, periodo: Periodo, site?: string): Promise<{ linhas: LinhaResumo[]; cliquesMeta: Record<string, number> | null }> {
  const [m, teste, anuncios] = await Promise.all([
    metricasPaginas(lancamentoId, periodo),
    contagensTeste(lancamentoId, periodo),
    desempenhoAnuncios(lancamentoId, periodo).catch(() => null),
  ]);
  const linhas = montarResumo(
    m.landings.map((l) => ({ site: l.site, landing: l.chave, visitas: l.visitas ?? 0, leads: l.leads })),
    teste,
    site,
  );
  let cliquesMeta: Record<string, number> | null = null;
  if (anuncios?.comMeta && anuncios.desempenho) {
    cliquesMeta = {};
    for (const l of anuncios.desempenho.linhas) {
      const s = l.destino.split(/[/ ]/)[0];
      cliquesMeta[s] = (cliquesMeta[s] ?? 0) + l.cliques;
    }
  }
  return { linhas, cliquesMeta };
}
