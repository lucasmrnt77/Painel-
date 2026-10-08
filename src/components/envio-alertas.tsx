import { Cartao } from "@/components/ui";
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

/** Como os alertas saem por WhatsApp (modo, contas e campanhas do Sendflow). */
export async function CartaoEnvioAlertas({ verSendflow, base = "/alertas" }: { verSendflow: boolean; base?: string }) {
  const modo = modoEnvio();
  const temToken = !!process.env.SENDFLOW_API_TOKEN?.trim();
  // A API do Sendflow tem limite de requisições: só consulta quando pedido, uma chamada por vez.
  const ver = temToken && verSendflow;
  const contas = ver ? await listarSendflow("accounts") : null;
  const campanhas = ver ? await listarSendflow("releases") : null;
  return (
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
          {temToken && !ver && (
            <a href={`${base}?sendflow=1`} className="inline-block rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
              Carregar contas e campanhas do Sendflow
            </a>
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

  );
}
