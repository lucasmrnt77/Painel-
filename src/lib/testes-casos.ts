/**
 * Casos dos testes automáticos dos eventos da Meta (puro — sem servidor).
 *
 * A regra esperada é escrita de novo aqui, direto do mapa do funil (22/10/2026),
 * sem importar o código do serviço de tracking. Assim, se alguém mudar a regra
 * lá sem querer, o teste diário pega.
 *
 * General — "Lead Qualificado":
 *   • Argentina: "Sí" qualifica todos; "No hoy" qualifica homens até 64 anos
 *     (menor de 25 a 55–64) e mulheres de 35 a 44.
 *   • Uruguai: "Sí" ou "No hoy" qualificam todos. Outros países (desde 23/10): a regra da Argentina.
 *   • "Imposible" ou sem resposta nunca qualifica.
 * Trader — "Lead Trader Qualificado" para quem já opera (inclusive menos de 3 meses);
 *   "Nunca hice" não; sem a experiência informada, qualifica.
 * Lead — "Lead General" / "Lead Trader" para todos.
 */

import { montar, type Modelos } from "./modelos-alertas";
import type { T } from "./i18n";

export type CorpoEvento = {
  landing: string;
  acao: string;
  telefone?: string;
  pais_geo?: string;
  idade?: string | null;
  genero?: string | null;
  resposta?: string | null;
  email?: string;
  experiencia?: string;
};

export type Caso = {
  grupo: string;
  nome: string;
  corpo: CorpoEvento;
  /** Resposta esperada do serviço */
  http: number;
  evento: string | null;
  qualificado: boolean | null;
};

/** Início e tamanho dos telefones de teste por país (o DDI decide o país na regra). */
export const TELEFONES_TESTE: Record<string, { prefixo: string; tamanho: number }> = {
  AR: { prefixo: "54911", tamanho: 13 },
  UY: { prefixo: "5989", tamanho: 11 },
  BR: { prefixo: "5511", tamanho: 13 },
  MX: { prefixo: "52155", tamanho: 13 },
};

/**
 * Um telefone de teste NOVO a cada uso (mesmo país, dígitos sorteados).
 * Antes eram 4 números fixos repetidos em ~50 eventos por dia, e a Meta acusava
 * "números de telefone duplicados" (>50% dos Lead Qualificado da API de Conversões).
 */
export function telTeste(pais: string): string {
  const t = TELEFONES_TESTE[pais] ?? TELEFONES_TESTE["UY"];
  let s = t.prefixo;
  while (s.length < t.tamanho) s += String(Math.floor(Math.random() * 10));
  return s;
}

const SI = ["si_puedo", "Sí, podría hacerlo sin problema"];
const NO_HOY = ["no_pero_podria", "No hoy, pero podría organizarme para conseguirlo"];
const HOMEM = ["hombre", "Masculino"];
const MULHER = ["mujer", "Femenino"];

/** Faixa pelo início do texto ("35_44", "35 a 44 años", "+65"…). */
function faixaDe(f: string | null | undefined): string | null {
  const t = (f ?? "").trim().toLowerCase();
  if (!t) return null;
  if (t.startsWith("menor")) return "menor_25";
  if (t.startsWith("mayor") || t.startsWith("+65") || t.startsWith("65")) return "mayor_65";
  for (const k of ["25_34", "35_44", "45_54", "55_64"]) if (t.startsWith(k.slice(0, 2))) return k;
  return null;
}

function resposta(r: string | null | undefined): "si" | "no_hoy" | "outra" {
  if (r && SI.includes(r)) return "si";
  if (r && NO_HOY.includes(r)) return "no_hoy";
  return "outra";
}

/** A regra oficial, reescrita a partir da especificação. */
export function qualificaEsperado(pais: string | null, r: string | null | undefined, genero: string | null | undefined, faixa: string | null | undefined): boolean {
  const x = resposta(r);
  if (x === "si") return true;
  if (x !== "no_hoy") return false;
  if (pais === "UY") return true; // Uruguai: "No hoy" qualifica todos; Argentina e os outros países seguem a regra da Argentina (23/10)
  const f = faixaDe(faixa);
  if (!f || !genero) return false;
  if (HOMEM.includes(genero)) return ["menor_25", "25_34", "35_44", "45_54", "55_64"].includes(f);
  if (MULHER.includes(genero)) return f === "35_44";
  return false;
}

