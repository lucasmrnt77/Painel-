"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { converterPlanilha, type ResultadoConversao } from "@/lib/planilha";

type Opcao = { id: number; nome: string };
type Totais = { novas: number; atualizadas: number; repetidas: number; invalidas: number };

const LOTE = 1000;

export function Importador({ lancamentos }: { lancamentos: Opcao[] }) {
  const router = useRouter();
  const [lancId, setLancId] = useState<number | "">(lancamentos[0]?.id ?? "");
  const [arquivo, setArquivo] = useState<string>("");
  const [conv, setConv] = useState<ResultadoConversao | null>(null);
  const [progresso, setProgresso] = useState<number | null>(null);
  const [totais, setTotais] = useState<Totais | null>(null);
  const [erro, setErro] = useState<string>("");

  function ler(f: File) {
    setErro(""); setTotais(null); setConv(null); setArquivo(f.name);
    Papa.parse<string[]>(f, {
      skipEmptyLines: false,
      complete: (r) => setConv(converterPlanilha(r.data)),
      error: (e) => setErro(`Não consegui ler o arquivo: ${e.message}`),
    });
  }

  async function importar() {
    if (!conv || lancId === "") return;
    setErro(""); setTotais(null); setProgresso(0);
    const t: Totais = { novas: 0, atualizadas: 0, repetidas: 0, invalidas: 0 };
    try {
      for (let i = 0; i < conv.linhas.length; i += LOTE) {
        const r = await fetch("/api/importar", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ lancamento_id: lancId, linhas: conv.linhas.slice(i, i + LOTE) }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.erro ?? `HTTP ${r.status}`);
        t.novas += j.novas; t.atualizadas += j.atualizadas; t.repetidas += j.repetidas ?? 0; t.invalidas += j.invalidas;
        setProgresso(Math.min(conv.linhas.length, i + LOTE));
      }
      setTotais(t);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setProgresso(null);
    }
  }

  const datas = conv?.linhas.map((l) => l.criado_em).sort() ?? [];
  const noGrupo = conv?.linhas.filter((l) => l.grupo).length ?? 0;
  const campo = "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Lançamento de destino
          <select className={`${campo} w-full`} value={lancId} onChange={(e) => setLancId(Number(e.target.value))}>
            {lancamentos.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Arquivo CSV (Google Sheets → Arquivo → Fazer download → .csv)
          <input type="file" accept=".csv,text/csv" className={`${campo} w-full`} onChange={(e) => e.target.files?.[0] && ler(e.target.files[0])} />
        </label>
      </div>

      {conv && conv.colunasFaltando.length > 0 && (
        <p className="text-sm text-rose-600">Colunas obrigatórias não encontradas: {conv.colunasFaltando.join(", ")}.</p>
      )}

      {conv && conv.colunasFaltando.length === 0 && (
        <div className="rounded-lg bg-zinc-50 p-4 text-sm dark:bg-zinc-950">
          <p className="font-medium">{arquivo}</p>
          <ul className="mt-2 space-y-1 text-zinc-600 dark:text-zinc-400">
            <li><b className="tabular">{conv.linhas.length}</b> linhas prontas para importar</li>
            <li>Período: {datas[0]?.slice(0, 10).split("-").reverse().join("/")} a {datas.at(-1)?.slice(0, 10).split("-").reverse().join("/")}</li>
            <li>Marcadas como &quot;no grupo&quot;: <span className="tabular">{noGrupo}</span> ({conv.linhas.length ? Math.round((100 * noGrupo) / conv.linhas.length) : 0}%)</li>
            {conv.rejeitadas.length > 0 && (
              <li className="text-amber-700 dark:text-amber-400">
                {conv.rejeitadas.length} linha(s) ignoradas:{" "}
                {conv.rejeitadas.slice(0, 8).map((r) => `linha ${r.linha} (${r.motivo}: "${r.valor}")`).join("; ")}
                {conv.rejeitadas.length > 8 ? "…" : ""}
              </li>
            )}
          </ul>
          <button
            onClick={importar}
            disabled={progresso !== null || conv.linhas.length === 0 || lancId === ""}
            className="mt-4 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {progresso !== null ? `Importando… ${progresso}/${conv.linhas.length}` : "Importar"}
          </button>
        </div>
      )}

      {totais && (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">
          Pronto: {totais.novas} novas, {totais.atualizadas} atualizadas (coluna Grupo mudou)
          {totais.repetidas ? `, ${totais.repetidas} repetidas na planilha` : ""}
          {totais.invalidas ? `, ${totais.invalidas} inválidas` : ""}. Linhas já importadas antes foram ignoradas.
        </p>
      )}
      {erro && <p className="text-sm text-rose-600">{erro}</p>}
    </div>
  );
}
