import { normalizarTelefone } from "./telefone";

export type TipoEvento = "entrou" | "saiu" | "desconhecido";

export type EventoNormalizado = {
  tipo: TipoEvento;
  tipo_original: string | null;
  telefone: string | null;
  grupo_id: string | null;
  grupo_nome: string | null;
  sendflow_ref: string | null;
};

type Entrada = { caminho: string[]; valor: unknown };

const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");

const CHAVES_TIPO_ACAO = ["action", "acao", "operation", "operacao"];
const CHAVES_TIPO_EVENTO = ["event", "evento", "eventtype", "eventname", "type", "tipo", "trigger", "gatilho"];
const CHAVES_TELEFONE = [
  "phone", "phonenumber", "telefone", "number", "numero", "whatsapp", "celular",
  "participant", "participants", "participante", "participantes", "remotejid", "jid",
  "lead", "contact", "contato", "member", "members", "membro", "membros",
];
// Caminhos que costumam ser do admin/instância e não de quem entrou/saiu.
const CAMINHOS_IGNORADOS = ["author", "autor", "admin", "owner", "instance", "instancia", "sender", "me", "bot", "account", "conta", "by"];
const CHAVES_GRUPO_ID = ["groupid", "grupoid", "groupjid", "chatid", "gid"];
const CHAVES_GRUPO_NOME = ["groupname", "gruponome", "nomegrupo", "subject", "grouptitle"];
const CHAVES_REF = [
  "campaignid", "campanhaid", "releaseid", "lancamentoid", "projectid", "projetoid",
  "campaign", "campanha", "release", "lancamento", "project", "projeto",
  "campaignname", "campanhanome", "releasename",
];

function achatar(obj: unknown, caminho: string[] = [], saida: Entrada[] = [], prof = 0): Entrada[] {
  if (prof > 6) return saida;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => achatar(v, [...caminho, String(i)], saida, prof + 1));
  } else if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      achatar(v, [...caminho, k], saida, prof + 1);
    }
  } else {
    saida.push({ caminho, valor: obj });
  }
  return saida;
}

/** Chaves do caminho sem índices de array, normalizadas. */
function chaves(caminho: string[]): string[] {
  return caminho.filter((c) => !/^\d+$/.test(c)).map(norm);
}

/** Valor mais raso cuja última chave está em `alvo`. */
function primeiroTexto(entradas: Entrada[], alvo: string[]): string | null {
  let melhor: { v: string; prof: number } | null = null;
  for (const e of entradas) {
    if (typeof e.valor !== "string" && typeof e.valor !== "number") continue;
    const ks = chaves(e.caminho);
    if (!alvo.includes(ks[ks.length - 1] ?? "")) continue;
    const v = String(e.valor).trim();
    if (!v) continue;
    if (!melhor || e.caminho.length < melhor.prof) melhor = { v, prof: e.caminho.length };
  }
  return melhor?.v ?? null;
}

function textoEmPai(entradas: Entrada[], pais: string[], filhos: string[]): string | null {
  for (const e of entradas) {
    if (typeof e.valor !== "string" && typeof e.valor !== "number") continue;
    const ks = chaves(e.caminho);
    if (ks.length < 2) continue;
    if (pais.includes(ks[ks.length - 2]) && filhos.includes(ks[ks.length - 1])) {
      const v = String(e.valor).trim();
      if (v) return v;
    }
  }
  return null;
}

export function classificarTipo(texto: string | null): TipoEvento {
  if (!texto) return "desconhecido";
  const t = texto.toLowerCase();
  const saiu = /(leave|left|remov|exit|kick|sai[ud]|saida|saída|quit|delete)/.test(t);
  const entrou = /(join|entr[oa]u|entrada|(^|[^a-z])add(ed)?([^a-z]|$)|adicion|new[_\s-]?member|novo[_\s-]?membro|member[_\s.-]?in\b|invite[_\s-]?accept)/.test(t);
  if (saiu && !entrou) return "saiu";
  if (entrou && !saiu) return "entrou";
  return "desconhecido";
}

