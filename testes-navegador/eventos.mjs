/**
 * Teste diário no navegador dos eventos da Meta (GitHub Actions → .github/workflows/testes-eventos.yml).
 *
 * Abre as páginas de verdade num Chromium, preenche como um lead e confere:
 *   • o servidor recebeu o evento (modo teste → "Eventos de teste" da Meta);
 *   • o pixel disparou o MESMO evento com o MESMO event_id (a Meta deduplica);
 *   • nenhum outro disparo do pixel com o mesmo nome sem event_id (contaria em dobro).
 *
 * Nada vai para as campanhas: o fbevents.js da Meta é trocado por um registrador e o
 * envio do pixel é descartado aqui no navegador, e o servidor recebe tudo como teste. Planilha e banco das páginas
 * também são bloqueados.
 *
 * Variáveis: PAINEL_URL, TESTES_TOKEN, GRUPO_URL, GENERAL_URL, DISPARO (agendado|manual),
 *            CHROMIUM_PATH (opcional, para rodar fora do GitHub).
 */
import { chromium } from "playwright";

/** Substitui o fbevents.js: cada track/trackCustom vira uma requisição a facebook.com/tr que o teste intercepta. */
const FBEVENTS_REGISTRADOR = `(function () {
  var f = window.fbq; if (!f) return; var px = null;
  f.callMethod = function () {
    var a = [].slice.call(arguments);
    if (a[0] === "init") { px = a[1]; return; }
    if (a[0] === "track" || a[0] === "trackCustom") {
      var o = a[3] || {};
      var q = "id=" + px + "&ev=" + encodeURIComponent(a[1]) + (o.eventID ? "&eid=" + encodeURIComponent(o.eventID) : "");
      new Image().src = "https://www.facebook.com/tr/?" + q;
    }
  };
  var fila = f.queue || []; f.queue = [];
  fila.forEach(function (a) { f.callMethod.apply(f, a); });
})();`;

const env = (k, padrao = "") => (process.env[k] || padrao).trim().replace(/\/+$/, "");
const PAINEL_URL = env("PAINEL_URL", "https://painel.traderdelite.net");
const TESTES_TOKEN = env("TESTES_TOKEN");
const GRUPO_URL = env("GRUPO_URL", "https://captura-grupo.vercel.app");
const GENERAL_URL = env("GENERAL_URL", "https://general-semana-inversionista-painel.vercel.app/gracias-video4");
const TELEFONE_UY = "59899009001";

const etapas = [];
const falhas = [];
function etapa(nome, verificacoes) {
  const erros = verificacoes.filter(([ok]) => !ok);
  etapas.push({ nome, total: verificacoes.length, falhas: erros.length });
  for (const [, , motivo] of erros) falhas.push({ teste: nome, motivo });
  console.log(`${erros.length ? "✗" : "✓"} ${nome}${erros.map(([, , m]) => `\n    - ${m}`).join("")}`);
}

/** Lê um disparo do pixel (GET com query ou POST com corpo de formulário). */
function lerPixel(req) {
  const u = new URL(req.url());
  const p = new URLSearchParams(u.search);
  const corpo = req.postData();
  if (corpo && !corpo.trim().startsWith("{")) for (const [k, v] of new URLSearchParams(corpo)) if (!p.has(k)) p.set(k, v);
  return { ev: p.get("ev"), eid: p.get("eid") || null, pixel: p.get("id") };
}