const RESPOSTAS = ["si_puedo", "no_pero_podria", "no_imposible", null];
const FAIXAS = ["menor_25", "25_34", "35_44", "45_54", "55_64", "mayor_65", null];

const rotulo = (v: string | null | undefined) => v ?? "vazio";

function qualificacao(grupo: string, nome: string, pais: string | null, corpo: Omit<CorpoEvento, "landing" | "acao">): Caso {
  const q = qualificaEsperado(pais, corpo.resposta, corpo.genero, corpo.idade);
  return { grupo, nome, corpo: { landing: "general", acao: "qualificacao", ...corpo }, http: 200, evento: q ? "Lead Qualificado" : "Lead General Desqualificado", qualificado: q };
}

/** Todos os casos: 157 (mais 1 verificação de envio duplicado = 158). */
export function casosEventos(): Caso[] {
  const casos: Caso[] = [];

  // Argentina: todas as combinações de resposta × gênero × faixa (incluindo vazios)
  for (const r of RESPOSTAS) for (const g of ["hombre", "mujer", null]) for (const f of FAIXAS)
    casos.push(qualificacao("Argentina", `AR · ${rotulo(r)} · ${rotulo(g)} · ${rotulo(f)}`, "AR", { telefone: telTeste("AR"), idade: f, genero: g, resposta: r }));

  // Uruguai: gênero e idade não importam; BR/MX (outros países) seguem a regra da Argentina (23/10)
  for (const p of ["UY", "BR", "MX"]) for (const r of RESPOSTAS) for (const g of ["hombre", "mujer"]) for (const f of ["25_34", "mayor_65"])
    casos.push(qualificacao("Outros países", `${p} · ${rotulo(r)} · ${g} · ${f}`, p, { telefone: telTeste(p), idade: f, genero: g, resposta: r }));

  // País: o DDI do telefone vale mais que a geolocalização
  const pais: [string, string, string, string, string][] = [
    ["sem telefone, geo AR, mulher", "", "AR", "mujer", "AR"],
    ["sem telefone, geo AR, homem 45-54", "", "AR", "hombre", "AR"],
    ["sem telefone, geo CL, mulher", "", "CL", "mujer", "CL"],
    ["telefone UY vence geo AR", telTeste("UY"), "AR", "mujer", "UY"],
    ["telefone AR vence geo UY", telTeste("AR"), "UY", "mujer", "AR"],
  ];
  for (const [nome, tel, geo, genero, p] of pais)
    casos.push(qualificacao("País", nome, p, { telefone: tel, pais_geo: geo, idade: "45_54", genero, resposta: "no_pero_podria" }));

  // Respostas em texto (como aparecem na página), não só os códigos
  const textos: [string, string, string, string][] = [
    ["AR", "Sí, podría hacerlo sin problema", "Femenino", "25 a 34 años"],
    ["AR", "No hoy, pero podría organizarme para conseguirlo", "Masculino", "35 a 44 años"],
    ["AR", "No hoy, pero podría organizarme para conseguirlo", "Masculino", "+65"],
    ["AR", "No, hoy sería imposible", "Masculino", "45 a 54 años"],
    ["UY", "No hoy, pero podría organizarme para conseguirlo", "Femenino", "Menor de 25"],
  ];
  for (const [p, r, g, f] of textos)
    casos.push(qualificacao("Textos em espanhol", `${p} · "${r}" · ${g} · ${f}`, p, { telefone: telTeste(p), idade: f, genero: g, resposta: r }));

  // Trader e eventos de Lead
  casos.push({ grupo: "Trader e Lead", nome: "trader: qualificação com Imposible", corpo: { landing: "trader", acao: "qualificacao", telefone: telTeste("AR"), resposta: "no_imposible", genero: "mujer" }, http: 200, evento: "Lead Trader Qualificado", qualificado: true });
  casos.push({ grupo: "Trader e Lead", nome: "trader: qualificação sem dados", corpo: { landing: "trader", acao: "qualificacao", telefone: telTeste("BR") }, http: 200, evento: "Lead Trader Qualificado", qualificado: true });
  casos.push({ grupo: "Trader e Lead", nome: "trader: menos de 3 meses", corpo: { landing: "trader", acao: "qualificacao", telefone: telTeste("UY"), experiencia: "menos-3-meses" }, http: 200, evento: "Lead Trader Qualificado", qualificado: true });
  casos.push({ grupo: "Trader e Lead", nome: "trader: nunca operou", corpo: { landing: "trader", acao: "qualificacao", telefone: telTeste("AR"), experiencia: "nunca" }, http: 200, evento: "Lead Trader Desqualificado", qualificado: false });
  casos.push({ grupo: "Trader e Lead", nome: "Lead General", corpo: { landing: "general", acao: "lead", telefone: telTeste("UY"), email: "qa@teste.com" }, http: 200, evento: "Lead General", qualificado: null });
  casos.push({ grupo: "Trader e Lead", nome: "Lead Trader", corpo: { landing: "trader", acao: "lead", telefone: telTeste("MX") }, http: 200, evento: "Lead Trader", qualificado: null });

  // Jubilados (24/10): mesma regra da General, qualificado próprio; o lead continua "Lead General"
  casos.push({ grupo: "Jubilados", nome: "jubilados: Lead General", corpo: { landing: "jubilados", acao: "lead", telefone: telTeste("UY") }, http: 200, evento: "Lead General", qualificado: null });
  casos.push({ grupo: "Jubilados", nome: "jubilados: AR · si_puedo", corpo: { landing: "jubilados", acao: "qualificacao", telefone: telTeste("AR"), resposta: "si_puedo", genero: "hombre", idade: "mayor_65" }, http: 200, evento: "Lead Jubilado Qualificado", qualificado: true });
  casos.push({ grupo: "Jubilados", nome: "jubilados: UY · no_pero_podria · mujer · mayor_65", corpo: { landing: "jubilados", acao: "qualificacao", telefone: telTeste("UY"), resposta: "no_pero_podria", genero: "mujer", idade: "mayor_65" }, http: 200, evento: "Lead Jubilado Qualificado", qualificado: true });
  casos.push({ grupo: "General/Jubilados", nome: "genjub: Lead General", corpo: { landing: "genjub", acao: "lead", telefone: telTeste("AR") }, http: 200, evento: "Lead General", qualificado: null });
  casos.push({ grupo: "General/Jubilados", nome: "genjub: AR · si_puedo", corpo: { landing: "genjub", acao: "qualificacao", telefone: telTeste("AR"), resposta: "si_puedo", genero: "mujer", idade: "55_64" }, http: 200, evento: "Lead Qualificado GeneralJubilados", qualificado: true });
  casos.push({ grupo: "General/Jubilados", nome: "genjub: AR · no_pero_podria · mujer · 25_34", corpo: { landing: "genjub", acao: "qualificacao", telefone: telTeste("AR"), resposta: "no_pero_podria", genero: "mujer", idade: "25_34" }, http: 200, evento: "Lead Desqualificado GeneralJubilados", qualificado: false });
  casos.push({ grupo: "Jubilados", nome: "jubilados: AR · no_imposible", corpo: { landing: "jubilados", acao: "qualificacao", telefone: telTeste("AR"), resposta: "no_imposible", genero: "hombre", idade: "55_64" }, http: 200, evento: "Lead Jubilado Desqualificado", qualificado: false });

  // Entradas inválidas são recusadas
  casos.push({ grupo: "Inválidos", nome: "landing inválida", corpo: { landing: "xyz", acao: "lead" }, http: 400, evento: null, qualificado: null });
  casos.push({ grupo: "Inválidos", nome: "ação inválida", corpo: { landing: "general", acao: "compra" }, http: 400, evento: null, qualificado: null });

  return casos;
}

