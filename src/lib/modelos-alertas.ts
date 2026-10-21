/**
 * Modelos (templates) das mensagens de alerta. Cada mensagem é um texto com variáveis entre chaves
 * ({lancamento}, {tempo}…). O painel permite editar o modelo de cada alerta no Catálogo de alertas;
 * sem edição, vale o modelo padrão abaixo (que reproduz exatamente o texto de antes).
 * Puro — testado em tests/modelos-alertas.test.ts.
 *
 * Regra das linhas: uma linha que tem variável e fica vazia depois de preenchida some
 * (ex.: {linha_fila} quando não há fila). Linhas em branco escritas no modelo continuam.
 */
export type Modelos = Partial<Record<string, string>>;
type Desc = { pt: string; es: string };
export type Variavel = { nome: string; desc: Desc };

const v = (nome: string, pt: string, es: string): Variavel => ({ nome, desc: { pt, es } });

const LANC = v("lancamento", "nome do lançamento (ou da planilha / grupo)", "nombre del lanzamiento (o de la planilla / grupo)");
const FUNIL = v("funil", "nome do funil do redirecionador", "nombre del embudo del redireccionador");
const GRUPO = v("grupo", "nome do grupo", "nombre del grupo");
const NOME = v("nome", "nome do lançamento", "nombre del lanzamiento");

export const MODELOS_PADRAO: Record<string, string> = {
  // Monitor (lançamento, grupo gratuito, planilhas)
  sem_entradas: "⚠️ *{lancamento}*\nSem entradas no grupo há *{tempo}*.\n{linha_ultima_entrada}\n{diagnostico}",
  sem_leads: "⚠️ *{lancamento}*\nNenhum lead novo na página há *{tempo}*.\n{linha_ultimo_lead}\nConfira os anúncios (pausados, sem saldo ou reprovados) e se a página está no ar.",
  planilha_parada: "⚠️ *{lancamento}*\nA planilha não busca dados do painel há *{tempo}* (última busca: {ultima_busca}, horário UY).\nOs leads continuam salvos no painel; quando a planilha voltar, ela recupera tudo sozinha.\nConfira na planilha: Extensões → Apps Script → Execuções (erros ou cota do Google).",
  leads_retomados: "✅ *{lancamento}*\nLeads retomados: novo lead em {retomada_em}, depois de {tempo} sem leads.",
  entradas_retomadas: "✅ *{lancamento}*\nEntradas retomadas às {retomada_em} depois de {tempo} sem entradas.",
  resumo: "📊 *{lancamento}* — {de} às {ate}\nInscrições: {inscricoes}\nEntradas no grupo: {entradas}{saidas}\n{linha_no_grupo}",
  teste: "🔔 *{lancamento}*\nMensagem de teste do monitor do painel Sendflow.",
  // Redirecionador
  cheio: "📦 *Redirecionador {funil}*\nO grupo *{grupo}* chegou a {cliques} cliques e foi considerado cheio.\n{linha_proximo}\n{linha_fila}",
  invalido: "🚫 *Redirecionador {funil}*\nO convite do grupo *{grupo}* deixou de funcionar (link redefinido ou revogado).\n{linha_proximo}\nSe o grupo tiver o ID do Sendflow, já pedimos um link novo.\n{linha_fila}",
  link_novo: "🔗 *Redirecionador {funil}*\nO grupo *{grupo}* recebeu link novo{do_sendflow} e voltou para a fila.",
  sem_grupos: "🆘 *Redirecionador {funil}*\nNenhum grupo disponível! Os cliques estão indo para {destino}\nAdicione ou reative grupos no painel.",
  redefinicao_sem_retorno: "⚠️ *Redirecionador {funil}*\nPedimos link novo do grupo *{grupo}* ao Sendflow há {minutos} min e ainda não chegou. Confira no Sendflow ou cole o link novo no painel.",
  redefinicao_falhou: "⚠️ *Redirecionador {funil}*\nO Sendflow recusou o pedido de link novo do grupo *{grupo}* ({erro}). Redefina pelo Sendflow e cole o link no painel.",
  // Eventos Meta
  testes_falharam: "🚨 *Testes dos eventos Meta falharam* ({onde})\n{falhas} de {total} verificações com problema:\n{detalhes}\n\nDetalhes no painel → Alertas.",
  testes_voltaram: "✅ *Testes dos eventos Meta voltaram a passar* ({onde})\n{total} verificações, nenhuma falha.",
  meta_saude: "🚨 *Problema nos eventos da Meta (dados da própria Meta)*\n{problemas}\n\nDetalhes no painel → Saúde na Meta.",
  // Campanhas
  ads_sem_dados: "🚨 *{nome}: dados da Meta sem atualizar*\nA última sincronização das campanhas foi {ultima_sync} ({horas} h atrás).\nSem esses dados o painel não consegue avisar se a Meta parar de gastar ou se o custo por lead subir.\n\nAvisar a Paola para conferir a sincronização.",
  ads_sem_gasto: "🚨 *{nome}: a Meta {titulo}*\n{periodo}: {investimento} gastos com {ativos} anúncio(s) ativo(s) — média dos dias anteriores: {media}.\n\nConferir no Gerenciador de Anúncios: pagamento/saldo da conta, anúncios reprovados ou limitados e se a campanha está mesmo ativa.",
  ads_cpl_alto: "🚨 *{nome}: custo por lead acima de {limite}*\n{periodo}: {investimento} investidos ÷ {leads} lead(s){qualificados} = *{cpl}*.\nO normal é bem abaixo disso: algo está errado.\n\nConferir: página de captura funcionando (fazer uma inscrição de teste), anúncio levando para a página certa, eventos chegando à Meta (Alertas → Saúde na Meta) e público/criativo cansado.",
};