async function novoContexto(browser) {
  const ctx = await browser.newContext({ locale: "es-UY", userAgent: undefined });
  const pixel = [];
  // Envio do pixel: registra e responde vazio (não chega na Meta)
  await ctx.route(/^https:\/\/([a-z0-9-]+\.)?facebook\.com\/(tr|privacy_sandbox)/, async (route) => {
    if (/\/tr/.test(route.request().url())) pixel.push(lerPixel(route.request()));
    await route.fulfill({ status: 200, contentType: "image/gif", body: "" });
  });
  // O fbevents.js da Meta é trocado por um que só registra as chamadas do fbq: assim conferimos
  // exatamente o que a página manda o pixel enviar (nome + event_id) e nada chega na Meta.
  await ctx.route(/connect\.facebook\.net\//, (route) =>
    route.request().url().includes("fbevents")
      ? route.fulfill({ contentType: "application/javascript", body: FBEVENTS_REGISTRADOR })
      : route.fulfill({ contentType: "application/javascript", body: "" }));
  // Planilhas, banco das páginas e WhatsApp: bloqueados no teste
  await ctx.route(/script\.google\.com|\/api\/leads\/|\/api\/save|chat\.whatsapp\.com|wa\.me|api\.whatsapp\.com/, (route) => route.abort());
  return { ctx, pixel };
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function aguardar(cond, ms = 10000) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) { if (cond()) return true; await esperar(200); }
  return cond();
}

function conferirPixel(pixel, evento, eventId) {
  const mesmos = pixel.filter((p) => p.ev === evento);
  const certo = mesmos.filter((p) => p.eid === eventId);
  const errados = mesmos.filter((p) => p.eid !== eventId);
  return [
    [certo.length >= 1, "pixel", `pixel não disparou "${evento}" com o event_id do servidor (disparos "${evento}": ${mesmos.length})`],
    [errados.length === 0, "dup", `"${evento}" disparou ${errados.length}× no pixel sem o mesmo event_id (conta em dobro na Meta): ${errados.map((p) => p.eid ?? "sem eid").join(", ")}`],
  ];
}

// ---------------------------------------------------------------- Grupo gratuito
async function testarGrupo(browser) {
  const nome = "Página do grupo: Lead (pixel × servidor)";
  const { ctx, pixel } = await novoContexto(browser);
  try {
    const page = await ctx.newPage();
    await page.route("**/api/pais", (r) => r.fulfill({ json: { country: "UY" } }));
    let enviado = null;
    let resposta = null;
    await page.route("**/api/inscribir", async (route) => {
      const corpo = JSON.parse(route.request().postData() || "{}");
      enviado = corpo;
      await route.continue({
        postData: JSON.stringify({ ...corpo, teste: true, website: "teste-automatico" }), // versão antiga da página: finge sucesso e não grava
        headers: { ...route.request().headers(), "x-teste-token": TESTES_TOKEN },
      });
    });
    page.on("response", async (r) => { if (r.url().includes("/api/inscribir")) resposta = await r.json().catch(() => null); });
    await page.goto(`${GRUPO_URL}/?utm_source=teste_automatico`, { waitUntil: "load" });
    await esperar(1500); // hidratação do React antes de digitar
    await page.fill("#email", "qa@teste.com");
    await page.fill("#whatsapp", "099009001");
    await page.click("button[type=submit]");
    await aguardar(() => resposta !== null, 20000);
    if (!resposta) await page.screenshot({ path: "grupo-falhou.png", fullPage: true }).catch(() => {});
    const evento = resposta?.teste?.evento ?? "Lead";
    const eventId = enviado?.event_id;
    await aguardar(() => pixel.some((p) => p.ev === evento && p.eid === eventId), 8000);
    const meta = resposta?.teste?.meta;
    etapa(nome, [
      [!!eventId, "id", "o formulário não gerou event_id"],
      [resposta?.ok === true && !!resposta?.teste, "srv", `servidor não respondeu em modo teste (${JSON.stringify(resposta)?.slice(0, 150)})`],
      [meta?.ok === true && Number(meta?.resposta?.events_received) === 1, "meta", `Meta não confirmou o evento do servidor (${meta?.motivo ?? "sem resposta"})`],
      ...conferirPixel(pixel, evento, eventId),
    ]);
  } catch (e) {
    etapa(nome, [[false, "erro", `erro no teste: ${e.message}`]]);
  } finally {
    await ctx.close();
  }
}

