/**
 * Recuperação por caminho do fluxo do Unnichat (056, 09/11/2026).
 * O Randomizador manda cada pessoa para um caminho (A–J). Um bloco "Requisição HTTP" em cada caminho avisa o painel;
 * o painel cruza com quem entrou no grupo DEPOIS do envio. Puro (sem banco) — tests/recuperacao-caminhos.test.ts.
 */

export type Tipo = "botao" | "link";
export type Etapa = "enviado" | "clicou";
export type AvisoCaminho = { telefone: string; caminho: string; tipo: Tipo; etapa: Etapa; fluxo: string | null };

/** Caminhos do fluxo de dezembro: A–E = botão "QUIERO SABER" antes do link; F–J = link do grupo direto. */
export const TIPO_PADRAO: Record<string, Tipo> = { A: "botao", B: "botao", C: "botao", D: "botao", E: "botao", F: "link", G: "link", H: "link", I: "link", J: "link" };

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

/** Lê o aviso do Unnichat (JSON, formulário ou ?query). Telefone com pelo menos 8 dígitos (variável não preenchida = erro). */
export function lerAviso(dados: Record<string, unknown>): AvisoCaminho | { erro: string } {
  const telefone = texto(dados.telefone ?? dados.phone ?? dados.telefono).replace(/[^\d+]/g, "");
  if (telefone.replace(/\D/g, "").length < 8) return { erro: "telefone_invalido" };
  const caminho = texto(dados.caminho ?? dados.camino ?? dados.path).toUpperCase();
  if (!/^[A-Z]$/.test(caminho)) return { erro: "caminho_invalido" };
  const t = texto(dados.tipo).toLowerCase();
  const tipo: Tipo | undefined = t === "botao" || t === "botão" || t === "boton" ? "botao" : t === "link" ? "link" : TIPO_PADRAO[caminho];
  if (!tipo) return { erro: "tipo_invalido" };
  const e = texto(dados.etapa).toLowerCase();
  const etapa: Etapa = e === "clicou" || e === "clic" || e === "click" ? "clicou" : "enviado";
  const fluxo = texto(dados.fluxo).slice(0, 60) || null;
  return { telefone, caminho, tipo, etapa, fluxo };
}

export type LinhaCaminho = { caminho: string; tipo: Tipo; receberam: number; clicaram: number; entraram: number; jaEstavam: number; medianaHoras: number | null };
export type TotalTipo = { tipo: Tipo; receberam: number; clicaram: number; entraram: number; taxa: number | null; taxaClique: number | null };

/** Mínimo por tipo para apontar o vencedor (abaixo disso a diferença pode ser acaso). */
export const MIN_POR_TIPO = 100;

export function totaisPorTipo(ls: LinhaCaminho[]): { botao: TotalTipo; link: TotalTipo; vencedor: Tipo | null } {
  const tot = (tipo: Tipo): TotalTipo => {
    const xs = ls.filter((l) => l.tipo === tipo);
    const receberam = xs.reduce((s, l) => s + l.receberam, 0);
    const clicaram = xs.reduce((s, l) => s + l.clicaram, 0);
    const entraram = xs.reduce((s, l) => s + l.entraram, 0);
    return { tipo, receberam, clicaram, entraram, taxa: receberam ? entraram / receberam : null, taxaClique: tipo === "botao" && receberam ? clicaram / receberam : null };
  };
  const botao = tot("botao");
  const link = tot("link");
  const vencedor = botao.receberam >= MIN_POR_TIPO && link.receberam >= MIN_POR_TIPO && botao.taxa != null && link.taxa != null && botao.taxa !== link.taxa
    ? (botao.taxa > link.taxa ? "botao" : "link") : null;
  return { botao, link, vencedor };
}
