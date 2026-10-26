import { test } from "node:test";
import assert from "node:assert/strict";
import { abasEntrouLead, CAB_GERAL, CAB_TRADER, CAB_UNIFICADO, linhaGeral, linhaTrader, linhaUnificado, paisDe, partes, statusGeral, type Envio } from "../src/lib/entrou-lead";

const base: Envio = {
  id: 31202, criado_em: "2026-10-26T21:06:00Z", telefone: "59899965409", telefone_chave: "99965409", email: "a@b.com",
  pagina_captura: "nunca_operou", pc: "Gen-Uruguay", experiencia: null, landing: "/v2", pagina_obrigado: "/gracias-v1",
  faixa_etaria: "35_44", genero: "mujer", resposta_dinheiro: "No hoy, pero podría organizarme para conseguirlo", qualificado: true,
  clicou_grupo_em: "2026-10-26T21:07:00Z",
  utm_source: "[ADV][35-65][UY][G] Aberto|[J] Anuncio36v1_(set26)",
  utm_medium: "Instagram_Stories|[PC][LEADS][DEZ26][UY][General] Teste de Página 02",
  utm_campaign: "Campaign1", utm_content: "36v1", utm_term: "[J] Anuncio36v1_(set26)|120248128818810519",
};

test("entrou lead: linha General igual ao modelo da Paola", () => {
  const l = linhaGeral(base, new Set(["99965409"]));
  assert.equal(l.length, CAB_GERAL.length + 1);
  assert.deepEqual(l.slice(0, 18), [
    "26/10/2026", "18:06", "59899965409", "Uruguay", "35_44", "mujer", "No hoy, pero podría organizarme para conseguirlo",
    "Campaign1", "36v1", "[PC][LEADS][DEZ26][UY][General] Teste de Página 02", "[ADV][35-65][UY][G] Aberto", "Instagram_Stories",
    "[J] Anuncio36v1_(set26)", "[J] Anuncio36v1_(set26)|120248128818810519", "120248128818810519", "Cualificado", "OK", "Tráfego",
  ]);
  assert.deepEqual(l.slice(18), ["a@b.com", "Gen-Uruguay", "/v2", "Video1", "/gracias-v1", "i31202"]);
});

test("entrou lead: status General (decisão, regra pelas respostas, sem respostas)", () => {
  assert.equal(statusGeral({ ...base, qualificado: false }), "No Cualificado");
  assert.equal(statusGeral({ ...base, qualificado: null }), "Cualificado"); // UY + "No hoy" → qualifica
  assert.equal(statusGeral({ ...base, qualificado: null, telefone: "5491164290703", genero: "mujer", faixa_etaria: "55_64" }), "No Cualificado");
  assert.equal(statusGeral({ ...base, qualificado: null, resposta_dinheiro: null }), "No registrado");
});

test("entrou lead: Trader e Unificado; orgânico sem UTM", () => {
  const t: Envio = { ...base, id: 9, pagina_captura: "trader", pc: "Trader-Argentina /v4", telefone: "5491168302622", experiencia: "menos-3-meses",
    faixa_etaria: null, genero: null, resposta_dinheiro: null, clicou_grupo_em: null, utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null, utm_term: null };
  const lt = linhaTrader(t);
  assert.equal(lt.length, CAB_TRADER.length + 1);
  assert.deepEqual([lt[3], lt[4], lt[13], lt[14], lt[15], lt[16]], ["Argentina", "menos-3-meses", "Trader", false, "Orgânico", "Trader-Argentina /v4"]);
  assert.equal(linhaTrader({ ...t, experiencia: "nunca" })[13], "Nunca");
  const lu = linhaUnificado(t, new Set());
  assert.equal(lu.length, CAB_UNIFICADO.length + 1);
  assert.deepEqual([lu[4], lu[5], lu[6], lu[15], lu[16]], ["", "", "menos-3-meses", "Trader", false]);
  const abas = abasEntrouLead([t, base], new Set());
  assert.equal(abas["👤 Entrou Lead | Geral"].linhas.length, 1);
  assert.equal(abas["👤 Entrou Lead | Trader"].linhas.length, 1);
  assert.equal(abas["👤 Entrou Lead | Unificado"].linhas.length, 2);
});

test("entrou lead: utilitários", () => {
  assert.deepEqual(partes("a|b|c"), ["a", "b|c"]);
  assert.deepEqual(partes(null), ["", ""]);
  assert.equal(paisDe("595981123456").nome, "Paraguay");
  assert.equal(paisDe("5511999").codigo, "BR");
  assert.equal(paisDe("").nome, "");
});
