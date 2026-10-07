/**
 * Aba "Grupo gratuito": período e filtros lidos da URL. Fuso: Uruguai (UTC-3, sem horário de verão).
 * Funções puras (sem acesso ao banco) para poderem ser testadas.
 */
export const FUSO_GRUPO = "America/Montevideo";
const OFFSET = "-03:00";
export const BASE_GRUPO = "/grupo";

export const PERIODOS = [
  { valor: "hoje", rotulo: "Hoje" },
  { valor: "7d", rotulo: "7 dias" },
  { valor: "30d", rotulo: "30 dias" },
  { valor: "tudo", rotulo: "Tudo" },
] as const;
export type Periodo = (typeof PERIODOS)[number]["valor"];

export const DIMENSOES = [
  { chave: "pais", rotulo: "País" },
  { chave: "source", rotulo: "Origem (utm_source)" },
  { chave: "campaign", rotulo: "Campanha (utm_campaign)" },
  { chave: "content", rotulo: "Anúncio (utm_content)" },
] as const;
export type Dimensao = (typeof DIMENSOES)[number]["chave"];

export const SEM_VALOR: Record<Dimensao, string> = { pais: "(sem país)", source: "(sem UTM)", campaign: "(sem UTM)", content: "(sem UTM)" };
export const COLUNA: Record<Dimensao, string> = { pais: "pais", source: "utm_source", campaign: "utm_campaign", content: "utm_content" };

export type FiltrosGrupo = {
  periodo: Periodo;
  desde: string | null; // ISO
  ate: string | null;
  dims: Partial<Record<Dimensao, string>>;
  q: string;
  pagina: number;
};

/** "YYYY-MM-DD" de hoje no Uruguai. */
export function hojeUY(agora = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO_GRUPO, year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}

export function somarDias(dia: string, n: number) {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const inicioDoDia = (dia: string) => new Date(`${dia}T00:00:00${OFFSET}`).toISOString();

export function lerFiltrosGrupo(sp: Record<string, string | string[] | undefined>, agora = new Date()): FiltrosGrupo {
  const um = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) ?? "";
  const periodo = (PERIODOS.some((p) => p.valor === um("periodo")) ? um("periodo") : "7d") as Periodo;
  const hoje = hojeUY(agora);
  const desde =
    periodo === "hoje" ? inicioDoDia(hoje)
    : periodo === "7d" ? inicioDoDia(somarDias(hoje, -6))
    : periodo === "30d" ? inicioDoDia(somarDias(hoje, -29))
    : null;
  const dims: FiltrosGrupo["dims"] = {};
  for (const d of DIMENSOES) {
    const v = um(d.chave).trim().slice(0, 200);
    if (v) dims[d.chave] = v;
  }
  const q = um("q").replace(/[^\p{L}\p{N}@.+_-]/gu, "").slice(0, 80);
  const pagina = Math.max(1, Math.min(10_000, Number.parseInt(um("pagina"), 10) || 1));
  return { periodo, desde, ate: null, dims, q, pagina };
}

/** Parâmetros da URL (sem a base), trocando só alguns. */
export function paramsGrupo(f: FiltrosGrupo, mudar: Record<string, string | null> = {}) {
  const p = new URLSearchParams();
  p.set("periodo", f.periodo);
  for (const [k, v] of Object.entries(f.dims)) if (v) p.set(k, v);
  if (f.q) p.set("q", f.q);
  for (const [k, v] of Object.entries(mudar)) {
    if (v === null || v === "") p.delete(k);
    else p.set(k, v);
  }
  if (!("pagina" in mudar)) p.delete("pagina");
  return p.toString();
}

export const hrefGrupo = (f: FiltrosGrupo, mudar: Record<string, string | null> = {}) => `${BASE_GRUPO}?${paramsGrupo(f, mudar)}`;

/** Filtros do PostgREST para a lista/CSV (mesmos critérios do resumo). */
export function queryListaGrupo(f: FiltrosGrupo, colunas: string) {
  const q = new URLSearchParams();
  q.set("select", colunas);
  q.set("order", "creado_en.desc");
  if (f.desde) q.append("creado_en", `gte.${f.desde}`);
  if (f.ate) q.append("creado_en", `lt.${f.ate}`);
  for (const d of DIMENSOES) {
    const v = f.dims[d.chave];
    if (!v) continue;
    q.append(COLUNA[d.chave], v === SEM_VALOR[d.chave] ? "is.null" : `eq.${v}`);
  }
  if (f.q) {
    const digitos = f.q.replace(/\D/g, "");
    const partes = [`email.ilike.*${f.q}*`];
    if (digitos.length >= 3) partes.push(`telefono.like.*${digitos}*`);
    q.set("or", `(${partes.join(",")})`);
  }
  return q;
}

export function argsResumoGrupo(f: FiltrosGrupo) {
  return {
    p_desde: f.desde, p_ate: f.ate,
    p_pais: f.dims.pais ?? null, p_source: f.dims.source ?? null,
    p_campaign: f.dims.campaign ?? null, p_content: f.dims.content ?? null,
  };
}

/** "2026-10-05" → "05/10" (+ dia da semana opcional) */
export function diaCurto(dia: string, comSemana = false) {
  const d = new Date(`${dia}T12:00:00Z`);
  const base = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit" }).format(d);
  if (!comSemana) return base;
  const sem = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "short" }).format(d).replace(".", "");
  return `${sem} ${base}`;
}

/** "5491123456789" → "+54 91123456789" (só para leitura). */
export function telefoneComDdi(t: string) {
  const d = t.replace(/\D/g, "");
  const ddis = ["598", "595", "591", "593", "506", "503", "502", "504", "505", "507", "54", "55", "56", "57", "58", "51", "52", "34", "1"];
  const ddi = ddis.find((x) => d.startsWith(x));
  return ddi ? `+${ddi} ${d.slice(ddi.length)}` : `+${d}`;
}
