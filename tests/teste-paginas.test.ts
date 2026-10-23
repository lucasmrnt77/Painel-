import { test } from "node:test";
import assert from "node:assert/strict";
import { lerPaginasTeste, nomePagina, resumoTeste } from "../src/lib/teste-paginas";
import type { LinhaFunil } from "../src/lib/metricas-paginas";
import type { Linha } from "../src/lib/anuncios";

const funil = (site: string, chave: string, visitas: number, leads: number, qualificados = 0): LinhaFunil =>
  ({ site, chave, visitas, leads, comecaram: leads, responderam: leads, qualificados, nao_qualificados: 0, no_grupo: leads });
const anuncio = (destino: string, investimento: number, cliques = 0, visualizacoes = 0) =>
  ({ anuncio: "A", destino, investimento, cliques, visualizacoes } as unknown as Linha);

test("páginas do teste: valida, tira repetidas e ordena", () => {
  assert.deepEqual(lerPaginasTeste(["Trader/v2", "Jubilar/v2", "General/v1", "Trader/v1", "x", "General/v1", "General"]),
    ["General", "General/v1", "Trader/v1", "Trader/v2", "Jubilar/v2"]);
  assert.equal(nomePagina("Trader", "/"), "Trader");
  assert.equal(nomePagina("Trader", "/v2"), "Trader/v2");
});

test("resumo: as 7 métricas por página, só das páginas do teste, com ★ por site", () => {
  const c = (site: string, landing: string, inscritos: number, leads: number, leadsQualificados: number) => ({ site, landing, inscritos, leads, leadsQualificados });
  const r = resumoTeste(
    ["Trader/v1", "Trader/v2", "General/v1"],
    [funil("Trader", "/v1", 200, 25), funil("Trader", "/v2", 200, 35), funil("General", "/v1", 50, 3), funil("Trader", "/v3", 999, 99)],
    [c("Trader", "/v1", 25, 20, 10), c("Trader", "/v2", 35, 30, 6), c("General", "/v1", 3, 2, 1), c("Trader", "/v3", 99, 99, 99)],
    [anuncio("Trader", 100, 500), anuncio("Trader/v2", 90, 300)], // link único: cliques do site inteiro
  );
  assert.deepEqual(r.map((l) => [l.pagina, l.visitas, l.leads, l.leadsQualificados, l.cliques]),
    [["Trader/v1", 200, 20, 10, 400], ["Trader/v2", 200, 30, 6, 400], ["General/v1", 50, 2, 1, 0]]); // 800 cliques ÷ visitas
  const v1 = r[0];
  assert.equal(v1.connectRate, 200 / 400);
  assert.equal(r[1].connectRate, 200 / 400); // mesmo connect rate no site (visitas 400 ÷ cliques 800)
  assert.equal(v1.conversao, 20 / 200);
  assert.equal(v1.conversaoQualificados, 10 / 200);
  assert.equal(v1.qualificacao, 10 / 20);
  assert.equal(r[2].connectRate, null); // sem cliques da Meta
  assert.deepEqual(r[0].melhor, { conversao: false, conversaoQualificados: true, qualificacao: true });
  assert.deepEqual(r[1].melhor, { conversao: true, conversaoQualificados: false, qualificacao: false });
  assert.deepEqual(r[2].melhor, { conversao: false, conversaoQualificados: false, qualificacao: false }); // sozinho e com poucos dados
});

test("link único: cliques do site repartidos pelas visitas de cada variação", () => {
  const r = resumoTeste(
    ["General/v1", "General/v2", "General/v3"],
    [funil("General", "/v1", 300, 0), funil("General", "/v2", 100, 0), funil("General", "/v3", 0, 0)],
    [],
    [anuncio("General", 10, 600), anuncio("General · Gen-Argentina", 1, 200), anuncio("Trader", 5, 999)],
  );
  assert.deepEqual(r.map((l) => l.cliques), [600, 200, 0]);
  assert.equal(r[0].connectRate, 0.5);
  assert.equal(r[1].connectRate, 0.5);
  assert.equal(r[2].connectRate, null);
});
