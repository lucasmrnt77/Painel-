/**
 * Política do grupo de alertas no WhatsApp: SÓ vai mensagem quando algo parou
 * de funcionar e precisa de ajuste. Avisos de "está tudo bem" (resumos,
 * entradas retomadas, link novo, testes voltaram a passar) ficam só no painel.
 * Pura — testada em tests/politica-alertas.test.ts.
 */

/** Monitor de entradas (lançamentos e grupo gratuito). */
export function monitorVaiProWhatsapp(tipo: string): boolean {
  // sem_entradas: ninguém entrou no prazo configurado (padrão 24 h)
  // teste: só quando alguém clica em "enviar teste" no painel
  // sem_leads: grupo gratuito sem lead novo na página no prazo configurado (padrão 24 h)
  // planilha_parada: a planilha unificada parou de buscar dados do painel (15 min)
  return tipo === "sem_entradas" || tipo === "sem_leads" || tipo === "planilha_parada" || tipo === "teste";
}

/** Redirecionador de grupos. `temProximo` = ainda há grupo ativo na fila. */
export function redirecionadorVaiProWhatsapp(tipo: string, temProximo: boolean): boolean {
  if (tipo === "sem_grupos" || tipo === "redefinicao_sem_retorno" || tipo === "redefinicao_falhou") return true;
  // Grupo cheio ou convite inválido só é problema se não sobrou grupo para receber os cliques
  if (tipo === "cheio" || tipo === "invalido") return !temProximo;
  return false; // link_novo e o resto: só no painel
}

/** Testes diários dos eventos: só quando falham. */
export function testesVaiProWhatsapp(ok: boolean): boolean {
  return !ok;
}

/** Campanhas na Meta (gasto parado, custo por lead alto, sincronização parada): sempre são problema. */
export function metaAdsVaiProWhatsapp(tipo: string): boolean {
  return tipo === "ads_sem_dados" || tipo === "ads_sem_gasto" || tipo === "ads_cpl_alto" || tipo === "ads_gasto_baixo";
}
