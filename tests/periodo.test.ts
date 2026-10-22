import { test } from "node:test";
import assert from "node:assert/strict";
import { lerPeriodo, rotuloPeriodo, temPeriodo } from "../src/lib/periodo";

test("período: datas válidas, inválidas e invertidas", () => {
  assert.deepEqual(lerPeriodo("2026-10-23", "2026-10-25"), { de: "2026-10-23", ate: "2026-10-25" });
  assert.deepEqual(lerPeriodo("2026-10-25", "2026-10-23"), { de: "2026-10-23", ate: "2026-10-25" });
  assert.deepEqual(lerPeriodo("2026-02-30", "x"), { de: null, ate: null });
  assert.deepEqual(lerPeriodo(undefined, "2026-10-25"), { de: null, ate: "2026-10-25" });
  assert.equal(temPeriodo({ de: null, ate: null }), false);
});

test("período: rótulo", () => {
  assert.equal(rotuloPeriodo({ de: "2026-10-23", ate: "2026-10-25" }), "23/10 a 25/10/2026");
  assert.equal(rotuloPeriodo({ de: "2026-12-30", ate: "2027-01-02" }), "30/12/2026 a 02/01/2027");
  assert.equal(rotuloPeriodo({ de: "2026-10-23", ate: null }), "desde 23/10/2026");
});
