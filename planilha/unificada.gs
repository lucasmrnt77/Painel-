/**
 * PLANILHA UNIFICADA DE LEADS — Painel Sendflow (General + Trader na mesma planilha)
 *
 * Como funciona:
 *  - As páginas gravam os leads no painel (banco de dados). Esta planilha só COPIA de lá:
 *    ela nunca está no caminho do cadastro, então não afeta a captação.
 *  - A cada 2 minutos (propriedade INTERVALO) busca só o que é novo ou mudou
 *    (lead novo, respostas, qualificação, entrada no grupo) e atualiza as linhas certas.
 *  - Todo dia às 4h (Uruguai) faz uma conferência completa, por segurança.
 *  - Se parar de buscar por 15 min, o painel avisa no WhatsApp da equipe. Quando volta,
 *    recupera tudo o que faltou (nada se perde: os leads estão no banco).
 *
 * Abas:
 *  - "Hoja 1"      → um lead por linha. A–Q iguais às de sempre (Fecha … Pag.Gracias, Chequeo Grupo).
 *                    R "Demografico", S "VIDEO", T "3 PREGUNTAS" são de vocês: o script NUNCA mexe nelas.
 *                    U Calificado · V Email · W Experiencia · X Página (General/Trader) · Y ID (não apagar).
 *                    As linhas não mudam de lugar: o que vocês anotarem em R/S/T continua na pessoa certa.
 *  - "Leads Grupo" → entradas nos grupos (Fecha, Hora, Telefono, Grupo, Página, ID).
 *  - "Estadisticas"→ criada uma vez com as fórmulas de sempre (depois é de vocês).
 *  - "Estado"      → última atualização, total de leads e último erro.
 *
 * Instalação (uma vez, numa planilha NOVA, na conta Gmail que vai ficar com ela):
 *  1. Extensões → Apps Script → apague o conteúdo e cole este arquivo inteiro → Salvar.
 *  2. Configurações do projeto (engrenagem) → Propriedades do script → adicionar:
 *       PAINEL_URL      = https://painel.traderdelite.net
 *       PLANILHA_TOKEN  = (o mesmo token das planilhas atuais)
 *       (opcionais) LANCAMENTO = slug do lançamento (vazio = o ativo) · INTERVALO = 2 · NOME = unificada
 *  3. Selecione a função "instalar" → Executar → autorize. A primeira carga leva até 1–2 min.
 *  Funções úteis: "sincronizar" (busca agora) · "ressincronizarTudo" (conferência completa).
 *
 * Fórmulas: setFormula usa sempre a sintaxe em inglês (vírgula), qualquer que seja o idioma da planilha.
 */
var COLS_LEADS = 17;   // A–Q
var COL_EXTRA = 21;    // U em diante (U..Y)
var LIMITE_POR_LINHA = 40; // até isso, atualiza linha a linha; acima, regrava o bloco (mais rápido)

function props_() { return PropertiesService.getScriptProperties(); }

function instalar() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var f = t.getHandlerFunction();
    if (f === "sincronizar" || f === "ressincronizarTudo" || f === "atualizarAgora") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("sincronizar").timeBased().everyMinutes(1).create();
  ScriptApp.newTrigger("ressincronizarTudo").timeBased().atHour(4).everyDays(1).inTimezone("America/Montevideo").create();
  props_().deleteProperty("CURSOR");
  ressincronizarTudo();
}

/** Gatilho de 1 em 1 min; só trabalha a cada INTERVALO minutos (padrão 2) para caber na cota do Gmail. */
function sincronizar() {
  var intervalo = Math.max(1, Number(props_().getProperty("INTERVALO") || 2));
  if (intervalo > 1 && new Date().getMinutes() % intervalo !== 0) return;
  var cursor = props_().getProperty("CURSOR");
  executar_(cursor || null);
}

function ressincronizarTudo() { executar_(null); }

