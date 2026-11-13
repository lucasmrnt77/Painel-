/**
 * Linhas telefônicas (059): regras puras da recarga — tests/linhas.test.ts.
 * Cada chip precisa de recarga a cada 6 meses para não ser perdido.
 */

export type EstadoLinha = "ativa" | "perdida";
export type Linha = {
  id: number; linha: string; celular: string | null; whatsapp: string | null; descricao: string | null;
  pin: string | null; puk: string | null; chip: string | null; estado: EstadoLinha;
  ultima_recarga: string | null; proxima_recarga: string | null;
};

export const MESES_RECARGA = 6;
/** A partir de quantos dias antes a recarga aparece como "vence em breve". */
export const DIAS_AVISO = 15;

export type SituacaoRecarga = "perdida" | "vencida" | "breve" | "ok" | "sem_data";

/** Data + 6 meses (AAAA-MM-DD). Dia que não existe no mês final vai para o último dia (31/08 → 28 ou 29/02). */
export function proximaRecarga(dia: string, meses = MESES_RECARGA): string {
  const [a, m, d] = dia.split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}

/** Dias de hoje até a data (negativo = já passou). */
export function diasAte(dia: string, hoje: string): number {
  return Math.round((Date.parse(`${dia}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86_400_000);
}

export function situacaoRecarga(l: Pick<Linha, "estado" | "proxima_recarga">, hoje: string): SituacaoRecarga {
  if (l.estado === "perdida") return "perdida";
  if (!l.proxima_recarga) return "sem_data";
  const d = diasAte(l.proxima_recarga, hoje);
  if (d < 0) return "vencida";
  if (d <= DIAS_AVISO) return "breve";
  return "ok";
}

/** Ordem da tabela: vencidas primeiro (a mais atrasada no topo), depois por data, sem data, perdidas por último. */
export function ordenarLinhas(ls: Linha[], hoje: string): Linha[] {
  const peso: Record<SituacaoRecarga, number> = { vencida: 0, breve: 1, ok: 2, sem_data: 3, perdida: 4 };
  return [...ls].sort((a, b) => {
    const sa = situacaoRecarga(a, hoje), sb = situacaoRecarga(b, hoje);
    if (sa !== sb) return peso[sa] - peso[sb];
    return (a.proxima_recarga ?? "9999").localeCompare(b.proxima_recarga ?? "9999") || a.linha.localeCompare(b.linha);
  });
}
