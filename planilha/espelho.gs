/**
 * Planilha espelho do Painel Sendflow — mesmo formato da "Pagina de Captura General".
 * Substitui os scripts antigos (PaginaTradersAgosto, PaginaTradersAgostoActualizacion, PagGeneralAgosto,
 * ActualizadorPorRespuestaIndividual, SendflowGruposTrader, Ingreso Grupo Sendflow General).
 *
 * As páginas gravam no painel; esta planilha só COPIA de lá, a cada 5 minutos:
 *  - "Hoja 1"      → leads da página General. Colunas A–Q iguais às de antes
 *                    (Fecha … Pag.Gracias, Chequeo Grupo = "OK" quando entrou no grupo).
 *                    R "Demografico" (fórmula), S "VIDEO" e T "3 PREGUNTAS" ficam livres para vocês:
 *                    o script NÃO mexe nelas. U "Calificado" e V "Email" são novas.
 *  - "Traders"     → leads da página Trader, mesmo formato (+ W "Experiencia").
 *  - "Leads Grupo" → entradas nos grupos (Fecha, Hora, Telefono, Grupo).
 *  - "Estadisticas"→ criada uma vez com as fórmulas de sempre (depois é de vocês; o script não sobrescreve).
 * Abas de cópia/análise ("Copia de …", "Hoja 22" etc.) nunca são tocadas.
 *
 * Fórmulas: setFormula usa sempre a sintaxe em inglês (vírgula), qualquer que seja o idioma da planilha.
 *
 * Instalação (uma vez):
 *  1. Extensões → Apps Script → cole este arquivo no lugar do anterior.
 *  2. Propriedades do script: PAINEL_URL, PLANILHA_TOKEN e (opcional) LANCAMENTO = slug do lançamento.
 *  3. Rode "instalar" uma vez. "atualizarAgora" atualiza na hora.
 */
var COLS_LEADS = 17;      // A–Q
var COL_EXTRA = 21;       // U em diante

function instalar() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "atualizarAgora") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("atualizarAgora").timeBased().everyMinutes(5).create();
  atualizarAgora();
}

function atualizarAgora() {
  var props = PropertiesService.getScriptProperties();
  var base = String(props.getProperty("PAINEL_URL") || "").replace(/\/+$/, "");
  var token = props.getProperty("PLANILHA_TOKEN");
  var lanc = props.getProperty("LANCAMENTO");
  if (!base || !token) throw new Error("Configure PAINEL_URL e PLANILHA_TOKEN nas propriedades do script");

  var url = base + "/api/planilha" + (lanc ? "?l=" + encodeURIComponent(lanc) : "");
  var r = UrlFetchApp.fetch(url, { headers: { "x-api-token": token }, muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error("Painel respondeu " + r.getResponseCode() + ": " + r.getContentText().slice(0, 200));
  var dados = JSON.parse(r.getContentText());
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    escreverLeads(ss, "Hoja 1", dados.abas["Hoja 1"]);
    escreverLeads(ss, "Traders", dados.abas["Traders"]);
    escreverSimples(ss, "Leads Grupo", dados.abas["Leads Grupo"]);
    garantirEstadisticas(ss);
    var nota = "Lançamento: " + dados.nome + " (" + dados.lancamento + ")\nAtualizado: " + new Date().toLocaleString();
    ss.getSheetByName("Hoja 1").getRange("A1").setNote(nota);
  } finally {
    lock.releaseLock();
  }
}

/** "dd/mm/yyyy" → Date (para filtros e fórmulas de data funcionarem). */
function paraData(t) {
  var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t || "");
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : t;
}

function prepararLinhas(linhas) {
  return linhas.map(function (l) {
    var c = l.slice();
    c[0] = paraData(c[0]);
    return c;
  });
}

function limparAbaixo(aba, col, ncols) {
  var ultima = aba.getLastRow();
  if (ultima > 1) aba.getRange(2, col, ultima - 1, ncols).clearContent();
}

function escreverLeads(ss, nome, d) {
  var aba = ss.getSheetByName(nome) || ss.insertSheet(nome);
  var nExtra = d.extra.length;
  aba.getRange(1, 1, 1, COLS_LEADS).setValues([d.colunas]).setFontWeight("bold");
  aba.getRange(1, COL_EXTRA, 1, nExtra).setValues([d.extra]).setFontWeight("bold");
  if (!aba.getRange("R1").getValue()) aba.getRange("R1:T1").setValues([["Demografico", "VIDEO", "3 PREGUNTAS"]]).setFontWeight("bold");
  aba.setFrozenRows(1);

  limparAbaixo(aba, 1, COLS_LEADS);
  limparAbaixo(aba, COL_EXTRA, nExtra);
  if (d.linhas.length) {
    var linhas = prepararLinhas(d.linhas);
    aba.getRange(2, 1, linhas.length, COLS_LEADS).setValues(linhas.map(function (l) { return l.slice(0, COLS_LEADS); }));
    aba.getRange(2, COL_EXTRA, linhas.length, nExtra).setValues(linhas.map(function (l) { return l.slice(COLS_LEADS); }));
    aba.getRange(2, 1, linhas.length, 1).setNumberFormat("dd/mm/yyyy");
  }
  // Coluna R: "edad + genero", igual à fórmula antiga (só cria se estiver vazia)
  if (!aba.getRange("R2").getFormula() && !aba.getRange("R2").getValue()) {
    aba.getRange("R2").setFormula('=ARRAYFORMULA(IF(F2:F="","",F2:F&" "&E2:E))');
  }
}

