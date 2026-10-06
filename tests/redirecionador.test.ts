import { test } from "node:test";
import assert from "node:assert/strict";
import { classificarPagina, ehRobo, extrairCodigo } from "../src/lib/convite";
import { lerGruposSendflow } from "../src/lib/sendflow-grupos-ler";
import { mensagemRedirecionador } from "../src/lib/mensagens";

// Trechos reais da página chat.whatsapp.com (06/10/2026), com enchimento para o tamanho real
const enche = "x".repeat(5000);
const valida = `<html><head><title id="pageTitle">Invitación a grupo de WhatsApp</title><meta property="og:title" content="Teste - Setembro  #1" /><meta property="og:image" content="https://pps.whatsapp.net/v/t61.jpg" /><meta property="og:site_name" content="WhatsApp.com" /></head><body class="_9vd5">${enche}<a class="action-button">Unirse</a><img src="https://static.whatsapp.net/rsrc.php/x.png"></body></html>`;
const invalida = `<html><head><title id="pageTitle">Invitación a grupo de WhatsApp</title><meta property="og:title" content="" /><meta property="og:image" content="https://static.whatsapp.net/rsrc.php/v4/yO/r/rukeqTVNJDY.png" /><meta property="og:site_name" content="WhatsApp.com" /></head><body class="_9vd5">${enche}<a class="action-button">x</a></body></html>`;

test("convite válido: og:title com o nome do grupo", () => {
  const r = classificarPagina(valida, 200);
  assert.equal(r.resultado, "valido");
  assert.equal(r.titulo, "Teste - Setembro  #1");
});

test("convite redefinido: página do WhatsApp sem nome de grupo", () => {
  assert.equal(classificarPagina(invalida, 200).resultado, "invalido");
  assert.equal(classificarPagina("", 404).resultado, "invalido");
});

test("dúvida nunca tira o grupo da fila", () => {
  assert.equal(classificarPagina(valida, 429).resultado, "inconclusivo");
  assert.equal(classificarPagina("<html>curta</html>", 200).resultado, "inconclusivo");
  assert.equal(classificarPagina(`<html>${enche} consent.whatsapp.com</html>`, 200).resultado, "inconclusivo");
  assert.equal(classificarPagina(`<html><body>${enche} outra coisa</body></html>`, 200).resultado, "inconclusivo");
  assert.equal(classificarPagina(valida, 0).resultado, "inconclusivo");
});

test("título genérico não conta como nome de grupo", () => {
  const generico = invalida.replace('og:title" content=""', 'og:title" content="WhatsApp Group Invite"');
  assert.equal(classificarPagina(generico, 200).resultado, "invalido");
});

test("extrai o código do link", () => {
  assert.equal(extrairCodigo("https://chat.whatsapp.com/KtpVug57syVKpmxlfcLPID"), "KtpVug57syVKpmxlfcLPID");
  assert.equal(extrairCodigo("chat.whatsapp.com/invite/KtpVug57syVKpmxlfcLPID?x=1"), "KtpVug57syVKpmxlfcLPID");
  assert.equal(extrairCodigo("KtpVug57syVKpmxlfcLPID"), "KtpVug57syVKpmxlfcLPID");
  assert.equal(extrairCodigo("https://wa.me/598991234"), null);
  assert.equal(extrairCodigo(""), null);
});

test("robôs e prévias de link não contam clique", () => {
  assert.ok(ehRobo("WhatsApp/2.23.20.0 A"));
  assert.ok(ehRobo("facebookexternalhit/1.1"));
  assert.ok(ehRobo(null));
  assert.ok(!ehRobo("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Instagram 300.0"));
  assert.ok(!ehRobo("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/141.0 Mobile Safari/537.36"));
});

test("lê os grupos do Sendflow em formatos diferentes", () => {
  const a = lerGruposSendflow([[{ id: "g1", name: "Trader #1", inviteCode: "AbCdEfGhIjKlMnOp", participants: 230 }], [{ id: "g2", name: "Trader #2", inviteCode: "https://chat.whatsapp.com/QrStUvWxYz123456" }]]);
  assert.deepEqual(a.map((g) => [g.id, g.codigo, g.participantes]), [["g1", "AbCdEfGhIjKlMnOp", 230], ["g2", "QrStUvWxYz123456", null]]);
  const b = lerGruposSendflow({ groups: [{ _id: "x", subject: "Geral", inviteLink: "chat.whatsapp.com/ZZZZZZZZZZZZZZZZ", participants: [1, 2, 3] }] });
  assert.deepEqual(b[0], { id: "x", gid: null, nome: "Geral", codigo: "ZZZZZZZZZZZZZZZZ", participantes: 3 });
});

test("mensagens dos alertas", () => {
  const m = mensagemRedirecionador("cheio", "Trader", { grupo: "Trader #1", cliques: 600, proximo: "Trader #2 (0 cliques)", restantes: 3 });
  assert.match(m!, /Trader #1[\s\S]*600 cliques/);
  assert.match(m!, /Trader #2/);
  assert.match(mensagemRedirecionador("sem_grupos", "Geral", { reserva: null })!, /sem link reserva/);
  assert.equal(mensagemRedirecionador("redefinicao_pedida", "Geral", {}), null);
});

test("gid do WhatsApp sem @g.us", () => {
  const g = lerGruposSendflow([{ id: "Mi2ssmaPI1gXAAVmsa4H", gid: "120363401234567890@g.us", name: "T #2", inviteCode: "DJYqH6HMpzBLBzsWbhdAZo" }]);
  assert.equal(g[0].id, "Mi2ssmaPI1gXAAVmsa4H");
  assert.equal(g[0].gid, "120363401234567890");
});
