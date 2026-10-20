import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CATALOGO } from "../src/lib/catalogo-alertas";
import { metaAdsVaiProWhatsapp, monitorVaiProWhatsapp, redirecionadorVaiProWhatsapp } from "../src/lib/politica-alertas";

test("todo tipo do histórico de alertas está no catálogo", () => {
  const pagina = readFileSync(new URL("../src/app/(painel)/alertas/page.tsx", import.meta.url), "utf8");
  const bloco = pagina.slice(pagina.indexOf("const ROTULO_TIPO"), pagina.indexOf("const ENVIO"));
  const tipos = [...bloco.matchAll(/^\s+(\w+): \{ rotulo/gm)].map((m) => m[1]);
  assert.ok(tipos.length >= 10);
  for (const tipo of tipos) assert.ok(CATALOGO.some((i) => i.tipo === tipo), `falta no catálogo: ${tipo}`);
});

test("cada alerta tem texto nos dois idiomas e mensagem de exemplo", () => {
  const tipos = new Set<string>();
  for (const i of CATALOGO) {
    assert.ok(!tipos.has(i.tipo), `repetido: ${i.tipo}`);
    tipos.add(i.tipo);
    for (const campo of [i.nome, i.quando, i.repeticao, i.diagnostico, i.envioDetalhe]) assert.ok(campo.pt && campo.es, i.tipo);
    assert.ok(i.verificar.pt.length > 0 && i.verificar.pt.length === i.verificar.es.length, i.tipo);
    assert.ok(i.exemplo().length > 10, `mensagem vazia: ${i.tipo}`);
  }
});

test("o catálogo diz a verdade sobre o que vai para o WhatsApp", () => {
  for (const i of CATALOGO.filter((x) => ["lancamento", "grupo", "planilha"].includes(x.area))) {
    const vai = monitorVaiProWhatsapp(i.tipo);
    assert.equal(vai, i.envio === "whatsapp" || i.envio === "manual", i.tipo);
  }
  for (const i of CATALOGO.filter((x) => x.area === "redirecionador")) {
    const comProximo = redirecionadorVaiProWhatsapp(i.tipo, true);
    const semProximo = redirecionadorVaiProWhatsapp(i.tipo, false);
    const esperado = i.envio === "whatsapp" ? [true, true] : i.envio === "condicional" ? [false, true] : [false, false];
    assert.deepEqual([comProximo, semProximo], esperado, i.tipo);
  }
  for (const i of CATALOGO.filter((x) => x.area === "ads")) assert.equal(metaAdsVaiProWhatsapp(i.tipo), i.envio === "whatsapp", i.tipo);
});
