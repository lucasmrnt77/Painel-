import { test } from "node:test";
import assert from "node:assert/strict";
import { dividirIgual, lerDestinos, lerRebrandly, montarDestino, SLUG_VALIDO } from "../src/lib/links";

test("links: final do link aceito", () => {
  for (const s of ["GruposWpp", "MercadoPago", "clase-1", "a", "promo_2026.oct"]) assert.ok(SLUG_VALIDO.test(s), s);
  for (const s of ["", "com espaço", "-comeca", "a/b", "x".repeat(81), "ñandu"]) assert.ok(!SLUG_VALIDO.test(s), s);
});

test("links: dividir 100% igual", () => {
  assert.deepEqual(dividirIgual(2), [50, 50]);
  assert.deepEqual(dividirIgual(3), [34, 33, 33]);
  assert.equal(dividirIgual(7).reduce((a, b) => a + b, 0), 100);
});

test("links: repassa parâmetros sem sobrescrever os do destino", () => {
  const d = "https://eventotra.metodoconsistente.com/?utm_campaign=Campaign4&utm_source=WhatsApp";
  const r = new URL(montarDestino(d, new URLSearchParams("utm_source=Instagram&utm_content=12"), true));
  assert.equal(r.searchParams.get("utm_source"), "WhatsApp");
  assert.equal(r.searchParams.get("utm_content"), "12");
  assert.equal(r.searchParams.get("utm_campaign"), "Campaign4");
  assert.equal(montarDestino(d, new URLSearchParams("x=1"), false), d);
  assert.equal(montarDestino("https://mpago.la/19kD6oa", new URLSearchParams(), true), "https://mpago.la/19kD6oa");
});

test("links: lê destinos do formulário", () => {
  assert.deepEqual(lerDestinos('[{"id":"4","url":" https://a.com ","peso":"50"},{"url":"https://b.com","peso":50},{"url":""}]'),
    [{ id: 4, url: "https://a.com", peso: 50 }, { url: "https://b.com", peso: 50 }]);
  assert.equal(lerDestinos("não é json"), null);
});

test("links: resposta do Rebrandly vira itens do domínio certo", () => {
  const r = lerRebrandly([
    { id: "a1", slashtag: "GruposWpp", destination: "https://eventotra.metodoconsistente.com/?x=1", title: "Semana", domain: { fullName: "link.traderdelite.net" } },
    { id: "a2", slashtag: "Outro", destination: "https://x.com", domain: { fullName: "rebrand.ly" } },
    { id: "a3", slashtag: "", destination: "https://raiz.com", domain: { fullName: "link.traderdelite.net" } },
  ], "link.traderdelite.net");
  assert.deepEqual(r, [{ slug: "GruposWpp", url: "https://eventotra.metodoconsistente.com/?x=1", titulo: "Semana", rebrandly_id: "a1" }]);
});
