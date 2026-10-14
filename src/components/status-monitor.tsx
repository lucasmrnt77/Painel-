import Link from "next/link";
import type { SituacaoMonitor } from "@/lib/dados";
import { duracao } from "@/lib/mensagens";

/** Linha compacta do monitor na Visão geral; o detalhe e a configuração ficam em Alertas. */
export function StatusMonitor({ nome, s, porLeads = false }: { nome: string; s: SituacaoMonitor | null; porLeads?: boolean }) {
  const termo = porLeads ? "lead" : "entrada";
  const min = s?.minutos_desde_ultima_entrada ?? null;
  const alerta = !!s?.monitor_ativo && min != null && min >= s.alerta_minutos_sem_entrada;
  const cor = !s?.monitor_ativo ? "bg-zinc-600" : alerta ? "bg-rose-500" : "animate-pulse bg-emerald-500";
  return (
    <Link href="/alertas" className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition hover:border-zinc-600 ${alerta ? "border-rose-500/40 bg-rose-500/5" : "border-zinc-800 bg-zinc-900"}`}>
      <div className="flex items-center gap-3">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${cor}`} />
        <div>
          <div className="text-sm font-medium">{nome}</div>
          <div className="text-xs text-zinc-500">
            {!s ? "ainda não configurado" : !s.monitor_ativo ? "desligado" : alerta ? `sem ${termo}s há ${duracao(min!)}` : `ligado · alerta após ${duracao(s.alerta_minutos_sem_entrada)}`}
            {s?.ultima_entrada_em ? ` · últim${porLeads ? "o" : "a"} ${termo} ${min != null ? `há ${duracao(min)}` : ""}` : ""}
          </div>
        </div>
      </div>
      <span className="text-xs text-emerald-400">Alertas →</span>
    </Link>
  );
}
