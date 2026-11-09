/**
 * Custo por lead NO GRUPO (055, 09/11/2026 — pedido do gestor de tráfego):
 * gasto na Meta ÷ leads que de fato entraram em um grupo, por funil (General, Trader, Jubilados) e por dia.
 * Puro (sem banco) — tests/custo-grupo.test.ts.
 */

export type Funil = "general" | "trader" | "jubilados";
export const FUNIS: { id: Funil; nome: string }[] = [
  { id: "general", nome: "General" },
  { id: "trader", nome: "Trader" },
  { id: "jubilados", nome: "Jubilados" },
];

export type LinhaCusto = { dia: string; funil: Funil; investimento: number; leads: number; noGrupo: number };
export type Celula = { investimento: number; leads: number; noGrupo: number; cpl: number | null; cplGrupo: number | null; pctGrupo: number | null };

export function celula(ls: Pick<LinhaCusto, "investimento" | "leads" | "noGrupo">[]): Celula {
  const investimento = ls.reduce((t, l) => t + l.investimento, 0);
  const leads = ls.reduce((t, l) => t + l.leads, 0);
  const noGrupo = ls.reduce((t, l) => t + l.noGrupo, 0);
  return {
    investimento, leads, noGrupo,
    cpl: leads > 0 && investimento > 0 ? investimento / leads : null,
    cplGrupo: noGrupo > 0 && investimento > 0 ? investimento / noGrupo : null,
    pctGrupo: leads > 0 ? noGrupo / leads : null,
  };
}

export type ResumoCusto = {
  total: { porFunil: Record<Funil, Celula>; geral: Celula };
  dias: { dia: string; porFunil: Record<Funil, Celula>; geral: Celula }[];
};

/** Total e por dia (mais recente primeiro). Só entram dias com gasto na Meta (antes das campanhas não há custo). */
export function resumirCusto(linhas: LinhaCusto[]): ResumoCusto {
  const comGasto = new Set(linhas.filter((l) => l.investimento > 0).map((l) => l.dia));
  const ls = linhas.filter((l) => comGasto.has(l.dia));
  const porFunil = (xs: LinhaCusto[]) =>
    Object.fromEntries(FUNIS.map((f) => [f.id, celula(xs.filter((x) => x.funil === f.id))])) as Record<Funil, Celula>;
  const dias = [...comGasto].sort((a, b) => b.localeCompare(a)).map((dia) => {
    const xs = ls.filter((l) => l.dia === dia);
    return { dia, porFunil: porFunil(xs), geral: celula(xs) };
  });
  return { total: { porFunil: porFunil(ls), geral: celula(ls) }, dias };
}
