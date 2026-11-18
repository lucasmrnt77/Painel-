import { test } from "node:test";
import assert from "node:assert/strict";
import { mensagemAlerta } from "../src/lib/mensagens";
import { monitorVaiProWhatsapp } from "../src/lib/politica-alertas";

test("alerta de intrusos lista os números e o grupo, e vai para o WhatsApp", () => {
  const m = mensagemAlerta("intrusos_grupo", "Lanzamiento Diciembre", {
    grupo: "La Semana del Inversionista #49", inicio: "2026-11-17T21:25:13Z",
    telefones: ["5493435063104", "5493624123451", "5493624694837"],
  });
  assert.match(m, /3 números sem inscrição/);
  assert.match(m, /La Semana del Inversionista #49/);
  assert.match(m, /18:25/);
  assert.match(m, /\+5493435063104\n\+5493624123451\n\+5493624694837/);
  assert.equal(monitorVaiProWhatsapp("intrusos_grupo"), true);
});
