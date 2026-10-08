import { test } from "node:test";
import assert from "node:assert/strict";
import {
  casosEventos, conferirRegistros, conferirResposta, lerResultadoNavegador, mensagemTestes, qualificaEsperado,
  type Execucao,
} from "../src/lib/testes-casos";

test("casos: cobrem a matriz inteira (148 + duplicado = 149 verificações)", () => {
  const c = casosEventos();
  assert.equal(c.length, 148);
  assert.equal(c.filter((x) => x.grupo === "Argentina").length, 84);
  assert.equal(c.filter((x) => x.evento === "Lead Qualificado").length, 54);
});

test("regra esperada: Argentina", () => {
  assert.equal(qualificaEsperado("AR", "si_puedo", "mujer", "menor_25"), true);
  assert.equal(qualificaEsperado("AR", "si_puedo", null, null), true);
  for (const f of ["35_44", "45_54", "55_64"]) assert.equal(qualificaEsperado("AR", "no_pero_podria", "hombre", f), true);
  for (const f of ["menor_25", "25_34", "mayor_65", null]) assert.equal(qualificaEsperado("AR", "no_pero_podria", "hombre", f), false);
  assert.equal(qualificaEsperado("AR", "no_pero_podria", "mujer", "45_54"), false);
  assert.equal(qualificaEsperado("AR", "no_pero_podria", null, "45_54"), false);
  assert.equal(qualificaEsperado("AR", "no_imposible", "hombre", "45_54"), false);
  assert.equal(qualificaEsperado("AR", null, "hombre", "45_54"), false);
});

test("regra esperada: outros países e textos", () => {
  assert.equal(qualificaEsperado("UY", "no_pero_podria", "mujer", "menor_25"), true);
  assert.equal(qualificaEsperado("BR", "si_puedo", null, null), true);
  assert.equal(qualificaEsperado("MX", "no_imposible", "hombre", "45_54"), false);
  assert.equal(qualificaEsperado(null, "no_pero_podria", "mujer", null), true);
  assert.equal(qualificaEsperado("AR", "No hoy, pero podría organizarme para conseguirlo", "Masculino", "35 a 44 años"), true);
  assert.equal(qualificaEsperado("AR", "No hoy, pero podría organizarme para conseguirlo", "Masculino", "+65"), false);
});

test("conferirResposta: aponta o que veio errado", () => {
  const caso = casosEventos().find((c) => c.nome === "AR · no_pero_podria · mujer · 45_54")!;
  assert.equal(caso.evento, null);
  assert.equal(conferirResposta(caso, "e1", { http: 200, corpo: { ok: true, evento: null, qualificado: false, event_id: "e1" } }), null);
  assert.match(conferirResposta(caso, "e1", { http: 200, corpo: { ok: true, evento: "Lead Qualificado", qualificado: true, event_id: "e1" } })!, /esperado "nenhum"/);
  assert.match(conferirResposta(caso, "e1", { http: 500, corpo: null })!, /HTTP 500/);
  assert.match(conferirResposta(caso, "e1", { http: 200, corpo: { ok: true, evento: null, qualificado: false, event_id: "outro" } })!, /event_id/);
  const invalido = casosEventos().find((c) => c.nome === "landing inválida")!;
  assert.equal(conferirResposta(invalido, "e2", { http: 400, corpo: { ok: false, erro: "x" } }), null);
  assert.match(conferirResposta(invalido, "e2", { http: 200, corpo: { ok: true } })!, /HTTP 200/);
});

test("conferirRegistros: faltando, duplicado, falhou, sem confirmação, a mais", () => {
  const ok = { status: "enviado", teste: true, meta_resposta: { events_received: 1 } };
  const esperados = [{ eventId: "a", evento: "Lead Qualificado" }, { eventId: "b", evento: "Lead General" }];
  assert.deepEqual(conferirRegistros(esperados, [{ event_name: "Lead Qualificado", event_id: "a", ...ok }, { event_name: "Lead General", event_id: "b", ...ok }]), []);
  const f = conferirRegistros(esperados, [
    { event_name: "Lead Qualificado", event_id: "a", ...ok },
    { event_name: "Lead Qualificado", event_id: "a", ...ok },
    { event_name: "Lead Qualificado", event_id: "z", ...ok },
  ]);
  assert.ok(f.some((m) => /a: registrado 2 vezes/.test(m)));
  assert.ok(f.some((m) => /b: não foi registrado/.test(m)));
  assert.ok(f.some((m) => /z: foi registrado mas não deveria/.test(m)));
  const g = conferirRegistros([{ eventId: "a", evento: "Lead Qualificado" }], [{ event_name: "Lead Qualificado", event_id: "a", status: "enviado", teste: false, meta_resposta: { events_received: 0 } }]);
  assert.ok(g.some((m) => /não foi marcado como teste/.test(m)));
  assert.ok(g.some((m) => /não confirmou/.test(m)));
  const h = conferirRegistros([{ eventId: "a", evento: "Lead Qualificado" }], [{ event_name: "Lead Qualificado", event_id: "a", status: "falhou", teste: true, meta_resposta: null }]);
  assert.ok(h.some((m) => /status "falhou"/.test(m)));
});

test("lerResultadoNavegador: valida e recalcula totais", () => {
  assert.equal(lerResultadoNavegador(null), null);
  assert.equal(lerResultadoNavegador({ resumo: [] }), null);
  const r = lerResultadoNavegador({
    resumo: [{ nome: "Grupo", total: 3, falhas: 1 }, { nome: "General", total: 4, falhas: 0 }, { nome: 5 }],
    detalhes: [{ teste: "Grupo: pixel", motivo: "sem eid" }, "lixo"],
    duracao_ms: 1200, disparo: "manual", ok: true,
  })!;
  assert.equal(r.origem, "navegador");
  assert.equal(r.disparo, "manual");
  assert.equal(r.total, 7);
  assert.equal(r.falhas, 1);
  assert.equal(r.ok, false); // o "ok" enviado é ignorado: vale a soma das falhas
  assert.equal(r.detalhes.length, 1);
});

test("mensagem do WhatsApp", () => {
  const e: Execucao = { origem: "servidor", disparo: "agendado", ok: false, total: 150, falhas: 2, duracao_ms: 1, resumo: [], detalhes: [{ teste: "X", motivo: "Y" }, { teste: "Z", motivo: "W" }] };
  assert.match(mensagemTestes(e, false), /falharam.*\n2 de 150[\s\S]*• X: Y/);
  assert.match(mensagemTestes({ ...e, ok: true, falhas: 0 }, true), /voltaram a passar/);
});
