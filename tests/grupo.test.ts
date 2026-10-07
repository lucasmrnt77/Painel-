import { test } from "node:test";
import assert from "node:assert/strict";
import { argsResumoGrupo, hrefGrupo, lerFiltrosGrupo, queryListaGrupo, telefoneComDdi } from "../src/lib/grupo-filtros";

const agora = new Date("2026-10-07T20:00:00Z"); // 17h no Uruguai

test("grupo: período padrão é 7 dias, começando 00h do Uruguai", () => {
  const f = lerFiltrosGrupo({}, agora);
  assert.equal(f.periodo, "7d");
  assert.equal(f.desde, "2026-10-01T03:00:00.000Z");
  assert.equal(f.pagina, 1);
});

test("grupo: hoje começa às 00h do Uruguai; tudo não tem início", () => {
  assert.equal(lerFiltrosGrupo({ periodo: "hoje" }, agora).desde, "2026-10-07T03:00:00.000Z");
  assert.equal(lerFiltrosGrupo({ periodo: "tudo" }, agora).desde, null);
});

test("grupo: filtros vão para o resumo e para a lista", () => {
  const f = lerFiltrosGrupo({ periodo: "tudo", pais: "Argentina", source: "(sem UTM)", q: "ana@x.com" }, agora);
  assert.deepEqual(argsResumoGrupo(f), { p_desde: null, p_ate: null, p_pais: "Argentina", p_source: "(sem UTM)", p_campaign: null, p_content: null });
  const q = queryListaGrupo(f, "id");
  assert.equal(q.get("pais"), "eq.Argentina");
  assert.equal(q.get("utm_source"), "is.null");
  assert.equal(q.get("or"), "(email.ilike.*ana@x.com*)");
});

test("grupo: busca por número procura também no telefone", () => {
  const f = lerFiltrosGrupo({ q: "5491123" }, agora);
  assert.equal(queryListaGrupo(f, "id").get("or"), "(email.ilike.*5491123*,telefono.like.*5491123*)");
});

test("grupo: busca não deixa passar caracteres do PostgREST", () => {
  const f = lerFiltrosGrupo({ q: "a,b)(or=x*" }, agora);
  assert.equal(f.q, "aborx");
});

test("grupo: links mantêm filtros e tiram a página", () => {
  const f = lerFiltrosGrupo({ periodo: "30d", pais: "Uruguay", pagina: "3" }, agora);
  assert.equal(hrefGrupo(f, { periodo: "hoje" }), "/grupo?periodo=hoje&pais=Uruguay");
  assert.equal(hrefGrupo(f, { pais: null }), "/grupo?periodo=30d");
  assert.equal(hrefGrupo(f, { pagina: "2" }), "/grupo?periodo=30d&pais=Uruguay&pagina=2");
});

test("grupo: telefone com DDI para leitura", () => {
  assert.equal(telefoneComDdi("5491123456789"), "+54 91123456789");
  assert.equal(telefoneComDdi("59899123456"), "+598 99123456");
});
