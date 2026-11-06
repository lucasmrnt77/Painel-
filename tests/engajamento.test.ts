import { test } from "node:test";
import assert from "node:assert/strict";
import { diagnosticar, ordenarEngajamento, type LinhaEngajamento } from "../src/lib/engajamento";

const l = (x: Partial<LinhaEngajamento>): LinhaEngajamento => ({
  site: "General", landing: "/v1", pais: "UY", visitas: 200, comDado: 200, inscreveu: 20, abandonouForm: 10, saiuRapido: 100,
  ficouSemForm: 70, rolouMetade: 50, medianaSegundos: 6, medianaCarregamentoMs: 1200, medianaCarregamentoSaiuRapidoMs: 1100, ...x,
});

test("maior perda em quem sai em menos de 5 s: headline", () => {
  assert.equal(diagnosticar(l({})), "headline");
});

test("quem sai rápido esperou mais de 3 s para a página abrir: página lenta, não headline", () => {
  assert.equal(diagnosticar(l({ medianaCarregamentoSaiuRapidoMs: 4200 })), "lenta");
});

test("leem e não tocam no formulário: página; começam e não enviam: formulário", () => {
  assert.equal(diagnosticar(l({ saiuRapido: 40, ficouSemForm: 130 })), "pagina");
  assert.equal(diagnosticar(l({ saiuRapido: 40, ficouSemForm: 40, abandonouForm: 100 })), "formulario");
});

test("empate (menos de 5 pontos) e poucos dados", () => {
  assert.equal(diagnosticar(l({ saiuRapido: 80, ficouSemForm: 75, abandonouForm: 25 })), "ok");
  assert.equal(diagnosticar(l({ comDado: 60 })), "poucos_dados");
});

test("ordem: site, página, país", () => {
  const r = ordenarEngajamento([l({ site: "Trader", landing: "/" }), l({ landing: "/v2", pais: "AR" }), l({ landing: "/", pais: "UY" }), l({ landing: "/", pais: "AR" })]);
  assert.deepEqual(r.map((x) => `${x.site}${x.landing}${x.pais}`), ["General/AR", "General/UY", "General/v2AR", "Trader/UY"]);
});