function tipoDoPayload(entradas: Entrada[]): { tipo: TipoEvento; original: string | null } {
  const acao = primeiroTexto(entradas, CHAVES_TIPO_ACAO);
  const evento = primeiroTexto(entradas, CHAVES_TIPO_EVENTO);
  const original = [evento, acao].filter(Boolean).join(" / ") || null;
  const porAcao = classificarTipo(acao);
  if (porAcao !== "desconhecido") return { tipo: porAcao, original };
  return { tipo: classificarTipo(evento), original };
}

function telefonesDoPayload(entradas: Entrada[]): string[] {
  const achados: string[] = [];
  for (const e of entradas) {
    const ks = chaves(e.caminho);
    if (ks.some((k) => CAMINHOS_IGNORADOS.includes(k))) continue;
    if (!ks.some((k) => CHAVES_TELEFONE.includes(k))) continue;
    // Ignora ids de grupo/campanha que por acaso estejam dentro de "lead"/"contact"
    const ultima = ks[ks.length - 1];
    if (["id", "groupid", "grupoid", "campaignid", "name", "nome", "email"].includes(ultima ?? "")) continue;
    const tel = normalizarTelefone(e.valor);
    if (tel && !achados.includes(tel)) achados.push(tel);
  }
  return achados;
}

function grupoIdDoPayload(entradas: Entrada[]): string | null {
  const direto =
    primeiroTexto(entradas, CHAVES_GRUPO_ID) ??
    textoEmPai(entradas, ["group", "grupo"], ["id", "jid"]);
  if (direto) return direto;
  for (const e of entradas) {
    if (typeof e.valor === "string" && /@g\.us$/i.test(e.valor.trim())) return e.valor.trim();
  }
  return null;
}

function eventosDeUmObjeto(obj: unknown, tipoForcado: TipoEvento | null): EventoNormalizado[] {
  const entradas = achatar(obj);
  const { tipo, original } = tipoDoPayload(entradas);
  const grupo_id = grupoIdDoPayload(entradas);
  const grupo_nome =
    primeiroTexto(entradas, CHAVES_GRUPO_NOME) ??
    textoEmPai(entradas, ["group", "grupo"], ["name", "nome", "subject", "title", "titulo"]);
  const sendflow_ref =
    textoEmPai(entradas, ["campaign", "campanha", "release", "lancamento", "project", "projeto"], ["id", "name", "nome"]) ??
    primeiroTexto(entradas, CHAVES_REF);
  const tipoFinal = tipoForcado ?? tipo;
  const telefones = telefonesDoPayload(entradas);

  if (telefones.length === 0) {
    return [{ tipo: "desconhecido", tipo_original: original, telefone: null, grupo_id, grupo_nome, sendflow_ref }];
  }
  return telefones.map((telefone) => ({
    tipo: tipoFinal,
    tipo_original: original,
    telefone,
    grupo_id,
    grupo_nome,
    sendflow_ref,
  }));
}

/**
 * Converte o payload do Sendflow em eventos por pessoa.
 * O formato exato do Sendflow ainda não foi confirmado, então o parser é
 * tolerante: procura telefone/tipo/grupo por nomes de campo comuns.
 * `tipoForcado` vem de ?tipo=entrou|saiu na URL do webhook e tem prioridade.
 */
export function extrairEventosSendflow(payload: unknown, tipoForcado: TipoEvento | null = null): EventoNormalizado[] {
  const lista = Array.isArray(payload) ? payload : [payload];
  return lista.flatMap((item) => eventosDeUmObjeto(item, tipoForcado));
}

export function tipoDaQuery(v: string | null): TipoEvento | null {
  if (!v) return null;
  const t = classificarTipo(v);
  return t === "desconhecido" ? null : t;
}
