"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { classificarAba, converterEntradasGrupo, converterPlanilha, type LinhaEntrada, type LinhaPlanilha, type TipoAba } from "@/lib/planilha";
import { lerArquivo } from "@/lib/ler-arquivo";

type Opcao = { id: number; nome: string };
type Previa = {
  linhas: (LinhaPlanilha | LinhaEntrada)[];
  rejeitadas: { linha: number; motivo: string; valor: string }[];
  colunasFaltando: string[];
};
type EstadoAba = {
  nome: string;
  tabela: string[][];
  tipo: TipoAba;
  motivo: string;
  copia: boolean;
  incluir: boolean;
  previa: Previa | null;
  resultado?: string;
};

const LOTE = 1000;

function previaDe(tipo: TipoAba, tabela: string[][]): Previa | null {
  if (tipo === "leads") return converterPlanilha(tabela);
  if (tipo === "entradas") return converterEntradasGrupo(tabela);
  return null;
}

const dataBR = (iso?: string) => iso?.slice(0, 10).split("-").reverse().join("/");

export function Importador({ lancamentos }: { lancamentos: Opcao[] }) {
  const router = useRouter();
  const [lancId, setLancId] = useState<number | "">(lancamentos[0]?.id ?? "");
  const [pagina, setPagina] = useState<"" | "trader" | "nunca_operou">("");
  const [arquivo, setArquivo] = useState<string>("");
  const [abas, setAbas] = useState<EstadoAba[]>([]);
  const [lendo, setLendo] = useState(false);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [concluido, setConcluido] = useState(false);

  async function ler(f: File) {
    setErro(""); setAbas([]); setConcluido(false); setArquivo(f.name); setLendo(true);
    try {
      const lidas = await lerArquivo(f);
      setAbas(
        lidas.map(({ nome, tabela }) => {
          const c = classificarAba(nome, tabela);
          return { nome, tabela, ...c, incluir: c.tipo !== "ignorar" && !c.copia, previa: previaDe(c.tipo, tabela) };
        }),
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setLendo(false);
    }
  }

  function mudar(i: number, patch: Partial<EstadoAba>) {
    setAbas((as) =>
      as.map((a, j) => {
        if (j !== i) return a;
        const n = { ...a, ...patch };
        if (patch.tipo && patch.tipo !== a.tipo) {
          n.previa = previaDe(patch.tipo, a.tabela);
          n.incluir = patch.tipo !== "ignorar";
        }
        return n;
      }),
    );
  }

  const selecionadas = abas.filter((a) => a.incluir && a.tipo !== "ignorar" && a.previa && a.previa.colunasFaltando.length === 0);
  const precisaPagina = selecionadas.some((a) => a.tipo === "leads");
  const podeImportar = selecionadas.length > 0 && lancId !== "" && (!precisaPagina || !!pagina) && progresso === null;

  async function importar() {
    if (!podeImportar) return;
    setErro(""); setConcluido(false);
    // Leads primeiro, depois as entradas (a ordem não muda o resultado, mas fica mais legível)
    const ordem = [...selecionadas].sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === "leads" ? -1 : 1));
    try {
      for (const aba of ordem) {
        const linhas = aba.previa!.linhas;
        const t: Record<string, number> = {};
        for (let i = 0; i < linhas.length; i += LOTE) {
          setProgresso(`${aba.nome}: ${Math.min(linhas.length, i + LOTE)}/${linhas.length}`);
          const r = await fetch("/api/importar", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ lancamento_id: lancId, tipo: aba.tipo, pagina_captura: pagina || null, linhas: linhas.slice(i, i + LOTE) }),
          });
          const j = await r.json();
          if (!r.ok) throw new Error(`${aba.nome}: ${j.erro ?? `HTTP ${r.status}`}`);
          for (const [k, v] of Object.entries(j)) if (typeof v === "number") t[k] = (t[k] ?? 0) + v;
        }
        const resultado =
          aba.tipo === "leads"
            ? `${t.novas ?? 0} novas, ${t.atualizadas ?? 0} atualizadas${t.repetidas ? `, ${t.repetidas} repetidas` : ""}`
            : `${t.novas ?? 0} entradas novas (${(t.validas ?? 0) - (t.novas ?? 0)} já existiam)`;
        setAbas((as) => as.map((a) => (a.nome === aba.nome ? { ...a, resultado } : a)));
      }
      // Atualiza as estatísticas do banco (sem isso, as telas podem ficar lentas logo após importar muito)
      setProgresso("atualizando estatísticas…");
      await fetch("/api/importar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tipo: "finalizar" }) });
      setConcluido(true);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setProgresso(null);
    }
  }

  const campo = "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950";
  const rotulo = "space-y-1 text-xs font-medium text-zinc-600 dark:text-zinc-400";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={rotulo}>
          Lançamento de destino
          <select className={`${campo} w-full`} value={lancId} onChange={(e) => setLancId(Number(e.target.value))}>
            {lancamentos.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
        </label>
        <label className={rotulo}>
          Página de captura destes leads
          <select className={`${campo} w-full`} value={pagina} onChange={(e) => setPagina(e.target.value as typeof pagina)}>
            <option value="">Escolha…</option>
            <option value="trader">Trader (quem já opera)</option>
            <option value="nunca_operou">Nunca operou</option>
          </select>
        </label>
        <label className={rotulo}>
          Planilha (.xlsx com todas as abas, ou .csv)
          <input type="file" accept=".xlsx,.csv,text/csv" className={`${campo} w-full`} onChange={(e) => e.target.files?.[0] && ler(e.target.files[0])} />
        </label>
      </div>

      {lendo && <p className="text-sm text-zinc-500">Lendo {arquivo}…</p>}

      {abas.length > 0 && (
        <div className="rounded-lg bg-zinc-50 p-4 text-sm dark:bg-zinc-950">
          <p className="mb-3 font-medium">{arquivo} · {abas.length} aba(s)</p>
          <div className="-mx-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-zinc-800">
                  <th className="px-4 py-2 font-medium">Importar</th>
                  <th className="px-4 py-2 font-medium">Aba</th>
                  <th className="px-4 py-2 font-medium">Tipo</th>
                  <th className="px-4 py-2 font-medium">O que tem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {abas.map((a, i) => {
                  const datas = a.previa?.linhas.map((l) => ("criado_em" in l ? l.criado_em : l.entrou_em)).sort() ?? [];
                  const semGrupo = a.tipo === "leads" && a.previa && !(a.previa.linhas as LinhaPlanilha[]).some((l) => l.grupo !== null);
                  return (
                    <tr key={a.nome} className={a.incluir ? "" : "opacity-60"}>
                      <td className="px-4 py-2 align-top">
                        <input type="checkbox" checked={a.incluir} disabled={a.tipo === "ignorar"} onChange={(e) => mudar(i, { incluir: e.target.checked })} />
                      </td>
                      <td className="px-4 py-2 align-top font-medium">
                        {a.nome}
                        {a.copia && <span className="ml-2 rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] font-normal text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">parece cópia</span>}
                      </td>
                      <td className="px-4 py-2 align-top">
                        <select className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900" value={a.tipo} onChange={(e) => mudar(i, { tipo: e.target.value as TipoAba })}>
                          <option value="leads">Leads</option>
                          <option value="entradas">Entradas no grupo</option>
                          <option value="ignorar">Ignorar</option>
                        </select>
                      </td>
                      <td className="px-4 py-2 align-top text-xs text-zinc-600 dark:text-zinc-400">
                        {a.tipo === "ignorar" && <span>{a.motivo} · {Math.max(0, a.tabela.length - 1)} linhas</span>}
                        {a.previa && a.previa.colunasFaltando.length > 0 && (
                          <span className="text-rose-600">Faltam colunas: {a.previa.colunasFaltando.join(", ")}</span>
                        )}
                        {a.previa && a.previa.colunasFaltando.length === 0 && (
                          <>
                            <b className="tabular">{a.previa.linhas.length}</b> linhas · {dataBR(datas[0])} a {dataBR(datas.at(-1))}
                            {a.previa.rejeitadas.length > 0 && (
                              <span className="text-amber-700 dark:text-amber-400" title={a.previa.rejeitadas.slice(0, 20).map((r) => `linha ${r.linha}: ${r.motivo} (${r.valor})`).join("\n")}>
                                {" "}· {a.previa.rejeitadas.length} ignoradas
                              </span>
                            )}
                            {semGrupo && <span className="block text-amber-700 dark:text-amber-400">Sem coluna Grupo (TRUE/FALSE): quem entrou vem da aba de entradas.</span>}
                            {a.resultado && <span className="block font-medium text-emerald-700 dark:text-emerald-400">✓ {a.resultado}</span>}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={importar}
              disabled={!podeImportar}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {progresso ? `Importando ${progresso}` : `Importar ${selecionadas.length} aba(s)`}
            </button>
            {precisaPagina && !pagina && <span className="text-xs text-amber-700 dark:text-amber-400">Escolha a página de captura dos leads.</span>}
            {concluido && <span className="text-sm text-emerald-700 dark:text-emerald-400">Importação concluída. Reimportar não duplica.</span>}
          </div>
        </div>
      )}
      {erro && <p className="text-sm text-rose-600">{erro}</p>}
    </div>
  );
}
