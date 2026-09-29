import Link from "next/link";
import { exigirLogin } from "@/lib/sessao";
import { param } from "@/lib/contexto";
import { escolherLancamento, listarResumos } from "@/lib/dados";
import { DIMENSOES, FILTROS, agrupar, aplicarFiltros, carregarAnalise, opcoesFiltro, type Filtros } from "@/lib/analise";
import { numero } from "@/lib/formato";
import { Cartao, Kpi, montarHref, td } from "@/components/ui";
import { SemLancamento } from "@/components/cabecalho";

const ROTULO_FILTRO: Record<string, string> = {
  pais: "País", canal: "Canal", experiencia: "Experiência", landing: "Landing",
  pagina_obrigado: "Pág. de obrigado", posicionamento: "Posicionamento", origem: "Origem",
};

export default async function Analise({ searchParams }: PageProps<"/analise">) {
  await exigirLogin();
  const sp = await searchParams;
  const resumos = await listarResumos();
  if (resumos.length === 0) return <SemLancamento />;

  const lParam = param(sp, "l");
  const todos = lParam === "todos";
  const atual = todos ? null : escolherLancamento(resumos, lParam);
  const por = DIMENSOES[param(sp, "por") ?? ""] ? param(sp, "por")! : "anuncio";
  const filtros: Filtros = {};
  for (const k of [...FILTROS, "de", "ate"] as const) {
    const v = param(sp, k);
    if (v) filtros[k] = v;
  }

  const base = await carregarAnalise(atual?.lancamento_id ?? null);
  const linhas = aplicarFiltros(base, filtros);
  const grupos = agrupar(linhas, por);
  const noGrupo = linhas.filter((l) => l.no_grupo).length;
  const maxLeads = Math.max(1, ...grupos.map((g) => g.leads));
  const estado = { l: todos ? "todos" : atual?.slug, por, ...filtros };
  const href = (extra: Record<string, string | undefined>) => montarHref("/analise", { ...estado, ...extra });
  const campo = "rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950";
  const temFiltro = Object.keys(filtros).length > 0;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Análise</h1>
          <p className="text-sm text-zinc-500">{todos ? "Todos os lançamentos" : atual?.nome} · taxa de entrada no grupo por dimensão</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={href({ l: "todos" })} className={`rounded-full border px-3 py-1 text-xs font-medium ${todos ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900" : "border-zinc-300 dark:border-zinc-700"}`}>Todos</Link>
          {resumos.map((r) => (
            <Link key={r.slug} href={href({ l: r.slug })} className={`rounded-full border px-3 py-1 text-xs font-medium ${!todos && atual?.slug === r.slug ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900" : "border-zinc-300 dark:border-zinc-700"}`}>{r.nome}</Link>
          ))}
        </div>
      </div>

      <Cartao>
        <form action="/analise" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="l" value={estado.l ?? ""} />
          <input type="hidden" name="por" value={por} />
          {FILTROS.map((k) => (
            <label key={k} className="space-y-1 text-xs text-zinc-500">
              <span className="block">{ROTULO_FILTRO[k]}</span>
              <select name={k} defaultValue={filtros[k] ?? ""} className={`${campo} max-w-44`}>
                <option value="">Todos</option>
                {opcoesFiltro(base, k).slice(0, 80).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
          ))}
          <label className="space-y-1 text-xs text-zinc-500"><span className="block">De</span><input type="date" name="de" defaultValue={filtros.de} className={campo} /></label>
          <label className="space-y-1 text-xs text-zinc-500"><span className="block">Até</span><input type="date" name="ate" defaultValue={filtros.ate} className={campo} /></label>
          <button className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">Filtrar</button>
          {temFiltro && <Link href={montarHref("/analise", { l: estado.l, por })} className="px-2 py-1.5 text-sm text-zinc-500 hover:underline">limpar</Link>}
        </form>
      </Cartao>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi rotulo="Leads (pessoas únicas)" valor={numero(linhas.length)} detalhe={temFiltro ? `de ${numero(base.length)} no total` : undefined} />
        <Kpi rotulo="Entraram no grupo" valor={numero(noGrupo)} destaque="verde" />
        <Kpi rotulo="Taxa de entrada" valor={linhas.length ? `${((100 * noGrupo) / linhas.length).toFixed(1)}%` : "—"} />
        <Kpi rotulo={`${DIMENSOES[por].rotulo}s distintos`} valor={numero(grupos.length)} />
      </div>

      <Cartao>
        <div className="mb-3 flex flex-wrap gap-2">
          {Object.entries(DIMENSOES).map(([k, d]) => (
            <Link key={k} href={href({ por: k })} className={`rounded-full border px-3 py-1 text-xs font-medium ${k === por ? "border-emerald-600 bg-emerald-600 text-white" : "border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"}`}>
              {d.rotulo}
            </Link>
          ))}
        </div>
        <div className="-mx-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-zinc-800">
                <th className="px-4 py-2 font-medium">{DIMENSOES[por].rotulo}</th>
                <th className="px-4 py-2 font-medium text-right">Leads</th>
                <th className="px-4 py-2 font-medium">% do total</th>
                <th className="px-4 py-2 font-medium text-right">No grupo</th>
                <th className="px-4 py-2 font-medium text-right">Taxa de entrada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {grupos.slice(0, 300).map((g) => {
                const pouco = g.leads < 30;
                const corTaxa = pouco ? "text-zinc-400" : g.pct >= 90 ? "text-emerald-700 dark:text-emerald-400" : g.pct < 75 ? "text-rose-700 dark:text-rose-400" : "";
                return (
                  <tr key={g.chave} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                    <td className={`${td} max-w-md break-words`}>{g.chave}</td>
                    <td className={`${td} tabular text-right`}>{numero(g.leads)}</td>
                    <td className={td}>
                      <div className="flex items-center gap-2">
                        <div className="h-2 rounded-sm bg-zinc-400" style={{ width: `${Math.max(2, (100 * g.leads) / maxLeads) * 0.6}%` }} />
                        <span className="tabular text-xs text-zinc-500">{g.share.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className={`${td} tabular text-right`}>{numero(g.noGrupo)}</td>
                    <td className={`${td} tabular text-right font-medium ${corTaxa}`} title={pouco ? "Menos de 30 leads: taxa pouco confiável" : undefined}>
                      {g.pct.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {grupos.length === 0 && <p className="px-4 py-8 text-center text-sm text-zinc-500">Nenhum lead com esses filtros.</p>}
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          Cada pessoa conta uma vez por lançamento (primeira inscrição). Taxas em cinza têm menos de 30 leads. Verde ≥ 90%, vermelho &lt; 75%.
        </p>
      </Cartao>
    </>
  );
}
