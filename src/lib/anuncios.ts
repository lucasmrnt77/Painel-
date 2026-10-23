/**
 * Anúncio × variação da página (os anúncios levam direto para a página, sem redirecionamento).
 * Puro — testado em tests/anuncios.test.ts.
 *
 * - Registro: cada anúncio aponta para uma página (General, Trader, Jubilar) e uma variação (/v1, /v2…).
 *   Cada troca fica no histórico, e o investimento/visualizações de cada dia vão para a variação daquele dia.
 * - Leads e qualificados vêm do painel (pela variação em que a pessoa realmente entrou).
 * - Visualizações da página, cliques e investimento vêm da base da Paola, pelo nome do anúncio.
 */
import { SITES, type Site } from "./criativos";

export type Registro = { id: number; nome: string; pagina: Site | null; variacao: string | null };
export type Historico = { nome: string; pagina: Site | null; variacao: string | null; desde: string };
export type MetaDia = { criativo: string; data: string; investimento: number; cliques: number; visualizacoes: number };
export type LeadsAnuncio = { anuncio: string; site: string; landing: string; leads: number; qualificados: number };

export type Linha = {
  anuncio: string;
  destino: string; // "General/v2"
  registrado: boolean;
  investimento: number;
  cliques: number;
  visualizacoes: number;
  leads: number;
  qualificados: number;
  conversao: number | null; // leads ÷ visualizações da página
  taxaQualificados: number | null; // qualificados ÷ visualizações
  cpl: number | null;
  cplQualificado: number | null;
};
export type Desempenho = {
  linhas: Linha[];
  melhorPorAnuncio: Map<string, string>; // anúncio → destino com maior conversão
  melhorPorDestino: { destino: string; anuncio: string; conversao: number }[];
};

/** Mínimos para disputar o "melhor" (evita vencer com poucos dados). */
export const MIN_VISUALIZACOES = 100;
export const MIN_LEADS = 5;

const NOME_SITE: Record<Site, string> = { general: "General", trader: "Trader", jubilar: "Jubilar", genjub: "Gen-Jubilados" };
const chave = (s: string) => s.trim().toLowerCase();

export function destino(site: string, variacao: string | null): string {
  if (!variacao || variacao === "/") return site;
  // Nomes antigos (Gen-Argentina, /pag1…) ficam separados do nome da página
  return variacao.startsWith("/") ? `${site}${variacao}` : `${site} · ${variacao}`;
}

