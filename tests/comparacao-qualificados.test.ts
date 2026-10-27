import { test } from "node:test";
import assert from "node:assert/strict";
import { compararQualificados, QUALIFICADOS } from "../src/lib/comparacao-qualificados";

const f = (evento: string, servidor: number | null, navegador: number | null, ok = true) => ({ evento, ok, servidor, navegador });

test("qualificados: tudo batendo = ok", () => {
  const r = compararQualificados([f("Lead General Qualificado", 20, 18)], { "Lead General Qualificado": 20 }, {}, ["Lead General Qualificado"]);
  assert.equal(r[0].situacao, "ok");
  assert.deepEqual(r[0].problemas, []);
});

test("qualificados: servidor da Meta = nosso + cópia do navegador (gateway) não é problema (alerta de 27/10)", () => {
  const r = compararQualificados([f("Lead General Qualificado", 144, 47)], { "Lead General Qualificado": 47 }, { "Lead General Qualificado": 52 }, ["Lead General Qualificado"]);
  assert.equal(r[0].situacao, "ok");
  const j = compararQualificados([f("Lead Jubilado Qualificado", 69, 34)], { "Lead Jubilado Qualificado": 36 }, { "Lead Jubilado Qualificado": 2 }, ["Lead Jubilado Qualificado"]);
  assert.equal(j[0].situacao, "ok");
});

test("qualificados: Meta com o dobro (exemplo do Emi: 10 nossos × 20 na Meta)", () => {
  const srv = compararQualificados([f("Lead General Qualificado", 30, 10)], { "Lead General Qualificado": 10 }, {}, ["Lead General Qualificado"]);
  assert.equal(srv[0].situacao, "meta_mais");
  assert.match(srv[0].problemas[0], /registrou 30 pelo servidor.*enviamos 10/);
  const nav = compararQualificados([f("Lead General Qualificado", 10, 20)], { "Lead General Qualificado": 10 }, {}, ["Lead General Qualificado"]);
  assert.equal(nav[0].situacao, "meta_mais");
  assert.match(nav[0].problemas[0], /navegador registrou 20/);
});

test("qualificados: testes do período não viram falso alarme", () => {
  const r = compararQualificados([f("Lead Trader Qualificado", 30, 12)], { "Lead Trader Qualificado": 12 }, { "Lead Trader Qualificado": 15 }, ["Lead Trader Qualificado"]);
  assert.equal(r[0].situacao, "ok");
});

test("qualificados: Meta com menos pelo servidor = eventos perdidos", () => {
  const r = compararQualificados([f("Lead Jubilado Qualificado", 5, 18)], { "Lead Jubilado Qualificado": 20 }, {}, ["Lead Jubilado Qualificado"]);
  assert.equal(r[0].situacao, "meta_menos");
  assert.match(r[0].problemas[0], /faltam 75%/);
});

test("qualificados: navegador com menos é normal (bloqueador de anúncios)", () => {
  const r = compararQualificados([f("Lead Jubilado Qualificado", 20, 12)], { "Lead Jubilado Qualificado": 20 }, {}, ["Lead Jubilado Qualificado"]);
  assert.equal(r[0].situacao, "ok");
});

test("qualificados: poucos eventos e sem dados não alertam", () => {
  const r = compararQualificados([f("Lead General Qualificado", 8, 9), f("Lead Trader Qualificado", null, null, false)], { "Lead General Qualificado": 4 }, {});
  assert.equal(r.length, QUALIFICADOS.length);
  assert.equal(r.find((x) => x.evento === "Lead General Qualificado")!.situacao, "poucos");
  assert.equal(r.find((x) => x.evento === "Lead Trader Qualificado")!.situacao, "sem_dados");
  assert.equal(r.find((x) => x.evento === "Lead Jubilado Qualificado")!.situacao, "sem_dados");
  assert.ok(r.every((x) => x.problemas.length === 0));
  assert.equal(compararQualificados(null, {}, {})[0].situacao, "sem_dados");
});
