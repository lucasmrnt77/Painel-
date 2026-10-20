import { test } from "node:test";
import assert from "node:assert/strict";
import { lerLinkAnuncio, montarDesempenho, urlDoAnuncio, type Registro } from "../src/lib/anuncios";
import { VARIACAO } from "../src/lib/criativos";

const SITES = [
  { site: "general" as const, url_base: "https://eventogeneral.metodoconsistente.com" },
  { site: "trader" as const, url_base: "https://eventotrader.metodoconsistente.com" },
  { site: "jubilar" as const, url_base: "https://eventojubilar.metodoconsistente.com" },
];

test("link colado do anúncio → página e variação", () => {
  assert.deepEqual(lerLinkAnuncio("https://eventotrader.metodoconsistente.com/v2?utm_source=x", SITES), { pagina: "trader", variacao: "/v2" });
  assert.deepEqual(lerLinkAnuncio("https://eventojubilar.metodoconsistente.com/", SITES), { pagina: "jubilar", variacao: "/" });
  assert.deepEqual(lerLinkAnuncio("https://eventogeneral.metodoconsistente.com/v3-intl", SITES), { pagina: "general", variacao: "/v3" });
  assert.equal(lerLinkAnuncio("https://outro.com/v1", SITES), null);
  assert.equal(lerLinkAnuncio("não é link", SITES), null);
});

test("variação aceita a principal e /vN", () => {
  assert.ok(VARIACAO.test("/") && VARIACAO.test("/v2"));
  assert.ok(!VARIACAO.test("v2") && !VARIACAO.test("/a/b"));
  assert.match(urlDoAnuncio("https://eventotrader.metodoconsistente.com", "/v2"), /^https:\/\/eventotrader\.metodoconsistente\.com\/v2\?utm_source=\{\{adset\.name\}\}\|\{\{ad\.name\}\}/);
});

test("anúncio trocado de variação: investimento de cada dia vai para a variação do dia", () => {
  const registros: Registro[] = [{ id: 1, nome: "[G] Anuncio36_v1", pagina: "general", variacao: "/v2" }];
  const historico = [
    { nome: "[G] Anuncio36_v1", pagina: "general" as const, variacao: "/v1", desde: "2026-12-01T12:00:00Z" },
    { nome: "[G] Anuncio36_v1", pagina: "general" as const, variacao: "/v2", desde: "2026-12-03T12:00:00Z" },
  ];
  const meta = [
    { criativo: "[G] Anuncio36_v1", data: "2026-12-01", investimento: 10, cliques: 120, visualizacoes: 100 },
    { criativo: "[G] Anuncio36_v1", data: "2026-12-02", investimento: 10, cliques: 120, visualizacoes: 100 },
    { criativo: "[G] Anuncio36_v1", data: "2026-12-03", investimento: 20, cliques: 240, visualizacoes: 200 },
    { criativo: "Aquecimento", data: "2026-12-03", investimento: 99, cliques: 1, visualizacoes: 1 }, // não é captação: fora
  ];
  const leads = [
    { anuncio: "[G] Anuncio36_v1", site: "General", landing: "/v1", leads: 20, qualificados: 10 },
    { anuncio: "[G] Anuncio36_v1", site: "General", landing: "/v2", leads: 60, qualificados: 20 },
  ];
  const d = montarDesempenho(registros, historico, meta, leads);
  const v1 = d.linhas.find((l) => l.destino === "General/v1")!;
  const v2 = d.linhas.find((l) => l.destino === "General/v2")!;
  assert.equal(v1.visualizacoes, 200);
  assert.equal(v1.investimento, 20);
  assert.equal(v1.conversao, 0.1);
  assert.equal(v2.visualizacoes, 200);
  assert.equal(v2.conversao, 0.3);
  assert.equal(v2.cpl, 20 / 60);
  assert.equal(d.melhorPorAnuncio.get("[g] anuncio36_v1"), "General/v2");
  assert.deepEqual(d.melhorPorDestino.map((m) => m.destino), ["General/v1", "General/v2"]);
  assert.ok(!d.linhas.some((l) => l.anuncio === "Aquecimento"));
});

test("anúncio não registrado: vai para a variação onde entraram os leads", () => {
  const d = montarDesempenho([], [], [{ criativo: "[T] X", data: "2026-12-01", investimento: 5, cliques: 10, visualizacoes: 150 }],
    [{ anuncio: "[T] X", site: "Trader", landing: "/v3", leads: 15, qualificados: 3 }]);
  assert.equal(d.linhas.length, 1);
  assert.equal(d.linhas[0].destino, "Trader/v3");
  assert.equal(d.linhas[0].registrado, false);
  assert.equal(d.linhas[0].conversao, 0.1);
});