export type RespostaServico = { http: number; corpo: { ok?: boolean; evento?: string | null; qualificado?: boolean | null; event_id?: string; erro?: string } | null };

/** Compara a resposta do serviço com o esperado. Devolve o motivo da falha ou null. */
export function conferirResposta(c: Caso, eventId: string, r: RespostaServico): string | null {
  if (r.http !== c.http) return `HTTP ${r.http} (esperado ${c.http})`;
  if (c.http !== 200) return r.corpo?.ok === false ? null : "deveria ter sido recusado";
  if (!r.corpo?.ok) return `resposta sem ok (${r.corpo?.erro ?? "sem corpo"})`;
  if ((r.corpo.evento ?? null) !== c.evento) return `evento "${r.corpo.evento ?? "nenhum"}" (esperado "${c.evento ?? "nenhum"}")`;
  if ((r.corpo.qualificado ?? null) !== c.qualificado) return `qualificado=${r.corpo.qualificado} (esperado ${c.qualificado})`;
  if (r.corpo.event_id !== eventId) return "event_id devolvido diferente do enviado";
  return null;
}

export type RegistroEvento = { event_name: string; event_id: string; status: string; teste: boolean; meta_resposta: unknown };

/** Confere o que o serviço gravou: 1 linha por evento esperado, enviada e aceita pela Meta. */
export function conferirRegistros(esperados: { eventId: string; evento: string }[], registros: RegistroEvento[]): string[] {
  const falhas: string[] = [];
  const porId = new Map<string, RegistroEvento[]>();
  for (const r of registros) porId.set(r.event_id, [...(porId.get(r.event_id) ?? []), r]);
  for (const e of esperados) {
    const rs = porId.get(e.eventId) ?? [];
    if (rs.length === 0) { falhas.push(`${e.evento} ${e.eventId}: não foi registrado`); continue; }
    if (rs.length > 1) falhas.push(`${e.evento} ${e.eventId}: registrado ${rs.length} vezes (duplicado)`);
    const r = rs[0];
    if (r.event_name !== e.evento) falhas.push(`${e.eventId}: registrado como "${r.event_name}" (esperado "${e.evento}")`);
    if (!r.teste) falhas.push(`${e.eventId}: não foi marcado como teste`);
    if (r.status !== "enviado") {
      const erro = (r.meta_resposta as { erro?: unknown } | null)?.erro;
      falhas.push(`${e.evento} ${e.eventId}: status "${r.status}"${typeof erro === "string" ? ` (${erro})` : ""}`);
    }
    else if (Number((r.meta_resposta as { events_received?: unknown } | null)?.events_received) !== 1) falhas.push(`${e.evento} ${e.eventId}: Meta não confirmou o recebimento`);
  }
  const ids = new Set(esperados.map((e) => e.eventId));
  for (const r of registros) if (!ids.has(r.event_id)) falhas.push(`${r.event_name} ${r.event_id}: foi registrado mas não deveria (não qualificado ou inválido)`);
  return falhas;
}

