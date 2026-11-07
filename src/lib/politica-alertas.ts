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

/**
 * Campanhas na Meta (07/11/2026): só vai para o WhatsApp o que PARA o orçamento — conta bloqueada/em análise,
 * conta sem gastar, limite de gasto reduzido pela Meta, gasto zerado. Ritmo baixo, dia abaixo, CPL alto,
 * orçamento divergente e sincronização parada ficam só no painel (aba Alertas).
 */
export const ADS_NO_WHATSAPP = ["ads_conta_bloqueada", "ads_conta_sem_gasto", "ads_limite_reduzido", "ads_sem_gasto"];
export function metaAdsVaiProWhatsapp(tipo: string): boolean {
  return ADS_NO_WHATSAPP.includes(tipo);
}
