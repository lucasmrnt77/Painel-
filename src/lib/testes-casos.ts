/**
 * Casos dos testes automáticos dos eventos da Meta (puro — sem servidor).
 *
 * A regra esperada é escrita de novo aqui, direto da especificação do Emiliano
 * (02/10/2026), sem importar o código do serviço de tracking. Assim, se alguém
 * mudar a regra lá sem querer, o teste diário pega.
 *
 * General — "Lead Qualificado":
 *   • Argentina: "Sí" qualifica todos; "No hoy" só homens de 35 a 64.
 *   • Outros países: "Sí" ou "No hoy" qualificam todos.
 *   • "Imposible" ou sem resposta nunca qualifica.
 * Trader — toda qualificação gera "Lead Trader Qualificado".
 * Lead — "Lead General" / "Lead Trader" para todos.
 */

export type CorpoEvento = {
  landing: string;
  acao: string;
  telefone?: string;
  pais_geo?: string;
  idade?: string | null;
  genero?: string | null;
  resposta?: string | null;
  email?: string;
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

export const TELEFONES_TESTE: Record<string, string> = {
  AR: "5491100009001",
  UY: "59899009001",
  BR: "5511900009001",
  MX: "5215500009001",
};

const SI = ["si_puedo", "Sí, podría hacerlo sin problema"];
const NO_HOY = ["no_pero_podria", "No hoy, pero podría organizarme para conseguirlo"];
const HOMEM = ["hombre", "Masculino"];

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
  if (pais !== "AR") return true;
  const faixaOk = !!faixa && ["35", "45", "55"].some((p) => faixa.startsWith(p));
  return !!genero && HOMEM.includes(genero) && faixaOk;
}

const RESPOSTAS = ["si_puedo", "no_pero_podria", "no_imposible", null];
const FAIXAS = ["menor_25", "25_34", "35_44", "45_54", "55_64", "mayor_65", null];

const rotulo = (v: string | null | undefined) => v ?? "vazio";

function qualificacao(grupo: string, nome: string, pais: string | null, corpo: Omit<CorpoEvento, "landing" | "acao">): Caso {
  const q = qualificaEsperado(pais, corpo.resposta, corpo.genero, corpo.idade);
  return { grupo, nome, corpo: { landing: "general", acao: "qualificacao", ...corpo }, http: 200, evento: q ? "Lead Qualificado" : null, qualificado: q };
}

/** Todos os casos: 149 no total. */
export function casosEventos(): Caso[] {
  const casos: Caso[] = [];

  // Argentina: todas as combinações de resposta × gênero × faixa (incluindo vazios)
  for (const r of RESPOSTAS) for (const g of ["hombre", "mujer", null]) for (const f of FAIXAS)
    casos.push(qualificacao("Argentina", `AR · ${rotulo(r)} · ${rotulo(g)} · ${rotulo(f)}`, "AR", { telefone: TELEFONES_TESTE.AR, idade: f, genero: g, resposta: r }));

  // Outros países: gênero e idade não importam
  for (const p of ["UY", "BR", "MX"]) for (const r of RESPOSTAS) for (const g of ["hombre", "mujer"]) for (const f of ["25_34", "mayor_65"])
    casos.push(qualificacao("Outros países", `${p} · ${rotulo(r)} · ${g} · ${f}`, p, { telefone: TELEFONES_TESTE[p], idade: f, genero: g, resposta: r }));

  // País: o DDI do telefone vale mais que a geolocalização
  const pais: [string, string, string, string, string][] = [
    ["sem telefone, geo AR, mulher", "", "AR", "mujer", "AR"],
    ["sem telefone, geo AR, homem 45-54", "", "AR", "hombre", "AR"],
    ["sem telefone, geo CL, mulher", "", "CL", "mujer", "CL"],
    ["telefone UY vence geo AR", TELEFONES_TESTE.UY, "AR", "mujer", "UY"],
    ["telefone AR vence geo UY", TELEFONES_TESTE.AR, "UY", "mujer", "AR"],
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
    casos.push(qualificacao("Textos em espanhol", `${p} · "${r}" · ${g} · ${f}`, p, { telefone: TELEFONES_TESTE[p], idade: f, genero: g, resposta: r }));

  // Trader e eventos de Lead
  casos.push({ grupo: "Trader e Lead", nome: "trader: qualificação com Imposible", corpo: { landing: "trader", acao: "qualificacao", telefone: TELEFONES_TESTE.AR, resposta: "no_imposible", genero: "mujer" }, http: 200, evento: "Lead Trader Qualificado", qualificado: true });
  casos.push({ grupo: "Trader e Lead", nome: "trader: qualificação sem dados", corpo: { landing: "trader", acao: "qualificacao", telefone: TELEFONES_TESTE.BR }, http: 200, evento: "Lead Trader Qualificado", qualificado: true });
  casos.push({ grupo: "Trader e Lead", nome: "Lead General", corpo: { landing: "general", acao: "lead", telefone: TELEFONES_TESTE.UY, email: "qa@teste.com" }, http: 200, evento: "Lead General", qualificado: null });
  casos.push({ grupo: "Trader e Lead", nome: "Lead Trader", corpo: { landing: "trader", acao: "lead", telefone: TELEFONES_TESTE.MX }, http: 200, evento: "Lead Trader", qualificado: null });

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
    if (r.status !== "enviado") falhas.push(`${e.evento} ${e.eventId}: status "${r.status}"`);
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

export function mensagemTestes(e: Execucao, voltou: boolean): string {
  const onde = e.origem === "servidor" ? "servidor" : "navegador (pixel)";
  if (voltou) return `✅ *Testes dos eventos Meta voltaram a passar* (${onde})\n${e.total} verificações, nenhuma falha.`;
  const linhas = e.detalhes.slice(0, 8).map((f) => `• ${f.teste}: ${f.motivo}`);
  const resto = e.falhas > 8 ? `\n… e mais ${e.falhas - 8}` : "";
  return `🚨 *Testes dos eventos Meta falharam* (${onde})\n${e.falhas} de ${e.total} verificações com problema:\n${linhas.join("\n")}${resto}\n\nDetalhes no painel → Alertas.`;
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