function executar_(desde) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return; // outra execução em andamento: esta pula, a próxima pega tudo
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  try {
    var d = buscar_(desde);
    var n1 = aplicar_(ss, "Hoja 1", d.abas["Hoja 1"], true);
    var n2 = aplicar_(ss, "Leads Grupo", d.abas["Leads Grupo"], false);
    garantirEstadisticas(ss);
    props_().setProperty("CURSOR", d.cursor); // só avança depois de gravar tudo
    estado_(ss, d, n1, n2, "");
  } catch (e) {
    estado_(ss, null, null, null, String(e && e.message || e));
    throw e;
  } finally {
    lock.releaseLock();
  }
}

function buscar_(desde) {
  var p = props_();
  var base = String(p.getProperty("PAINEL_URL") || "").replace(/\/+$/, "");
  var token = p.getProperty("PLANILHA_TOKEN");
  var lanc = p.getProperty("LANCAMENTO");
  var nome = p.getProperty("NOME") || "unificada";
  if (!base || !token) throw new Error("Configure PAINEL_URL e PLANILHA_TOKEN nas propriedades do script");
  var url = base + "/api/planilha?formato=2&pagina=todas&nome=" + encodeURIComponent(nome) +
    (desde ? "&desde=" + encodeURIComponent(desde) : "") + (lanc ? "&l=" + encodeURIComponent(lanc) : "");
  var r = UrlFetchApp.fetch(url, { headers: { "x-api-token": token }, muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error("Painel respondeu " + r.getResponseCode() + ": " + r.getContentText().slice(0, 200));
  var d = JSON.parse(r.getContentText());
  if (!d.ok || d.formato !== 2) throw new Error("Resposta inesperada do painel");
  return d;
}

/** "dd/mm/yyyy" → Date (para filtros e fórmulas de data funcionarem). */
function paraData_(t) {
  var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t || "");
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : t;
}

/**
 * Insere ou atualiza as linhas pelo ID (última coluna). Nunca apaga linha nem mexe em R/S/T.
 * Retorna { novas, atualizadas }.
 */
function aplicar_(ss, nomeAba, d, ehLeads) {
  var aba = ss.getSheetByName(nomeAba) || ss.insertSheet(nomeAba);
  var nCols = d.colunas.length + d.extra.length;          // largura dos dados recebidos
  var colId = ehLeads ? COL_EXTRA + d.extra.length - 1 : d.colunas.length;

  // Cabeçalhos (sempre os mesmos)
  if (ehLeads) {
    aba.getRange(1, 1, 1, COLS_LEADS).setValues([d.colunas]).setFontWeight("bold");
    aba.getRange(1, COL_EXTRA, 1, d.extra.length).setValues([d.extra]).setFontWeight("bold");
    if (!aba.getRange("R1").getValue()) aba.getRange("R1:T1").setValues([["Demografico", "VIDEO", "3 PREGUNTAS"]]).setFontWeight("bold");
  } else {
    aba.getRange(1, 1, 1, d.colunas.length).setValues([d.colunas]).setFontWeight("bold");
  }
  aba.setFrozenRows(1);
  if (ehLeads && !aba.getRange("R2").getFormula() && !aba.getRange("R2").getValue()) {
    aba.getRange("R2").setFormula('=ARRAYFORMULA(IF(F2:F="","",F2:F&" "&E2:E))');
  }
  if (!d.linhas.length) return { novas: 0, atualizadas: 0 };

  // Onde está cada ID hoje
  var ultima = aba.getLastRow();
  var ids = ultima > 1 ? aba.getRange(2, colId, ultima - 1, 1).getValues() : [];
  var linhaDoId = {};
  var ultimaComId = 1;
  for (var i = 0; i < ids.length; i++) {
    var id = String(ids[i][0] || "");
    if (id) { linhaDoId[id] = i + 2; ultimaComId = i + 2; }
  }

  // Separa novas e existentes (se vier repetido, vale a última versão)
  var porId = {}, ordem = [];
  d.linhas.forEach(function (l) {
    var id = String(l[nCols - 1]);
    if (!(id in porId)) ordem.push(id);
    porId[id] = l;
  });
  var novas = [], atualizar = [];
  ordem.forEach(function (id) {
    var l = porId[id].slice();
    l[0] = paraData_(l[0]);
    if (linhaDoId[id]) atualizar.push({ linha: linhaDoId[id], valores: l }); else novas.push(l);
  });

  var escrever = function (linhaIni, linhas) {
    if (!linhas.length) return;
    if (ehLeads) {
      aba.getRange(linhaIni, 1, linhas.length, COLS_LEADS).setValues(linhas.map(function (l) { return l.slice(0, COLS_LEADS); }));
      aba.getRange(linhaIni, COL_EXTRA, linhas.length, d.extra.length).setValues(linhas.map(function (l) { return l.slice(COLS_LEADS); }));
    } else {
      aba.getRange(linhaIni, 1, linhas.length, nCols).setValues(linhas);
    }
    aba.getRange(linhaIni, 1, linhas.length, 1).setNumberFormat("dd/mm/yyyy");
  };

  // Existentes: poucas → linha a linha; muitas → lê o bloco, troca na memória e regrava de uma vez
  if (atualizar.length && atualizar.length <= LIMITE_POR_LINHA) {
    atualizar.forEach(function (u) { escrever(u.linha, [u.valores]); });
  } else if (atualizar.length) {
    var total = ultimaComId - 1;
    var blocoA = aba.getRange(2, 1, total, ehLeads ? COLS_LEADS : nCols).getValues();
    var blocoU = ehLeads ? aba.getRange(2, COL_EXTRA, total, d.extra.length).getValues() : null;
    atualizar.forEach(function (u) {
      var k = u.linha - 2;
      if (ehLeads) { blocoA[k] = u.valores.slice(0, COLS_LEADS); blocoU[k] = u.valores.slice(COLS_LEADS); }
      else blocoA[k] = u.valores;
    });
    aba.getRange(2, 1, total, ehLeads ? COLS_LEADS : nCols).setValues(blocoA);
    if (ehLeads) aba.getRange(2, COL_EXTRA, total, d.extra.length).setValues(blocoU);
    aba.getRange(2, 1, total, 1).setNumberFormat("dd/mm/yyyy");
  }

  // Novas: no fim, logo depois da última linha com ID
  escrever(ultimaComId + 1, novas);
  return { novas: novas.length, atualizadas: atualizar.length };
}

function estado_(ss, d, n1, n2, erro) {
  var e = ss.getSheetByName("Estado") || ss.insertSheet("Estado");
  var agora = Utilities.formatDate(new Date(), "America/Montevideo", "dd/MM/yyyy HH:mm:ss");
  var leads = ss.getSheetByName("Hoja 1");
  var total = leads ? Math.max(0, leads.getRange("Y:Y").getValues().filter(function (r) { return r[0] !== ""; }).length - 1) : 0;
  var linhas = [
    ["Última verificación (hora UY)", agora],
    ["Lanzamiento", d ? d.nome + " (" + d.lancamento + ")" : e.getRange("B2").getValue()],
    ["Leads en Hoja 1", total],
    ["Último cambio", d ? (d.completo ? "Conferencia completa · " : "") + n1.novas + " nuevos, " + n1.atualizadas + " actualizados · grupo: " + n2.novas + " nuevos" : e.getRange("B4").getValue()],
    ["Último error", erro ? agora + " — " + erro : ""],
  ];
  e.getRange(1, 1, linhas.length, 2).setValues(linhas);
  e.getRange(1, 1, linhas.length, 1).setFontWeight("bold");
  e.getRange("B5").setFontColor(erro ? "#c00000" : "#000000");
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
  e.getRange("A18").setValue("Por página (columna X)").setFontWeight("bold");
  e.getRange("A19").setValue("General"); e.getRange("C19").setFormula("=COUNTIF('Hoja 1'!X:X,\"General\")"); e.getRange("D19").setFormula("=C19/$C$14");
  e.getRange("A20").setValue("Trader"); e.getRange("C20").setFormula("=COUNTIF('Hoja 1'!X:X,\"Trader\")"); e.getRange("D20").setFormula("=C20/$C$14");
  e.getRange("D4:D20").setNumberFormat("0.0%"); e.getRange("F4:F16").setNumberFormat("0.0%"); e.getRange("H4:H16").setNumberFormat("0.0%");
}
