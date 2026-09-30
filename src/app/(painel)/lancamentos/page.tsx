import { headers } from "next/headers";
import { contexto } from "@/lib/contexto";
import { configsLancamentos } from "@/lib/dados";
import { ativarLancamento, desativarLancamento } from "@/lib/acoes";
import { dataHora, numero } from "@/lib/formato";
import { Cartao } from "@/components/ui";
import { CabecalhoPagina } from "@/components/cabecalho";
import { FormLancamento } from "@/components/formularios";
import { listarSendflow, modoEnvio, type ItemSendflow } from "@/lib/whatsapp";

const DESCRICAO_MODO: Record<string, string> = {
  sendflow_grupo: "Sendflow → grupo(s) da campanha de alertas",
  sendflow_direto: "Sendflow → mensagem direta aos telefones do lançamento",
  webhook: "Webhook genérico (WHATSAPP_WEBHOOK_URL)",
  nenhum: "Nenhum — os alertas ficam só no painel",
};

function ListaSendflow({ titulo, itens, erro, selecionado }: { titulo: string; itens: ItemSendflow[]; erro?: string; selecionado: string }) {
  return (
    <div>
      <p className="mb-1 font-medium">{titulo}</p>
      {erro ? (
        <p className="text-xs text-rose-600">{erro}</p>
      ) : itens.length === 0 ? (
        <p className="text-xs text-zinc-500">Nenhum item retornado.</p>
      ) : (
        <ul className="max-h-64 space-y-1 overflow-y-auto text-xs">
          {itens.map((i) => (
            <li key={i.id} className={`flex gap-2 rounded px-2 py-1 ${i.id === selecionado ? "bg-emerald-50 font-medium dark:bg-emerald-950/40" : ""}`}>
              <code className="shrink-0 font-mono">{i.id}</code>
              <span className="truncate text-zinc-600 dark:text-zinc-400">{i.nome}{i.extra && i.extra !== i.nome ? ` · ${i.extra}` : ""}</span>
              {i.id === selecionado && <span className="ml-auto shrink-0 text-emerald-700 dark:text-emerald-400">em uso</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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
  const modo = modoEnvio();
  const temToken = !!process.env.SENDFLOW_API_TOKEN?.trim();
  const [contas, campanhas] = temToken
    ? await Promise.all([listarSendflow("accounts"), listarSendflow("releases")])
    : [null, null];

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

      <Cartao titulo="Envio dos alertas por WhatsApp">
        <div className="space-y-3 text-sm">
          <p>
            Modo atual: <b>{DESCRICAO_MODO[modo]}</b>
          </p>
          {!temToken && (
            <p className="text-xs text-zinc-500">
              Para o Sendflow enviar os alertas, cadastre na Vercel <code>SENDFLOW_API_TOKEN</code>. Depois de salvar e
              refazer o deploy, esta seção lista as contas e campanhas com os ids para preencher{" "}
              <code>SENDFLOW_ACCOUNT_ID</code> e <code>SENDFLOW_ALERTAS_CAMPANHA_ID</code>.
            </p>
          )}
          {contas && campanhas && (
            <>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Atenção: o alerta vai para <b>todos os grupos</b> da campanha escolhida. Use uma campanha só com o grupo da
                equipe (ou o grupo de teste), nunca a campanha dos leads.
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                <ListaSendflow titulo="Contas (SENDFLOW_ACCOUNT_ID)" {...contas} selecionado={process.env.SENDFLOW_ACCOUNT_ID?.trim() ?? ""} />
                <ListaSendflow titulo="Campanhas (SENDFLOW_ALERTAS_CAMPANHA_ID)" {...campanhas} selecionado={process.env.SENDFLOW_ALERTAS_CAMPANHA_ID?.trim() ?? ""} />
              </div>
            </>
          )}
        </div>
      </Cartao>

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
