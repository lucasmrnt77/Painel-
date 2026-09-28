import { Suspense } from "react";
import { exigirLogin } from "@/lib/sessao";
import { sair } from "@/lib/acoes";
import { Abas } from "@/components/navegacao";

export default async function LayoutPainel({ children }: LayoutProps<"/">) {
  await exigirLogin();
  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <span className="font-semibold">Painel Sendflow</span>
            </div>
            <form action={sair}>
              <button className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">Sair</button>
            </form>
          </div>
          <Suspense>
            <Abas />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto max-w-7xl space-y-4 px-4 py-6">{children}</main>
    </div>
  );
}
