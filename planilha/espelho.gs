/**
 * Planilha espelho do Painel Sendflow — substitui os scripts antigos
 * (PaginaTradersAgosto, PaginaTradersAgostoActualizacion, PagGeneralAgosto,
 *  ActualizadorPorRespuestaIndividual, SendflowGruposTrader, Ingreso Grupo Sendflow General).
 *
 * As páginas gravam no painel; esta planilha só COPIA de lá (a cada 5 minutos):
 * cadastro, landing, página de gracias, cada resposta, se ficou calificado e se
 * entrou no grupo. Nada aqui grava no painel.
 *
 * Instalação (uma vez):
 *  1. Planilha nova → Extensões → Apps Script → cole este arquivo.
 *  2. Configurações do projeto (engrenagem) → Propriedades do script → adicionar:
 *       PAINEL_URL     = https://painel.traderdelite.net
 *       PLANILHA_TOKEN = (o mesmo valor da variável PLANILHA_TOKEN na Vercel do painel)
 *       LANCAMENTO     = (opcional) slug do lançamento; vazio = o lançamento ativo
 *  3. Rode a função "instalar" uma vez e autorize. Pronto: atualiza sozinho a cada 5 min.
 *     "atualizarAgora" atualiza na hora.
 */
var ABA = "Leads";

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
  var aba = ss.getSheetByName(ABA) || ss.insertSheet(ABA);
  var tabela = [dados.colunas].concat(dados.linhas);
  // Telefone como texto (sem virar número/notação científica)
  for (var i = 1; i < tabela.length; i++) tabela[i][4] = "'" + tabela[i][4];

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    aba.clearContents();
    aba.getRange(1, 1, tabela.length, dados.colunas.length).setValues(tabela);
    aba.setFrozenRows(1);
    aba.getRange(1, 1, 1, dados.colunas.length).setFontWeight("bold");
    ss.setActiveSheet(aba);
    aba.getRange("A1").setNote("Lançamento: " + dados.nome + " (" + dados.lancamento + ")\nAtualizado: " + new Date().toLocaleString());
  } finally {
    lock.releaseLock();
  }
}
