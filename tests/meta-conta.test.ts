import { test } from "node:test";
import assert from "node:assert/strict";
import { avaliarConta, casaFiltro, fracaoEsperada, type LeituraConta } from "../src/lib/meta-conta-regras";

const BR = (dia: string, h: number, m = 0) => new Date(`${dia}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00-03:00`);

// Curva real da conta (02–03/11/2026): % do orçamento gasto até cada hora
const CURVA: Record<number, number> = { 1: 0.04, 3: 0.08, 6: 0.128, 7: 0.168, 8: 0.226, 9: 0.296, 10: 0.349, 12: 0.423, 14: 0.503, 18: 0.658, 23: 0.922 };
const fr = (h: number) => {
  const hs = Object.keys(CURVA).map(Number).sort((a, b) => a - b);
  let melhor = hs[0];
  for (const x of hs) if (Math.abs(x - h) < Math.abs(melhor - h)) melhor = x;
  return CURVA[melhor];
};

/** Leitura de um dia/hora com a soma dos orçamentos = 272 (duas campanhas de 136). */
const leitura = (dia: string, h: number, m = 7, gasto?: [number, number], x: Partial<LeituraConta> = {}): LeituraConta => {
  const [g1, g2] = gasto ?? [136 * fr(h + m / 60), 136 * fr(h + m / 60)];
  return {
    status: 1, motivo: null, limiteDiario: null, moeda: "USD", lidoEm: BR(dia, h, m).toISOString(),
    campanhas: [
      { id: "1", nome: "[PC][LEADS][DEZ26][AR][General] Teste", orcamentoDia: 136, gastoHoje: g1 },
      { id: "2", nome: "[PC][LEADS][DEZ26][UY][General] Teste", orcamentoDia: 136, gastoHoje: g2 },
    ],
    ...x,
  };
};

/** Histórico normal: 7 dias anteriores, leituras de hora em hora (00:07–23:07). */
const historicoNormal = (ate = "2026-12-06", dias = 7): LeituraConta[] => {
  const out: LeituraConta[] = [];
  for (let d = dias; d >= 1; d--) {
    const dia = new Date(new Date(`${ate}T12:00:00-03:00`).getTime() - d * 86_400_000).toISOString().slice(0, 10);
    for (let h = 1; h <= 23; h++) out.push(leitura(dia, h));
  }
  return out;
};

const ctx = (atual: LeituraConta, historico: LeituraConta[], agora = new Date(new Date(atual.lidoEm).getTime() + 60_000)) => ({
  lancamentoId: 5, nome: "Dezembro 2026", horaInicio: 6, atual, historico, ultimoRitmoEm: null, agora,
});

test("filtro do painel (ILIKE) casa com o nome das campanhas", () => {
  assert.ok(casaFiltro("%[DEZ26]%", "[PC][LEADS][DEZ26][AR][Trader] Teste de Página 02"));
  assert.ok(!casaFiltro("%[DEZ26]%", "[PC][WPP] Teste API 2"));
  assert.ok(casaFiltro("%aquecimento de conta%", "[PC][LEADS][CBO][UY] Aquecimento de Conta"));
});

test("curva: às 6h a conta costuma ter gasto ~13% do orçamento (não 25%)", () => {
  const f = fracaoEsperada(BR("2026-12-06", 6, 7), historicoNormal());
  assert.ok(f != null && f > 0.12 && f < 0.14, String(f));
  assert.equal(fracaoEsperada(BR("2026-12-06", 6, 7), historicoNormal("2026-12-06", 2)), null); // menos de 3 dias
});

test("04/11 às 06:07 (US$ 21,96, 63% do normal): NÃO alerta — era falso alarme", () => {
  const hist = [...historicoNormal(), leitura("2026-12-06", 5, 37, [9.5, 9.5])];
  const atual = leitura("2026-12-06", 6, 7, [11, 10.96]);
  assert.deepEqual(avaliarConta(ctx(atual, hist)), []);
});

test("04/11 às 08:37 (US$ 46,42, ~65% do normal): NÃO alerta", () => {
  const hist = [...historicoNormal(), leitura("2026-12-06", 8, 7, [21, 21])];
  const atual = leitura("2026-12-06", 8, 37, [23.2, 23.22]);
  assert.deepEqual(avaliarConta(ctx(atual, hist)), []);
});

test("gasto despenca (conta travada): alerta só na 2ª leitura seguida abaixo de 50%", () => {
  const base = historicoNormal();
  const primeira = leitura("2026-12-06", 10, 7, [10, 10]); // 20 de ~95 esperados = 21%
  assert.deepEqual(avaliarConta(ctx(primeira, [...base, leitura("2026-12-06", 9, 37)])).map((a) => a.tipo), []);
  const segunda = leitura("2026-12-06", 10, 37, [10.2, 10.1]);
  const r = avaliarConta(ctx(segunda, [...base, primeira]));
  assert.deepEqual(r.map((a) => a.tipo), ["ads_ritmo_baixo"]);
  assert.match(r[0].mensagem, /abaixo do normal/);
});

test("sem histórico (lançamento novo): linear só a partir das 9h", () => {
  const cedo = leitura("2026-12-06", 7, 7, [1, 1]);
  assert.deepEqual(avaliarConta(ctx(cedo, [leitura("2026-12-06", 6, 37, [1, 1])])), []);
  const tarde = leitura("2026-12-06", 12, 7, [5, 5]);
  const r = avaliarConta(ctx(tarde, [leitura("2026-12-06", 11, 37, [5, 5])]));
  assert.deepEqual(r.map((a) => a.tipo), ["ads_ritmo_baixo"]);
});

