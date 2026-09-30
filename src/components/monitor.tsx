import type { Alerta, SituacaoMonitor } from "@/lib/dados";
import { alternarMonitor } from "@/lib/acoes";
import { dataHora } from "@/lib/formato";
import { FormTesteAlerta } from "./formularios";
import type { ModoEnvio } from "@/lib/whatsapp";

const ROTULO_ALERTA: Record<string, string> = {
  sem_entradas: "Sem entradas",
  entradas_retomadas: "Retomadas",
  resumo: "Resumo",
  teste: "Teste",
};
const COR_ALERTA: Record<string, string> = {
  sem_entradas: "text-rose-700 dark:text-rose-400",
  entradas_retomadas: "text-emerald-700 dark:text-emerald-400",
  resumo: "text-sky-700 dark:text-sky-400",
  teste: "text-zinc-500",
};
const ROTULO_ENVIO: Record<string, string> = {
  enviado: "enviado", parcial: "envio parcial", falhou: "falhou", sem_envio: "só no painel", pendente: "enviando",
};

export function CartaoMonitor({ s, alertas, modo }: { s: SituacaoMonitor; alertas: Alerta[]; modo: ModoEnvio }) {
  const porTelefone = modo === "sendflow_direto" || modo === "webhook";
  const min = s.minutos_desde_ultima_entrada;
  const limiar = s.alerta_minutos_sem_entrada;
  const cor =
    min == null ? "text-zinc-500"
    : min >= limiar ? "text-rose-600 dark:text-rose-400"
    : min >= limiar / 2 ? "text-amber-600 dark:text-amber-400"
    : "text-emerald-600 dark:text-emerald-400";

  return (
    <section className={`rounded-xl border bg-white dark:bg-zinc-900 ${s.monitor_ativo ? "border-emerald-300 dark:border-emerald-800" : "border-zinc-200 dark:border-zinc-800"}`}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${s.monitor_ativo ? "animate-pulse bg-emerald-500" : "bg-zinc-400"}`} />
          <h2 className="text-sm font-semibold">Monitor de tráfego</h2>
          <span className="text-xs text-zinc-500">
            {s.monitor_ativo
              ? `ligado desde ${dataHora(s.monitor_ligado_em)} · alerta após ${limiar} min sem entradas`
              : "desligado — ligue quando o tráfego começar"}
          </span>
        </div>
        <form action={alternarMonitor}>
          <input type="hidden" name="id" value={s.lancamento_id} />
          <input type="hidden" name="ativo" value={s.monitor_ativo ? "0" : "1"} />
          <button
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              s.monitor_ativo
                ? "border border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                : "bg-emerald-600 text-white hover:bg-emerald-700"
            }`}
          >
            {s.monitor_ativo ? "Desligar monitor" : "Ligar monitor"}
          </button>
        </form>
      </header>
      <div className="grid gap-4 p-4 md:grid-cols-[1fr_1fr_1fr_2fr]">
        <div>
          <div className="text-xs text-zinc-500">Última entrada no grupo</div>
          <div className={`tabular mt-1 text-2xl font-semibold ${cor}`}>{min == null ? "—" : `há ${min} min`}</div>
          <div className="text-xs text-zinc-500">{s.ultima_entrada_em ? dataHora(s.ultima_entrada_em) : "nenhuma ainda"}</div>
        </div>
        <div>
          <div className="text-xs text-zinc-500">Últimos 20 min</div>
          <div className="tabular mt-1 text-2xl font-semibold">{s.ultimos_20.entradas}</div>
          <div className="text-xs text-zinc-500">entradas · {s.ultimos_20.inscricoes} inscrições</div>
        </div>
        <div>
          <div className="text-xs text-zinc-500">Última hora</div>
          <div className="tabular mt-1 text-2xl font-semibold">{s.ultimos_60.entradas}</div>
          <div className="text-xs text-zinc-500">entradas · {s.ultimos_60.inscricoes} inscrições</div>
        </div>
        <div className="min-w-0">
          <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
            <span>Alertas recentes</span>
            {modo === "nenhum" && <span className="text-amber-700 dark:text-amber-400">WhatsApp ainda não configurado</span>}
            {modo === "sendflow_grupo" && <span className="text-emerald-700 dark:text-emerald-400">envio: grupo da equipe via Sendflow</span>}
            {porTelefone && s.alerta_telefones.length === 0 && <span className="text-amber-700 dark:text-amber-400">sem telefones cadastrados</span>}
            {porTelefone && s.alerta_telefones.length > 0 && <span>envio: {s.alerta_telefones.length} telefone(s){modo === "sendflow_direto" ? " via Sendflow" : ""}</span>}
          </div>
          {alertas.length === 0 ? (
            <p className="text-sm text-zinc-500">Nenhum alerta ainda.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {alertas.map((a) => (
                <li key={a.id} className="flex gap-2" title={a.mensagem}>
                  <span className="tabular shrink-0 text-zinc-500">{dataHora(a.criado_em)}</span>
                  <span className={`shrink-0 font-medium ${COR_ALERTA[a.tipo] ?? ""}`}>{ROTULO_ALERTA[a.tipo] ?? a.tipo}</span>
                  <span className="truncate text-zinc-600 dark:text-zinc-400">{a.mensagem.split("\n").slice(1).join(" · ")}</span>
                  <span className="ml-auto shrink-0 text-zinc-400">{ROTULO_ENVIO[a.envio_status] ?? a.envio_status}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3"><FormTesteAlerta lancamentoId={s.lancamento_id} /></div>
        </div>
      </div>
    </section>
  );
}

export function GraficoHoras({ serie }: { serie: { hora: string; inscricoes: number; entradas: number; saidas: number }[] }) {
  const horas = serie.map((s) => ({ ...s, k: s.hora.slice(0, 13) }));
  const max = Math.max(1, ...horas.map((s) => Math.max(s.inscricoes, s.entradas)));
  const vazio = horas.every((h) => h.inscricoes === 0 && h.entradas === 0);
  return (
    <div className="overflow-x-auto">
      {vazio && <p className="mb-2 text-center text-xs text-zinc-500">Sem movimento nas últimas 24h.</p>}
      <div className="flex h-40 min-w-[560px] items-end gap-1">
        {horas.map((s) => {
          const h = s.k.slice(11, 13);
          return (
            <div key={s.k} className="flex flex-1 flex-col items-center gap-1" title={`${s.k.slice(8, 10)}/${s.k.slice(5, 7)} ${h}h — ${s.inscricoes} inscrições, ${s.entradas} entradas, ${s.saidas} saídas`}>
              <div className="flex h-32 w-full items-end justify-center gap-px">
                <div className="w-2/5 max-w-3 rounded-t-sm bg-zinc-400" style={{ height: `${(100 * s.inscricoes) / max}%` }} />
                <div className="w-2/5 max-w-3 rounded-t-sm bg-emerald-500" style={{ height: `${(100 * s.entradas) / max}%` }} />
              </div>
              <span className="tabular text-[10px] text-zinc-500">{h}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
