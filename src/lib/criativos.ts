/**
 * Criativos → página (Trader, General, Jubilar) e o ranking de variação × país.
 * Funções puras (sem banco) — testadas em tests/criativos.test.ts.
 */

export type Site = "general" | "trader" | "jubilar";
export const SITES: { site: Site; nome: string }[] = [
  { site: "general", nome: "General" },
  { site: "jubilar", nome: "Jubilar" },
  { site: "trader", nome: "Trader" },
];
export const PAISES = ["AR", "UY", "CL", "Outros"] as const;
export type PaisGrupo = (typeof PAISES)[number];
export const NOME_PAIS: Record<PaisGrupo, string> = { AR: "Argentina", UY: "Uruguai", CL: "Chile", Outros: "Outros países" };

/** Site da visita: o que a página informou ou, sem isso, o domínio de origem. */
export function siteDaVisita(informado: unknown, origem: string): Site {
  const s = typeof informado === "string" ? informado.toLowerCase() : "";
  if (s === "jubilar" || /eventojub|jubilar\./.test(origem)) return "jubilar";
  if (s === "trader" || /eventotra|trader\./.test(origem)) return "trader";
  return "general";
}

/**
 * Chaves para achar o criativo de um clique: o nome do anúncio (depois do "|" do utm_source, como os anúncios
 * mandam "conjunto|anúncio"), o utm_content e um ad_name, se vier. A primeira que existir na tabela vence.
 */
export function chavesDoClique(p: URLSearchParams): string[] {
  const chaves: string[] = [];
  const add = (v: string | null | undefined) => {
    const t = (v ?? "").trim();
    if (t && t.length <= 200 && !chaves.some((c) => c.toLowerCase() === t.toLowerCase())) chaves.push(t);
  };
  add(p.get("ad_name"));
  const fonte = p.get("utm_source") ?? "";
  if (fonte.includes("|")) add(fonte.slice(fonte.lastIndexOf("|") + 1));
  add(p.get("utm_content"));
  return chaves;
}

/** Página pelo prefixo do nome do anúncio — igual à função pagina_do_criativo do banco. */
export function paginaPeloNome(nome: string): Site | null {
  if (/^\s*\[(jg|jub[a-z]*)\]/i.test(nome)) return "jubilar";
  if (/^\s*\[t\]/i.test(nome)) return "trader";
  if (/^\s*\[g\]/i.test(nome)) return "general";
  return null;
}

/** Variação da página: "/" (principal), "/v1", "/v2"… */
export const VARIACAO = /^\/([A-Za-z0-9_-]{1,30})?$/;

// ── Ranking variação × país ─────────────────────────────────────────────────────────────────────

export type LinhaPais = { site: string; landing: string; pais: PaisGrupo; visitas: number; leads: number; qualificados: number };
export type Gasto = { criativo: string; pais: string; investimento: number };
export type CriativoMapa = { nome: string; pagina: Site | null; variacao: string | null };

export type Celula = {
  visitas: number; leads: number; qualificados: number;
  gasto: number | null; // estimado quando o criativo não tem variação fixa
  taxaInscricao: number | null; // leads ÷ visitas
  taxaQualificados: number | null; // qualificados ÷ visitas
  cpl: number | null; // gasto ÷ leads
  cplQualificado: number | null; // gasto ÷ qualificados
};
export type Melhor = { taxaInscricao: string | null; taxaQualificados: string | null; cpl: string | null };
export type RankingSite = {
  site: string;
  variacoes: string[];
  celulas: Record<string, Partial<Record<PaisGrupo, Celula>>>; // variação → país → números
  melhor: Partial<Record<PaisGrupo, Melhor>>;
  /** "/v2 — Argentina e Uruguai" pela taxa de inscrição */
  resumo: { variacao: string; paises: PaisGrupo[] }[];
  gastoSemVariacao: boolean;
};

/** Mínimos para uma variação disputar o "melhor" (evita vencer com 3 visitas). */
export const MIN_VISITAS = 30;
export const MIN_LEADS_CPL = 5;

export function paisDoGasto(p: string): PaisGrupo {
  const t = p.trim().toUpperCase();
  return t === "AR" || t === "UY" || t === "CL" ? t : "Outros";
}

const NOME_SITE: Record<Site, string> = { general: "General", trader: "Trader", jubilar: "Jubilar" };

/** Variações no padrão (/, /v1, /v2…) primeiro, na ordem do número. */
function ordemVariacao(a: string, b: string) {
  const peso = (s: string) => (s === "/" ? 0 : /^\/v\d+$/.test(s) ? 1 : s.startsWith("(") ? 3 : 2);
  return peso(a) - peso(b) || a.localeCompare(b, undefined, { numeric: true });
}

