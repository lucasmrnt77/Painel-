/** Grupos cheios/pausados: convite conferido 1x por dia (20/11/2026: #25, #58 e #45 caíram depois de cheios). */
export const CONFERIR_PARADOS_MIN = 24 * 60

type G = { status: string; verificacao: string | null; verificado_em: string | null }

/** Grupos fora da fila (cheios ou pausados), sem convite já inválido e sem conferência há 24 h; mais antigos primeiro. */
export function paradosParaConferir<T extends G>(todos: T[], agora = Date.now()): T[] {
  return todos
    .filter((g) => (g.status === "cheio" || g.status === "pausado") && g.verificacao !== "invalido"
      && (g.verificado_em ? (agora - new Date(g.verificado_em).getTime()) / 60000 : Infinity) >= CONFERIR_PARADOS_MIN)
    .sort((a, b) => (a.verificado_em ?? "").localeCompare(b.verificado_em ?? ""))
}

/** Depois desse tempo sem conseguir confirmar no Sendflow, avisa mesmo assim. */
export const CONFIRMAR_MAX_MIN = 30

/**
 * Convite parou de funcionar: o que fazer, com a lista de grupos do Sendflow em mãos (puro — testável).
 * - "trocar": o Sendflow tem um link novo que funciona → foi só link redefinido, sem alerta;
 * - "alertar": o Sendflow marca suspenso, ou o link novo dele também não funciona, ou passou do tempo máximo;
 * - "esperar": ainda não deu para confirmar — inclusive quando o Sendflow ainda mostra o mesmo link
 *   (23/11/2026: conta criadora bloqueada → WhatsApp trocou os links e o Sendflow demorou a atualizar).
 */
export function decidirConfirmacao(p: {
  codigoPainel: string; noSendflow: { codigo: string | null; suspenso?: boolean } | null; novoValido: boolean | null; minutosPendente: number
}): "trocar" | "alertar" | "esperar" {
  const s = p.noSendflow
  if (s?.suspenso) return "alertar"
  if (s?.codigo && s.codigo !== p.codigoPainel) {
    if (p.novoValido === true) return "trocar"
    if (p.novoValido === false) return "alertar"
  }
  return p.minutosPendente >= CONFIRMAR_MAX_MIN ? "alertar" : "esperar"
}