export const VARIAVEIS: Record<string, Variavel[]> = {
  sem_entradas: [LANC, v("tempo", "tempo sem entradas", "tiempo sin entradas"), v("ultima_entrada", "hora da última entrada", "hora de la última entrada"),
    v("linha_ultima_entrada", "\"Última entrada: 10:05.\" ou \"Nenhuma entrada desde que o monitor foi ligado.\"", "\"Última entrada: 10:05.\" o \"Ninguna entrada desde que se encendió el monitor.\""),
    v("inscricoes", "inscrições no período", "inscripciones en el período"),
    v("diagnostico", "frase que diz se o tráfego parou ou se as pessoas não chegam ao grupo", "frase que dice si se detuvo el tráfico o si la gente no llega al grupo")],
  sem_leads: [LANC, v("tempo", "tempo sem leads", "tiempo sin leads"), v("ultimo_lead", "data e hora do último lead", "fecha y hora del último lead"),
    v("linha_ultimo_lead", "\"Último lead: … (horário UY).\" ou \"Nenhum lead desde…\"", "\"Último lead: … (horário UY).\" o \"Ningún lead desde…\"")],
  planilha_parada: [LANC, v("tempo", "tempo sem buscar dados", "tiempo sin buscar datos"), v("ultima_busca", "data e hora da última busca", "fecha y hora de la última búsqueda")],
  leads_retomados: [LANC, v("retomada_em", "data e hora do lead novo", "fecha y hora del lead nuevo"), v("tempo", "tempo que ficou sem leads", "tiempo que estuvo sin leads")],
  entradas_retomadas: [LANC, v("retomada_em", "hora da entrada", "hora de la entrada"), v("tempo", "tempo que ficou sem entradas", "tiempo que estuvo sin entradas")],
  resumo: [LANC, v("de", "início do período", "inicio del período"), v("ate", "fim do período", "fin del período"), v("inscricoes", "inscrições", "inscripciones"),
    v("entradas", "entradas no grupo", "entradas al grupo"), v("saidas", "\" · Saídas: 3\" (vazio se não houve)", "\" · Saídas: 3\" (vacío si no hubo)"),
    v("linha_no_grupo", "\"Dos inscritos no período, 75% já estão no grupo.\"", "\"Dos inscritos no período, 75% já estão no grupo.\"")],
  teste: [LANC],
  cheio: [FUNIL, GRUPO, v("cliques", "cliques do grupo", "clics del grupo"), v("linha_proximo", "para qual grupo vão os cliques agora (ou aviso de fila vazia)", "a qué grupo van los clics ahora (o aviso de fila vacía)"),
    v("linha_fila", "\"Grupos ativos na fila: 5.\"", "\"Grupos ativos na fila: 5.\"")],
  invalido: [FUNIL, GRUPO, v("linha_proximo", "para qual grupo vão os cliques agora (ou aviso de fila vazia)", "a qué grupo van los clics ahora (o aviso de fila vacía)"),
    v("linha_fila", "\"Grupos ativos na fila: 5.\"", "\"Grupos ativos na fila: 5.\"")],
  link_novo: [FUNIL, GRUPO, v("do_sendflow", "\" do Sendflow\" quando veio do Sendflow", "\" do Sendflow\" cuando vino de Sendflow")],
  sem_grupos: [FUNIL, v("destino", "para onde vão os cliques (link reserva ou lugar nenhum)", "a dónde van los clics (link de reserva o ningún lugar)")],
  redefinicao_sem_retorno: [FUNIL, GRUPO, v("minutos", "minutos desde o pedido", "minutos desde el pedido")],
  redefinicao_falhou: [FUNIL, GRUPO, v("erro", "código do erro do Sendflow", "código de error de Sendflow")],
  testes_falharam: [v("onde", "servidor ou navegador (pixel)", "servidor o navegador (pixel)"), v("falhas", "verificações com problema", "verificaciones con problema"),
    v("total", "verificações feitas", "verificaciones hechas"), v("detalhes", "lista das falhas (até 8)", "lista de fallas (hasta 8)")],
  testes_voltaram: [v("onde", "servidor ou navegador (pixel)", "servidor o navegador (pixel)"), v("total", "verificações feitas", "verificaciones hechas")],
  meta_saude: [v("problemas", "lista dos problemas (até 8)", "lista de problemas (hasta 8)")],
  ads_sem_dados: [NOME, v("ultima_sync", "\"em 06/12 às 06:00\" ou \"— nunca\"", "\"em 06/12 às 06:00\" o \"— nunca\""), v("horas", "horas sem atualizar", "horas sin actualizar")],
  ads_sem_gasto: [NOME, v("titulo", "\"não gastou nada hoje\" ou \"quase não gastou ontem\"", "\"não gastou nada hoje\" o \"quase não gastou ontem\""),
    v("periodo", "\"Até 13:10\" (hoje) ou \"06/12\" (ontem)", "\"Até 13:10\" (hoy) o \"06/12\" (ayer)"), v("investimento", "valor gasto", "monto gastado"),
    v("ativos", "anúncios ativos", "anuncios activos"), v("media", "média dos dias anteriores", "promedio de los días anteriores")],
  ads_cpl_alto: [NOME, v("limite", "limite de custo por lead", "límite de costo por lead"), v("periodo", "\"Hoje até 13:10\" ou \"Dia 06/12\"", "\"Hoje até 13:10\" o \"Dia 06/12\""),
    v("investimento", "valor investido", "monto invertido"), v("leads", "leads do dia", "leads del día"),
    v("qualificados", "\" qualificado(s)\" no lançamento (vazio no grupo gratuito)", "\" qualificado(s)\" en el lanzamiento (vacío en el grupo gratuito)"),
    v("cpl", "custo por lead", "costo por lead")],
};

