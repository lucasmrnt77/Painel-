import { test } from "node:test";
import assert from "node:assert/strict";
import { lerAviso, totaisPorTipo, type LinhaCaminho } from "../src/lib/recuperacao-caminhos";

test("aviso do Unnichat: tipo pelo caminho (A–E botão, F–J link) e etapa padrão 'enviado'", () => {
  assert.deepEqual(lerAviso({ telefone: "+598 99 123 456", caminho: "c" }), { telefone: "+59899123456", caminho: "C", tipo: "botao", etapa: "enviado", fluxo: null });
  assert.deepEqual(lerAviso({ phone: "5491122334455", caminho: "H", etapa: "enviado" }), { telefone: "5491122334455", caminho: "H", tipo: "link", etapa: "enviado", fluxo: null });
  assert.equal((lerAviso({ telefone: "59899123456", caminho: "A", etapa: "clicou" }) as { etapa: string }).etapa, "clicou");
});

test("variável não preenchida ou caminho errado: recusa", () => {
  assert.deepEqual(lerAviso({ telefone: "{{telefone}}", caminho: "A" }), { erro: "telefone_invalido" });
  assert.deepEqual(lerAviso({ telefone: "59899123456", caminho: "AA" }), { erro: "caminho_invalido" });
});

test("totais por tipo e vencedor só com 100 pessoas em cada", () => {
  const l = (caminho: string, tipo: "botao" | "link", receberam: number, clicaram: number, entraram: number): LinhaCaminho => ({ caminho, tipo, receberam, clicaram, entraram, jaEstavam: 0, medianaHoras: 1 });
  const poucos = totaisPorTipo([l("A", "botao", 40, 20, 10), l("F", "link", 40, 0, 14)]);
  assert.equal(poucos.vencedor, null);
  assert.equal(poucos.botao.taxaClique, 0.5);
  const r = totaisPorTipo([l("A", "botao", 60, 30, 12), l("B", "botao", 60, 25, 15), l("F", "link", 55, 0, 20), l("G", "link", 50, 0, 18)]);
  assert.equal(r.botao.receberam, 120);
  assert.equal(r.link.entraram, 38);
  assert.equal(r.vencedor, "link");
});
