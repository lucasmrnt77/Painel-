/**
 * PLANILHA UNIFICADA DE LEADS — Painel Sendflow (uma aba por página de captura)
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
 * Abas (no mesmo formato das planilhas do lançamento passado):
 *  - "General"  → leads da página General: A–Q iguais à "Pagina de Captura General" (Fecha … Chequeo Grupo).
 *                 R "Demografico", S "VIDEO", T "3 PREGUNTAS" são de vocês: o script NUNCA mexe nelas.
 *                 U Calificado · V Email · W ID (não apagar).
 *  - "Trader"   → leads da página Trader: A–L iguais à "Pagina de Traders" (Fecha, Hora, Experiencia, Telefono,
 *                 Campana, Anuncio, utm_source, utm_medium, utm_term, Landing, Pagina de gracias, Grupo).
 *                 M "CHEQUEO" é de vocês. N Pais · O Calificado (3+ meses operando) · P ID (não apagar).
 *  - "Leads Grupo General" / "Leads Grupo Trader" → entradas nos grupos (Fecha, Hora, Telefono, Grupo, ID).
 *  - "Estadisticas" → criada uma vez com as fórmulas de sempre + resumo da Trader (depois é de vocês).
 *  - "Estado"   → última atualização, leads por aba e último erro.
 *  As linhas não mudam de lugar: o que vocês anotarem nas colunas livres continua na pessoa certa.
 *
 * Instalação (uma vez, na conta Gmail que vai ficar com a planilha):
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
var LIMITE_POR_LINHA = 40; // até isso, atualiza linha a linha; acima, regrava o bloco (mais rápido)
var ABAS_ESPERADAS = ["General", "Trader", "Leads Grupo General", "Leads Grupo Trader"];

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
    // Se alguma aba principal sumir (apagada sem querer), refaz a carga completa para recriá-la
    if (desde && ABAS_ESPERADAS.some(function (n) { return !ss.getSheetByName(n); })) desde = null;
    var d = buscar_(desde);
    var res = {};
    Object.keys(d.abas).forEach(function (nome) { res[nome] = aplicar_(ss, nome, d.abas[nome]); });
    garantirEstadisticas(ss);
    props_().setProperty("CURSOR", d.cursor); // só avança depois de gravar tudo
    estado_(ss, d, res, "");
  } catch (e) {
    estado_(ss, null, null, String(e && e.message || e));
    throw e;
  } finally {
    lock.releaseLock();
  }
}

function buscar_(desde) {
  var p = props_();
  var base = String(p.getProperty("PAINEL_URL") || "").trim().replace(/\/+$/, "");
  var token = String(p.getProperty("PLANILHA_TOKEN") || "").trim();
  var lanc = p.getProperty("LANCAMENTO");
  var nome = p.getProperty("NOME") || "unificada";
  if (!base || !token) throw new Error("Configure PAINEL_URL e PLANILHA_TOKEN nas propriedades do script");
  var url = base + "/api/planilha?formato=3&nome=" + encodeURIComponent(nome) +
    (desde ? "&desde=" + encodeURIComponent(desde) : "") + (lanc ? "&l=" + encodeURIComponent(lanc) : "");
  var r = UrlFetchApp.fetch(url, { headers: { "x-api-token": token }, muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error("Painel respondeu " + r.getResponseCode() + ": " + r.getContentText().slice(0, 200));
  var d = JSON.parse(r.getContentText());
  if (!d.ok || d.formato !== 3) throw new Error("Resposta inesperada do painel (atualize o painel ou este script)");
  return d;
}

/** "dd/mm/yyyy" → Date (para filtros e fórmulas de data funcionarem). */
function paraData_(t) {
  var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t || "");
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : t;
}

/**
 * Insere ou atualiza as linhas pelo ID (última coluna do último bloco). Nunca apaga linha
 * nem mexe nas colunas fora dos blocos (as colunas livres de vocês). Retorna { novas, atualizadas }.
 * spec = { blocos: [{ col, cab: [...] }], fixos?: [{ col, valores }], formula?: { celula, f }, linhas: [[...]] }
 */
