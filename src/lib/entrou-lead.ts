/**
 * Abas "👤 Entrou Lead | Geral / Trader / Unificado" da planilha "Dados Diciembre", no formato do modelo
 * da gestora de tráfego (Paola, 26/10/2026). Uma linha por ENVIO do formulário (não por pessoa), igual às
 * planilhas das páginas, com as UTMs separadas:
 *   utm_source = "Conjunto|Anúncio"      → Source | Content
 *   utm_medium = "Posicionamento|Campanha" → Medium | Campaña (nome completo)
 *   utm_term   = "Anúncio|AD ID"          → Term (inteiro) | AD ID
 *   utm_campaign → Campaña (curta) · utm_content → Anuncio (curto)
 * Status General: Cualificado / No Cualificado / No registrado (sem respostas). Trader: Trader / Nunca.
 * Grupo General: "OK" se entrou no grupo do WhatsApp. Trader: TRUE/FALSE (clicou em "unirme al grupo").
 * Origem: Tráfego (veio de anúncio, tem UTM) ou Orgânico. Puro — tests/entrou-lead.test.ts.
 */
import { qualificaEsperado } from "./testes-casos";

export type Envio = {
  id: number | string;
  criado_em: string;
  telefone: string | null;
  telefone_chave: string | null;
  email: string | null;
  pagina_captura: string | null; // "trader" | "nunca_operou"
  pc: string | null; // o que a página mandou: "Gen-Uruguay", "Jub-Argentina", "Trader-Argentina /v2"…
  experiencia: string | null;
  landing: string | null;
  pagina_obrigado: string | null;
  faixa_etaria: string | null;
  genero: string | null;
  resposta_dinheiro: string | null;
  qualificado: boolean | null;
  clicou_grupo_em: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
};

export const CAB_GERAL = ["Data", "Hora", "Telefono", "País", "Edad", "Genero", "Respuesta", "Campaña", "Anuncio ", "Campaña", "Source", "Medium",
  "Content", "Term", "AD ID", "Status", "Grupo", "Origem", "Email", "Pag Captura", "Landing", "Video", "Pag Gracias"];
export const CAB_TRADER = ["Data", "Hora", "Telefono", "País", "Experiencia", "Campaña", "Anuncio ", "Campaña", "Source", "Medium", "Content", "Term",
  "AD ID", "Status", "Grupo", "Origem", "Lading", "Pag Gracias"];
export const CAB_UNIFICADO = ["Data  ", "Hora", "Telefono", "País", "Idade", "Genero", "Respuesta", "Campaña", "Anuncio ", "Campaña", "Source",
  "Medium", "Content", "Term", "AD ID", "Status", "Grupo", "Origem"];

/** Coluna do ID (bem longe das colunas de fórmulas/estatísticas que a Paola usa ao lado dos dados). */
export const COL_ID = 60; // BH

const DDI: [string, string, string][] = [
  ["598", "Uruguay", "UY"], ["54", "Argentina", "AR"], ["56", "Chile", "CL"], ["55", "Brasil", "BR"], ["595", "Paraguay", "PY"],
  ["593", "Ecuador", "EC"], ["591", "Bolivia", "BO"], ["57", "Colombia", "CO"], ["52", "México", "MX"], ["51", "Perú", "PE"],
  ["58", "Venezuela", "VE"], ["34", "España", "ES"], ["1", "Estados Unidos", "US"],
];

/** País pelo DDI do telefone (nome em espanhol e código). */
export function paisDe(telefone: string | null | undefined): { nome: string; codigo: string | null } {
  const t = String(telefone ?? "").replace(/\D/g, "");
  const p = [...DDI].sort((a, b) => b[0].length - a[0].length).find(([d]) => t.startsWith(d));
  return p ? { nome: p[1], codigo: p[2] } : { nome: t ? "Otro" : "", codigo: null };
}

/** "A|B" → [A, B] (sem "|" → [tudo, ""]). */
export function partes(v: string | null | undefined): [string, string] {
  const s = String(v ?? "").trim();
  const i = s.indexOf("|");
  return i < 0 ? [s, ""] : [s.slice(0, i).trim(), s.slice(i + 1).trim()];
}

export function utms(e: Envio) {
  const [source, content] = partes(e.utm_source);
  const [medium, campanha] = partes(e.utm_medium);
  const [, adId] = partes(e.utm_term);
  return {
    campanhaCurta: String(e.utm_campaign ?? ""), anuncioCurto: String(e.utm_content ?? ""), campanha, source, medium, content,
    term: String(e.utm_term ?? ""), adId,
  };
}

export const origem = (e: Envio) => (String(e.utm_source ?? "").trim() || String(e.utm_campaign ?? "").trim() ? "Tráfego" : "Orgânico");

