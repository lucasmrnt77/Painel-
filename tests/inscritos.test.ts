import { test } from "node:test";
import assert from "node:assert/strict";
import { conjuntoEAnuncio, juntarEnvios, limitesUtc, montarResumo, paisDoTelefone, rotuloSite, rotuloVariacao } from "../src/lib/inscritos";

test("país pelo DDI, página e variação", () => {
  assert.equal(paisDoTelefone("59899123456"), "Uruguai");
  assert.equal(paisDoTelefone("5491100000961"), "Argentina");
  assert.equal(paisDoTelefone("5511900000971"), "Brasil");
  assert.equal(paisDoTelefone("12025550100"), "Outro");
  assert.equal(rotuloSite("Jubilar"), "Jubilados");
  assert.equal(rotuloVariacao("/"), "principal");
  assert.equal(rotuloVariacao("/v2"), "/v2");
});

test("conjunto|anúncio do utm_source", () => {
  assert.deepEqual(conjuntoEAnuncio("CONJ-TESTE|ANUNCIO-TESTE-T"), { conjunto: "CONJ-TESTE", anuncio: "ANUNCIO-TESTE-T" });
  assert.deepEqual(conjuntoEAnuncio("so-conjunto"), { conjunto: "so-conjunto", anuncio: null });
  assert.deepEqual(conjuntoEAnuncio(null), { conjunto: null, anuncio: null });
});

test("período no horário do Uruguai → UTC", () => {
  assert.deepEqual(limitesUtc({ de: "2026-10-23", ate: "2026-10-26" }), { desde: "2026-10-23T03:00:00Z", antes: "2026-10-27T03:00:00Z" });
  assert.deepEqual(limitesUtc({ de: null, ate: "2026-10-31" }), { desde: null, antes: "2026-11-01T03:00:00Z" });
});

test("envios da mesma pessoa: calificado mais recente, primeiro clique, origem mais recente", () => {
  const m = juntarEnvios([
    { telefone_chave: "1", criado_em: "2026-10-23T10:00:00Z", qualificado: false, clicou_grupo_em: "2026-10-23T10:05:00Z", origem: "Trader-Uruguay", pagina_obrigado: "/gracias-v1" },
    { telefone_chave: "1", criado_em: "2026-10-23T12:00:00Z", qualificado: true, clicou_grupo_em: "2026-10-23T12:01:00Z", origem: "Trader-Uruguay /v2", pagina_obrigado: "/gracias-v2" },
    { telefone_chave: null, criado_em: "2026-10-23T12:00:00Z", qualificado: true, clicou_grupo_em: null, origem: null, pagina_obrigado: null },
  ]);
  assert.deepEqual(m.get("1"), { qualificado: true, clicouEm: "2026-10-23T10:05:00Z", origem: "Trader-Uruguay /v2", gracias: "/gracias-v2" });
  assert.equal(m.size, 1);
});

test("resumo por página × variação, na ordem General, Trader, Jubilados", () => {
  const r = montarResumo(
    [{ site: "Trader", landing: "/v2", visitas: 100, leads: 10 }, { site: "General", landing: "/v1", visitas: 50, leads: 5 }, { site: "—", landing: "/", visitas: 0, leads: 3 }],
    [{ site: "Trader", landing: "/v2", leads: 6, leadsQualificados: 4 }],
  );
  assert.deepEqual(r.map((x) => [x.site, x.landing, x.visitas, x.inscricoes, x.cliquesGrupo, x.calificados]), [["General", "/v1", 50, 5, 0, 0], ["Trader", "/v2", 100, 10, 6, 4]]);
  assert.equal(r[1].conversao, 0.1);
  assert.equal(r[1].taxaClique, 0.6);
  assert.equal(montarResumo([{ site: "Trader", landing: "/v2", visitas: 1, leads: 1 }], [], "General").length, 0);
});
