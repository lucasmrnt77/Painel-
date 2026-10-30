/**
 * Conta de anúncios na Meta lida direto pela API de Marketing (token só leitura `META_ADS_TOKEN`).
 * Puro — testado em tests/meta-conta.test.ts. Pedido do Emi (30/10/2026), depois do bloqueio de conta e da
 * redução do limite diário que a própria Meta fez no lançamento anterior:
 *  - ads_conta_bloqueada: a conta não está ativa (desativada, em análise de risco, pagamento pendente…).
 *  - ads_limite_reduzido: a Meta baixou o limite de gasto diário da conta, ou ele ficou abaixo da soma dos
 *    orçamentos das campanhas ativas do lançamento (aí as campanhas não conseguem gastar o planejado).
 *  - ads_ritmo_baixo: a partir da hora de início (dezembro: 6h), o gasto de hoje está abaixo de
 *    TOLERANCIA_RITMO do que o orçamento do dia previa até agora. O orçamento é lido da Meta a cada rodada,
 *    então acompanha sozinho quando o gestor sobe os orçamentos.
 */
import { diaLocal, horaLocal } from "./meta-ads-regras";
import { montar, type Modelos } from "./modelos-alertas";

/** Gasto abaixo de 50% do esperado pelo orçamento até a hora atual = ritmo baixo. */
export const TOLERANCIA_RITMO = 0.5;
/** Só avalia o ritmo com pelo menos isso de gasto esperado (evita alerta nos primeiros minutos). */
export const ESPERADO_MINIMO = 10;
/** Não repete o alerta de ritmo antes deste intervalo (minutos). */
export const REPETIR_RITMO_MIN = 120;
/** Queda do limite diário que conta como redução (2%: evita arredondamento/câmbio). */
export const QUEDA_LIMITE = 0.02;

export type CampanhaMeta = { id: string; nome: string; orcamentoDia: number; gastoHoje: number };
export type LeituraConta = {
  status: number;
  motivo: number | null;
  /** Limite de gasto diário definido pela Meta (null = a API não informou). */
  limiteDiario: number | null;
  moeda: string;
  /** Campanhas ativas do lançamento (filtradas pelo nome). */
  campanhas: CampanhaMeta[];
  lidoEm: string;
};
export type AlertaConta = {
  tipo: "ads_conta_bloqueada" | "ads_limite_reduzido" | "ads_ritmo_baixo";
  chave: string; mensagem: string; dados: Record<string, unknown>;
};

export const SITUACAO_CONTA: Record<number, string> = {
  1: "ativa", 2: "desativada", 3: "com pagamento pendente", 7: "em análise de risco", 8: "com liquidação pendente",
  9: "em período de carência", 100: "com encerramento pendente", 101: "encerrada",
};
export const MOTIVO_BLOQUEIO: Record<number, string> = {
  1: "política de integridade dos anúncios", 2: "revisão de IP", 3: "risco de pagamento", 4: "conta cinza encerrada",
  5: "revisão AFC", 6: "integridade da empresa", 7: "encerramento permanente", 8: "conta de revendedor sem uso",
  9: "conta sem uso", 10: "conta guarda-chuva", 11: "política de integridade do gerenciador de negócios",
  12: "conta de anúncios com informações falsas", 13: "entidade legal desvinculada", 14: "revisão de conversa",
  15: "conta comprometida",
};

export const somaOrcamento = (l: LeituraConta) => l.campanhas.reduce((s, c) => s + c.orcamentoDia, 0);
export const somaGasto = (l: LeituraConta) => l.campanhas.reduce((s, c) => s + c.gastoHoje, 0);

/** Minutos desde a meia-noite local (UY/AR). */
export function minutosDoDia(d: Date): number {
  const x = new Date(d.getTime() - 3 * 3_600_000);
  return x.getUTCHours() * 60 + x.getUTCMinutes();
}

