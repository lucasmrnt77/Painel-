import { test } from "node:test";
import assert from "node:assert/strict";
import { avaliarAds, avaliarGastoMinimo, divergenciaEventos, type EntradaAds, type EntradaGastoMinimo } from "../src/lib/meta-ads-regras";

// Horário de Brasília/Uruguai = UTC-3
const BR = (dia: string, h: number, m = 0) => new Date(`${dia}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00-03:00`);

// OP Futuros real (out/2026): ~US$ 10/dia, 4 anúncios ativos
const dias = [
  { data: "2026-10-15", investimento: 10.1, ativos: 4 },
  { data: "2026-10-16", investimento: 8.0, ativos: 4 },
  { data: "2026-10-17", investimento: 9.14, ativos: 4 },
  { data: "2026-10-18", investimento: 12.82, ativos: 4 },
  { data: "2026-10-19", investimento: 4.26, ativos: 4 },
];
const base = (x: Partial<EntradaAds>): EntradaAds => ({
  lancamentoId: 3, nome: "OP Futuros", moeda: "USD", cplMaximo: 8, dias,
  ultimaSync: BR("2026-10-19", 15).toISOString(),
  leads: { "2026-10-18": 9, "2026-10-19": 4 }, jaExistem: new Set(), agora: BR("2026-10-19", 15, 37), ...x,
});

test("dia normal: nenhuma alerta", () => {
  assert.deepEqual(avaliarAds(base({}), false), []);
});

test("sincronização parada há 20 h: só avisa isso", () => {
  const r = avaliarAds(base({ ultimaSync: BR("2026-10-18", 15).toISOString(), agora: BR("2026-10-19", 12) }), false);
  assert.deepEqual(r.map((a) => a.tipo), ["ads_sem_dados"]);
});

test("começo do dia sem gasto não dá falso alarme", () => {
  const d = dias.map((x) => (x.data === "2026-10-19" ? { ...x, investimento: 0 } : x));
  const r = avaliarAds(base({ dias: d, ultimaSync: BR("2026-10-19", 3).toISOString(), agora: BR("2026-10-19", 9), leads: { "2026-10-18": 9, "2026-10-19": 0 } }), false);
  assert.deepEqual(r, []);
});

test("nada gasto até a sync da tarde: alerta parcial", () => {
  const d = dias.map((x) => (x.data === "2026-10-19" ? { ...x, investimento: 0 } : x));
  const r = avaliarAds(base({ dias: d }), false);
  assert.deepEqual(r.map((a) => a.chave), ["ads_sem_gasto:3:2026-10-19:parcial"]);
});

test("ontem quase sem gasto: alerta do dia fechado", () => {
  const d = dias.map((x) => (x.data === "2026-10-18" ? { ...x, investimento: 1.5 } : x));
  const r = avaliarAds(base({ dias: d }), false);
  assert.ok(r.some((a) => a.chave === "ads_sem_gasto:3:2026-10-18"));
  // Se a parcial de ontem já avisou, não repete
  const r2 = avaliarAds(base({ dias: d, jaExistem: new Set(["ads_sem_gasto:3:2026-10-18:parcial"]) }), false);
  assert.ok(!r2.some((a) => a.tipo === "ads_sem_gasto"));
});

test("custo por lead acima de US$ 8", () => {
  const r = avaliarAds(base({ leads: { "2026-10-18": 1, "2026-10-19": 4 } }), false);
  assert.deepEqual(r.map((a) => a.chave), ["ads_cpl_alto:3:2026-10-18"]);
  assert.match(r[0].mensagem, /US\$ 12\.82/);
  // Parcial: gastou US$ 9 e nenhum lead
  const d = dias.map((x) => (x.data === "2026-10-19" ? { ...x, investimento: 9 } : x));
  const p = avaliarAds(base({ dias: d, leads: { "2026-10-18": 9, "2026-10-19": 0 } }), false);
  assert.deepEqual(p.map((a) => a.chave), ["ads_cpl_alto:3:2026-10-19:parcial"]);
  // Menos de US$ 8 gastos ainda não avalia
  const q = avaliarAds(base({ leads: { "2026-10-18": 9, "2026-10-19": 0 } }), false);
  assert.deepEqual(q, []);
});

