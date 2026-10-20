import { test } from "node:test";
import assert from "node:assert/strict";
import { chavesDoClique, listaPaises, montarRanking, paginaPeloNome, siteDaVisita, type LinhaPais } from "../src/lib/criativos";
import { normalizarPaginaCaptura } from "../src/lib/captura";

test("site da visita: informado ou pelo domínio", () => {
  assert.equal(siteDaVisita("jubilar", ""), "jubilar");
  assert.equal(siteDaVisita(undefined, "https://eventojubilar.metodoconsistente.com/"), "jubilar");
  assert.equal(siteDaVisita(undefined, "https://eventotrader.metodoconsistente.com/v2"), "trader");
  assert.equal(siteDaVisita(undefined, "https://eventogeneral.metodoconsistente.com/"), "general");
});

test("Jub-Uruguay entra como página geral (nunca operou)", () => {
  assert.equal(normalizarPaginaCaptura("Jub-Uruguay"), "nunca_operou");
  assert.equal(normalizarPaginaCaptura("Gen-Argentina"), "nunca_operou");
  assert.equal(normalizarPaginaCaptura("Trader-Uruguay"), "trader");
});

test("chaves do clique: nome do anúncio primeiro, depois utm_content", () => {
  const p = new URLSearchParams({ utm_source: "[LaL1%][35-65][AR][JG] Lista|[JG] Anuncio36_v1", utm_content: "36v1" });
  assert.deepEqual(chavesDoClique(p), ["[JG] Anuncio36_v1", "36v1"]);
  assert.deepEqual(chavesDoClique(new URLSearchParams({ utm_content: "36v1" })), ["36v1"]);
});

test("página pelo prefixo do anúncio", () => {
  assert.equal(paginaPeloNome("[JG] Anuncio36_v1"), "jubilar");
  assert.equal(paginaPeloNome("[T] Anuncio105_v15"), "trader");
  assert.equal(paginaPeloNome("[G] Anuncio36_v2"), "general");
  assert.equal(paginaPeloNome("EsMañana"), null);
});

const l = (site: string, landing: string, pais: LinhaPais["pais"], visitas: number, leads: number, qualificados = 0): LinhaPais =>
  ({ site, landing, pais, visitas, leads, qualificados });

test("ranking: melhor variação por país e resumo", () => {
  const linhas = [
    l("Trader", "/v1", "AR", 100, 10, 5), l("Trader", "/v2", "AR", 100, 20, 6),
    l("Trader", "/v1", "UY", 100, 12, 8), l("Trader", "/v2", "UY", 100, 25, 4),
    l("Trader", "/v1", "CL", 100, 30, 9), l("Trader", "/v2", "CL", 10, 9, 9), // /v2 em CL com poucas visitas
  ];
  const [r] = montarRanking(linhas, [], []);
  assert.equal(r.melhor.AR?.taxaInscricao, "/v2");
  assert.equal(r.melhor.UY?.taxaQualificados, "/v1");
  assert.equal(r.melhor.CL?.taxaInscricao, "/v1"); // /v2 não disputa (menos de 30 visitas)
  assert.deepEqual(r.resumo, [{ variacao: "/v1", paises: ["CL"] }, { variacao: "/v2", paises: ["AR", "UY"] }]);
  assert.equal(listaPaises(["AR", "UY"]), "Argentina e Uruguai");
});

test("ranking: custo por lead pelo criativo (variação fixa e divisão pelas visitas)", () => {
  const linhas = [l("General", "/v1", "AR", 300, 30), l("General", "/v2", "AR", 100, 20), l("Jubilar", "/v1", "AR", 100, 10)];
  const gastos = [
    { criativo: "[G] Anuncio36_v1", pais: "AR", investimento: 40 }, // divisão normal → 30 para /v1, 10 para /v2
    { criativo: "Anuncio99", pais: "AR", investimento: 20 }, // tabela: General /v2
    { criativo: "[JG] Anuncio36_v1", pais: "AR", investimento: 25 },
    { criativo: "Aquecimento", pais: "AR", investimento: 999 }, // sem página: fica fora
  ];
  const r = montarRanking(linhas, gastos, [{ nome: "anuncio99", pagina: "general", variacao: "/v2" }]);
  const g = r.find((x) => x.site === "General")!;
  assert.equal(g.celulas["/v1"].AR?.cpl, 1); // 30 ÷ 30
  assert.equal(g.celulas["/v2"].AR?.cpl, 1.5); // (10 + 20) ÷ 20
  assert.equal(g.melhor.AR?.cpl, "/v1");
  assert.equal(r.find((x) => x.site === "Jubilar")!.celulas["/v1"].AR?.cpl, 2.5);
});