/** Preenche o modelo. Variável desconhecida fica como está (ex.: "{xyz}"). */
export function preencher(modelo: string, vars: Record<string, string | number | null | undefined>): string {
  const linhas = modelo.replace(/\r\n/g, "\n").split("\n");
  const saida: string[] = [];
  for (const linha of linhas) {
    let temVar = false;
    const r = linha.replace(/\{(\w+)\}/g, (m, k: string) => {
      if (!(k in vars)) return m;
      temVar = true;
      const x = vars[k];
      return x == null ? "" : String(x);
    });
    if (temVar && r.trim() === "") continue;
    saida.push(r);
  }
  return saida.join("\n");
}

/** Mensagem do tipo: modelo editado (se houver) ou o padrão. */
export function montar(tipo: string, vars: Record<string, string | number | null | undefined>, modelos?: Modelos): string {
  const editado = modelos?.[tipo]?.trim();
  return preencher(editado || MODELOS_PADRAO[tipo] || "", vars);
}

/** Variáveis usadas no modelo que não existem para o tipo (para avisar ao editar). */
export function variaveisDesconhecidas(tipo: string, modelo: string): string[] {
  const validas = new Set((VARIAVEIS[tipo] ?? []).map((x) => x.nome));
  return [...new Set([...modelo.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].filter((n) => !validas.has(n));
}
