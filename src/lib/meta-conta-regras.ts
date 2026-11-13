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
 *    Cada campanha conta a partir de quando COMEÇOU a gastar hoje (07/11/2026: campanhas novas que entraram às
 *    5h30 eram cobradas pelo gasto da madrugada inteira → "39% do normal" falso). Campanha que começou há menos de
 *    2 h (aprendizado) ou que ainda não gastou nada hoje fica fora — conta parada é o alerta ads_conta_sem_gasto.
 *  - ads_conta_sem_gasto: de 8h em diante, a CONTA (todas as campanhas ativas do lançamento somadas) não gastou nada
 *    em ~2 h, com campanha ativa e orçamento. Sem nada rodando, não avisa. (07/11/2026, Emi: antes era por campanha —
 *    campanha nova agendada ou em análise disparava alerta enquanto a conta gastava normal.)
 *  - ads_dia_abaixo: o dia anterior fechou abaixo de 75% do orçamento (o atraso que travou a escala em setembro).
 *    Orçamento do dia = média das leituras do dia (campanha criada às 22h pesa só o tempo em que existiu; antes
 *    pegava a última leitura e campanhas novas da noite davam falso alarme, 06/11/2026).
 *  - ads_orcamento_divergente: a soma dos orçamentos na Meta não bate com o orçamento planejado no painel
 *    (diferença > 5% ou US$ 5) em duas leituras seguidas — pega campanha esquecida, pausada ou orçamento não ajustado.
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
  tipo: "ads_conta_bloqueada" | "ads_limite_reduzido" | "ads_ritmo_baixo" | "ads_conta_sem_gasto" | "ads_dia_abaixo" | "ads_orcamento_divergente";
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
  if (tipo === "ads_conta_sem_gasto") {
    return montar(tipo, {
      nome, minutos: String(d.minutos), hora: hhmm(String(d.lido_em)),
      gasto: dinheiro(Number(d.gasto), moeda), orcamento: dinheiro(Number(d.orcamento), moeda), campanhas: String(d.campanhas),
    }, modelos);
  }
  if (tipo === "ads_orcamento_divergente") {
    const dif = Number(d.diferenca);
    const camps = (d.campanhas as { nome: string; orcamento: number }[] | undefined) ?? [];
    return montar(tipo, {
      nome, planejado: dinheiro(Number(d.planejado), moeda), orcamento: dinheiro(Number(d.orcamento), moeda),
      diferenca: `${dif > 0 ? "+" : "−"}${dinheiro(Math.abs(dif), moeda)}`, situacao: dif > 0 ? "acima" : "abaixo",
      hora: hhmm(String(d.lido_em)),
      campanhas: camps.map((c) => `• ${c.nome}: ${dinheiro(c.orcamento, moeda)}`).join("\n"),
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
/** Menos que isso em ~2 h = conta parada (centavos de ajuste da Meta não contam como gasto). */
export const PARADA_GASTO_MINIMO = 0.5;
/** Dia anterior que fechou abaixo desta fração do orçamento = alerta. */
export const DIA_MINIMO = 0.75;
/** Orçamento da Meta × planejado no painel: diferença tolerada (o maior dos dois). */
export const DIVERGENCIA_PCT = 0.05;
export const DIVERGENCIA_MIN_USD = 5;

/** O orçamento lido da Meta difere do planejado no painel além da tolerância? */
export function orcamentoDiverge(meta: number, planejado: number | null): boolean {
  if (planejado == null || planejado <= 0) return false;
  return Math.abs(meta - planejado) > Math.max(planejado * DIVERGENCIA_PCT, DIVERGENCIA_MIN_USD);
}

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

/** Campanha que começou a gastar há menos disso fica fora do ritmo (fase de aprendizado). */
export const RITMO_CARENCIA_MIN = 120;

/**
 * Quando cada campanha começou a gastar hoje: null = desde 00:00 (já gastava na 1ª leitura do dia);
 * Date = leitura em que apareceu gastando pela 1ª vez (−15 min); ausente do mapa = ainda não gastou hoje.
 */
export function inicioDoGasto(l: LeituraConta, historico: LeituraConta[]): Map<string, Date | null> {
  const t = new Date(l.lidoEm);
  const dia = diaLocal(t);
  const doDia = [...historico, l]
    .filter((x) => diaLocal(new Date(x.lidoEm)) === dia && new Date(x.lidoEm).getTime() <= t.getTime())
    .sort((a, b) => new Date(a.lidoEm).getTime() - new Date(b.lidoEm).getTime());
  const out = new Map<string, Date | null>();
  doDia.forEach((x, i) => {
    for (const c of x.campanhas) {
      if (out.has(c.id) || c.gastoHoje <= 0) continue;
      out.set(c.id, i === 0 ? null : new Date(new Date(x.lidoEm).getTime() - 15 * 60_000));
    }
  });
  return out;
}

/** Fração do orçamento que a conta costuma ter gasto até um horário (curva; sem curva, linear). */
function fracaoAte(momento: Date, historico: LeituraConta[]): number {
  return fracaoEsperada(momento, historico) ?? minutosDoDia(momento) / 1440;
}

/**
 * Ritmo de uma leitura: gasto ÷ esperado (curva real; sem histórico, linear a partir da HORA_LINEAR).
 * Só entram as campanhas que já gastavam há pelo menos RITMO_CARENCIA_MIN, cada uma cobrada desde que começou.
 */
export function ritmoDaLeitura(l: LeituraConta, historico: LeituraConta[], horaInicio: number):
  { ritmo: number; esperado: number; fracao: number; fonte: "curva" | "linear"; porCampanha: Map<string, number> } | null {
  const t = new Date(l.lidoEm);
  if (somaOrcamento(l) <= 0) return null;
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
  const inicio = inicioDoGasto(l, historico);
  const porCampanha = new Map<string, number>();
  let esperado = 0;
  let gasto = 0;
  for (const c of l.campanhas) {
    if (c.orcamentoDia <= 0 || !inicio.has(c.id)) continue;
    const ini = inicio.get(c.id) ?? null;
    if (ini && (t.getTime() - ini.getTime()) / 60_000 < RITMO_CARENCIA_MIN) continue;
    const e = c.orcamentoDia * Math.max(fracao - (ini ? fracaoAte(ini, historico) : 0), 0);
    porCampanha.set(c.id, e);
    esperado += e;
    gasto += c.gastoHoje;
  }
  if (esperado < ESPERADO_MINIMO) return null;
  return { ritmo: gasto / esperado, esperado, fracao, fonte, porCampanha };
}

/**
 * A conta não gastou nada entre as duas leituras? Compara CAMPANHA POR CAMPANHA (10/11/2026): trocar campanhas no
 * meio do dia (pausar as antigas, criar novas) tirava o gasto das pausadas da soma e a conta "parecia" parada.
 *  - gasto no período = o que cada campanha ativa agora gastou a mais desde a leitura anterior (campanha nova: tudo
 *    o que já gastou hoje); campanha pausada no meio do caminho não puxa nada para baixo;
 *  - só conta como parada se havia campanha com orçamento ativa nas DUAS leituras (campanhas novas ainda em análise
 *    ou agendadas, sozinhas, não são "conta parada").
 */
export function contaParada(atual: LeituraConta, antes: LeituraConta): boolean {
  const gastoAntes = new Map(antes.campanhas.map((c) => [c.id, c.gastoHoje]));
  const emAmbas = atual.campanhas.filter((c) => c.orcamentoDia > 0 && gastoAntes.has(c.id));
  if (emAmbas.length === 0) return false;
  const gastoNoPeriodo = atual.campanhas.reduce((s, c) => s + Math.max(0, c.gastoHoje - (gastoAntes.get(c.id) ?? 0)), 0);
  return gastoNoPeriodo < PARADA_GASTO_MINIMO;
}

export function avaliarConta(e: {
  lancamentoId: number; nome: string; horaInicio: number;
  atual: LeituraConta;
  /** Leituras anteriores (últimos ~8 dias), qualquer ordem, sem a atual. */
  historico: LeituraConta[];
  ultimoRitmoEm: string | null; agora: Date;
  /** Orçamento do dia planejado no painel (null = sem conferência). */
  orcamentoPlanejado?: number | null;
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

  // Orçamento na Meta × planejado no painel — confirmado em duas leituras seguidas (dá ~30 min para ajustar os dois)
  const plan = e.orcamentoPlanejado ?? null;
  if (orcamentoDiverge(orcamento, plan) && anterior && diaLocal(new Date(anterior.lidoEm)) === hoje
      && (tAtual - new Date(anterior.lidoEm).getTime()) / 60_000 <= 75 && orcamentoDiverge(somaOrcamento(anterior), plan)) {
    saida.push(alerta("ads_orcamento_divergente",
      `ads_orcamento_divergente:${id}:${hoje}:${Math.round(plan! * 100)}:${Math.round(orcamento * 100)}`, e.nome,
      { moeda, planejado: plan, orcamento, diferenca: orcamento - plan!, lido_em: atual.lidoEm,
        campanhas: atual.campanhas.map((c) => ({ nome: c.nome, orcamento: c.orcamentoDia })) }));
  }

  // Dia anterior fechou bem abaixo do orçamento (uma vez por dia)
  const ontemLeituras = historico.filter((l) => diaLocal(new Date(l.lidoEm)) < hoje);
  const ultimaOntem = ontemLeituras[ontemLeituras.length - 1];
  if (ultimaOntem && minutosDoDia(new Date(ultimaOntem.lidoEm)) >= 23 * 60 && ultimaOntem.status === 1) {
    const diaOntem = diaLocal(new Date(ultimaOntem.lidoEm));
    const doDia = ontemLeituras.filter((l) => diaLocal(new Date(l.lidoEm)) === diaOntem);
    const orcOntem = doDia.reduce((t, l) => t + somaOrcamento(l), 0) / doDia.length;
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
        .filter((c) => r.porCampanha.has(c.id))
        .map((c) => ({ nome: c.nome, gasto: c.gastoHoje, esperado: r.porCampanha.get(c.id)! }))
        .filter((c) => c.esperado > 0 && c.gasto < c.esperado * TOLERANCIA_RITMO)
        .sort((a, b) => a.gasto / a.esperado - b.gasto / b.esperado)
        .slice(0, 6);
      saida.push(alerta("ads_ritmo_baixo", `ads_ritmo_baixo:${id}:${Math.floor(tAtual / 60_000)}`, e.nome,
        { moeda, gasto: r.esperado * r.ritmo, esperado: r.esperado, orcamento, pct: r.ritmo, lido_em: atual.lidoEm, atrasadas, fonte: r.fonte }));
    }
  }

  // Conta parada: as campanhas ativas não gastaram nada em ~2 h, campanha por campanha (contaParada) (uma vez a cada 2 h enquanto continuar parada)
  if (orcamento > 0 && horaLocal(new Date(atual.lidoEm)) >= PARADA_HORA_INICIO) {
    const antes = [...historico].reverse().find((l) => {
      const dt = (tAtual - new Date(l.lidoEm).getTime()) / 60_000;
      return dt >= PARADA_MIN - 10 && dt <= PARADA_MIN + 30 && diaLocal(new Date(l.lidoEm)) === hoje;
    });
    if (antes && antes.status === 1 && somaOrcamento(antes) > 0 && contaParada(atual, antes)) {
      saida.push(alerta("ads_conta_sem_gasto", `ads_conta_sem_gasto:${id}:${hoje}:${Math.floor(minutosDoDia(new Date(atual.lidoEm)) / PARADA_MIN)}`, e.nome,
        { moeda, gasto: somaGasto(atual), orcamento, campanhas: atual.campanhas.filter((c) => c.orcamentoDia > 0).length,
          minutos: Math.round((tAtual - new Date(antes.lidoEm).getTime()) / 60_000), lido_em: atual.lidoEm }));
    }
  }
  return saida;
}
