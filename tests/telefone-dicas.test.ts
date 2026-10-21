import { test } from "node:test";
import assert from "node:assert/strict";
import { dicaDoMotivo } from "../src/lib/telefone-dicas";

test("causa e correção por tipo de problema", () => {
  assert.equal(dicaDoMotivo("Argentina: falta o código de área (veio só 15 + número)").sugestaoConfiavel, true);
  assert.equal(dicaDoMotivo("Uruguai: parece número argentino digitado com o 598").sugestaoConfiavel, true);
  assert.equal(dicaDoMotivo("Uruguai: um dígito a mais").sugestaoConfiavel, false);
  assert.equal(dicaDoMotivo("número de teste (dígitos repetidos ou em sequência)").descartar, true);
  assert.match(dicaDoMotivo("Argentina: faltam dígitos (9 de 10)").causa, /incompleto/);
  assert.match(dicaDoMotivo("Uruguai: dígitos a mais (11 de 8) (país informado diferente)").causa, /Dígitos a mais/);
  assert.match(dicaDoMotivo(null).causa, /desconhecido/);
});
