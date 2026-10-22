/**
 * Testes A/B das páginas (headline, estrutura, imagem…): cada teste tem nome, páginas e período.
 * Junta, por página, os dados da própria página (visitas, leads, calificados, grupo) e os da Meta
 * (investimento, cliques, visualizações, pelo registro anúncio → variação). Puro — tests/teste-paginas.test.ts.
 */
import type { LinhaFunil } from "./metricas-paginas";
import type { Linha as LinhaAnuncio } from "./anuncios";

export const SITES_TESTE = ["General", "Trader", "Jubilar"] as const;
export const VARIACOES_TESTE = ["/", "/v1", "/v2", "/v3", "/v4", "/v5", "/v6"] as const;

/** Mínimos para ganhar a ★ (evita vencer com poucos dados). */
export const MIN_VISITAS_TESTE = 100;
export const MIN_LEADS_TESTE = 5;

const PAGINA = /^(General|Trader|Jubilar)(\/v\d{1,2})?$/;

/** "Trader/v1", "General" (página principal)… — o mesmo formato do destino dos anúncios. */
export const nomePagina = (site: string, variacao: string) => (variacao === "/" ? site : `${site}${variacao}`);

/** Valores do formulário → lista válida, sem repetição, na ordem General, Trader, Jubilar e /, /v1, /v2… */
export function lerPaginasTeste(valores: string[]): string[] {
  const ok = new Set(valores.map((v) => v.trim()).filter((v) => PAGINA.test(v)));
  return [...ok].sort(ordemPagina);
}

export function sitePagina(p: string): string {
  return p.split("/")[0];
}

function ordemPagina(a: string, b: string): number {
  const s = (p: string) => SITES_TESTE.indexOf(sitePagina(p) as (typeof SITES_TESTE)[number]);
  const v = (p: string) => (p.includes("/") ? Number(p.split("/v")[1]) : 0);
  return s(a) - s(b) || v(a) - v(b);
}

/** Por página no período (metricas_teste_periodo, 037): cadastros, leads (clicaram no grupo) e leads calificados. */
export type ContagemTeste = { site: string; landing: string; inscritos: number; leads: number; leadsQualificados: number };

/**
 * As 7 métricas dos testes de dezembro, por página:
 *  1) visitas (page view)  2) leads = clicaram em "unirme al grupo"  3) leads calificados
 *  4) connect rate = visitas ÷ cliques da Meta  5) conversão = leads ÷ visitas
 *  6) conversão calificados = leads calificados ÷ visitas  7) qualificação = leads calificados ÷ leads
 */
export type LinhaTeste = {
  pagina: string;
  site: string;
  visitas: number;
  leads: number;
  leadsQualificados: number;
  cliques: number; // cliques da Meta (base do connect rate)
  inscritos: number; // fizeram o cadastro (com ou sem clique no grupo), só como referência
  connectRate: number | null;
  conversao: number | null;
  conversaoQualificados: number | null;
  qualificacao: number | null;
  melhor: { conversao: boolean; conversaoQualificados: boolean; qualificacao: boolean };
};

const razao = (a: number, b: number) => (b > 0 ? a / b : null);

export function resumoTeste(paginas: string[], landings: LinhaFunil[], contagens: ContagemTeste[], anuncios: LinhaAnuncio[]): LinhaTeste[] {
  const linhas = paginas.map((pagina): LinhaTeste => {
    const site = sitePagina(pagina);
    const soma = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((t, x) => t + f(x), 0);
    const l = landings.filter((x) => nomePagina(x.site, x.chave) === pagina);
    const c = contagens.filter((x) => nomePagina(x.site, x.landing) === pagina);
    const a = anuncios.filter((x) => x.destino === pagina);
    const visitas = soma(l, (x) => x.visitas ?? 0);
    const leads = soma(c, (x) => x.leads);
    const leadsQualificados = soma(c, (x) => x.leadsQualificados);
    const cliques = soma(a, (x) => x.cliques);
    return {
      pagina, site, visitas, leads, leadsQualificados, cliques, inscritos: soma(c, (x) => x.inscritos),
      connectRate: razao(visitas, cliques),
      conversao: razao(leads, visitas),
      conversaoQualificados: razao(leadsQualificados, visitas),
      qualificacao: razao(leadsQualificados, leads),
      melhor: { conversao: false, conversaoQualificados: false, qualificacao: false },
    };
  });
  // ★ dentro de cada site (General/v1 × General/v2…), só entre páginas com dados suficientes
  for (const site of new Set(linhas.map((l) => l.site))) {
    const ls = linhas.filter((l) => l.site === site && l.visitas >= MIN_VISITAS_TESTE && l.leads >= MIN_LEADS_TESTE);
    if (ls.length < 2) continue;
    for (const k of ["conversao", "conversaoQualificados", "qualificacao"] as const) {
      const cs = ls.filter((l) => l[k] != null);
      if (cs.length < 2) continue;
      const alvo = Math.max(...cs.map((l) => l[k]!));
      for (const l of cs) if (l[k] === alvo) l.melhor[k] = true;
    }
  }
  return linhas;
}
