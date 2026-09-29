import { headers } from "next/headers";
import { contexto } from "@/lib/contexto";
import { configsLancamentos } from "@/lib/dados";
import { ativarLancamento, desativarLancamento } from "@/lib/acoes";
import { dataHora, numero } from "@/lib/formato";
import { Cartao } from "@/components/ui";
import { CabecalhoPagina } from "@/components/cabecalho";
import { FormLancamento } from "@/components/formularios";

function Codigo({ children }: { children: string }) {
  return <code className="block break-all rounded-lg bg-zinc-50 px-3 py-2 font-mono text-xs dark:bg-zinc-950">{children}</code>;
}

export default async function Lancamentos({ searchParams }: PageProps<"/lancamentos">) {
  const { resumos, atual } = await contexto(await searchParams);
  const configs = await configsLancamentos();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "SEU-DOMINIO.vercel.app";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const base = `${proto}://${host}`;

  return (
    <>
      <CabecalhoPagina titulo="Lançamentos" resumos={resumos} atual={atual} />

      <Cartao titulo="Novo lançamento">
        <FormLancamento />
      </Cartao>

      {resumos.map((r) => (
        <Cartao
          key={r.lancamento_id}
          titulo={`${r.nome} · ${r.slug}`}
          acao={
            r.ativo ? (
              <form action={desativarLancamento} className="flex items-center gap-2">
                <input type="hidden" name="id" value={r.lancamento_id} />
                <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">Ativo</span>
                <button className="text-xs text-zinc-500 hover:underline">desativar</button>
              </form>
            ) : (
              <form action={ativarLancamento}>
                <input type="hidden" name="id" value={r.lancamento_id} />
                <button className="rounded-lg border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">Tornar ativo</button>
              </form>
            )
          }
        >
          <p className="mb-3 text-xs text-zinc-500">
            Criado em {dataHora(r.criado_em)} · {numero(r.inscritos)} inscritos · {numero(r.membros_no_grupo)} no grupo
            {configs.get(r.lancamento_id)?.monitor_ativo && <span className="ml-2 font-medium text-emerald-700 dark:text-emerald-400">· monitor ligado</span>}
          </p>
          <details>
            <summary className="cursor-pointer text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">Editar</summary>
            <div className="mt-3"><FormLancamento lancamento={{ ...r, ...configs.get(r.lancamento_id) }} /></div>
          </details>
        </Cartao>
      ))}

      <Cartao titulo="Como conectar">
        <div className="space-y-4 text-sm">
          <div>
            <p className="font-medium">Página de captura → POST</p>
            <p className="mb-1 text-xs text-zinc-500">Campos: nome, email, telefone (ou phone/whatsapp) e utm_*. Sem &quot;lancamento&quot; usa o lançamento ativo. Com &amp;redirect=1 a pessoa é redirecionada para o link do grupo.</p>
            <Codigo>{`${base}/api/captura?token=SEU_CAPTURA_TOKEN`}</Codigo>
          </div>
          <div>
            <p className="font-medium">Sendflow → webhook</p>
            <p className="mb-1 text-xs text-zinc-500">Se o Sendflow tiver um gatilho separado para entrada e para saída, use uma URL para cada. Se for um só, tire o &amp;tipo=.</p>
            <Codigo>{`${base}/api/webhooks/sendflow?token=SEU_SENDFLOW_WEBHOOK_TOKEN&tipo=entrou`}</Codigo>
            <div className="h-2" />
            <Codigo>{`${base}/api/webhooks/sendflow?token=SEU_SENDFLOW_WEBHOOK_TOKEN&tipo=saiu`}</Codigo>
          </div>
        </div>
      </Cartao>
    </>
  );
}