export function montarRanking(linhas: LinhaPais[], gastos: Gasto[], criativos: CriativoMapa[]): RankingSite[] {
  const mapa = new Map(criativos.map((c) => [c.nome.trim().toLowerCase(), c]));
  // Gasto por site × país × variação (null = sem variação fixa → divide pelas visitas)
  const gasto = new Map<string, number>();
  const chave = (site: string, pais: PaisGrupo, variacao: string | null) => `${site}|${pais}|${variacao ?? ""}`;
  for (const g of gastos) {
    const c = mapa.get(g.criativo.trim().toLowerCase());
    const pagina = c?.pagina ?? paginaPeloNome(g.criativo);
    if (!pagina || !(g.investimento > 0)) continue;
    const k = chave(NOME_SITE[pagina], paisDoGasto(g.pais), c?.variacao ?? null);
    gasto.set(k, (gasto.get(k) ?? 0) + g.investimento);
  }
  const temGasto = gasto.size > 0;

  const saida: RankingSite[] = [];
  const sites = [...new Set(linhas.map((l) => l.site))].filter((s) => s !== "—");
  for (const site of sites) {
    const ls = linhas.filter((l) => l.site === site);
    const variacoes = [...new Set(ls.map((l) => l.landing))].sort(ordemVariacao);
    const celulas: RankingSite["celulas"] = {};
    let gastoSemVariacao = false;
    for (const pais of PAISES) {
      const doPais = ls.filter((l) => l.pais === pais);
      const totVisitas = doPais.reduce((t, l) => t + l.visitas, 0);
      const totLeads = doPais.reduce((t, l) => t + l.leads, 0);
      const semVar = gasto.get(chave(site, pais, null)) ?? 0;
      if (semVar > 0) gastoSemVariacao = true;
      for (const l of doPais) {
        // Gasto sem variação fixa: divide pela participação nas visitas (ou nos leads, sem visitas)
        const parte = totVisitas > 0 ? l.visitas / totVisitas : totLeads > 0 ? l.leads / totLeads : 0;
        const g = temGasto ? semVar * parte + (gasto.get(chave(site, pais, l.landing)) ?? 0) : null;
        (celulas[l.landing] ??= {})[pais] = {
          visitas: l.visitas, leads: l.leads, qualificados: l.qualificados, gasto: g,
          taxaInscricao: l.visitas > 0 ? l.leads / l.visitas : null,
          taxaQualificados: l.visitas > 0 ? l.qualificados / l.visitas : null,
          cpl: g != null && g > 0 && l.leads > 0 ? g / l.leads : null,
          cplQualificado: g != null && g > 0 && l.qualificados > 0 ? g / l.qualificados : null,
        };
      }
    }
    const melhor: RankingSite["melhor"] = {};
    for (const pais of PAISES) {
      const cands = variacoes.map((v) => ({ v, c: celulas[v]?.[pais] })).filter((x): x is { v: string; c: Celula } => !!x.c);
      const maior = (f: (c: Celula) => number | null, ok: (c: Celula) => boolean) => {
        let best: { v: string; n: number } | null = null;
        for (const { v, c } of cands) {
          const n = f(c);
          if (n == null || !ok(c)) continue;
          if (!best || n > best.n) best = { v, n };
        }
        return best?.v ?? null;
      };
      const m: Melhor = {
        taxaInscricao: maior((c) => c.taxaInscricao, (c) => c.visitas >= MIN_VISITAS),
        taxaQualificados: maior((c) => c.taxaQualificados, (c) => c.visitas >= MIN_VISITAS),
        cpl: maior((c) => (c.cpl == null ? null : -c.cpl), (c) => c.leads >= MIN_LEADS_CPL),
      };
      if (m.taxaInscricao || m.taxaQualificados || m.cpl) melhor[pais] = m;
    }
    const porVariacao = new Map<string, PaisGrupo[]>();
    for (const pais of PAISES) {
      const v = melhor[pais]?.taxaInscricao;
      if (v) porVariacao.set(v, [...(porVariacao.get(v) ?? []), pais]);
    }
    const resumo = [...porVariacao.entries()].map(([variacao, paises]) => ({ variacao, paises })).sort((a, b) => ordemVariacao(a.variacao, b.variacao));
    saida.push({ site, variacoes, celulas, melhor, resumo, gastoSemVariacao });
  }
  const ordemSite = (s: string) => (s === "General" ? 0 : s === "Jubilar" ? 1 : s === "Trader" ? 2 : 3);
  return saida.sort((a, b) => ordemSite(a.site) - ordemSite(b.site));
}

/** "Argentina e Uruguai" / "Argentina, Uruguai e Chile" */
export function listaPaises(ps: PaisGrupo[], nomes: Record<PaisGrupo, string> = NOME_PAIS, e = "e"): string {
  const n = ps.map((p) => nomes[p]);
  return n.length <= 1 ? n.join("") : `${n.slice(0, -1).join(", ")} ${e} ${n[n.length - 1]}`;
}
