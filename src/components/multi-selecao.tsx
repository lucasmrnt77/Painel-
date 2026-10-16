"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/cliente";

const campo = "rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950";

/** Lista suspensa com caixas de seleção. Envia o mesmo nome várias vezes no formulário; nada marcado = sem filtro. */
export function MultiSelecao({ nome, rotulo, vazio, opcoes }: {
  nome: string; rotulo: string; vazio: string; opcoes: { valor: string; rotulo: string }[];
}) {
  const t = useT();
  const [marcados, setMarcados] = useState<string[]>([]);
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const fora = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) ref.current.open = false;
    };
    document.addEventListener("click", fora);
    return () => document.removeEventListener("click", fora);
  }, []);

  const texto = marcados.length === 0
    ? vazio
    : marcados.length <= 2
      ? opcoes.filter((o) => marcados.includes(o.valor)).map((o) => o.rotulo).join(", ")
      : t("{n} selecionados", { n: marcados.length });

  return (
    <div className="space-y-1">
      <span className="block text-xs text-zinc-500">{rotulo}</span>
      <details ref={ref} className="group relative">
        <summary className={`${campo} flex min-w-44 cursor-pointer list-none items-center justify-between gap-2`}>
          <span>{texto}</span>
          <span className="text-xs text-zinc-500 group-open:rotate-180">▾</span>
        </summary>
        <div className="absolute z-20 mt-1 max-h-72 min-w-full overflow-auto rounded-lg border border-zinc-300 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-950">
          {opcoes.map((o) => (
            <label key={o.valor} className="flex cursor-pointer items-center gap-2 whitespace-nowrap rounded px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800">
              <input type="checkbox" name={nome} value={o.valor} checked={marcados.includes(o.valor)}
                onChange={(e) => setMarcados((m) => e.target.checked ? [...m, o.valor] : m.filter((x) => x !== o.valor))} />
              {o.rotulo}
            </label>
          ))}
          {marcados.length > 0 && (
            <button type="button" onClick={() => setMarcados([])} className="mt-1 w-full rounded px-2 py-1 text-left text-xs text-zinc-500 hover:underline">
              {t("limpar")}
            </button>
          )}
        </div>
      </details>
    </div>
  );
}
