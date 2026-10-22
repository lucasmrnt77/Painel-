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

export type LinhaTeste = {
  pagina: string;
  site: string;
  visitas: number;
  leads: number;
  conversao: number | null; // leads ÷ visitas da página
  responderam: number;
  qualificados: number;
  taxaQualificados: number | null; // calificados ÷ quem respondeu
  noGrupo: number;
  taxaGrupo: number | null; // no grupo ÷ leads
  investimento: number;
  cliques: number;
  visualizacoes: number; // visualizações da página segundo a Meta
  cpl: number | null;
  cplQualificado: number | null;
  melhor: { conversao: boolean; qualificados: boolean; cpl: boolean };
};

export function resumoTeste(paginas: string[], landings: LinhaFunil[], anuncios: LinhaAnuncio[]): LinhaTeste[] {
  const linhas = paginas.map((pagina): LinhaTeste => {
    const site = sitePagina(pagina);
    const l = landings.filter((x) => nomePagina(x.site, x.chave) === pagina);
    const a = anuncios.filter((x) => x.destino === pagina);
    const soma = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((t, x) => t + f(x), 0);
    const visitas = soma(l, (x) => x.visitas ?? 0);
    const leads = soma(l, (x) => x.leads);
    const responderam = soma(l, (x) => x.responderam);
    const qualificados = soma(l, (x) => x.qualificados);
    const noGrupo = soma(l, (x) => x.no_grupo);
    const investimento = soma(a, (x) => x.investimento);
    return {
      pagina, site, visitas, leads, responderam, qualificados, noGrupo,
      conversao: visitas > 0 ? leads / visitas : null,
      taxaQualificados: responderam > 0 ? qualificados / responderam : null,
      taxaGrupo: leads > 0 ? noGrupo / leads : null,
      investimento, cliques: soma(a, (x) => x.cliques), visualizacoes: soma(a, (x) => x.visualizacoes),
      cpl: investimento > 0 && leads > 0 ? investimento / leads : null,
      cplQualificado: investimento > 0 && qualificados > 0 ? investimento / qualificados : null,
      melhor: { conversao: false, qualificados: false, cpl: false },
    };
  });
  // ★ dentro de cada site (General/v1 × General/v2…), só entre páginas com dados suficientes
  for (const site of new Set(linhas.map((l) => l.site))) {
    const ls = linhas.filter((l) => l.site === site && l.visitas >= MIN_VISITAS_TESTE && l.leads >= MIN_LEADS_TESTE);
    if (ls.length < 2) continue;
    const marcar = (k: keyof LinhaTeste["melhor"], v: (l: LinhaTeste) => number | null, menor = false) => {
      const cs = ls.filter((l) => v(l) != null);
      if (cs.length < 2) return;
      const alvo = menor ? Math.min(...cs.map((l) => v(l)!)) : Math.max(...cs.map((l) => v(l)!));
      for (const l of cs) if (v(l) === alvo) l.melhor[k] = true;
    };
    marcar("conversao", (l) => l.conversao);
    marcar("qualificados", (l) => (l.visitas > 0 ? l.qualificados / l.visitas : null));
    marcar("cpl", (l) => l.cpl, true);
  }
  return linhas;
}
