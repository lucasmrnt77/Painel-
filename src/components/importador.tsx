"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { converterEntradasGrupo, converterPlanilha, type LinhaEntrada, type LinhaPlanilha } from "@/lib/planilha";

type Opcao = { id: number; nome: string };
type Tipo = "leads" | "entradas";
type Previa = {
  linhas: (LinhaPlanilha | LinhaEntrada)[];
  rejeitadas: { linha: number; motivo: string; valor: string }[];
  colunasFaltando: string[];
  pareceListaDeGrupo?: boolean;
};
type Totais = Record<string, number>;

const LOTE = 1000;

export function Importador({ lancamentos }: { lancamentos: Opcao[] }) {
  const router = useRouter();
  const [tipo, setTipo] = useState<Tipo>("leads");
  const [lancId, setLancId] = useState<number | "">(lancamentos[0]?.id ?? "");
  const [pagina, setPagina] = useState<"" | "trader" | "nunca_operou">("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [progresso, setProgresso] = useState<number | null>(null);
  const [totais, setTotais] = useState<Totais | null>(null);
  const [erro, setErro] = useState<string>("");

  function ler(f: File, t: Tipo) {
    setErro(""); setTotais(null); setPrevia(null); setArquivo(f);
    Papa.parse<string[]>(f, {
      skipEmptyLines: false,
      complete: (r) => setPrevia(t === "leads" ? converterPlanilha(r.data) : converterEntradasGrupo(r.data)),
      error: (e) => setErro(`Não consegui ler o arquivo: ${e.message}`),
    });
  }

  function trocarTipo(t: Tipo) {
    setTipo(t);
    if (arquivo) ler(arquivo, t);
  }

  async function importar() {
    if (!previa || lancId === "" || (tipo === "leads" && !pagina)) return;
    setErro(""); setTotais(null); setProgresso(0);
    const t: Totais = {};
    try {
      for (let i = 0; i < previa.linhas.length; i += LOTE) {
        const r = await fetch("/api/importar", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ lancamento_id: lancId, tipo, pagina_captura: pagina || null, linhas: previa.linhas.slice(i, i + LOTE) }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.erro ?? `HTTP ${r.status}`);
        for (const [k, v] of Object.entries(j)) if (typeof v === "number") t[k] = (t[k] ?? 0) + v;
        setProgresso(Math.min(previa.linhas.length, i + LOTE));
      }
      setTotais(t);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setProgresso(null);
    }
  }

  const datas = previa?.linhas.map((l) => ("criado_em" in l ? l.criado_em : l.entrou_em)).sort() ?? [];
  const dataBR = (iso?: string) => iso?.slice(0, 10).split("-").reverse().join("/");
  const noGrupo = tipo === "leads" ? (previa?.linhas as LinhaPlanilha[] | undefined)?.filter((l) => l.grupo).length ?? 0 : 0;
  const temColunaGrupo = tipo === "leads" && (previa?.linhas as LinhaPlanilha[] | undefined)?.some((l) => l.grupo !== null);
  const bloqueado = tipo === "leads" && !!previa?.pareceListaDeGrupo;
  const campo = "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950";
  const rotulo = "space-y-1 text-xs font-medium text-zinc-600 dark:text-zinc-400";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {([
          ["leads", "Leads (inscrições da página de captura)"],
          ["entradas", "Entradas no grupo (lista de quem entrou)"],
        ] as const).map(([k, r]) => (
          <button
            key={k}
            onClick={() => trocarTipo(k)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${tipo === k ? "border-emerald-600 bg-emerald-600 text-white" : "border-zinc-300 dark:border-zinc-700"}`}
          >
            {r}
          </button>
        ))}
      </div>

      <div className={`grid gap-3 ${tipo === "leads" ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        <label className={rotulo}>
          Lançamento de destino
          <select className={`${campo} w-full`} value={lancId} onChange={(e) => setLancId(Number(e.target.value))}>
            {lancamentos.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
        </label>
        {tipo === "leads" && (
          <label className={rotulo}>
            Página de captura desta planilha
            <select className={`${campo} w-full`} value={pagina} onChange={(e) => setPagina(e.target.value as typeof pagina)}>
              <option value="">Escolha…</option>
              <option value="trader">Trader (quem já opera)</option>
              <option value="nunca_operou">Nunca operou</option>
            </select>
          </label>
        )}
        <label className={rotulo}>
          Arquivo CSV (Google Sheets → Arquivo → Fazer download → .csv, uma aba por vez)
          <input type="file" accept=".csv,text/csv" className={`${campo} w-full`} onChange={(e) => e.target.files?.[0] && ler(e.target.files[0], tipo)} />
        </label>
      </div>

      {previa && previa.colunasFaltando.length > 0 && (
        <p className="text-sm text-rose-600">Colunas obrigatórias não encontradas: {previa.colunasFaltando.join(", ")}.</p>
      )}

      {previa && previa.colunasFaltando.length === 0 && (
        <div className="rounded-lg bg-zinc-50 p-4 text-sm dark:bg-zinc-950">
          <p className="font-medium">{arquivo?.name}</p>
          {bloqueado && (
            <p className="mt-2 text-rose-600">
              A coluna Grupo tem nomes de grupos, não TRUE/FALSE: este arquivo parece a <b>lista de entradas no grupo</b>. Troque para
              &quot;Entradas no grupo&quot; acima.
            </p>
          )}
          <ul className="mt-2 space-y-1 text-zinc-600 dark:text-zinc-400">
            <li><b className="tabular">{previa.linhas.length}</b> linhas prontas para importar</li>
            <li>Período: {dataBR(datas[0])} a {dataBR(datas.at(-1))}</li>
            {tipo === "leads" && temColunaGrupo && (
              <li>Marcadas como &quot;no grupo&quot;: <span className="tabular">{noGrupo}</span> ({previa.linhas.length ? Math.round((100 * noGrupo) / previa.linhas.length) : 0}%)</li>
            )}
            {tipo === "leads" && !temColunaGrupo && !bloqueado && (
              <li className="text-amber-700 dark:text-amber-400">
                Sem coluna Grupo (TRUE/FALSE): quem entrou no grupo vem da lista de entradas. Importe também a aba &quot;Leads Grupo&quot; em
                &quot;Entradas no grupo&quot;.
              </li>
            )}
            {tipo === "entradas" && (
              <li>Grupos: {new Set((previa.linhas as LinhaEntrada[]).map((l) => l.grupo_nome ?? "—")).size} nomes distintos</li>
            )}
            {previa.rejeitadas.length > 0 && (
              <li className="text-amber-700 dark:text-amber-400">
                {previa.rejeitadas.length} linha(s) ignoradas:{" "}
                {previa.rejeitadas.slice(0, 8).map((r) => `linha ${r.linha} (${r.motivo}: "${r.valor}")`).join("; ")}
                {previa.rejeitadas.length > 8 ? "…" : ""}
              </li>
            )}
          </ul>
          <button
            onClick={importar}
            disabled={progresso !== null || previa.linhas.length === 0 || lancId === "" || (tipo === "leads" && !pagina) || bloqueado}
            className="mt-4 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {progresso !== null ? `Importando… ${progresso}/${previa.linhas.length}` : "Importar"}
          </button>
          {tipo === "leads" && !pagina && <span className="ml-3 text-xs text-amber-700 dark:text-amber-400">Escolha a página de captura antes de importar.</span>}
        </div>
      )}

      {totais && (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">
          {tipo === "leads"
            ? <>Pronto: {totais.novas ?? 0} novas, {totais.atualizadas ?? 0} atualizadas{totais.repetidas ? `, ${totais.repetidas} repetidas na planilha` : ""}{totais.invalidas ? `, ${totais.invalidas} inválidas` : ""}. Linhas já importadas antes foram ignoradas.</>
            : <>Pronto: {totais.novas ?? 0} entradas novas registradas ({(totais.validas ?? 0) - (totais.novas ?? 0)} já existiam). Os leads com essas entradas agora aparecem como &quot;no grupo&quot;.</>}
        </p>
      )}
      {erro && <p className="text-sm text-rose-600">{erro}</p>}
    </div>
  );
}
