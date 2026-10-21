import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mensagemAlerta, mensagemRedirecionador } from "../src/lib/mensagens";
import { mensagemAds } from "../src/lib/meta-ads-regras";
import { mensagemSaude } from "../src/lib/meta-saude-regras";
import { mensagemTestes } from "../src/lib/testes-casos";
import { MODELOS_PADRAO, VARIAVEIS, preencher, variaveisDesconhecidas } from "../src/lib/modelos-alertas";
import { CATALOGO } from "../src/lib/catalogo-alertas";
import { ALERTA, REDIR, ADS, SAUDE, TESTES } from "./fixtures/casos-mensagens";

// Textos gravados antes da troca para modelos: os padrões têm que gerar exatamente o mesmo texto
const ANTES = JSON.parse(readFileSync(new URL("./fixtures/mensagens-alertas.json", import.meta.url), "utf8"));

test("modelos padrão geram exatamente as mensagens de antes", () => {
  assert.deepEqual(ALERTA.map(([t, n, d]) => mensagemAlerta(t, n, d)), ANTES.alerta);
  assert.deepEqual(REDIR.map(([t, n, d]) => mensagemRedirecionador(t, n, d)), ANTES.redir);
  assert.deepEqual(ADS.map(([t, n, d]) => mensagemAds(t as never, n, d)), ANTES.ads);
  assert.deepEqual(SAUDE.map((p) => mensagemSaude(p)), ANTES.saude);
  assert.deepEqual(TESTES.map(([e, v]) => mensagemTestes(e as never, v)), ANTES.testes);
});

test("modelo editado substitui o padrão", () => {
  const m = mensagemAlerta("teste", "Dez", {}, { teste: "Olá {lancamento}!\n{inexistente}" });
  assert.equal(m, "Olá Dez!\n{inexistente}");
  assert.equal(mensagemAlerta("teste", "Dez", {}, { teste: "   " }), "🔔 *Dez*\nMensagem de teste do monitor do painel Sendflow.");
});

test("linha com variável vazia some; linha em branco do modelo fica", () => {
  assert.equal(preencher("a\n{x}\n\nb {y}", { x: "", y: "" }), "a\n\nb ");
});

test("todo alerta do catálogo tem modelo e variáveis documentadas", () => {
  for (const i of CATALOGO) {
    assert.ok(MODELOS_PADRAO[i.tipo], `sem modelo: ${i.tipo}`);
    assert.deepEqual(variaveisDesconhecidas(i.tipo, MODELOS_PADRAO[i.tipo]), [], i.tipo);
    assert.ok(VARIAVEIS[i.tipo]?.length, i.tipo);
  }
});

test("edição: igual ao padrão não é guardado; editado substitui no catálogo", async () => {
  const { comTextos, normalizarEdicao, itemDoCatalogo } = await import("../src/lib/catalogo-alertas");
  const item = itemDoCatalogo("sem_leads")!;
  const igual = normalizarEdicao(item, MODELOS_PADRAO.sem_leads, {
    mensagem: MODELOS_PADRAO.sem_leads + "\n", diagnostico_pt: item.diagnostico.pt, diagnostico_es: " ",
    verificar_pt: item.verificar.pt.map((x) => `• ${x}`).join("\r\n"), verificar_es: "",
  });
  assert.deepEqual(igual, { mensagem: null, diagnostico_pt: null, diagnostico_es: null, verificar_pt: null, verificar_es: null });
  const ed = normalizarEdicao(item, MODELOS_PADRAO.sem_leads, {
    mensagem: "⚠️ {lancamento}: {tempo} sem leads", diagnostico_pt: "Outro diagnóstico", diagnostico_es: "",
    verificar_pt: "Passo 1\n\n- Passo 2", verificar_es: "",
  });
  assert.equal(ed.mensagem, "⚠️ {lancamento}: {tempo} sem leads");
  assert.deepEqual(ed.verificar_pt, ["Passo 1", "Passo 2"]);
  const c = comTextos(item, ed);
  assert.equal(c.diagnostico.pt, "Outro diagnóstico");
  assert.equal(c.diagnostico.es, item.diagnostico.es);
  assert.deepEqual(c.verificar.pt, ["Passo 1", "Passo 2"]);
  assert.deepEqual(c.editado, { mensagem: true, diagnostico: true, verificar: true });
  assert.equal(c.exemplo({ sem_leads: ed.mensagem! }), "⚠️ OP Futuros: 1 dia 1 h sem leads");
});
