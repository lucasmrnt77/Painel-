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

test("planilha Nunca operou (Hoja 1)", () => {
  const r = converterPlanilha([
    ["Fecha", "Hora", "Telefono", "Pais", "Edad", "Genero", "Respuesta_dinero", "Pagina_captura", "Campaign", "Anuncio", "Utm_source", "Utm_medium", "Utm_term", "Landing", "Video", "Pag.Gracias", "Chequeo Grupo", "Demografico"],
    ["12/07/2026", "5:04:13", "59899605956", "Uruguay", "55_64", "mujer", "Sí, podría hacerlo sin problema", "Gen-Uruguay", "Campaign1", "21v4", "[ADV][UY] X|[G] Anuncio21_v4", "Instagram_Stories|[RA] Camp", "[G] Anuncio21_v4|526", "/", "Video1", "gracias-video", "OK", "mujer 55_64"],
    ["2026-07-12", "05:06", "541150248045.0", "Argentina", "", "", "", "/", "Campaign1", "173", "", "", "", "Jub-Argentina", "Video1", "/gracias-video4", "", ""],
    ["12/07/2026", "5:06:35", "5.41149E+11", "Argentina", "", "", "", "/", "", "", "", "", "", "/", "", "", "", ""],
  ]);
  assert.deepEqual(r.colunasFaltando, []);
  assert.equal(r.pareceListaDeGrupo, false);
  assert.equal(r.linhas.length, 2);
  assert.equal(r.rejeitadas.length, 1); // notação científica
  const [a, b] = r.linhas;
  assert.equal(a.landing, "Gen-Uruguay");
  assert.equal(a.faixa_etaria, "55_64");
  assert.equal(a.genero, "mujer");
  assert.equal(a.resposta_dinheiro, "Sí, podría hacerlo sin problema");
  assert.equal(a.utm_campaign, "Campaign1");
  assert.equal(a.pagina_obrigado, "gracias-video");
  assert.equal(a.grupo, null);
  assert.equal(b.telefone, "541150248045");
  assert.equal(b.criado_em, "2026-07-12T05:06:00-03:00");
  assert.equal(b.landing, "Jub-Argentina");
});

test("lista de grupo importada como leads é detectada", () => {
  const r = converterPlanilha([
    ["Fecha", "Hora", "Telefono", "Grupo"],
    ["12/07/2026", "5:05", "59899605956", "La Semana del Inversionista #8"],
    ["12/07/2026", "5:06", "5491159120671", "ES MAÑANA 20HS #28"],
  ]);
  assert.equal(r.pareceListaDeGrupo, true);
  assert.ok(r.linhas.every((l) => l.grupo === null));
});

test("converterEntradasGrupo", async () => {
  const { converterEntradasGrupo } = await import("../src/lib/planilha");
  const r = converterEntradasGrupo([
    ["Fecha", "Hora", "Telefono", "Grupo"],
    ["12/07/2026", "5:05", "59899605956", "La Semana del Inversionista #8"],
    ["11/07/2026", "16:51", "5519996652412", ""],
    ["12/07/2026", "5:06", "123", "x"],
  ]);
  assert.equal(r.linhas.length, 2);
  assert.equal(r.rejeitadas.length, 1);
  assert.deepEqual(r.linhas[0], {
    chave: "12/07/2026|5:05|59899605956|La Semana del Inversionista #8",
    entrou_em: "2026-07-12T05:05:00-03:00",
    telefone: "59899605956",
    grupo_nome: "La Semana del Inversionista #8",
  });
  assert.equal(r.linhas[1].grupo_nome, null);
});

test("celulaParaTexto e classificarAba", async () => {
  const { celulaParaTexto, classificarAba } = await import("../src/lib/planilha");
  assert.equal(celulaParaTexto(new Date("2026-07-12T00:00:00Z")), "12/07/2026");
  assert.equal(celulaParaTexto(new Date("1899-12-30T05:04:13Z")), "5:04:13");
  assert.equal(celulaParaTexto(59899605956), "59899605956");
  assert.equal(celulaParaTexto(true), "TRUE");
  assert.equal(celulaParaTexto(null), "");
  const leads = [["Fecha", "Hora", "Telefono", "Edad", "Anuncio"], ["12/07/2026", "5:04:13", "59899605956", "55_64", "21v4"]];
  const grupo = [["Fecha", "Hora", "Telefono", "Grupo"], ["12/07/2026", "5:05", "59899605956", "La Semana #8"]];
  const trader = [["Fecha", "Hora", "Telefono", "Grupo"], ["12/07/2026", "5:05", "59899605956", "TRUE"]];
  assert.equal(classificarAba("Hoja 1", leads).tipo, "leads");
  assert.equal(classificarAba("Copia de Hoja 1", leads).copia, true);
  assert.equal(classificarAba("Leads Grupo", grupo).tipo, "entradas");
  assert.equal(classificarAba("X", trader).tipo, "leads");
  assert.equal(classificarAba("Hoja 22", [[""], ["5698250684"]]).tipo, "ignorar");
});

test("lista de grupo sem título na coluna do grupo (planilha de traders)", async () => {
  const { classificarAba, converterEntradasGrupo } = await import("../src/lib/planilha");
  const t = [["Fecha", "Hora", "Telefono", "", "5239"]];
  for (let i = 0; i < 10; i++) t.push(["24/08/2026", `22:4${i}:00`, `5989960560${i}`, `La Semana del Inversionista #5`, ""]);
  t.push(["12/07/2026", "7:40:00", "5491176124112", "", ""]);
  assert.equal(classificarAba("Leads Grupo", t).tipo, "entradas");
  const r = converterEntradasGrupo(t);
  assert.equal(r.linhas.length, 11);
  assert.equal(r.linhas[0].grupo_nome, "La Semana del Inversionista #5");
  assert.equal(r.linhas[10].grupo_nome, null);
});
