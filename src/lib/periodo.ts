/** Período de datas (AAAA-MM-DD, dia no fuso de Montevidéu). null = sem limite daquele lado. */
export type Periodo = { de: string | null; ate: string | null };

const DATA = /^\d{4}-\d{2}-\d{2}$/;

function dataValida(v: string | undefined | null): string | null {
  const s = (v ?? "").trim();
  if (!DATA.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : null;
}

/** Lê ?de= e ?ate= da URL. Datas inválidas são ignoradas; se vierem invertidas, troca. */
export function lerPeriodo(de?: string | null, ate?: string | null): Periodo {
  let a = dataValida(de);
  let b = dataValida(ate);
  if (a && b && a > b) [a, b] = [b, a];
  return { de: a, ate: b };
}

export const temPeriodo = (p: Periodo) => !!(p.de || p.ate);

/** "23/10 a 25/10/2026", "desde 23/10/2026", "até 25/10/2026". */
export function rotuloPeriodo(p: Periodo, t: (s: string, v?: Record<string, string>) => string = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v?.[k] ?? "")): string {
  const br = (s: string, ano: boolean) => `${s.slice(8, 10)}/${s.slice(5, 7)}${ano ? `/${s.slice(0, 4)}` : ""}`;
  if (p.de && p.ate) return t("{a} a {b}", { a: br(p.de, p.de.slice(0, 4) !== p.ate.slice(0, 4)), b: br(p.ate, true) });
  if (p.de) return t("desde {a}", { a: br(p.de, true) });
  if (p.ate) return t("até {b}", { b: br(p.ate, true) });
  return "";
}
