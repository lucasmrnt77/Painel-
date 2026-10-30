import { test } from "node:test";
import assert from "node:assert/strict";
import { avaliarConta, casaFiltro, type LeituraConta } from "../src/lib/meta-conta-regras";

const BR = (dia: string, h: number, m = 0) => new Date(`${dia}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00-03:00`);

// Dezembro/2026: ~US$ 272/dia somando os orçamentos; limite da Meta US$ 1.833,15
const leitura = (x: Partial<LeituraConta> = {}, h = 12): LeituraConta => ({
  status: 1, motivo: null, limiteDiario: 1833.15, moeda: "USD", lidoEm: BR("2026-12-06", h).toISOString(),
  campanhas: [
    { id: "1", nome: "[PC][LEADS][DEZ26][AR][General] Teste", orcamentoDia: 136, gastoHoje: 70 },
    { id: "2", nome: "[PC][LEADS][DEZ26][UY][General] Teste", orcamentoDia: 136, gastoHoje: 66 },
  ],
  ...x,
});
const ctx = (atual: LeituraConta, anterior: LeituraConta | null = null, agora = BR("2026-12-06", 12, 7)) => ({
  lancamentoId: 5, nome: "Dezembro 2026", horaInicio: 6, atual, anterior, ultimoRitmoEm: null, agora,
});

test("filtro do painel (ILIKE) casa com o nome das campanhas", () => {
  assert.ok(casaFiltro("%[DEZ26]%", "[PC][LEADS][DEZ26][AR][Trader] Teste de Página 02"));
  assert.ok(!casaFiltro("%[DEZ26]%", "[PC][WPP] Teste API 2"));
  assert.ok(casaFiltro("%aquecimento de conta%", "[PC][LEADS][CBO][UY] Aquecimento de Conta"));
});

test("tudo normal: nenhum alerta", () => {
  assert.deepEqual(avaliarConta(ctx(leitura())), []);
});

test("conta em análise de risco: só esse alerta", () => {
  const r = avaliarConta(ctx(leitura({ status: 7, motivo: 3 })));
  assert.deepEqual(r.map((a) => a.tipo), ["ads_conta_bloqueada"]);
  assert.match(r[0].mensagem, /em análise de risco/);
  assert.match(r[0].mensagem, /risco de pagamento/);
});

test("Meta baixou o limite diário", () => {
  const r = avaliarConta(ctx(leitura({ limiteDiario: 250 }), leitura()));
  assert.deepEqual(r.map((a) => a.tipo), ["ads_limite_reduzido"]);
  assert.match(r[0].mensagem, /antes: US\$ 1833\.15/);
});

test("limite abaixo da soma dos orçamentos (sem leitura anterior)", () => {
  const r = avaliarConta(ctx(leitura({ limiteDiario: 200 })));
  assert.deepEqual(r.map((a) => a.chave), ["ads_limite_reduzido:5:abaixo:2026-12-06"]);
});

test("gasto abaixo do ritmo do orçamento → alerta com as campanhas atrasadas", () => {
  const atual = leitura({ campanhas: [
    { id: "1", nome: "AR General", orcamentoDia: 136, gastoHoje: 5 },
    { id: "2", nome: "UY General", orcamentoDia: 136, gastoHoje: 60 },
  ] });
  const r = avaliarConta(ctx(atual));
  assert.deepEqual(r.map((a) => a.tipo), ["ads_ritmo_baixo"]);
  assert.match(r[0].mensagem, /AR General/);
  assert.doesNotMatch(r[0].mensagem, /UY General/);
});

test("ritmo: antes das 6h, repetido há menos de 2 h ou orçamento que sobe sozinho", () => {
  const baixo = leitura({ campanhas: [{ id: "1", nome: "x", orcamentoDia: 272, gastoHoje: 1 }] }, 5);
  assert.deepEqual(avaliarConta(ctx(baixo, null, BR("2026-12-06", 5, 7))), []);
  const r = avaliarConta({ ...ctx(leitura({ campanhas: [{ id: "1", nome: "x", orcamentoDia: 272, gastoHoje: 10 }] })), ultimoRitmoEm: BR("2026-12-06", 11).toISOString() });
  assert.deepEqual(r, []);
  // Orçamento aumentado para 500: às 12h espera ~250; gastou 136 → ok (>50%)
  const maior = leitura({ campanhas: [{ id: "1", nome: "x", orcamentoDia: 500, gastoHoje: 136 }] });
  assert.deepEqual(avaliarConta(ctx(maior)), []);
});