function escreverSimples(ss, nome, d) {
  var aba = ss.getSheetByName(nome) || ss.insertSheet(nome);
  var n = d.colunas.length;
  aba.getRange(1, 1, 1, n).setValues([d.colunas]).setFontWeight("bold");
  aba.setFrozenRows(1);
  limparAbaixo(aba, 1, n);
  if (d.linhas.length) {
    aba.getRange(2, 1, d.linhas.length, n).setValues(prepararLinhas(d.linhas));
    aba.getRange(2, 1, d.linhas.length, 1).setNumberFormat("dd/mm/yyyy");
  }
}

/** Cria "Estadisticas" (uma vez) com as fórmulas de sempre, olhando a coluna inteira da Hoja 1. */
function garantirEstadisticas(ss) {
  if (ss.getSheetByName("Estadisticas")) return;
  var e = ss.insertSheet("Estadisticas");
  var G = "'Hoja 1'!G:G", A = "'Hoja 1'!A:A";
  var hoje = A + ',">="&TODAY(),' + A + ',"<"&TODAY()+1';
  var ontem = A + ',">="&TODAY()-1,' + A + ',"<"&TODAY()';
  var resp = [["Con el dinero", "Sí, podría hacerlo sin problema"], ["Lo consigue", "No hoy, pero podría organizarme para conseguirlo"], ["No cualificado", "No, hoy sería imposible"]];
  e.getRange("A1").setValue("ESTADISTICAS").setFontWeight("bold");
  e.getRange("A2:H2").setValues([["PUBLICO", "", "CANTIDAD", "PORCENTAJE", "HOY", "PORCENTAJE", "AYER", "PORCENTAJE"]]).setFontWeight("bold");
  resp.forEach(function (r, i) {
    var lin = 4 + i * 2;
    e.getRange(lin, 1).setValue(r[0]);
    e.getRange(lin, 3).setFormula('=COUNTIF(' + G + ',"' + r[1] + '")');
    e.getRange(lin, 4).setFormula("=C" + lin + "/$C$14");
    e.getRange(lin, 5).setFormula('=COUNTIFS(' + G + ',"' + r[1] + '",' + hoje + ')');
    e.getRange(lin, 6).setFormula("=E" + lin + "/$E$14");
    e.getRange(lin, 7).setFormula('=COUNTIFS(' + G + ',"' + r[1] + '",' + ontem + ')');
    e.getRange(lin, 8).setFormula("=G" + lin + "/$G$14");
  });
  e.getRange("A10").setValue("Cualificado (respuesta)");
  e.getRange("C10").setFormula("=C4+C6"); e.getRange("E10").setFormula("=E4+E6"); e.getRange("G10").setFormula("=G4+G6");
  e.getRange("A12").setValue("No completo registro");
  e.getRange("C12").setFormula("=C14-C10-C8"); e.getRange("E12").setFormula("=E14-E10-E8"); e.getRange("G12").setFormula("=G14-G10-G8");
  e.getRange("A14").setValue("TOTAL").setFontWeight("bold");
  e.getRange("C14").setFormula("=COUNTA('Hoja 1'!A2:A)");
  e.getRange("E14").setFormula('=COUNTIFS(' + hoje + ')');
  e.getRange("G14").setFormula('=COUNTIFS(' + ontem + ')');
  [10, 12, 14].forEach(function (lin) {
    e.getRange(lin, 4).setFormula("=C" + lin + "/$C$14");
    e.getRange(lin, 6).setFormula("=E" + lin + "/$E$14");
    e.getRange(lin, 8).setFormula("=G" + lin + "/$G$14");
  });
  e.getRange("A16").setValue("Calificado (regla Meta, columna U)");
  e.getRange("C16").setFormula("=COUNTIF('Hoja 1'!U:U,\"Sí\")");
  e.getRange("D16").setFormula("=C16/$C$14");
  e.getRange("D4:D16").setNumberFormat("0.0%"); e.getRange("F4:F16").setNumberFormat("0.0%"); e.getRange("H4:H16").setNumberFormat("0.0%");
}
