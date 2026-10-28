/**
 * Testes A/B das páginas (headline, estrutura, imagem…): cada teste tem nome, páginas e período.
 * Junta, por página, os dados da própria página (visitas, leads, calificados, grupo) e os da Meta
 * (investimento, cliques, visualizações, pelo registro anúncio → variação). Puro — tests/teste-paginas.test.ts.
 */
import type { LinhaFunil } from "./metricas-paginas";
import type { Linha as LinhaAnuncio } from "./anuncios";

export const SITES_TESTE = ["General", "Trader", "Jubilar", "Gen-Jubilados"] as const;
export const VARIACOES_TESTE = ["/", "/v1", "/v2", "/v3", "/v4", "/v5", "/v6"] as const;

/** Mínimos para ganhar a ★ (evita vencer com poucos dados). */
export const MIN_VISITAS_TESTE = 100;
export const MIN_LEADS_TESTE = 5;

const PAGINA = /^(General|Trader|Jubilar|Gen-Jubilados)(\/v\d{1,2})?$/;

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

/** Site de um destino de anúncio ("General/v2", "General", "General · Gen-Argentina" → "General"). */
const siteDestino = (d: string) => d.split(/[/ ]/)[0];

const soma = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((t, x) => t + f(x), 0);

/**
 * Link único (dezembro em diante): todos os anúncios de um site levam ao domínio puro e a Vercel
 * divide entre as variações. Os cliques da Meta são do site inteiro, então cada página do teste recebe
 * a parte proporcional às suas visitas — o connect rate fica o mesmo para as páginas do site
 * (visitas do site ÷ cliques do site), e é o número real.
 */
export function resumoTeste(paginas: string[], landings: LinhaFunil[], contagens: ContagemTeste[], anuncios: LinhaAnuncio[]): LinhaTeste[] {
  const visitasDe = (pagina: string) => soma(landings.filter((x) => nomePagina(x.site, x.chave) === pagina), (x) => x.visitas ?? 0);
  const cliquesSite = new Map<string, number>();
  const visitasSite = new Map<string, number>();
  for (const site of new Set(paginas.map(sitePagina))) {
    cliquesSite.set(site, soma(anuncios.filter((x) => siteDestino(x.destino) === site), (x) => x.cliques));
    visitasSite.set(site, soma(paginas.filter((p) => sitePagina(p) === site), visitasDe));
  }
  const linhas = paginas.map((pagina): LinhaTeste => {
    const site = sitePagina(pagina);
    const c = contagens.filter((x) => nomePagina(x.site, x.landing) === pagina);
    const visitas = visitasDe(pagina);
    const leads = soma(c, (x) => x.leads);
    const leadsQualificados = soma(c, (x) => x.leadsQualificados);
    const vs = visitasSite.get(site) ?? 0;
    const cliques = vs > 0 ? Math.round(((cliquesSite.get(site) ?? 0) * visitas) / vs) : 0;
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

/**
 * REGRA (28/10/2026): nenhum teste pode sobrepor outro. Os dados de cada teste (visitas, leads,
 * qualificados, Meta) são separados por dia (horário do Uruguai), então dois testes do mesmo lançamento
 * não podem ter nenhum dia em comum — nem o dia da troca. Devolve o teste que conflita, ou null.
 */
export function testeQueSobrepoe(
  novo: { inicio: string; fim: string },
  outros: { id: number; nome: string; inicio: string; fim: string }[],
  idProprio?: number | null,
): { id: number; nome: string; inicio: string; fim: string } | null {
  return outros.find((o) => o.id !== idProprio && o.inicio <= novo.fim && novo.inicio <= o.fim) ?? null;
}