/** General: a decisão gravada (clique no grupo); sem ela, a regra pelas respostas; sem respostas, "No registrado". */
export function statusGeral(e: Envio): string {
  if (e.qualificado === true) return "Cualificado";
  if (e.qualificado === false) return "No Cualificado";
  if (!e.resposta_dinheiro) return "No registrado";
  return qualificaEsperado(paisDe(e.telefone).codigo, e.resposta_dinheiro, e.genero, e.faixa_etaria) ? "Cualificado" : "No Cualificado";
}

export const statusTrader = (e: Envio) => (String(e.experiencia ?? "").toLowerCase().startsWith("nunca") ? "Nunca" : "Trader");

/** "2026-10-26T21:06:00Z" → ["26/10/2026", "18:06"] (hora do Uruguai). */
export function dataHoraCurta(iso: string): [string, string] {
  const p = new Intl.DateTimeFormat("es-UY", {
    timeZone: "America/Montevideo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(iso));
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return [`${v("day")}/${v("month")}/${v("year")}`, `${v("hour")}:${v("minute")}`];
}

const idDe = (e: Envio) => `i${e.id}`;

/** Linha da aba Geral (+ ID na coluna COL_ID). `noGrupo` = telefones que entraram no grupo do WhatsApp. */
export function linhaGeral(e: Envio, noGrupo: Set<string>): string[] {
  const [data, hora] = dataHoraCurta(e.criado_em);
  const u = utms(e);
  return [
    data, hora, String(e.telefone ?? ""), paisDe(e.telefone).nome, String(e.faixa_etaria ?? ""), String(e.genero ?? ""), String(e.resposta_dinheiro ?? ""),
    u.campanhaCurta, u.anuncioCurto, u.campanha, u.source, u.medium, u.content, u.term, u.adId,
    statusGeral(e), noGrupo.has(String(e.telefone_chave ?? "")) ? "OK" : "", origem(e),
    String(e.email ?? ""), String(e.pc ?? ""), String(e.landing ?? ""), "Video1", String(e.pagina_obrigado ?? ""),
    idDe(e),
  ];
}

export function linhaTrader(e: Envio): (string | boolean)[] {
  const [data, hora] = dataHoraCurta(e.criado_em);
  const u = utms(e);
  return [
    data, hora, String(e.telefone ?? ""), paisDe(e.telefone).nome, String(e.experiencia ?? ""),
    u.campanhaCurta, u.anuncioCurto, u.campanha, u.source, u.medium, u.content, u.term, u.adId,
    statusTrader(e), !!e.clicou_grupo_em, origem(e), String(e.pc ?? ""), String(e.pagina_obrigado ?? ""),
    idDe(e),
  ];
}

export function linhaUnificado(e: Envio, noGrupo: Set<string>): (string | boolean)[] {
  const trader = e.pagina_captura === "trader";
  const [data, hora] = dataHoraCurta(e.criado_em);
  const u = utms(e);
  return [
    data, hora, String(e.telefone ?? ""), paisDe(e.telefone).nome,
    trader ? "" : String(e.faixa_etaria ?? ""), trader ? "" : String(e.genero ?? ""), trader ? String(e.experiencia ?? "") : String(e.resposta_dinheiro ?? ""),
    u.campanhaCurta, u.anuncioCurto, u.campanha, u.source, u.medium, u.content, u.term, u.adId,
    trader ? statusTrader(e) : statusGeral(e),
    trader ? !!e.clicou_grupo_em : noGrupo.has(String(e.telefone_chave ?? "")) ? "OK" : "",
    origem(e),
    idDe(e),
  ];
}

/** As três abas, no formato de blocos do planilha/unificada.gs (dados a partir de A; ID na COL_ID). */
export function abasEntrouLead(envios: Envio[], noGrupo: Set<string>) {
  const ord = [...envios].sort((a, b) => a.criado_em.localeCompare(b.criado_em));
  const geral = ord.filter((e) => e.pagina_captura !== "trader");
  const trader = ord.filter((e) => e.pagina_captura === "trader");
  return {
    "👤 Entrou Lead | Geral": { blocos: [{ col: 1, cab: CAB_GERAL }, { col: COL_ID, cab: ["ID"] }], linhas: geral.map((e) => linhaGeral(e, noGrupo)) },
    "👤 Entrou Lead | Trader": { blocos: [{ col: 1, cab: CAB_TRADER }, { col: COL_ID, cab: ["ID"] }], linhas: trader.map(linhaTrader) },
    "👤 Entrou Lead | Unificado": { blocos: [{ col: 1, cab: CAB_UNIFICADO }, { col: COL_ID, cab: ["ID"] }], linhas: ord.map((e) => linhaUnificado(e, noGrupo)) },
  };
}