test("Meta × nosso: só alerta quando a Meta recebe menos de 80% do que enviamos", () => {
  // Caso real 24/10: 155 testes × 86 na Meta e 11 nossos — não é problema (antes dava "0 × 11")
  const meta = [{ evento: "Lead General", total: 75 }, { evento: "Lead Qualificado", total: 86 }];
  const testes = { "Lead General": 8, "Lead Qualificado": 155 };
  assert.deepEqual(divergenciaEventos(meta, testes, { "Lead General": 24, "Lead Qualificado": 11 }), []);
  // Meta com menos que 80% do nosso → problema
  const p = divergenciaEventos([{ evento: "Lead", total: 20 }], {}, { Lead: 30 });
  assert.equal(p.length, 1);
  assert.match(p[0], /faltam 33%/);
  // Evento que a Meta não tem nenhum
  assert.equal(divergenciaEventos([], {}, { "Lead Qualificado": 12 }).length, 1);
  // 80% ou mais → ok; abaixo de 10 nossos → não compara
  assert.deepEqual(divergenciaEventos([{ evento: "Lead", total: 24 }], {}, { Lead: 30 }), []);
  assert.deepEqual(divergenciaEventos([{ evento: "Lead", total: 0 }], {}, { Lead: 8 }), []);
});

// ── Gasto mínimo a cada 30 min (dezembro/2026)
const g = (x: Partial<EntradaGastoMinimo>): EntradaGastoMinimo => ({
  lancamentoId: 5, nome: "Dezembro 2026", moeda: "USD", limiar30: 10, horaInicio: 6,
  leituras: [
    { syncEm: BR("2026-12-06", 10).toISOString(), investimento: 100 },
    { syncEm: BR("2026-12-06", 10, 30).toISOString(), investimento: 112 },
  ],
  ultimoAlertaEm: null, agora: BR("2026-12-06", 10, 37), ...x,
});

test("gasto mínimo: gastou o mínimo nos 30 min → sem alerta", () => {
  assert.equal(avaliarGastoMinimo(g({})), null);
});

test("gasto mínimo: gastou menos nos 30 min → alerta", () => {
  const a = avaliarGastoMinimo(g({ leituras: [
    { syncEm: BR("2026-12-06", 10).toISOString(), investimento: 100 },
    { syncEm: BR("2026-12-06", 10, 30).toISOString(), investimento: 104 },
  ] }));
  assert.equal(a?.tipo, "ads_gasto_baixo");
  assert.equal(a?.dados.gasto, 4);
  assert.match(a!.mensagem, /10:00 às 10:30/);
});

test("gasto mínimo: intervalo maior → mínimo proporcional", () => {
  // 6 h entre 10h e 16h → mínimo 120; gastou 150 → ok
  const ok = avaliarGastoMinimo(g({ leituras: [
    { syncEm: BR("2026-12-06", 10).toISOString(), investimento: 100 },
    { syncEm: BR("2026-12-06", 16).toISOString(), investimento: 250 },
  ], agora: BR("2026-12-06", 16, 7) }));
  assert.equal(ok, null);
});

test("gasto mínimo: antes da hora de início, desligado ou repetido → sem alerta", () => {
  const madrugada = g({ leituras: [
    { syncEm: BR("2026-12-06", 3).toISOString(), investimento: 10 },
    { syncEm: BR("2026-12-06", 10).toISOString(), investimento: 11 },
  ] });
  assert.equal(avaliarGastoMinimo(madrugada), null);
  const baixo = [
    { syncEm: BR("2026-12-06", 10).toISOString(), investimento: 100 },
    { syncEm: BR("2026-12-06", 10, 30).toISOString(), investimento: 101 },
  ];
  assert.equal(avaliarGastoMinimo(g({ leituras: baixo, limiar30: null })), null);
  assert.equal(avaliarGastoMinimo(g({ leituras: baixo, ultimoAlertaEm: BR("2026-12-06", 9, 30).toISOString() })), null);
  assert.ok(avaliarGastoMinimo(g({ leituras: baixo, ultimoAlertaEm: BR("2026-12-06", 8).toISOString() })));
});

test("custo por lead: com hora de início 6h a parcial já é avaliada de manhã", () => {
  const d = [...dias, { data: "2026-10-20", investimento: 60, ativos: 10 }];
  const e = base({ dias: d, cplMaximo: 6, ultimaSync: BR("2026-10-20", 7).toISOString(), agora: BR("2026-10-20", 7, 7), leads: { "2026-10-19": 9, "2026-10-20": 5 } });
  assert.deepEqual(avaliarAds({ ...e, horaInicio: 6 }, false).map((a) => a.tipo), ["ads_cpl_alto"]);
  assert.deepEqual(avaliarAds(e, false), []); // padrão 12h
});