/** Dia (AAAA-MM-DD) no horário de Brasil/Uruguai. */
export function diaLocal(iso: string): string {
  return new Date(new Date(iso).getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
}

/** Link colado do anúncio → página e variação ("https://eventotrader.metodoconsistente.com/v2?utm…"). */
export function lerLinkAnuncio(link: string, sites: { site: Site; url_base: string }[]): { pagina: Site; variacao: string } | null {
  let u: URL;
  try {
    u = new URL(link.trim());
  } catch {
    return null;
  }
  const s = sites.find((x) => {
    try {
      return new URL(x.url_base).hostname === u.hostname;
    } catch {
      return false;
    }
  });
  if (!s) return null;
  const caminho = u.pathname.replace(/\/+$/, "").replace(/-intl$/, "");
  if (caminho === "") return { pagina: s.site, variacao: "/" };
  if (!/^\/[A-Za-z0-9_-]{1,30}$/.test(caminho)) return null;
  return { pagina: s.site, variacao: caminho };
}

/** Endereço que vai no anúncio (com os parâmetros dinâmicos da Meta). */
export function urlDoAnuncio(urlBase: string, variacao: string | null): string {
  const caminho = !variacao || variacao === "/" ? "/" : variacao;
  return `${urlBase}${caminho}?utm_source={{adset.name}}|{{ad.name}}&utm_campaign={{campaign.name}}&utm_content=CÓDIGO`;
}

export function montarDesempenho(registros: Registro[], historico: Historico[], meta: MetaDia[], leads: LeadsAnuncio[]): Desempenho {
  const porNome = new Map(registros.map((r) => [chave(r.nome), r]));
  const hist = new Map<string, Historico[]>();
  for (const h of [...historico].sort((a, b) => a.desde.localeCompare(b.desde))) {
    const k = chave(h.nome);
    hist.set(k, [...(hist.get(k) ?? []), h]);
  }
  // Destino com mais leads de cada anúncio (para dias sem registro)
  const leadsPorAnuncio = new Map<string, LeadsAnuncio[]>();
  for (const l of leads) {
    if (!l.anuncio || l.site === "—") continue;
    const k = chave(l.anuncio);
    leadsPorAnuncio.set(k, [...(leadsPorAnuncio.get(k) ?? []), l]);
  }
  const destinoPelosLeads = (k: string): string | null => {
    const ls = leadsPorAnuncio.get(k);
    if (!ls?.length) return null;
    const best = [...ls].sort((a, b) => b.leads - a.leads)[0];
    return destino(best.site, best.landing);
  };
  const destinoNoDia = (k: string, dia: string): string | null => {
    const hs = (hist.get(k) ?? []).filter((h) => h.pagina && diaLocal(h.desde) <= dia);
    const h = hs[hs.length - 1] ?? (hist.get(k) ?? []).find((x) => x.pagina); // antes do 1º registro: o 1º destino
    if (h?.pagina) return destino(NOME_SITE[h.pagina], h.variacao);
    return destinoPelosLeads(k);
  };

  const linhas = new Map<string, Linha>();
  const nomeExibido = new Map<string, string>();
  const linha = (anuncio: string, dest: string): Linha => {
    const k = `${chave(anuncio)}|${dest}`;
    let l = linhas.get(k);
    if (!l) {
      l = {
        anuncio: nomeExibido.get(chave(anuncio)) ?? anuncio, destino: dest, registrado: porNome.has(chave(anuncio)),
        investimento: 0, cliques: 0, visualizacoes: 0, leads: 0, qualificados: 0,
        conversao: null, taxaQualificados: null, cpl: null, cplQualificado: null,
      };
      linhas.set(k, l);
    }
    return l;
  };
  for (const r of registros) nomeExibido.set(chave(r.nome), r.nome);

  // Só anúncios registrados ou que trouxeram leads (o resto da conta da Meta não é captação)
  const relevantes = new Set([...porNome.keys(), ...leadsPorAnuncio.keys()]);
  for (const m of meta) {
    const k = chave(m.criativo);
    if (!relevantes.has(k)) continue;
    const dest = destinoNoDia(k, m.data);
    if (!dest) continue;
    const l = linha(m.criativo, dest);
    l.investimento += m.investimento;
    l.cliques += m.cliques;
    l.visualizacoes += m.visualizacoes;
  }
  for (const x of leads) {
    if (!x.anuncio || x.site === "—") continue;
    const l = linha(x.anuncio, destino(x.site, x.landing));
    l.leads += x.leads;
    l.qualificados += x.qualificados;
  }
  // Registrados sem nenhum dado ainda também aparecem
  for (const r of registros) if (r.pagina) linha(r.nome, destino(NOME_SITE[r.pagina], r.variacao));

  const todas = [...linhas.values()].map((l) => ({
    ...l,
    conversao: l.visualizacoes > 0 ? l.leads / l.visualizacoes : null,
    taxaQualificados: l.visualizacoes > 0 ? l.qualificados / l.visualizacoes : null,
    cpl: l.investimento > 0 && l.leads > 0 ? l.investimento / l.leads : null,
    cplQualificado: l.investimento > 0 && l.qualificados > 0 ? l.investimento / l.qualificados : null,
  }));
  const disputa = (l: Linha) => l.conversao != null && l.visualizacoes >= MIN_VISUALIZACOES && l.leads >= MIN_LEADS;

  const melhorPorAnuncio = new Map<string, string>();
  const porAnuncio = new Map<string, Linha[]>();
  for (const l of todas) porAnuncio.set(chave(l.anuncio), [...(porAnuncio.get(chave(l.anuncio)) ?? []), l]);
  for (const [k, ls] of porAnuncio) {
    const best = ls.filter(disputa).sort((a, b) => b.conversao! - a.conversao!)[0];
    if (best) melhorPorAnuncio.set(k, best.destino);
  }
  const melhorPorDestino: Desempenho["melhorPorDestino"] = [];
  const porDestino = new Map<string, Linha[]>();
  for (const l of todas) porDestino.set(l.destino, [...(porDestino.get(l.destino) ?? []), l]);
  for (const [dest, ls] of porDestino) {
    const best = ls.filter(disputa).sort((a, b) => b.conversao! - a.conversao!)[0];
    if (best) melhorPorDestino.push({ destino: dest, anuncio: best.anuncio, conversao: best.conversao! });
  }

  const ordemDestino = (d: string) => {
    const i = SITES.findIndex((s) => d.startsWith(s.nome));
    return i < 0 ? 9 : i;
  };
  todas.sort((a, b) => a.anuncio.localeCompare(b.anuncio, undefined, { numeric: true }) || ordemDestino(a.destino) - ordemDestino(b.destino) || a.destino.localeCompare(b.destino, undefined, { numeric: true }));
  melhorPorDestino.sort((a, b) => ordemDestino(a.destino) - ordemDestino(b.destino) || a.destino.localeCompare(b.destino, undefined, { numeric: true }));
  return { linhas: todas, melhorPorAnuncio, melhorPorDestino };
}