// ---------------------------------------------------------------------
// Resultado de uma execução (servidor ou navegador)
// ---------------------------------------------------------------------

export const MAX_DETALHES = 50;

export type Falha = { teste: string; motivo: string };
export type Etapa = { nome: string; total: number; falhas: number };
export type Execucao = {
  id?: number;
  criado_em?: string;
  origem: "servidor" | "navegador";
  disparo: "agendado" | "manual";
  ok: boolean;
  total: number;
  falhas: number;
  duracao_ms: number | null;
  resumo: Etapa[];
  detalhes: Falha[];
  envio_status?: string | null;
};

export function mensagemTestes(e: Execucao, voltou: boolean, modelos?: Modelos): string {
  const onde = e.origem === "servidor" ? "servidor" : "navegador (pixel)";
  if (voltou) return montar("testes_voltaram", { onde, total: e.total }, modelos);
  const linhas = e.detalhes.slice(0, 8).map((f) => `• ${f.teste}: ${f.motivo}`);
  const resto = e.falhas > 8 ? `\n… e mais ${e.falhas - 8}` : "";
  return montar("testes_falharam", { onde, falhas: e.falhas, total: e.total, detalhes: `${linhas.join("\n")}${resto}` }, modelos);
}

/** Valida o resultado enviado pelo teste do navegador (GitHub Actions). */
export function lerResultadoNavegador(b: unknown): Execucao | null {
  if (!b || typeof b !== "object") return null;
  const o = b as Record<string, unknown>;
  const etapas = Array.isArray(o.resumo) ? o.resumo : [];
  const falhas = Array.isArray(o.detalhes) ? o.detalhes : [];
  const resumo: Etapa[] = etapas.slice(0, 30).flatMap((e) => {
    const x = e as Record<string, unknown>;
    return typeof x?.nome === "string" && Number.isInteger(x.total) && Number.isInteger(x.falhas)
      ? [{ nome: x.nome.slice(0, 200), total: Number(x.total), falhas: Number(x.falhas) }] : [];
  });
  const detalhes: Falha[] = falhas.slice(0, MAX_DETALHES).flatMap((f) => {
    const x = f as Record<string, unknown>;
    return typeof x?.teste === "string" ? [{ teste: x.teste.slice(0, 200), motivo: String(x.motivo ?? "").slice(0, 500) }] : [];
  });
  if (resumo.length === 0) return null;
  const total = resumo.reduce((s, e) => s + e.total, 0);
  const nFalhas = resumo.reduce((s, e) => s + e.falhas, 0);
  return {
    origem: "navegador", disparo: o.disparo === "manual" ? "manual" : "agendado",
    ok: nFalhas === 0, total, falhas: nFalhas,
    duracao_ms: Number.isInteger(o.duracao_ms) ? Number(o.duracao_ms) : null,
    resumo, detalhes,
  };
}

