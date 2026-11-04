/**
 * Conta de anúncios na Meta lida direto pela API de Marketing (token só leitura `META_ADS_TOKEN`).
 * Puro — testado em tests/meta-conta.test.ts. Pedido do Emi (30/10/2026), depois do bloqueio de conta e da
 * redução do limite diário que a própria Meta fez no lançamento anterior:
 *  - ads_conta_bloqueada: a conta não está ativa (desativada, em análise de risco, pagamento pendente…).
 *  - ads_limite_reduzido: a Meta baixou o limite de gasto diário da conta, ou ele ficou abaixo da soma dos
 *    orçamentos das campanhas ativas do lançamento (aí as campanhas não conseguem gastar o planejado).
 *  - ads_ritmo_baixo: o gasto de hoje está abaixo de 50% do que a conta COSTUMA ter gasto até este horário
 *    (mediana dos últimos 7 dias, proporcional ao orçamento atual), em DUAS leituras seguidas. A Meta gasta
 *    pouco de madrugada e acelera de dia: comparar com uma divisão linear das 24 h dava falso alarme de manhã
 *    (04/11/2026). Sem 3 dias de histórico, cai no linear a partir das 9h.
 *  - ads_campanha_parada: de 8h em diante, uma campanha ativa não gastou nada em ~2 h enquanto as outras gastaram.
 *  - ads_dia_abaixo: o dia anterior fechou abaixo de 75% do orçamento (o atraso que travou a escala em setembro).
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
  tipo: "ads_conta_bloqueada" | "ads_limite_reduzido" | "ads_ritmo_baixo" | "ads_campanha_parada" | "ads_dia_abaixo";
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
  if (tipo === "ads_campanha_parada") {
    return montar(tipo, {
      nome, campanha: String(d.campanha), minutos: String(d.minutos), hora: hhmm(String(d.lido_em)),
      gasto: dinheiro(Number(d.gasto), moeda), orcamento: dinheiro(Number(d.orcamento), moeda),
    }, modelos);
  }
  if (tipo === "ads_dia_abaixo") {
    const [a, m, dd] = String(d.dia).split("-");
    return montar(tipo, {
      nome, dia: `${dd}/${m}/${a}`, gasto: dinheiro(Number(d.gasto), moeda), orcamento: dinheiro(Number(d.orcamento), moeda),
      pct: `${Math.round(Number(d.pct) * 100)}%`,
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

/** Leitura mais próxima do mesmo horário (± JANELA_CURVA_MIN) em cada um dos dias anteriores. */
export const JANELA_CURVA_MIN = 20;
/** Dias anteriores usados na curva de gasto, e o mínimo para confiar nela. */
export const DIAS_CURVA = 7;
export const DIAS_CURVA_MIN = 3;
/** Sem histórico suficiente, o cálculo linear só começa a valer a partir desta hora. */
export const HORA_LINEAR = 9;
/** Campanha sem gastar nada por este tempo (com as outras gastando) = parada. */
export const PARADA_MIN = 120;
export const PARADA_HORA_INICIO = 8;
/** Dia anterior que fechou abaixo desta fração do orçamento = alerta. */
export const DIA_MINIMO = 0.75;

const mediana = (v: number[]) => {
  const o = [...v].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};

/**
 * Quanto do orçamento a conta costuma ter gasto até este horário: mediana dos dias anteriores
 * (gasto ÷ orçamento daquele dia, na leitura mais próxima do mesmo horário). null = histórico curto.
 */
export function fracaoEsperada(momento: Date, historico: LeituraConta[]): number | null {
  const hoje = diaLocal(momento);
  const alvo = minutosDoDia(momento);
  const porDia = new Map<string, { dist: number; frac: number }>();
  for (const l of historico) {
    const t = new Date(l.lidoEm);
    const dia = diaLocal(t);
    if (dia >= hoje) continue;
    const orc = somaOrcamento(l);
    if (orc <= 0 || l.status !== 1) continue;
    const dist = Math.abs(minutosDoDia(t) - alvo);
    if (dist > JANELA_CURVA_MIN) continue;
    const atual = porDia.get(dia);
    if (!atual || dist < atual.dist) porDia.set(dia, { dist, frac: somaGasto(l) / orc });
  }
  const dias = [...porDia.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, DIAS_CURVA);
  if (dias.length < DIAS_CURVA_MIN) return null;
  return mediana(dias.map(([, v]) => v.frac));
}

/** Ritmo de uma leitura: gasto ÷ esperado (curva real; sem histórico, linear a partir da HORA_LINEAR). */
export function ritmoDaLeitura(l: LeituraConta, historico: LeituraConta[], horaInicio: number):
  { ritmo: number; esperado: number; fracao: number; fonte: "curva" | "linear" } | null {
  const t = new Date(l.lidoEm);
  const orc = somaOrcamento(l);
  if (orc <= 0) return null;
  const curva = fracaoEsperada(t, historico);
  let fracao: number;
  let fonte: "curva" | "linear";
  if (curva != null) {
    if (horaLocal(t) < horaInicio) return null;
    fracao = curva;
    fonte = "curva";
  } else {
    if (horaLocal(t) < Math.max(horaInicio, HORA_LINEAR)) return null;
    fracao = minutosDoDia(t) / 1440;
    fonte = "linear";
  }
  const esperado = orc * fracao;
  if (esperado < ESPERADO_MINIMO) return null;
  return { ritmo: somaGasto(l) / esperado, esperado, fracao, fonte };
}

