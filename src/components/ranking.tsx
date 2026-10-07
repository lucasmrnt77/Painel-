import Link from "next/link";
import { numero } from "@/lib/formato";

type Item = { valor: string; n: number };

/** Barras horizontais com o número escrito ao lado. Clicar filtra a página por aquele valor. */
export function Ranking({ titulo, itens, total, ativo, href, limite = 8 }: {
  titulo: string; itens: Item[]; total: number; ativo?: string; href: (valor: string | null) => string; limite?: number;
}) {
  const topo = itens.slice(0, limite);
  const resto = itens.slice(limite).reduce((s, i) => s + i.n, 0);
  const max = Math.max(1, ...topo.map((i) => i.n));
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{titulo}</h2>
        {ativo && <Link href={href(null)} className="text-xs text-emerald-700 hover:underline dark:text-emerald-400">limpar filtro</Link>}
      </div>
      {topo.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-500">Sem dados no período.</p>
      ) : (
        <ul className="space-y-2">
          {topo.map((i) => {
            const pct = total ? Math.round((i.n / total) * 100) : 0;
            const sel = ativo === i.valor;
            return (
              <li key={i.valor}>
                <Link
                  href={href(sel ? null : i.valor)}
                  title={sel ? "Remover filtro" : `Filtrar por ${i.valor}`}
                  className={`-mx-1.5 block rounded-md px-1.5 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-800 ${sel ? "ring-1 ring-emerald-500" : ""}`}
                >
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">{i.valor}</span>
                    <span className="tabular shrink-0"><strong>{numero(i.n)}</strong> <span className="text-zinc-400">{pct}%</span></span>
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(i.n / max) * 100}%` }} />
                  </div>
                </Link>
              </li>
            );
          })}
          {resto > 0 && (
            <li className="flex justify-between pt-1 text-sm text-zinc-500">
              <span>Outros ({itens.length - limite})</span><span className="tabular">{numero(resto)}</span>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
