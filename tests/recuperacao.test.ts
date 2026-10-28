import { test } from "node:test";
import assert from "node:assert/strict";
import { lerEnvios, resumoRecuperacao, type LinhaRecuperacao } from "../src/lib/recuperacao";

const l = (k: string, envio: string, entrou: boolean, min: number | null, extra: Partial<LinhaRecuperacao> = {}): LinhaRecuperacao =>
  ({ telefone_chave: k, primeiro_envio: envio, envios: 1, conta: 1, historico: false, site: "General", entrou_depois: entrou, minutos_ate_entrar: min, ...extra });

test("recuperação: resumo, taxas e tempo até entrar", () => {
  const r = resumoRecuperacao([
    l("a", "2026-10-28T15:00:00Z", true, 12),
    l("b", "2026-10-28T16:00:00Z", true, 300, { site: "Jubilar" }),
    l("c", "2026-10-28T17:00:00Z", false, null, { envios: 2 }),
    l("d", "2026-10-27T15:00:00Z", true, 2000, { conta: 2 }),
    l("e", "2026-10-26T03:00:00Z", true, 30, { historico: true }),
  ]);
  assert.equal(r.pessoas, 5);
  assert.equal(r.mensagens, 6);
  assert.equal(r.entraram, 4);
  assert.equal(r.taxa, 0.8);
  assert.equal(r.em1h, 1); // histórico fica fora (só tem o dia)
  assert.equal(r.em24h, 3);
  assert.equal(r.medianaMinutos, 300); // 12, 300, 2000
  assert.deepEqual(r.porDia.map((d) => d.chave), ["2026-10-28", "2026-10-27", "2026-10-26"]);
  assert.equal(r.porDia[0].taxa, 2 / 3);
  assert.equal(r.porSite.find((s) => s.chave === "Jubilar")?.entraram, 1);
  assert.deepEqual(r.porConta.map((c) => c.chave), ["Conta 1", "Conta 2"]);
  assert.equal(r.temHistorico, true);
  assert.equal(resumoRecuperacao([]).taxa, null);
});

test("recuperação: leitura do corpo do Apps Script", () => {
  const agora = new Date("2026-10-28T20:00:00Z");
  const e = lerEnvios({ envios: [
    { telefone: "+598 99 123 456", conta: 1, http: 200 },
    { telefone: "5491150000301", enviado_em: "2026-10-27", origem: "historico" },
    { telefone: "123" },
    { telefone: "5491150000302", enviado_em: "lixo", conta: 999, http: 9999 },
  ] }, agora);
  assert.equal(e.length, 3);
  assert.deepEqual(e[0], { telefone: "59899123456", enviado_em: agora.toISOString(), conta: 1, http: 200, origem: "script" });
  assert.equal(e[1].origem, "historico");
  assert.equal(e[1].enviado_em, "2026-10-27T00:00:00.000Z");
  assert.deepEqual([e[2].conta, e[2].http, e[2].enviado_em], [null, null, agora.toISOString()]);
  assert.deepEqual(lerEnvios(null), []);
});
