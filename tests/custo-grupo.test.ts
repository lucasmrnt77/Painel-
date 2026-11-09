import { test } from "node:test";
import assert from "node:assert/strict";
import { resumirCusto, type LinhaCusto } from "../src/lib/custo-grupo";

const l = (dia: string, funil: LinhaCusto["funil"], investimento: number, leads: number, noGrupo: number): LinhaCusto => ({ dia, funil, investimento, leads, noGrupo });

test("custo por lead no grupo: total e por dia, por funil (números reais de 07–08/11)", () => {
  const r = resumirCusto([
    l("2026-11-07", "general", 246.95, 83, 64), l("2026-11-07", "jubilados", 117.13, 61, 34), l("2026-11-07", "trader", 191.24, 59, 48),
    l("2026-11-08", "general", 274.84, 77, 58), l("2026-11-08", "jubilados", 134.87, 67, 46), l("2026-11-08", "trader", 239.66, 74, 60),
    l("2026-10-20", "general", 0, 5, 3), // antes das campanhas: sem gasto, fora
  ]);
  assert.deepEqual(r.dias.map((d) => d.dia), ["2026-11-08", "2026-11-07"]);
  assert.equal(r.total.porFunil.general.cplGrupo!.toFixed(2), "4.28");
  assert.equal(r.total.porFunil.jubilados.cplGrupo!.toFixed(2), "3.15");
  assert.equal(r.total.porFunil.trader.cplGrupo!.toFixed(2), "3.99");
  assert.equal(r.total.geral.cplGrupo!.toFixed(2), "3.89");
  assert.equal(r.dias[0].porFunil.general.cplGrupo!.toFixed(2), "4.74");
  assert.equal(r.total.geral.leads, 421);
});

test("funil sem ninguém no grupo: CPL no grupo vazio (não divide por zero)", () => {
  const r = resumirCusto([l("2026-11-09", "trader", 10, 2, 0)]);
  assert.equal(r.total.porFunil.trader.cplGrupo, null);
  assert.equal(r.total.porFunil.general.cplGrupo, null);
});
