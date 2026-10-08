import { contexto, param } from "@/lib/contexto";
import { listarWebhooks } from "@/lib/dados";
import { dataHora, telefoneBonito } from "@/lib/formato";
import { Cartao, Paginacao, montarHref } from "@/components/ui";
import { CabecalhoPagina } from "@/components/cabecalho";
import { Importador } from "@/components/importador";

const COR_TIPO: Record<string, string> = {
  entrou: "text-emerald-700 dark:text-emerald-400",
  importacao: "text-sky-700 dark:text-sky-400",
  saiu: "text-rose-700 dark:text-rose-400",
  desconhecido: "text-zinc-500",
};

export default async function SendflowEImportacao({ searchParams }: PageProps<"/eventos">) {
  const sp = await searchParams;
  const { resumos, atual } = await contexto(sp);
  const { webhooks, eventos, total, pagina, porPagina } = await listarWebhooks(Number(param(sp, "p") ?? 1));
  const nomeLanc = new Map(resumos.map((r) => [r.lancamento_id, r.nome]));

  return (
    <>
      <CabecalhoPagina titulo="Sendflow e importação" resumos={resumos} atual={atual} />

      {atual && (
        <Cartao titulo="Importar planilha de leads (histórico)">
          <div id="importar" className="mb-4 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
            <p>
              Suba a planilha inteira em <b>.xlsx</b> (Google Sheets → Arquivo → Fazer download → Microsoft Excel). O painel lê todas as abas e
              identifica sozinho o que é <b>Leads</b> (inscrições) e o que é <b>Entradas no grupo</b> (Fecha, Hora, Telefono, Grupo). Abas que
              parecem cópia ou que não têm Fecha/Hora/Telefono ficam desmarcadas — confira antes de importar. Também aceita .csv (uma aba).
            </p>
            <p>
              Escolha a página de captura (Trader ou Nunca operou) dos leads desta planilha. Reimportar é seguro: nada duplica, só a coluna
              Grupo e a página são atualizadas.
            </p>
          </div>
          <Importador lancamentos={[atual, ...resumos.filter((r) => r.lancamento_id !== atual.lancamento_id)].map((r) => ({ id: r.lancamento_id, nome: r.nome }))} />
        </Cartao>
      )}

      <Cartao titulo={`Eventos recebidos do Sendflow (${total})`}>
        <p id="eventos" className="mb-3 text-sm text-zinc-500">
          Tudo que chegou pelo webhook, de todos os lançamentos, com o payload bruto. Eventos &quot;desconhecido&quot; significam que não
          deu para identificar telefone ou tipo — abra o payload para ajustar o mapeamento.
        </p>
        {webhooks.length === 0 && <p className="py-8 text-center text-sm text-zinc-500">Nenhum webhook recebido ainda.</p>}
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {webhooks.map((w) => {
            const evs = eventos.filter((e) => e.webhook_id === w.id);
            return (
              <li key={w.id} className="py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="tabular text-zinc-500">#{w.id}</span>
                  <span className="tabular">{dataHora(w.recebido_em)}</span>
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800">{w.origem}</span>
                  <span className="text-xs text-zinc-500">{w.n_eventos} evento(s)</span>
                </div>
                <ul className="mt-1 space-y-0.5 text-xs">
                  {evs.slice(0, 20).map((e) => (
                    <li key={e.id} className="flex flex-wrap gap-x-3">
                      <span className={`w-20 font-medium ${COR_TIPO[e.tipo] ?? ""}`}>{e.tipo}</span>
                      <span className="tabular w-36">{telefoneBonito(e.telefone)}</span>
                      <span className="text-zinc-500">{e.grupo_nome ?? e.grupo_id ?? "—"}</span>
                      <span className="text-zinc-400">{e.lancamento_id ? nomeLanc.get(e.lancamento_id) : "sem lançamento"}</span>
                      {e.tipo_original && <span className="text-zinc-400">({e.tipo_original})</span>}
                    </li>
                  ))}
                  {evs.length > 20 && <li className="text-zinc-400">… e mais {evs.length - 20}</li>}
                </ul>
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">payload</summary>
                  <pre className="mt-1 max-h-80 overflow-auto rounded-lg bg-zinc-50 p-3 text-xs dark:bg-zinc-950">{JSON.stringify(w.payload, null, 2)}</pre>
                </details>
              </li>
            );
          })}
        </ul>
        <div className="mt-2">
          <Paginacao pagina={pagina} total={total} porPagina={porPagina} href={(p) => montarHref("/eventos", { l: atual?.slug, p }) + "#eventos"} />
        </div>
      </Cartao>
    </>
  );
}