/** Converte o filtro do painel (ILIKE: % e _) num teste de nome. */
export function casaFiltro(filtro: string, nome: string): boolean {
  const re = filtro.split("").map((c) => (c === "%" ? ".*" : c === "_" ? "." : c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("");
  return new RegExp(`^${re}$`, "i").test(nome);
}

const dinheiro = (v: number, moeda: string) => `${moeda === "USD" ? "US$" : moeda} ${v.toFixed(2)}`;
const hhmm = (iso: string) => {
  const d = new Date(new Date(iso).getTime() - 3 * 3_600_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

export function mensagemConta(tipo: AlertaConta["tipo"], nome: string, d: Record<string, unknown>, modelos?: Modelos): string {
  const moeda = String(d.moeda ?? "USD");
  if (tipo === "ads_conta_bloqueada") {
    return montar(tipo, {
      nome, situacao: SITUACAO_CONTA[Number(d.status)] ?? `status ${d.status}`,
      motivo: d.motivo ? ` (motivo: ${MOTIVO_BLOQUEIO[Number(d.motivo)] ?? d.motivo})` : "",
    }, modelos);
  }
  if (tipo === "ads_limite_reduzido") {
    return montar(tipo, {
      nome, limite: dinheiro(Number(d.limite), moeda),
      antes: d.anterior != null ? ` (antes: ${dinheiro(Number(d.anterior), moeda)})` : "",
      orcamento: dinheiro(Number(d.orcamento), moeda),
      titulo: d.abaixo ? "ficou abaixo dos orçamentos" : "foi reduzido",
    }, modelos);
  }
  const atrasadas = (d.atrasadas as { nome: string; gasto: number; esperado: number }[] | undefined) ?? [];
  return montar("ads_ritmo_baixo", {
    nome, hora: hhmm(String(d.lido_em)), gasto: dinheiro(Number(d.gasto), moeda), esperado: dinheiro(Number(d.esperado), moeda),
    orcamento: dinheiro(Number(d.orcamento), moeda), pct: `${Math.round(Number(d.pct) * 100)}%`,
    campanhas: atrasadas.length ? atrasadas.map((c) => `• ${c.nome}: ${dinheiro(c.gasto, moeda)} de ~${dinheiro(c.esperado, moeda)}`).join("\n") : "",
  }, modelos);
}

function alerta(tipo: AlertaConta["tipo"], chave: string, nome: string, dados: Record<string, unknown>): AlertaConta {
  return { tipo, chave, mensagem: mensagemConta(tipo, nome, dados), dados };
}

export function avaliarConta(e: {
  lancamentoId: number; nome: string; horaInicio: number;
  atual: LeituraConta; anterior: LeituraConta | null;
  ultimoRitmoEm: string | null; agora: Date;
}): AlertaConta[] {
  const { atual, anterior } = e;
  const id = e.lancamentoId;
  const hoje = diaLocal(e.agora);
  const moeda = atual.moeda;
  const saida: AlertaConta[] = [];

  // Conta bloqueada / em análise: uma vez por dia por situação
  if (atual.status !== 1) {
    saida.push(alerta("ads_conta_bloqueada", `ads_conta_bloqueada:${id}:${atual.status}:${hoje}`, e.nome, { moeda, status: atual.status, motivo: atual.motivo }));
    return saida; // com a conta parada, os outros alertas só repetem o mesmo problema
  }

  const orcamento = somaOrcamento(atual);
  // Limite diário da Meta
  if (atual.limiteDiario != null) {
    const ant = anterior?.limiteDiario ?? null;
    if (ant != null && atual.limiteDiario < ant * (1 - QUEDA_LIMITE)) {
      saida.push(alerta("ads_limite_reduzido", `ads_limite_reduzido:${id}:${Math.round(atual.limiteDiario * 100)}`, e.nome,
        { moeda, limite: atual.limiteDiario, anterior: ant, orcamento }));
    } else if (orcamento > 0 && atual.limiteDiario < orcamento) {
      saida.push(alerta("ads_limite_reduzido", `ads_limite_reduzido:${id}:abaixo:${hoje}`, e.nome,
        { moeda, limite: atual.limiteDiario, anterior: null, orcamento, abaixo: true }));
    }
  }

  // Ritmo do gasto × orçamento do dia
  if (orcamento > 0 && horaLocal(e.agora) >= e.horaInicio) {
    const fracao = minutosDoDia(new Date(atual.lidoEm)) / 1440;
    const esperado = orcamento * fracao;
    const gasto = somaGasto(atual);
    const repetido = e.ultimoRitmoEm && e.agora.getTime() - new Date(e.ultimoRitmoEm).getTime() < REPETIR_RITMO_MIN * 60_000;
    if (esperado >= ESPERADO_MINIMO && gasto < esperado * TOLERANCIA_RITMO && !repetido) {
      const atrasadas = atual.campanhas
        .map((c) => ({ nome: c.nome, gasto: c.gastoHoje, esperado: c.orcamentoDia * fracao }))
        .filter((c) => c.esperado > 0 && c.gasto < c.esperado * TOLERANCIA_RITMO)
        .sort((a, b) => a.gasto / a.esperado - b.gasto / b.esperado)
        .slice(0, 6);
      saida.push(alerta("ads_ritmo_baixo", `ads_ritmo_baixo:${id}:${Math.floor(new Date(atual.lidoEm).getTime() / 60_000)}`, e.nome,
        { moeda, gasto, esperado, orcamento, pct: gasto / esperado, lido_em: atual.lidoEm, atrasadas }));
    }
  }
  return saida;
}
