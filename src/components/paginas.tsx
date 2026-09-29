import Link from "next/link";
import type { ResumoPagina } from "@/lib/dados";
import { numero } from "@/lib/formato";
import { Cartao, montarHref, td } from "./ui";

const ROTULO: Record<string, string> = { trader: "Trader", nunca_operou: "Nunca operou", sem_pagina: "Sem página" };
const PUBLICO_ERRADO: Record<string, string> = { trader: "nunca operaram", nunca_operou: "já operam" };

export function CartaoPaginas({ linhas, slug }: { linhas: ResumoPagina[]; slug: string }) {
  if (linhas.length === 0) return null;
  const destaque = linhas.find((l) => l.pagina_captura === "trader" && l.fora_do_publico > 0);
  return (
    <Cartao
      titulo="Por página de captura"
      acao={<Link className="text-xs text-emerald-700 hover:underline dark:text-emerald-400" href={montarHref("/analise", { l: slug, por: "pagina_perfil" })}>ver na Análise →</Link>}
    >
      {destaque && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
          Da página <b>Trader</b>, <b className="tabular">{numero(destaque.fora_do_publico)}</b> pessoas
          {destaque.pct_fora_do_publico != null && <> (<b className="tabular">{destaque.pct_fora_do_publico}%</b> dos que responderam)</>} disseram que{" "}
          <b>nunca operaram</b>.
        </p>
      )}
      <div className="-mx-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-zinc-800">
              <th className="px-4 py-2 font-medium">Página</th>
              <th className="px-4 py-2 text-right font-medium">Leads</th>
              <th className="px-4 py-2 text-right font-medium">No grupo</th>
              <th className="px-4 py-2 text-right font-medium">Nunca operou</th>
              <th className="px-4 py-2 text-right font-medium">Já opera</th>
              <th className="px-4 py-2 text-right font-medium">Sem resposta</th>
              <th className="px-4 py-2 text-right font-medium">Fora do público da página</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {linhas.map((l) => (
              <tr key={l.pagina_captura}>
                <td className={`${td} font-medium`}>{ROTULO[l.pagina_captura] ?? l.pagina_captura}</td>
                <td className={`${td} tabular text-right`}>{numero(l.leads)}</td>
                <td className={`${td} tabular text-right`}>
                  {numero(l.no_grupo)} <span className="text-xs text-zinc-500">({l.pct_no_grupo ?? "—"}%)</span>
                </td>
                <td className={`${td} tabular text-right`}>{numero(l.perfil_nunca_operou)}</td>
                <td className={`${td} tabular text-right`}>{numero(l.perfil_ja_opera)}</td>
                <td className={`${td} tabular text-right text-zinc-500`}>{numero(l.perfil_sem_resposta)}</td>
                <td className={`${td} tabular text-right`}>
                  {PUBLICO_ERRADO[l.pagina_captura] ? (
                    <>
                      {numero(l.fora_do_publico)} <span className="text-xs text-zinc-500">({l.pct_fora_do_publico ?? "—"}% {PUBLICO_ERRADO[l.pagina_captura]})</span>
                    </>
                  ) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {linhas.some((l) => l.pagina_captura === "sem_pagina") && (
        <p className="mt-3 text-xs text-zinc-500">
          &quot;Sem página&quot;: inscrições sem a página de captura informada. Na importação, reimporte a planilha escolhendo a página; na captura,
          envie o campo <code>pagina_captura</code>.
        </p>
      )}
    </Cartao>
  );
}
