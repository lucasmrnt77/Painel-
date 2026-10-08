import { test } from "node:test";
import assert from "node:assert/strict";
import { monitorVaiProWhatsapp, redirecionadorVaiProWhatsapp, testesVaiProWhatsapp } from "../src/lib/politica-alertas";

test("monitor: só falta de entradas (e o teste manual) vão para o WhatsApp", () => {
  assert.equal(monitorVaiProWhatsapp("sem_entradas"), true);
  assert.equal(monitorVaiProWhatsapp("teste"), true);
  assert.equal(monitorVaiProWhatsapp("resumo"), false);
  assert.equal(monitorVaiProWhatsapp("entradas_retomadas"), false);
});

test("redirecionador: só o que precisa de ajuste", () => {
  for (const t of ["sem_grupos", "redefinicao_sem_retorno", "redefinicao_falhou"]) assert.equal(redirecionadorVaiProWhatsapp(t, true), true, t);
  assert.equal(redirecionadorVaiProWhatsapp("cheio", true), false);
  assert.equal(redirecionadorVaiProWhatsapp("cheio", false), true);
  assert.equal(redirecionadorVaiProWhatsapp("invalido", true), false);
  assert.equal(redirecionadorVaiProWhatsapp("invalido", false), true);
  assert.equal(redirecionadorVaiProWhatsapp("link_novo", false), false);
});

test("testes diários: só quando falham", () => {
  assert.equal(testesVaiProWhatsapp(false), true);
  assert.equal(testesVaiProWhatsapp(true), false);
});
