import { test } from "node:test";
import assert from "node:assert/strict";
import { estadoFunil, slugDoNome, SLUG_FUNIL } from "../src/lib/redir-status";

const f = { limite_cliques: 600, link_reserva: null };
const g = (status: string, cliques = 0) => ({ status, cliques });

test("funil sem grupos", () => {
  assert.equal(estadoFunil(f, []).nivel, "vazio");
});

test("sem grupo na fila: parado, ou indo para a reserva", () => {
  assert.equal(estadoFunil(f, [g("cheio", 600), g("pausado")]).nivel, "parado");
  const r = estadoFunil({ ...f, link_reserva: "https://x" }, [g("cheio", 600)]);
  assert.equal(r.nivel, "parado");
  assert.equal(r.rotulo, "Sem grupo na fila");
});

test("um grupo só ou poucas vagas: atenção", () => {
  assert.equal(estadoFunil(f, [g("ativo", 10)]).nivel, "atencao");
  const r = estadoFunil(f, [g("ativo", 500), g("ativo", 300)]);
  assert.equal(r.nivel, "atencao");
  assert.equal(r.vagas, 400);
});

test("cliques sem grupo hoje viram atenção", () => {
  assert.equal(estadoFunil(f, [g("ativo"), g("ativo")], 3).nivel, "atencao");
});

test("funcionando", () => {
  const r = estadoFunil(f, [g("ativo", 100), g("ativo"), g("cheio", 600), g("redefinindo")]);
  assert.equal(r.nivel, "ok");
  assert.equal(r.naFila, 2);
  assert.equal(r.total, 4);
  assert.equal(r.aguardandoLink, 1);
});

test("final do link a partir do nome", () => {
  assert.equal(slugDoNome("Trader Dezembro"), "trader-dezembro");
  assert.equal(slugDoNome("  Lançamento  #3 "), "lancamento-3");
  assert.ok(SLUG_FUNIL.test(slugDoNome("Grupo gratuito OP Futuros")));
  assert.ok(slugDoNome("x".repeat(50)).length <= 30);
});