// ---------------------------------------------------------------- General (página de obrigado)
async function testarGeneral(browser) {
  const { ctx, pixel } = await novoContexto(browser);
  const respostas = [];
  try {
    const page = await ctx.newPage();
    page.on("response", async (r) => {
      if (r.url().includes("/api/evento") && r.request().method() === "POST") {
        const corpo = JSON.parse(r.request().postData() || "{}");
        respostas.push({ enviado: corpo, recebido: await r.json().catch(() => null) });
      }
    });
    const url = `${GENERAL_URL}?tel=${TELEFONE_UY}&country=UY&email=qa%40teste.com&tde_teste=1&utm_source=teste_automatico`;
    await page.goto(url, { waitUntil: "domcontentloaded" });

    // 1) Lead General ao abrir a página
    await aguardar(() => respostas.some((r) => r.enviado.acao === "lead"), 15000);
    const lead = respostas.find((r) => r.enviado.acao === "lead");
    await aguardar(() => pixel.some((p) => p.ev === "Lead General" && p.eid === lead?.recebido?.event_id), 8000);
    etapa("General: Lead General ao abrir (pixel × servidor)", [
      [!!lead, "chamou", "a página não chamou o serviço de tracking"],
      [lead?.enviado?.teste === true, "teste", "a chamada não foi em modo teste"],
      [lead?.recebido?.evento === "Lead General", "evento", `servidor devolveu "${lead?.recebido?.evento ?? "nada"}"`],
      ...conferirPixel(pixel, "Lead General", lead?.recebido?.event_id),
    ]);

    // 2) Lead Qualificado ao responder (UY + "No hoy" qualifica)
    const selects = page.locator("select");
    await selects.nth(0).selectOption("35_44");
    await selects.nth(1).selectOption("hombre");
    await selects.nth(2).selectOption("no_pero_podria");
    await page.getByRole("button", { name: /UNIRME AL GRUPO/i }).click();
    await aguardar(() => respostas.some((r) => r.enviado.acao === "qualificacao"), 15000);
    const q = respostas.find((r) => r.enviado.acao === "qualificacao");
    await aguardar(() => pixel.some((p) => p.ev === "Lead Qualificado" && p.eid === q?.recebido?.event_id), 8000);
    etapa("General: Lead Qualificado ao responder (pixel × servidor)", [
      [!!q, "chamou", "a página não chamou o serviço ao responder"],
      [q?.enviado?.idade === "35_44" && q?.enviado?.genero === "hombre" && q?.enviado?.resposta === "no_pero_podria", "dados", `respostas enviadas erradas: ${JSON.stringify(q?.enviado ?? {}).slice(0, 150)}`],
      [q?.recebido?.evento === "Lead Qualificado" && q?.recebido?.qualificado === true, "evento", `servidor devolveu "${q?.recebido?.evento ?? "nada"}"`],
      ...conferirPixel(pixel, "Lead Qualificado", q?.recebido?.event_id),
    ]);
  } catch (e) {
    etapa("General: página de obrigado", [[false, "erro", `erro no teste: ${e.message}`]]);
  } finally {
    const outros = [...new Set(pixel.map((p) => p.ev))].filter((ev) => !["PageView", "Lead General", "Lead Qualificado"].includes(ev));
    if (outros.length) console.log(`  (outros disparos do pixel na General: ${outros.join(", ")})`);
    await ctx.close();
  }
}

async function reportar(corpo) {
  if (!TESTES_TOKEN) { console.log("TESTES_TOKEN vazio: resultado não enviado ao painel"); return; }
  const r = await fetch(`${PAINEL_URL}/api/testes/navegador`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${TESTES_TOKEN}` },
    body: JSON.stringify(corpo),
  }).catch((e) => ({ ok: false, status: 0, text: async () => e.message }));
  console.log(`painel: HTTP ${r.status} ${await r.text()}`);
  if (!r.ok) process.exitCode = 1;
}

const inicio = Date.now();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  await testarGrupo(browser);
  await testarGeneral(browser);
} finally {
  await browser.close();
}
await reportar({ resumo: etapas, detalhes: falhas, duracao_ms: Date.now() - inicio, disparo: process.env.DISPARO === "manual" ? "manual" : "agendado" });
if (falhas.length) { console.log(`\n${falhas.length} falha(s)`); process.exitCode = 1; }
