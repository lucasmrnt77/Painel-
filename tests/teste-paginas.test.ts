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

test("resumo: junta página e Meta, só das páginas do teste, com ★ por site", () => {
  const r = resumoTeste(
    ["Trader/v1", "Trader/v2", "General/v1"],
    [funil("Trader", "/v1", 200, 20, 10), funil("Trader", "/v2", 200, 30, 6), funil("General", "/v1", 50, 2), funil("Trader", "/v3", 999, 99)],
    [anuncio("Trader/v1", 100, 40, 180), anuncio("Trader/v2", 90), anuncio("Trader/v3", 500)],
  );
  assert.deepEqual(r.map((l) => [l.pagina, l.visitas, l.leads, l.investimento]), [["Trader/v1", 200, 20, 100], ["Trader/v2", 200, 30, 90], ["General/v1", 50, 2, 0]]);
  assert.equal(r[0].cpl, 5);
  assert.equal(r[1].cpl, 3);
  assert.deepEqual(r[0].melhor, { conversao: false, qualificados: true, cpl: false });
  assert.deepEqual(r[1].melhor, { conversao: true, qualificados: false, cpl: true });
  assert.deepEqual(r[2].melhor, { conversao: false, qualificados: false, cpl: false }); // sozinho e com poucos dados
});
