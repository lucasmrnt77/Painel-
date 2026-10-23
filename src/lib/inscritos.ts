/**
 * Aba Inscritos: todas as inscrições do lançamento, separadas por página (General, Trader, Jubilados,
 * Gen-Jubilados), variação e país, com tudo o que a pessoa preencheu. Funções puras — tests/inscritos.test.ts.
 */
import type { Periodo } from "./periodo";

/** Páginas (o nome que o banco grava em v_leads.site) e o rótulo da aba. */
export const SITES_INSCRITOS = [
  { site: "General", rotulo: "General" },
  { site: "Trader", rotulo: "Trader" },
  { site: "Jubilar", rotulo: "Jubilados" },
  { site: "Gen-Jubilados", rotulo: "Gen-Jubilados" },
] as const;

export const VARIACOES_INSCRITOS = ["/", "/v1", "/v2", "/v3", "/v4", "/v5", "/v6"] as const;

/** País pelo DDI do WhatsApp (o mesmo critério da planilha "Pagina_captura"). */
export const PAISES_INSCRITOS = [
  { valor: "UY", rotulo: "Uruguai", prefixo: "598" },
  { valor: "AR", rotulo: "Argentina", prefixo: "54" },
  { valor: "CL", rotulo: "Chile", prefixo: "56" },
  { valor: "BR", rotulo: "Brasil", prefixo: "55" },
] as const;

export function paisDoTelefone(tel: string | null | undefined): string {
  const t = (tel ?? "").replace(/\D/g, "");
  const p = PAISES_INSCRITOS.find((x) => t.startsWith(x.prefixo));
  return p ? p.rotulo : t ? "Outro" : "—";
}

export const rotuloSite = (site: string | null | undefined) =>
  SITES_INSCRITOS.find((s) => s.site === site)?.rotulo ?? (site && site !== "—" ? site : "—");

/** Variação a partir do landing gravado: "/v2" → "/v2"; "/" → "principal"; nomes antigos ("Trader-XX") como vieram. */
export function rotuloVariacao(landing: string | null | undefined): string {
  if (!landing) return "—";
  if (landing === "/") return "principal";
  return landing;
}

/** utm_source dos anúncios vem como "conjunto|anúncio". */
export function conjuntoEAnuncio(utmSource: string | null | undefined): { conjunto: string | null; anuncio: string | null } {
  const s = (utmSource ?? "").trim();
  if (!s) return { conjunto: null, anuncio: null };
  const i = s.lastIndexOf("|");
  return i < 0 ? { conjunto: s, anuncio: null } : { conjunto: s.slice(0, i) || null, anuncio: s.slice(i + 1) || null };
}

/** Período (dias no horário do Uruguai, UTC−3) → limites em UTC para filtrar inscrito_em. */
export function limitesUtc(p: Periodo): { desde: string | null; antes: string | null } {
  const mais1 = (d: string) => {
    const x = new Date(`${d}T00:00:00Z`);
    x.setUTCDate(x.getUTCDate() + 1);
    return x.toISOString().slice(0, 10);
  };
  return {
    desde: p.de ? `${p.de}T03:00:00Z` : null,
    antes: p.ate ? `${mais1(p.ate)}T03:00:00Z` : null,
  };
}

/** Uma inscrição (linha de `inscricoes`) — o que não está na v_leads. */
export type Envio = {
  telefone_chave: string | null;
  criado_em: string;
  qualificado: boolean | null;
  clicou_grupo_em: string | null;
  origem: string | null; // o que a página mandou em pagina_captura ("Trader-Uruguay /v2", "Gen-Argentina")
  pagina_obrigado: string | null;
};

export type Extra = { qualificado: boolean | null; clicouEm: string | null; origem: string | null; gracias: string | null };

/**
 * Junta os envios de cada pessoa: calificado = a decisão mais recente; clique no grupo = o primeiro;
 * origem e gracias = do envio mais recente que tiver.
 */
export function juntarEnvios(envios: Envio[]): Map<string, Extra> {
  const porPessoa = new Map<string, Envio[]>();
  for (const e of envios) {
    if (!e.telefone_chave) continue;
    porPessoa.set(e.telefone_chave, [...(porPessoa.get(e.telefone_chave) ?? []), e]);
  }
  const out = new Map<string, Extra>();
  for (const [k, es] of porPessoa) {
    const rec = [...es].sort((a, b) => b.criado_em.localeCompare(a.criado_em));
    const cliques = es.map((e) => e.clicou_grupo_em).filter((c): c is string => !!c).sort();
    out.set(k, {
      qualificado: rec.find((e) => e.qualificado != null)?.qualificado ?? null,
      clicouEm: cliques[0] ?? null,
      origem: rec.find((e) => e.origem)?.origem ?? null,
      gracias: rec.find((e) => e.pagina_obrigado)?.pagina_obrigado ?? null,
    });
  }
  return out;
}

/** Resumo por página × variação: visitas, inscrições, cliques no grupo, calificados e as taxas. */
export type LinhaResumo = {
  site: string;
  landing: string;
  visitas: number;
  inscricoes: number;
  cliquesGrupo: number;
  calificados: number;
  conversao: number | null; // inscrições ÷ visitas
  taxaClique: number | null; // cliques no grupo ÷ inscrições
  taxaCalificados: number | null; // calificados ÷ inscrições
};

const ORDEM_SITE = SITES_INSCRITOS.map((s) => s.site as string);
const ordemLanding = (l: string) => (l === "/" ? 0 : /^\/v\d+$/.test(l) ? Number(l.slice(2)) : 100);

export function montarResumo(
  landings: { site: string; landing: string; visitas: number; leads: number }[],
  teste: { site: string; landing: string; leads: number; leadsQualificados: number }[],
  site?: string,
): LinhaResumo[] {
  const m = new Map<string, LinhaResumo>();
  const linha = (s: string, l: string) => {
    const k = `${s}|${l}`;
    let r = m.get(k);
    if (!r) {
      r = { site: s, landing: l, visitas: 0, inscricoes: 0, cliquesGrupo: 0, calificados: 0, conversao: null, taxaClique: null, taxaCalificados: null };
      m.set(k, r);
    }
    return r;
  };
  for (const x of landings) {
    const r = linha(x.site, x.landing);
    r.visitas += x.visitas;
    r.inscricoes += x.leads;
  }
  for (const x of teste) {
    const r = linha(x.site, x.landing);
    r.cliquesGrupo += x.leads;
    r.calificados += x.leadsQualificados;
  }
  const razao = (a: number, b: number) => (b > 0 ? a / b : null);
  return [...m.values()]
    .filter((r) => (!site || r.site === site) && r.site !== "—" && (r.visitas || r.inscricoes))
    .map((r) => ({ ...r, conversao: razao(r.inscricoes, r.visitas), taxaClique: razao(r.cliquesGrupo, r.inscricoes), taxaCalificados: razao(r.calificados, r.inscricoes) }))
    .sort((a, b) => {
      const sa = ORDEM_SITE.indexOf(a.site), sb = ORDEM_SITE.indexOf(b.site);
      return (sa < 0 ? 99 : sa) - (sb < 0 ? 99 : sb) || ordemLanding(a.landing) - ordemLanding(b.landing) || a.landing.localeCompare(b.landing);
    });
}