// ---------------------------------------------------------------------
// Exibição no painel (tradução). Os textos gravados e enviados nos alertas
// continuam em português; aqui só se traduz o que aparece na tela.
// ---------------------------------------------------------------------

/** Textos montados com partes que também precisam de tradução (a, b, c = grupos do regex). */
const COMPOSTOS: [RegExp, string, boolean[]][] = [
  [/^Não consegui consultar a Meta: (.+)$/, "Não consegui consultar a Meta: {a}", [true]],
  [/^A Meta recusou a consulta de qualidade: (.+)$/, "A Meta recusou a consulta de qualidade: {a}", [true]],
  [/^Volume das últimas 24 h indisponível: (.+)$/, "Volume das últimas 24 h indisponível: {a}", [true]],
  [/^resposta sem ok \((.*)\)$/, "resposta sem ok ({a})", [true]],
  [/^evento "(.*)" \(esperado "(.*)"\)$/, 'evento "{a}" (esperado "{b}")', [true, true]],
  [/^Meta não confirmou o evento do servidor \((.*)\)$/, "Meta não confirmou o evento do servidor ({a})", [true]],
  [/^servidor devolveu "(.*)"$/, 'servidor devolveu "{a}"', [true]],
  [/^([^:]+): (.+)$/, "{a}: {b}", [true, true]],
];

/** Traduz nomes de teste, motivos de falha e problemas/avisos da Meta para exibir. */
export function traduzirDetalhe(t: T, s: string): string {
  if (!s) return s;
  const direto = t(s);
  if (direto !== s) return direto;
  for (const [re, chave, traduzir] of COMPOSTOS) {
    const m = s.match(re);
    if (!m) continue;
    const vars: Record<string, string> = {};
    traduzir.forEach((tr, i) => { vars["abc"[i]] = tr ? traduzirDetalhe(t, m[i + 1]) : m[i + 1]; });
    return t(chave, vars);
  }
  if (s.includes(" · ")) return s.split(" · ").map((p) => traduzirDetalhe(t, p)).join(" · ");
  return s;
}
