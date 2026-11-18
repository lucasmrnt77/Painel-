import { test } from "node:test";
import assert from "node:assert/strict";
import { intervaloContagem, faixaCusto, decidir, codigoCriativo, agrupar, alvoDe, type LinhaAnuncio } from "../src/lib/decisao-anuncios";

const perto = (a: number, b: number, tol = 0.05) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

test("decisão por anúncio: intervalo de 95% da contagem (perto do exato)", () => {
  const [i5, s5] = intervaloContagem(5); perto(i5, 1.62); perto(s5, 11.67, 0.1);
  const [i0, s0] = intervaloContagem(0); assert.equal(i0, 0); perto(s0, 3.69, 0.1);
  const [i77, s77] = intervaloContagem(77); perto(i77, 60.8, 0.3); perto(s77, 96.2, 0.3);
});

test("decisão por anúncio: faixa de custo e regras", () => {
  const f = faixaCusto(337, 77);
  perto(f.custo!, 4.38); perto(f.min, 3.5, 0.1); perto(f.max, 5.54, 0.1);
  assert.equal(faixaCusto(10, 0).max, Infinity);
  // comprovado abaixo do alvo → escalar
  assert.equal(decidir(337, 77, 10).decisao, "escalar");
  // poucos dados → manter
  assert.equal(decidir(44, 5, 10).decisao, "manter");
  // 3× o alvo sem qualificado → pausar; menos que isso → manter
  assert.equal(decidir(31, 0, 10).decisao, "pausar");
  assert.equal(decidir(29, 0, 10).decisao, "manter");
  // comprovado acima do alvo → pausar
  assert.equal(decidir(600, 30, 10).decisao, "pausar");
  // sem alvo → manter
  assert.equal(decidir(100, 5, null).motivo, "sem_alvo");
});

test("decisão por anúncio: código do criativo, agrupamento e alvo", () => {
  assert.equal(codigoCriativo("[T] Anuncio130v2_(set26)"), "130v2");
  assert.equal(codigoCriativo("[T] Anuncio162_(dez26)"), "162");
  assert.equal(codigoCriativo("Outro nome"), "Outro nome");
  const base = { funil: "trader", pais: "US", campanha: "C", publico: "P", ad_status: "PAUSED", visitas: 10, primeiro_dia: "2026-11-10", ultimo_dia: "2026-11-12", leads: 5, qualificados: 5, no_grupo: 4, qualificados_no_grupo: 4 };
  const ls: LinhaAnuncio[] = [
    { ...base, ad_id: "1", criativo: "[T] Anuncio130v2_(set26)", investimento: 50 },
    { ...base, ad_id: "2", criativo: "[T] Anuncio130v2_(set26)", investimento: 20, publico: "Q", ad_status: "ACTIVE", ultimo_dia: "2026-11-17" },
    { ...base, ad_id: "3", criativo: "[T] Anuncio130v2_(set26)", investimento: 7, pais: "AR" },
  ];
  const g = agrupar(ls, "criativo");
  assert.equal(g.length, 2);
  const us = g.find((x) => x.pais === "US")!;
  assert.equal(us.investimento, 70); assert.equal(us.qualificados, 10); assert.equal(us.anuncios, 2); assert.equal(us.ativos, 1);
  assert.equal(us.publico, null); assert.equal(us.ultimo_dia, "2026-11-17");
  assert.equal(agrupar(ls, "anuncio").length, 3);
  const pr = [{ funil: "general", pais: "AR", cpl_base: 2 }, { funil: "trader", pais: "US", cpl_base: 10.01 }];
  assert.equal(alvoDe(pr, "jubilados", "AR"), 2);
  assert.equal(alvoDe(pr, "trader", "US"), 10.01);
  assert.equal(alvoDe(pr, "trader", "UY"), null);
});
