import Link from "next/link";
import { Tx } from "@/lib/i18n/cliente";

/** Abas do redirecionador: funis (tela principal) e grupos/importação. */
export function SubmenuRedirecionador({ ativo }: { ativo: "funis" | "grupos" }) {
  const itens = [
    { chave: "funis", href: "/redirecionador", rotulo: "Funis" },
    { chave: "grupos", href: "/redirecionador/grupos", rotulo: "Grupos e importação" },
  ] as const;
  return (
    <nav className="flex gap-1 rounded-lg border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900">
      {itens.map((i) => (
        <Link
          key={i.chave}
          href={i.href}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
            i.chave === ativo
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          }`}
        >
          <Tx>{i.rotulo}</Tx>
        </Link>
      ))}
    </nav>
  );
}
