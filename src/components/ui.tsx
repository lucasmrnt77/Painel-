import Link from "next/link";
import { COR_STATUS, ROTULO_STATUS } from "@/lib/formato";

export function Cartao({ titulo, children, acao, className = "" }: { titulo?: string; children: React.ReactNode; acao?: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 ${className}`}>
      {(titulo || acao) && (
        <header className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          {titulo && <h2 className="text-sm font-semibold">{titulo}</h2>}
          {acao}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Kpi({ rotulo, valor, detalhe, destaque }: { rotulo: string; valor: string; detalhe?: string; destaque?: "verde" | "ambar" | "vermelho" }) {
  const cor =
    destaque === "verde" ? "text-emerald-600 dark:text-emerald-400"
    : destaque === "ambar" ? "text-amber-600 dark:text-amber-400"
    : destaque === "vermelho" ? "text-rose-600 dark:text-rose-400"
    : "";
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{rotulo}</div>
      <div className={`tabular mt-1 text-2xl font-semibold ${cor}`}>{valor}</div>
      {detalhe && <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{detalhe}</div>}
    </div>
  );
}

export function Selo({ status }: { status: string }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${COR_STATUS[status] ?? COR_STATUS.telefone_invalido}`}>
      {ROTULO_STATUS[status] ?? status}
    </span>
  );
}

export function montarHref(base: string, params: Record<string, string | number | undefined | null>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  const s = sp.toString();
  return s ? `${base}?${s}` : base;
}

export function Chips({ itens, ativo }: { itens: { valor: string; rotulo: string; href: string; qtd?: number }[]; ativo: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {itens.map((i) => (
        <Link
          key={i.valor}
          href={i.href}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
            i.valor === ativo
              ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
              : "border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          }`}
        >
          {i.rotulo}
          {i.qtd !== undefined && <span className="tabular ml-1.5 opacity-70">{i.qtd}</span>}
        </Link>
      ))}
    </div>
  );
}

export function Busca({ acao, valor, ocultos, placeholder, nome = "q" }: { acao: string; valor?: string; ocultos: Record<string, string | undefined>; placeholder: string; nome?: string }) {
  return (
    <form action={acao} className="flex gap-2">
      {Object.entries(ocultos).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <input
        name={nome}
        defaultValue={valor}
        placeholder={placeholder}
        className="w-full min-w-0 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-zinc-500 sm:w-64 dark:border-zinc-700 dark:bg-zinc-950"
      />
      <button className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">Buscar</button>
    </form>
  );
}

export function Paginacao({ pagina, total, porPagina, href }: { pagina: number; total: number; porPagina: number; href: (p: number) => string }) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  if (paginas <= 1) return <p className="text-xs text-zinc-500">{total} registro(s)</p>;
  return (
    <div className="flex items-center justify-between text-xs text-zinc-500">
      <span className="tabular">{total} registros · página {pagina} de {paginas}</span>
      <div className="flex gap-2">
        {pagina > 1 && <Link className="rounded border border-zinc-300 px-2 py-1 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800" href={href(pagina - 1)}>← Anterior</Link>}
        {pagina < paginas && <Link className="rounded border border-zinc-300 px-2 py-1 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800" href={href(pagina + 1)}>Próxima →</Link>}
      </div>
    </div>
  );
}

export function Tabela({ cabecalho, children, vazio }: { cabecalho: string[]; children: React.ReactNode; vazio?: boolean }) {
  return (
    <div className="-mx-4 overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            {cabecalho.map((c) => <th key={c} className="px-4 py-2 font-medium whitespace-nowrap">{c}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">{children}</tbody>
      </table>
      {vazio && <p className="px-4 py-8 text-center text-sm text-zinc-500">Nada por aqui ainda.</p>}
    </div>
  );
}

export const td = "px-4 py-2 align-top";
