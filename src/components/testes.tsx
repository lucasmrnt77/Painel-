"use client";

import { useActionState } from "react";
import { rodarTestesAgora } from "@/lib/acoes-testes";
import type { Execucao } from "@/lib/testes-casos";

const botao = "rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300";

const quando = (iso?: string) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

const ROTULO = { servidor: "Servidor (regras + API de Conversões)", navegador: "Navegador (pixel × servidor, mesmo event_id)" } as const;

function Situacao({ origem, e }: { origem: Execucao["origem"]; e: Execucao | null }) {
  const cor = !e ? "border-zinc-800 bg-zinc-900" : e.ok ? "border-emerald-500/30 bg-emerald-500/5" : "border-rose-500/40 bg-rose-500/5";
  return (
    <div className={`rounded-xl border p-4 ${cor}`}>
      <div className="flex items-center gap-2 text-xs text-zinc-400">
        <span className={`h-2 w-2 rounded-full ${!e ? "bg-zinc-600" : e.ok ? "bg-emerald-500" : "bg-rose-500"}`} />
        {ROTULO[origem]}
      </div>
      <div className="mt-1 text-lg font-semibold">
        {!e ? "Ainda não rodou" : e.ok ? `Tudo certo · ${e.total} verificações` : `${e.falhas} de ${e.total} falharam`}
      </div>
      <div className="text-xs text-zinc-500">
        {e ? `última execução ${quando(e.criado_em)}${e.disparo === "manual" ? " (manual)" : ""}` : origem === "navegador" ? "roda pelo GitHub Actions (ainda não configurado)" : "roda todo dia às 07:17"}
      </div>
      {e && !e.ok && (
        <ul className="mt-3 space-y-1 text-sm">
          {e.detalhes.slice(0, 12).map((f, i) => (
            <li key={i} className="text-rose-300"><span className="font-medium">{f.teste}:</span> <span className="text-rose-200/80">{f.motivo}</span></li>
          ))}
          {e.detalhes.length > 12 && <li className="text-xs text-zinc-500">… e mais {e.detalhes.length - 12}</li>}
        </ul>
      )}
      {e && e.resumo.length > 0 && (
        <table className="mt-3 w-full text-left text-xs">
          <tbody className="divide-y divide-zinc-800">
            {e.resumo.map((r) => (
              <tr key={r.nome}>
                <td className="py-1.5 pr-2 text-zinc-400">{r.nome}</td>
                <td className={`tabular py-1.5 text-right ${r.falhas ? "text-rose-400" : "text-emerald-400"}`}>{r.falhas ? `${r.falhas} falha(s)` : "ok"} · {r.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function TestesEventos({ servidor, navegador, historico }: { servidor: Execucao | null; navegador: Execucao | null; historico: Execucao[] }) {
  const [estado, acao, pendente] = useActionState(rodarTestesAgora, undefined);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Situacao origem="servidor" e={servidor} />
        <Situacao origem="navegador" e={navegador} />
      </div>
      <form action={acao} className="flex flex-wrap items-center gap-3">
        <button disabled={pendente} className={botao}>{pendente ? "Testando… (até 1 min)" : "Rodar testes do servidor agora"}</button>
        {estado?.ok && <span className="text-sm text-emerald-400">{estado.ok}</span>}
        {estado?.erro && <span className="text-sm text-rose-400">{estado.erro}</span>}
      </form>
      {historico.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Últimas execuções">
          {historico.map((e) => (
            <span
              key={e.id}
              title={`${quando(e.criado_em)} · ${e.origem} · ${e.ok ? "ok" : `${e.falhas} falha(s)`}`}
              className={`rounded px-2 py-0.5 text-[11px] ${e.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/15 text-rose-300"}`}
            >
              {quando(e.criado_em)} {e.origem === "servidor" ? "S" : "N"}
            </span>
          ))}
        </div>
      )}
      <p className="text-xs text-zinc-500">
        Tudo vai como <b>teste</b>: a Meta recebe em &quot;Eventos de teste&quot; e nada entra nas campanhas. Se algo falhar, o aviso chega no WhatsApp
        (mesmo envio dos alertas) e de novo quando voltar a funcionar.
      </p>
    </div>
  );
}
