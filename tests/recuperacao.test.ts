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

test("recuperação: funil, período e série do gráfico (30/10)", async () => {
  const { filtrarPeriodo, funilDe, serieRecuperacao, inicioPeriodo } = await import("../src/lib/recuperacao");
  const agora = new Date("2026-10-30T15:00:00Z"); // 12h no Uruguai
  assert.equal(funilDe("Trader"), "Trader");
  assert.equal(funilDe("Jubilar"), "General");
  assert.equal(funilDe("Gen-Jubilados"), "General");
  assert.equal(inicioPeriodo("hoje", agora), "2026-10-30");
  assert.equal(inicioPeriodo("3d", agora), "2026-10-28");
  assert.equal(inicioPeriodo("7d", agora), "2026-10-24");
  assert.equal(inicioPeriodo("tudo", agora), null);
  const ls = [
    l("a", "2026-10-30T13:10:00Z", true, 5), // 10h UY
    l("b", "2026-10-30T13:40:00Z", false, null),
    l("c", "2026-10-29T13:00:00Z", true, 50, { site: "Trader" }),
    l("d", "2026-10-26T13:00:00Z", true, 50),
  ];
  assert.equal(filtrarPeriodo(ls, "hoje", agora).length, 2);
  assert.equal(filtrarPeriodo(ls, "3d", agora).length, 3);
  assert.equal(filtrarPeriodo(ls, "7d", agora).length, 4);
  const hoje = serieRecuperacao(filtrarPeriodo(ls, "hoje", agora), "hoje", agora);
  assert.equal(hoje.length, 13); // 00h a 12h
  assert.deepEqual(hoje[10], { chave: "10", rotulo: "10h", recebidos: 2, entraram: 1, taxa: 0.5 });
  const sete = serieRecuperacao(filtrarPeriodo(ls, "7d", agora), "7d", agora);
  assert.equal(sete.length, 7);
  assert.equal(sete[0].rotulo, "24/10");
  assert.equal(sete[2].recebidos, 1); // 26/10
  assert.equal(sete[1].taxa, null); // dia sem envio
});