test("uma campanha parada 2 h enquanto a outra gasta (ex.: campanha nova agendada): NÃO alerta — a conta está gastando", () => {
  const hist = [...historicoNormal(), leitura("2026-12-06", 10, 7, [40, 47])];
  const atual = leitura("2026-12-06", 12, 7, [40, 60]);
  assert.deepEqual(avaliarConta(ctx(atual, hist)).filter((a) => a.tipo === "ads_conta_sem_gasto"), []);
});

test("a conta inteira sem gastar 2 h (de 8h em diante): alerta da conta", () => {
  const hist = [...historicoNormal(), leitura("2026-12-06", 10, 7, [40, 47])];
  const r = avaliarConta(ctx(leitura("2026-12-06", 12, 7, [40, 47.2]), hist)).filter((a) => a.tipo === "ads_conta_sem_gasto");
  assert.equal(r.length, 1);
  assert.match(r[0].mensagem, /a conta da Meta parou de gastar/);
  assert.match(r[0].mensagem, /2 campanhas ativas/);
});

test("nada rodando (sem campanha ativa) ou madrugada: não alerta", () => {
  const vazia = (h: number) => leitura("2026-12-06", h, 7, [0, 0], { campanhas: [] });
  assert.deepEqual(avaliarConta(ctx(vazia(12), [...historicoNormal(), vazia(10)])).filter((a) => a.tipo === "ads_conta_sem_gasto"), []);
  const hist = [...historicoNormal(), leitura("2026-12-06", 4, 7, [5, 5])];
  assert.deepEqual(avaliarConta(ctx(leitura("2026-12-06", 6, 7, [5, 5]), hist)).filter((a) => a.tipo === "ads_conta_sem_gasto"), []);
});

test("ontem fechou com 66% do orçamento: alerta uma vez", () => {
  const hist = [...historicoNormal("2026-12-05", 6), leitura("2026-12-05", 23, 37, [90, 90])];
  const r = avaliarConta(ctx(leitura("2026-12-06", 0, 37, [1, 1]), hist));
  assert.deepEqual(r.map((a) => [a.tipo, a.chave]), [["ads_dia_abaixo", "ads_dia_abaixo:5:2026-12-05"]]);
  assert.match(r[0].mensagem, /66%/);
});

test("ontem: campanhas novas criadas às 22h não inflam o orçamento do dia (06/11/2026)", () => {
  // dia todo com 272 de orçamento e gasto normal; às 22h entram campanhas novas (+488) que ainda não gastam
  const ontem = "2026-12-05";
  const dia = [];
  for (let h = 1; h <= 23; h++) {
    const g = 136 * fr(h + 7 / 60);
    const extra = h >= 22 ? [{ id: "9", nome: "[PC][LEADS][DEZ26][AR][Trader] Escala 01", orcamentoDia: 488, gastoHoje: 0 }] : [];
    const l = leitura(ontem, h, 7, [g, g]);
    dia.push({ ...l, campanhas: [...l.campanhas, ...extra] });
  }
  const hist = [...historicoNormal(ontem, 6), ...dia, leitura(ontem, 23, 37, [125, 125])];
  const r = avaliarConta(ctx(leitura("2026-12-06", 0, 37, [1, 1]), hist));
  assert.deepEqual(r.filter((a) => a.tipo === "ads_dia_abaixo"), []);
});

test("conta em análise de risco: só esse alerta", () => {
  const r = avaliarConta(ctx(leitura("2026-12-06", 12, 7, undefined, { status: 7, motivo: 3 }), historicoNormal()));
  assert.deepEqual(r.map((a) => a.tipo), ["ads_conta_bloqueada"]);
  assert.match(r[0].mensagem, /em análise de risco/);
});

test("orçamento aumentado (500): a curva usa a % e acompanha", () => {
  const hist = [...historicoNormal(), leitura("2026-12-06", 11, 37, [100, 100])];
  const atual = leitura("2026-12-06", 12, 7, [100, 105], { campanhas: [
    { id: "1", nome: "A", orcamentoDia: 250, gastoHoje: 100 },
    { id: "2", nome: "B", orcamentoDia: 250, gastoHoje: 105 },
  ] }); // esperado ~42% de 500 = 211; gastou 205 → normal
  assert.deepEqual(avaliarConta(ctx(atual, hist)), []);
});

test("orçamento na Meta diferente do planejado: alerta só na 2ª leitura seguida", () => {
  const hist = historicoNormal();
  const primeira = leitura("2026-12-06", 12, 7); // Meta: 272
  const ctxPlan = (a: LeituraConta, h: LeituraConta[], plan: number | null) => ({ ...ctx(a, h), orcamentoPlanejado: plan });
  // acabou de mudar o planejado para 400: a 1ª leitura (sem leitura anterior de hoje divergente) não alerta
  assert.deepEqual(avaliarConta(ctxPlan(primeira, hist, 400)).map((a) => a.tipo), []);
  const segunda = leitura("2026-12-06", 12, 37);
  const r = avaliarConta(ctxPlan(segunda, [...hist, primeira], 400));
  assert.deepEqual(r.map((a) => a.tipo), ["ads_orcamento_divergente"]);
  assert.match(r[0].mensagem, /Planejado no painel: US\$ 400\.00/);
  assert.match(r[0].mensagem, /abaixo do planejado/);
  // dentro da tolerância (272 × 275 = 1%) ou sem planejado: nada
  assert.deepEqual(avaliarConta(ctxPlan(segunda, [...hist, primeira], 275)), []);
  assert.deepEqual(avaliarConta(ctxPlan(segunda, [...hist, primeira], null)), []);
});
