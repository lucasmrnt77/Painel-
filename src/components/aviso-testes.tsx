import Link from "next/link";
import type { ProblemaTeste } from "@/lib/testes-eventos";

/** Faixa vermelha no topo de todas as páginas quando os testes dos eventos acusam problema. */
export function AvisoTestes({ problemas }: { problemas: ProblemaTeste[] }) {
  if (problemas.length === 0) return null;
  return (
    <div role="alert" className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm">
      <div className="min-w-0">
        <p className="font-semibold text-rose-300">⚠ Problema nos eventos da Meta</p>
        <ul className="mt-0.5 space-y-0.5 text-rose-200/90">
          {problemas.map((p) => <li key={p.origem} className="break-words">{p.texto}</li>)}
        </ul>
      </div>
      <Link href="/alertas#testes" className="shrink-0 rounded-lg border border-rose-400/40 px-3 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-500/20">
        Ver detalhes
      </Link>
    </div>
  );
}
