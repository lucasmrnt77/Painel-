import Link from "next/link";
import type { Resumo } from "@/lib/dados";
import { SeletorLancamento } from "./navegacao";
import { Tx } from "@/lib/i18n/cliente";

type Opcao = { slug: string; nome: string; ativo: boolean };

/** `extras` entra no seletor depois dos lançamentos (ex.: a campanha do grupo gratuito na Visão geral). */
export function CabecalhoPagina({ titulo, resumos, atual, children, extras = [], subtitulo, selecionado }: {
  titulo: string; resumos: Resumo[]; atual: Resumo | null; children?: React.ReactNode;
  extras?: Opcao[]; subtitulo?: string; selecionado?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold">{titulo}</h1>
        {subtitulo && <p className="text-sm text-zinc-500">{subtitulo}</p>}
        {!subtitulo && atual && (
          <p className="text-sm text-zinc-500">
            <Tx>{atual.nome}</Tx>
            {atual.ativo && <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"><Tx>ativo</Tx></span>}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {children}
        <SeletorLancamento opcoes={[...resumos.map((r) => ({ slug: r.slug, nome: r.nome, ativo: r.ativo })), ...extras]} atual={selecionado ?? atual?.slug ?? null} />
      </div>
    </div>
  );
}

export function SemLancamento() {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
      <p className="font-medium"><Tx>Nenhum lançamento cadastrado ainda</Tx></p>
      <p className="mt-1 text-sm text-zinc-500"><Tx>Crie o primeiro e marque como ativo para começar a receber inscrições.</Tx></p>
      <Link href="/lancamentos" className="mt-4 inline-block rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
        <Tx>Criar lançamento</Tx>
      </Link>
    </div>
  );
}
