"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/cliente";
import type { PontoRec } from "@/lib/recuperacao";

/**
 * Barras = mensagens recebidas; linha = % que entrou no grupo depois (eixo da direita).
 * Passe o mouse/foco numa coluna para ver os números.
 */
export function GraficoRecuperacao({ pontos }: { pontos: PontoRec[] }) {
  const t = useT();
  const [ativo, setAtivo] = useState<number | null>(null);
  const max = Math.max(1, ...pontos.map((p) => p.recebidos));
  const passo = Math.ceil(max / 4) || 1;
  const topo = passo * 4;
  const maxTaxa = Math.max(0.1, ...pontos.map((p) => p.taxa ?? 0));
  const topoTaxa = Math.min(1, Math.ceil(maxTaxa * 10) / 10);
  const marcas = [0, 1, 2, 3, 4];
  const passoRotulo = pontos.length <= 10 ? 1 : Math.ceil(pontos.length / 8);
  const x = (i: number) => ((i + 0.5) / Math.max(1, pontos.length)) * 100;
  const y = (taxa: number) => 100 - (taxa / topoTaxa) * 100;
  const linha = pontos.map((p, i) => (p.taxa == null ? null : `${x(i)},${y(p.taxa)}`)).filter(Boolean).join(" ");
  const p = ativo !== null ? pontos[ativo] : null;

  return (
    <figure className="m-0">
      <figcaption className="mb-2 flex flex-wrap items-center gap-4 text-xs text-zinc-500">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />{t("Recebidos")}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 bg-amber-400" />{t("Entraram no grupo (%)")}</span>
      </figcaption>
      <div className="relative flex h-56 gap-3">
        <div className="tabular flex w-8 shrink-0 flex-col-reverse justify-between text-right text-[11px] text-zinc-400">
          {marcas.map((m) => <span key={m} className="-mb-1.5 leading-3">{m * passo}</span>)}
        </div>
        <div className="relative flex-1">
          {marcas.map((m) => (
            <div key={m} className="pointer-events-none absolute inset-x-0 border-t border-zinc-200 dark:border-zinc-800" style={{ bottom: `${(m / 4) * 100}%` }} />
          ))}
          <div className="absolute inset-0 flex items-end gap-[2px]" onPointerLeave={() => setAtivo(null)}>
            {pontos.map((pt, i) => (
              <button
                key={pt.chave}
                type="button"
                aria-label={`${pt.rotulo}: ${pt.recebidos} ${t("recebidos")}, ${pt.entraram} ${t("entraram")}`}
                onPointerEnter={() => setAtivo(i)}
                onFocus={() => setAtivo(i)}
                onBlur={() => setAtivo(null)}
                className="relative flex h-full min-w-0 flex-1 items-end outline-none"
              >
                <span
                  className={`block w-full rounded-t-[4px] bg-emerald-500 transition-opacity ${ativo !== null && ativo !== i ? "opacity-50" : ""}`}
                  style={{ height: pt.recebidos ? `max(2px, ${(pt.recebidos / topo) * 100}%)` : 0 }}
                />
              </button>
            ))}
          </div>
          <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {linha && <polyline points={linha} fill="none" stroke="#fbbf24" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
          </svg>
          {pontos.map((pt, i) => pt.taxa != null && (
            <span key={pt.chave} className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-400" style={{ left: `${x(i)}%`, top: `${y(pt.taxa)}%` }} />
          ))}
          {p && ativo !== null && (
            <div
              role="status"
              className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs shadow-md dark:border-zinc-700 dark:bg-zinc-900"
              style={{ left: `${x(ativo)}%` }}
            >
              <span className="text-zinc-500">{p.rotulo}</span> · <strong className="tabular">{p.recebidos}</strong> {t("recebidos")} · <strong className="tabular">{p.entraram}</strong> {t("entraram")} · <strong className="tabular">{p.taxa == null ? "—" : `${(100 * p.taxa).toFixed(1)}%`}</strong>
            </div>
          )}
        </div>
        <div className="tabular flex w-9 shrink-0 flex-col-reverse justify-between text-left text-[11px] text-amber-500">
          {marcas.map((m) => <span key={m} className="-mb-1.5 leading-3">{Math.round((m / 4) * topoTaxa * 100)}%</span>)}
        </div>
      </div>
      <div className="relative ml-11 mr-12 mt-1.5 h-4 text-[11px] text-zinc-400">
        {pontos.map((pt, i) => i % passoRotulo === 0 && (
          <span key={pt.chave} className="absolute top-0 -translate-x-1/2 whitespace-nowrap" style={{ left: `${x(i)}%` }}>{pt.rotulo}</span>
        ))}
      </div>
    </figure>
  );
}