function aplicar_(ss, nomeAba, spec) {
  var aba = ss.getSheetByName(nomeAba) || ss.insertSheet(nomeAba);
  var blocos = spec.blocos;
  var nCols = blocos.reduce(function (n, b) { return n + b.cab.length; }, 0);
  var ultimoBloco = blocos[blocos.length - 1];
  var colId = ultimoBloco.col + ultimoBloco.cab.length - 1;

  // Cabeçalhos
  blocos.forEach(function (b) { aba.getRange(1, b.col, 1, b.cab.length).setValues([b.cab]).setFontWeight("bold"); });
  (spec.fixos || []).forEach(function (f) {
    var r = aba.getRange(1, f.col, 1, f.valores.length);
    if (!r.getValues()[0].some(function (v) { return v !== ""; })) r.setValues([f.valores]).setFontWeight("bold");
  });
  aba.setFrozenRows(1);
  if (spec.formula) {
    var c = aba.getRange(spec.formula.celula);
    if (!c.getFormula() && !c.getValue()) c.setFormula(spec.formula.f);
  }
  if (!spec.linhas.length) return { novas: 0, atualizadas: 0 };

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
  spec.linhas.forEach(function (l) {
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

  // Corta a linha nos pedaços de cada bloco
  var pedacos = function (l) {
    var out = [], ini = 0;
    blocos.forEach(function (b) { out.push(l.slice(ini, ini + b.cab.length)); ini += b.cab.length; });
    return out;
  };
  var escrever = function (linhaIni, linhas) {
    if (!linhas.length) return;
    var partes = linhas.map(pedacos);
    blocos.forEach(function (b, k) {
      aba.getRange(linhaIni, b.col, linhas.length, b.cab.length).setValues(partes.map(function (p) { return p[k]; }));
    });
    aba.getRange(linhaIni, 1, linhas.length, 1).setNumberFormat("dd/mm/yyyy");
  };

  // Existentes: poucas → linha a linha; muitas → lê cada bloco, troca na memória e regrava de uma vez
  if (atualizar.length && atualizar.length <= LIMITE_POR_LINHA) {
    atualizar.forEach(function (u) { escrever(u.linha, [u.valores]); });
  } else if (atualizar.length) {
    var total = ultimaComId - 1;
    var dados = blocos.map(function (b) { return aba.getRange(2, b.col, total, b.cab.length).getValues(); });
    atualizar.forEach(function (u) {
      var p = pedacos(u.valores);
      blocos.forEach(function (b, k) { dados[k][u.linha - 2] = p[k]; });
    });
    blocos.forEach(function (b, k) { aba.getRange(2, b.col, total, b.cab.length).setValues(dados[k]); });
    aba.getRange(2, 1, total, 1).setNumberFormat("dd/mm/yyyy");
  }

  // Novas: no fim, logo depois da última linha com ID
  escrever(ultimaComId + 1, novas);
  return { novas: novas.length, atualizadas: atualizar.length };
}

function contarIds_(ss, nome, col) {
  var aba = ss.getSheetByName(nome);
  if (!aba || aba.getLastRow() < 2) return 0;
  return aba.getRange(2, col, aba.getLastRow() - 1, 1).getValues().filter(function (r) { return r[0] !== ""; }).length;
}

function estado_(ss, d, res, erro) {
  var e = ss.getSheetByName("Estado") || ss.insertSheet("Estado");
  var agora = Utilities.formatDate(new Date(), "America/Montevideo", "dd/MM/yyyy HH:mm:ss");
  var resumo = res ? Object.keys(res).map(function (n) { return n + ": " + res[n].novas + " nuevos, " + res[n].atualizadas + " act."; }).join(" · ") : "";
  var linhas = [
    ["Última verificación (hora UY)", agora],
    ["Lanzamiento", d ? d.nome + " (" + d.lancamento + ")" : e.getRange("B2").getValue()],
    ["Leads General", contarIds_(ss, "General", 23)],
    ["Leads Trader", contarIds_(ss, "Trader", 16)],
    ["Último cambio", d ? (d.completo ? "Conferencia completa · " : "") + resumo : e.getRange("B5").getValue()],
    ["Último error", erro ? agora + " — " + erro : ""],
  ];
  e.getRange(1, 1, linhas.length, 2).setValues(linhas);
  e.getRange(1, 1, linhas.length, 1).setFontWeight("bold");
  e.getRange("B6").setFontColor(erro ? "#c00000" : "#000000");
}

/** Cria "Estadisticas" (uma vez): fórmulas de sempre da General + resumo da Trader. */
function garantirEstadisticas(ss) {
  if (ss.getSheetByName("Estadisticas")) return;
  var e = ss.insertSheet("Estadisticas");
  var G = "General!G:G", A = "General!A:A";
  var hoje = A + ',">="&TODAY(),' + A + ',"<"&TODAY()+1';
  var ontem = A + ',">="&TODAY()-1,' + A + ',"<"&TODAY()';
  var resp = [["Con el dinero", "Sí, podría hacerlo sin problema"], ["Lo consigue", "No hoy, pero podría organizarme para conseguirlo"], ["No cualificado", "No, hoy sería imposible"]];
  e.getRange("A1").setValue("ESTADISTICAS — GENERAL").setFontWeight("bold");
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
  e.getRange("C14").setFormula("=COUNTA(General!A2:A)");
  e.getRange("E14").setFormula('=COUNTIFS(' + hoje + ')');
  e.getRange("G14").setFormula('=COUNTIFS(' + ontem + ')');
  [10, 12, 14].forEach(function (lin) {
    e.getRange(lin, 4).setFormula("=C" + lin + "/$C$14");
    e.getRange(lin, 6).setFormula("=E" + lin + "/$E$14");
    e.getRange(lin, 8).setFormula("=G" + lin + "/$G$14");
  });
  e.getRange("A16").setValue("Calificado (regla Meta, columna U)");
  e.getRange("C16").setFormula('=COUNTIF(General!U:U,"Sí")');
  e.getRange("D16").setFormula("=C16/$C$14");

  // Trader: por experiencia, calificado (3+ meses) y en el grupo
  var X = "Trader!C:C", AT = "Trader!A:A";
  var hojeT = AT + ',">="&TODAY(),' + AT + ',"<"&TODAY()+1';
  var ontemT = AT + ',">="&TODAY()-1,' + AT + ',"<"&TODAY()';
  e.getRange("A19").setValue("ESTADISTICAS — TRADER").setFontWeight("bold");
  e.getRange("A20:H20").setValues([["EXPERIENCIA", "", "CANTIDAD", "PORCENTAJE", "HOY", "PORCENTAJE", "AYER", "PORCENTAJE"]]).setFontWeight("bold");
  var exp = [["Nunca hice", "nunca"], ["Menos de 3 meses", "menos-3-meses"], ["6 a 12 meses", "6-12-meses"], ["De 1 año", "de-1-año"]];
  exp.forEach(function (x, i) {
    var lin = 21 + i;
    e.getRange(lin, 1).setValue(x[0]);
    e.getRange(lin, 3).setFormula('=COUNTIF(' + X + ',"' + x[1] + '")');
    e.getRange(lin, 4).setFormula("=C" + lin + "/$C$26");
    e.getRange(lin, 5).setFormula('=COUNTIFS(' + X + ',"' + x[1] + '",' + hojeT + ')');
    e.getRange(lin, 6).setFormula("=E" + lin + "/$E$26");
    e.getRange(lin, 7).setFormula('=COUNTIFS(' + X + ',"' + x[1] + '",' + ontemT + ')');
    e.getRange(lin, 8).setFormula("=G" + lin + "/$G$26");
  });
  e.getRange("A26").setValue("TOTAL TRADER").setFontWeight("bold");
  e.getRange("C26").setFormula("=COUNTA(Trader!A2:A)");
  e.getRange("E26").setFormula('=COUNTIFS(' + hojeT + ')');
  e.getRange("G26").setFormula('=COUNTIFS(' + ontemT + ')');
  [26].forEach(function (lin) {
    e.getRange(lin, 4).setFormula("=C" + lin + "/$C$26");
    e.getRange(lin, 6).setFormula("=E" + lin + "/$E$26");
    e.getRange(lin, 8).setFormula("=G" + lin + "/$G$26");
  });
  e.getRange("A28").setValue("Calificado (3+ meses, columna O)");
  e.getRange("C28").setFormula('=COUNTIF(Trader!O:O,"Sí")');
  e.getRange("D28").setFormula("=C28/$C$26");
  e.getRange("A29").setValue("En el grupo (columna L)");
  e.getRange("C29").setFormula("=COUNTIF(Trader!L:L,TRUE)");
  e.getRange("D29").setFormula("=C29/$C$26");
  e.getRange("D4:D29").setNumberFormat("0.0%"); e.getRange("F4:F26").setNumberFormat("0.0%"); e.getRange("H4:H26").setNumberFormat("0.0%");
}
