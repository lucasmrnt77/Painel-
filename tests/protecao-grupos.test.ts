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

test("alerta de intrusos pede para redefinir o link e não fala mais em bloqueio", () => {
  const m = mensagemAlerta("intrusos_grupo", "L", { grupo: "G", inicio: "2026-11-17T21:25:13Z", telefones: ["1", "2", "3"] });
  assert.doesNotMatch(m, /bloquead/);
  assert.match(m, /Redefinir link/);
});

test("convite inválido (possível suspensão) sempre vai ao WhatsApp, com o número de membros", async () => {
  const { redirecionadorVaiProWhatsapp } = await import("../src/lib/politica-alertas");
  const { mensagemRedirecionador } = await import("../src/lib/mensagens");
  assert.equal(redirecionadorVaiProWhatsapp("invalido", true), true);
  const m = mensagemRedirecionador("invalido", "Geral", { grupo: "#49", membros: 283, proximo: "#47 (0 cliques)", restantes: 3 }) ?? "";
  assert.match(m, /suspensão do grupo pelo WhatsApp/);
  assert.match(m, /Pessoas que entraram no grupo: 283\./);
  assert.match(m, /Agora os cliques vão para \*#47/);
});

test("recuperação sem efeito vai ao WhatsApp e diz quantos envios e desde quando", () => {
  const m = mensagemAlerta("recuperacao_sem_efeito", "Lanzamiento Diciembre", { envios: 168, desde: "2026-11-19T00:21:00Z", ultima_entrada_em: "2026-11-19T00:14:00Z" });
  assert.match(m, /\*168 mensagens\*/);
  assert.match(m, /19\/11, 21:21|18\/11, 21:21/);
  assert.match(m, /ninguém entrou no grupo/);
  assert.equal(monitorVaiProWhatsapp("recuperacao_sem_efeito"), true);
});
