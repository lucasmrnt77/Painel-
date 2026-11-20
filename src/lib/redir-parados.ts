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
