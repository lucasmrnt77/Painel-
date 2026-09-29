import { test } from "node:test";
import assert from "node:assert/strict";
import { converterPlanilha, limparTelefonePlanilha, dataHoraUruguai } from "../src/lib/planilha";

test("limparTelefonePlanilha", () => {
  assert.equal(limparTelefonePlanilha("59897979053,"), "59897979053");
  assert.equal(limparTelefonePlanilha("59892368710#96"), "59892368710");
  assert.equal(limparTelefonePlanilha("54+54929846781"), "54929846781");
  assert.equal(limparTelefonePlanilha("598+1098487009"), "5981098487009");
  assert.equal(limparTelefonePlanilha("5491112345678"), "5491112345678");
});

test("dataHoraUruguai", () => {
  assert.equal(dataHoraUruguai("12/07/2026", "5:06:40"), "2026-07-12T05:06:40-03:00");
  assert.equal(dataHoraUruguai("1/9/2026", "23:59"), "2026-09-01T23:59:00-03:00");
  assert.equal(dataHoraUruguai("31/13/2026", "1:00:00"), null);
  assert.equal(dataHoraUruguai("", "1:00:00"), null);
});

test("converterPlanilha com cabeçalho real", () => {
  const r = converterPlanilha([
    ["Fecha", "Hora", "Experiencia", "Telefono", "Campana", "Anuncio", "utm_source", "utm_medium", "utm_term", "Landing", "Pagina de gracias", "Grupo", "CHEQUEO", "Pais", "", ""],
    ["12/07/2026", "7:29:56", "nunca", "59897979053,", "Campaign2", "83v5", "[ADV][Uruguay] A|[T] Anuncio83_v5", "Facebook_Mobile_Feed|[RA][Leads] Teste", "[T] Anuncio83_v5|526165", "/", "/gracias-video-general", "TRUE", "OK", "", "", ""],
    ["12/07/2026", "8:00:00", "nunca", "123", "", "", "", "", "", "", "", "FALSE", "", "", "", ""],
    ["xx", "8:00:00", "nunca", "59899999999", "", "", "", "", "", "", "", "FALSE", "", "", "", ""],
    ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
  ]);
  assert.deepEqual(r.colunasFaltando, []);
  assert.equal(r.linhas.length, 1);
  assert.equal(r.rejeitadas.length, 2);
  const l = r.linhas[0];
  assert.equal(l.telefone, "59897979053");
  assert.equal(l.utm_campaign, "Campaign2");
  assert.equal(l.utm_content, "83v5");
  assert.equal(l.pagina_obrigado, "/gracias-video-general");
  assert.equal(l.grupo, true);
  assert.equal(l.chave, "12/07/2026|7:29:56|59897979053,");
});

test("colunas obrigatórias", () => {
  const r = converterPlanilha([["Nome", "Email"], ["a", "b"]]);
  assert.deepEqual(r.colunasFaltando, ["fecha", "hora", "telefone"]);
});
