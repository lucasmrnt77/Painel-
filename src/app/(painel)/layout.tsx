import { Suspense } from "react";
import { exigirLogin } from "@/lib/sessao";
import { sair } from "@/lib/acoes";
import { MenuLateral } from "@/components/navegacao";
import { AvisoTestes } from "@/components/aviso-testes";
import { problemasTestes } from "@/lib/testes-eventos";

export default async function LayoutPainel({ children }: LayoutProps<"/">) {
  await exigirLogin();
  const problemas = await problemasTestes();
  const botaoSair = (
    <form action={sair}>
      <button className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-sm text-zinc-500 hover:text-zinc-100">
        <span aria-hidden>⎋</span> Sair
      </button>
    </form>
  );
  return (
    <div className="min-h-screen">
      <Suspense>
        <MenuLateral sair={botaoSair} avisos={{ "/alertas": problemas.filter((p) => p.origem !== "meta").length, "/meta": problemas.filter((p) => p.origem === "meta").length }} />
      </Suspense>
      <div className="brilho-marca min-h-screen lg:pl-64">
        <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <AvisoTestes problemas={problemas} />
          {children}
        </main>
      </div>
    </div>
  );
}
