import "server-only";
import { db } from "./supabase";
import { montarRanking, type PaisGrupo } from "./criativos";
import { montarDesempenho, type Registro } from "./anuncios";
import { temPeriodo, type Periodo } from "./periodo";
import { nomePagina, type ContagemTeste } from "./teste-paginas";

const SEM_PERIODO: Periodo = { de: null, ate: null };
/** Parâmetros das funções *_periodo (migração 035). */
const argsPeriodo = (lancamentoId: number, p: Periodo) => ({ p_lancamento: lancamentoId, p_de: p.de, p_ate: p.ate });

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

/**
 * Funil por página. Com período (testes A/B), conta só quem se inscreveu nesses dias e as visitas desses dias;
 * sem período, o lançamento inteiro (as mesmas views de sempre).
 */
export async function metricasPaginas(lancamentoId: number, periodo: Periodo = SEM_PERIODO, paginas: string[] | null = null) {
  const comPeriodo = temPeriodo(periodo);
  const a = argsPeriodo(lancamentoId, periodo);
  const [l, g, c] = await Promise.all(comPeriodo
    ? [db().rpc("metricas_landing_periodo", a), db().rpc("metricas_gracias_periodo", a), db().rpc("metricas_cruzado_periodo", a)]
    : [
        db().from("v_metricas_landing").select("*").eq("lancamento_id", lancamentoId),
        db().from("v_metricas_gracias").select("*").eq("lancamento_id", lancamentoId),
        db().from("v_metricas_cruzado").select("*").eq("lancamento_id", lancamentoId),
      ]);
  const erro = l.error ?? g.error ?? c.error;
  if (erro) throw new Error(`métricas das páginas: ${erro.message}`);
  type Linha = Record<string, unknown> & { site: string | null; landing: string; pagina_obrigado: string };
  const n = (v: unknown) => Number(v ?? 0);
  const landings: LinhaFunil[] = ((l.data ?? []) as Linha[]).map((r) => ({
    site: r.site ?? "—", chave: r.landing, visitas: n(r.visitas), leads: n(r.leads), comecaram: n(r.comecaram), responderam: n(r.responderam),
    qualificados: n(r.qualificados), nao_qualificados: n(r.nao_qualificados), no_grupo: n(r.no_grupo),
  }));
  const gracias: LinhaFunil[] = ((g.data ?? []) as Linha[]).map((r) => ({
    site: r.site ?? "—", chave: r.pagina_obrigado, visitas: null, leads: n(r.leads), comecaram: n(r.comecaram), responderam: n(r.responderam),
    qualificados: n(r.qualificados), nao_qualificados: n(r.nao_qualificados), no_grupo: n(r.no_grupo),
  }));
  const cruzado: Cruzado[] = ((c.data ?? []) as Linha[]).map((r) => ({
    site: r.site ?? "—", landing: r.landing, pagina_obrigado: r.pagina_obrigado, leads: n(r.leads), qualificados: n(r.qualificados), no_grupo: n(r.no_grupo),
  }));
  // General antes de Trader; dentro de cada site, na ordem do nome (/v1, /v2, /v3…), com os sem padrão no fim
  const ordemSite = (s: string) => (s === "General" ? 0 : s === "Jubilar" ? 1 : s === "Trader" ? 2 : 3);
  const ordem = (a: LinhaFunil, b: LinhaFunil) =>
    ordemSite(a.site) - ordemSite(b.site) || pesoNome(a.chave) - pesoNome(b.chave) || a.chave.localeCompare(b.chave, undefined, { numeric: true }) || b.leads - a.leads;
  if (paginas) {
    // Teste aberto: só as páginas do teste; as gracias contam só os leads que vieram delas (036)
    const naPagina = (site: string | null, landing: string) => paginas.includes(nomePagina(site ?? "—", landing));
    const gl = await db().rpc("metricas_gracias_landing_periodo", a);
    if (gl.error) throw new Error(`gracias por landing: ${gl.error.message}`);
    const porGracias = new Map<string, LinhaFunil>();
    for (const r of (gl.data ?? []) as Linha[]) {
      if (!naPagina(r.site, r.landing)) continue;
      const k = `${r.site ?? "—"}|${r.pagina_obrigado}`;
      const g = porGracias.get(k) ?? { site: r.site ?? "—", chave: r.pagina_obrigado, visitas: null, leads: 0, comecaram: 0, responderam: 0, qualificados: 0, nao_qualificados: 0, no_grupo: 0 };
      g.leads += n(r.leads); g.comecaram += n(r.comecaram); g.responderam += n(r.responderam);
      g.qualificados += n(r.qualificados); g.nao_qualificados += n(r.nao_qualificados); g.no_grupo += n(r.no_grupo);
      porGracias.set(k, g);
    }
    return {
      landings: landings.filter((l) => naPagina(l.site, l.chave)).sort(ordem),
      gracias: [...porGracias.values()].sort(ordem),
      cruzado: cruzado.filter((c) => naPagina(c.site, c.landing)),
    };
  }
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
type LinhaPaisBanco = { site: string | null; landing: string; pais: PaisGrupo; visitas: unknown; leads: unknown; qualificados: unknown };

export async function rankingPaginas(lancamentoId: number, periodo: Periodo = SEM_PERIODO, paginas: string[] | null = null) {
  const comPeriodo = temPeriodo(periodo);
  const { data: lanc } = await db().from("lancamentos").select("ads_lancamento").eq("id", lancamentoId).maybeSingle();
  const adsLanc = (lanc as { ads_lancamento?: string | null } | null)?.ads_lancamento ?? null;
  const [linhas, criativos, gastos] = await Promise.all([
    comPeriodo
      ? todas<LinhaPaisBanco>((de, ate) => db().rpc("metricas_landing_pais_periodo", argsPeriodo(lancamentoId, periodo)).select("site, landing, pais, visitas, leads, qualificados")
          .order("site").order("landing").order("pais").range(de, ate) as unknown as PromiseLike<{ data: LinhaPaisBanco[] | null; error: { message: string } | null }>)
      : todas<LinhaPaisBanco>((de, ate) => db().from("v_metricas_landing_pais").select("site, landing, pais, visitas, leads, qualificados").eq("lancamento_id", lancamentoId)
          .order("site").order("landing").order("pais").range(de, ate)),
    db().from("criativos").select("nome, pagina, variacao"),
    adsLanc
      ? todas((de, ate) => {
          let q = db().from("pc_ads_meta_anuncio_dia").select("criativo, pais, investimento").eq("lancamento", adsLanc).gt("investimento", 0);
          if (periodo.de) q = q.gte("data", periodo.de);
          if (periodo.ate) q = q.lte("data", periodo.ate);
          return q.order("data").order("ad_id").range(de, ate);
        })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (linhas.error) return { erro: linhas.error.message, ranking: [], comGasto: false };
  const n = (v: unknown) => Number(v ?? 0);
  const ranking = montarRanking(
    (linhas.data ?? []).filter((r) => !paginas || paginas.includes(nomePagina(r.site ?? "—", r.landing))).map((r) => ({ site: r.site ?? "—", landing: r.landing, pais: r.pais, visitas: n(r.visitas), leads: n(r.leads), qualificados: n(r.qualificados) })),
    ((gastos.data ?? []) as { criativo: string | null; pais: string | null; investimento: unknown }[])
      .filter((g) => g.criativo).map((g) => ({ criativo: g.criativo!, pais: g.pais ?? "", investimento: n(g.investimento) })),
    ((criativos.data ?? []) as { nome: string; pagina: "general" | "trader" | "jubilar" | null; variacao: string | null }[]),
  );
  return { erro: null, ranking, comGasto: !!adsLanc && (gastos.data ?? []).length > 0 };
}

/** Cadastros, leads (clicaram no grupo) e leads calificados por página no período (037). */
export async function contagensTeste(lancamentoId: number, periodo: Periodo): Promise<ContagemTeste[]> {
  const { data, error } = await db().rpc("metricas_teste_periodo", argsPeriodo(lancamentoId, periodo));
  if (error) throw new Error(`métricas do teste: ${error.message}`);
  const n = (v: unknown) => Number(v ?? 0);
  return ((data ?? []) as { site: string | null; landing: string; inscritos: unknown; leads: unknown; leads_qualificados: unknown }[])
    .map((r) => ({ site: r.site ?? "—", landing: r.landing, inscritos: n(r.inscritos), leads: n(r.leads), leadsQualificados: n(r.leads_qualificados) }));
}

export type TestePagina = { id: number; nome: string; paginas: string[]; inicio: string; fim: string };

/** Períodos de teste salvos do lançamento (migração 035). Sem a tabela, devolve lista vazia e o erro. */
export async function testesPaginas(lancamentoId: number): Promise<{ testes: TestePagina[]; erro: string | null }> {
  const { data, error } = await db().from("testes_paginas").select("id, nome, paginas, inicio, fim").eq("lancamento_id", lancamentoId).order("inicio").order("id");
  if (error) return { testes: [], erro: error.message };
  return { testes: (data ?? []) as TestePagina[], erro: null };
}

/** Anúncio × variação: registro (com histórico), base da Paola (investimento, cliques, visualizações) e leads do painel. */
export async function desempenhoAnuncios(lancamentoId: number, periodo: Periodo = SEM_PERIODO) {
  const comPeriodo = temPeriodo(periodo);
  type LeadsBanco = { anuncio: string | null; site: string; landing: string; leads: unknown; qualificados: unknown };
  const { data: lanc } = await db().from("lancamentos").select("ads_lancamento").eq("id", lancamentoId).maybeSingle();
  const adsLanc = (lanc as { ads_lancamento?: string | null } | null)?.ads_lancamento ?? null;
  const [reg, hist, leads, meta] = await Promise.all([
    db().from("criativos").select("id, nome, pagina, variacao"),
    db().from("criativos_historico").select("pagina, variacao, desde, criativos(nome)"),
    comPeriodo
      ? todas<LeadsBanco>((de, ate) => db().rpc("leads_anuncio_periodo", argsPeriodo(lancamentoId, periodo)).select("anuncio, site, landing, leads, qualificados")
          .order("anuncio").order("site").order("landing").range(de, ate) as unknown as PromiseLike<{ data: LeadsBanco[] | null; error: { message: string } | null }>)
      : todas<LeadsBanco>((de, ate) => db().from("v_leads_anuncio").select("anuncio, site, landing, leads, qualificados").eq("lancamento_id", lancamentoId)
          .order("anuncio").order("site").order("landing").range(de, ate)),
    adsLanc
      ? todas((de, ate) => {
          let q = db().from("pc_ads_meta_anuncio_dia").select("criativo, data, investimento, cliques, visitou_pagina").eq("lancamento", adsLanc);
          if (periodo.de) q = q.gte("data", periodo.de);
          if (periodo.ate) q = q.lte("data", periodo.ate);
          return q.order("data").order("ad_id").range(de, ate);
        })
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