export function avaliarConta(e: {
  lancamentoId: number; nome: string; horaInicio: number;
  atual: LeituraConta;
  /** Leituras anteriores (últimos ~8 dias), qualquer ordem, sem a atual. */
  historico: LeituraConta[];
  ultimoRitmoEm: string | null; agora: Date;
}): AlertaConta[] {
  const { atual } = e;
  const historico = [...e.historico].sort((a, b) => new Date(a.lidoEm).getTime() - new Date(b.lidoEm).getTime());
  const anterior = historico[historico.length - 1] ?? null;
  const id = e.lancamentoId;
  const hoje = diaLocal(e.agora);
  const moeda = atual.moeda;
  const saida: AlertaConta[] = [];
  const tAtual = new Date(atual.lidoEm).getTime();

  // Conta bloqueada / em análise: uma vez por dia por situação
  if (atual.status !== 1) {
    saida.push(alerta("ads_conta_bloqueada", `ads_conta_bloqueada:${id}:${atual.status}:${hoje}`, e.nome, { moeda, status: atual.status, motivo: atual.motivo }));
    return saida; // com a conta parada, os outros alertas só repetem o mesmo problema
  }

  const orcamento = somaOrcamento(atual);
  // Limite diário da Meta (a API hoje não informa; fica pronto se passar a informar)
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

  // Dia anterior fechou bem abaixo do orçamento (uma vez por dia)
  const ontemLeituras = historico.filter((l) => diaLocal(new Date(l.lidoEm)) < hoje);
  const ultimaOntem = ontemLeituras[ontemLeituras.length - 1];
  if (ultimaOntem && minutosDoDia(new Date(ultimaOntem.lidoEm)) >= 23 * 60 && ultimaOntem.status === 1) {
    const orcOntem = somaOrcamento(ultimaOntem);
    const gastoOntem = somaGasto(ultimaOntem);
    if (orcOntem > 0 && gastoOntem < orcOntem * DIA_MINIMO) {
      const dia = diaLocal(new Date(ultimaOntem.lidoEm));
      saida.push(alerta("ads_dia_abaixo", `ads_dia_abaixo:${id}:${dia}`, e.nome,
        { moeda, dia, gasto: gastoOntem, orcamento: orcOntem, pct: gastoOntem / orcOntem, lido_em: ultimaOntem.lidoEm }));
    }
  }

  // Ritmo do gasto × o que a conta costuma gastar até esta hora — confirmado em duas leituras seguidas
  const r = ritmoDaLeitura(atual, historico, e.horaInicio);
  if (r && r.ritmo < TOLERANCIA_RITMO) {
    const previa = [...historico].reverse().find((l) => {
      const dt = (tAtual - new Date(l.lidoEm).getTime()) / 60_000;
      return dt >= 20 && dt <= 75 && diaLocal(new Date(l.lidoEm)) === hoje;
    });
    const rPrev = previa ? ritmoDaLeitura(previa, historico.filter((l) => l !== previa), e.horaInicio) : null;
    const repetido = e.ultimoRitmoEm && e.agora.getTime() - new Date(e.ultimoRitmoEm).getTime() < REPETIR_RITMO_MIN * 60_000;
    if (rPrev && rPrev.ritmo < TOLERANCIA_RITMO && !repetido) {
      const atrasadas = atual.campanhas
        .map((c) => ({ nome: c.nome, gasto: c.gastoHoje, esperado: c.orcamentoDia * r.fracao }))
        .filter((c) => c.esperado > 0 && c.gasto < c.esperado * TOLERANCIA_RITMO)
        .sort((a, b) => a.gasto / a.esperado - b.gasto / b.esperado)
        .slice(0, 6);
      saida.push(alerta("ads_ritmo_baixo", `ads_ritmo_baixo:${id}:${Math.floor(tAtual / 60_000)}`, e.nome,
        { moeda, gasto: somaGasto(atual), esperado: r.esperado, orcamento, pct: r.ritmo, lido_em: atual.lidoEm, atrasadas, fonte: r.fonte }));
    }
  }

  // Campanha parada: sem gastar nada por 2 h enquanto as outras gastam (uma vez por dia por campanha)
  if (horaLocal(new Date(atual.lidoEm)) >= PARADA_HORA_INICIO) {
    const antes = [...historico].reverse().find((l) => {
      const dt = (tAtual - new Date(l.lidoEm).getTime()) / 60_000;
      return dt >= PARADA_MIN - 10 && dt <= PARADA_MIN + 30 && diaLocal(new Date(l.lidoEm)) === hoje;
    });
    if (antes) {
      const gastoAntes = new Map(antes.campanhas.map((c) => [c.id, c.gastoHoje]));
      const totalDelta = somaGasto(atual) - somaGasto(antes);
      for (const c of atual.campanhas) {
        if (c.orcamentoDia <= 0 || !gastoAntes.has(c.id)) continue;
        const delta = c.gastoHoje - (gastoAntes.get(c.id) ?? 0);
        const outras = totalDelta - delta;
        if (delta < 0.01 && outras >= 2) {
          saida.push(alerta("ads_campanha_parada", `ads_campanha_parada:${id}:${c.id}:${hoje}`, e.nome,
            { moeda, campanha: c.nome, gasto: c.gastoHoje, orcamento: c.orcamentoDia, minutos: Math.round((tAtual - new Date(antes.lidoEm).getTime()) / 60_000), lido_em: atual.lidoEm }));
        }
      }
    }
  }
  return saida;
}
