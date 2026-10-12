import Link from "next/link";
import { contexto, param } from "@/lib/contexto";
import { escolherLancamento } from "@/lib/dados";
import { metricasPaginas, pct, type LinhaFunil } from "@/lib/metricas-paginas";
import { numero } from "@/lib/formato";
import { Cartao, Kpi, Tabela, montarHref, td } from "@/components/ui";
import { SemLancamento } from "@/components/cabecalho";

export default async function Paginas({ searchParams }: PageProps<"/paginas">) {
  const sp = await searchParams;
  const { resumos } = await contexto(sp);
  if (resumos.length === 0) return <SemLancamento />;
  const atual = escolherLancamento(resumos, param(sp, "l"));
  if (!atual) return <SemLancamento />;
  const { landings, gracias, cruzado } = await metricasPaginas(atual.lancamento_id);

  const soma = (k: keyof LinhaFunil, ls: LinhaFunil[]) => ls.reduce((t, l) => t + Number(l[k] ?? 0), 0);
  const visitas = soma("visitas", landings);
  const leads = soma("leads", landings);
  const responderam = soma("responderam", landings);
  const qualificados = soma("qualificados", landings);
  const noGrupo = soma("no_grupo", landings);

  // Divisão landing × gracias: % de cada gracias dentro de cada landing
  const paginasGracias = [...new Set(cruzado.map((c) => c.pagina_obrigado))].sort();
  const porLanding = new Map<string, Map<string, number>>();
  for (const c of cruzado) {
    const m = porLanding.get(c.landing) ?? new Map<string, number>();
    m.set(c.pagina_obrigado, c.leads);
    porLanding.set(c.landing, m);
  }

  const linhaFunil = (l: LinhaFunil, totalLeads: number, comVisitas: boolean) => (
    <tr key={l.chave}>
      <td className={`${td} font-medium`}>{l.chave}</td>
      {comVisitas && <td className={`${td} tabular text-right`}>{numero(l.visitas)}</td>}
      <td className={`${td} tabular text-right`}>{numero(l.leads)} <span className="text-xs text-zinc-500">({pct(l.leads, totalLeads)})</span></td>
      {comVisitas && <td className={`${td} tabular text-right`}>{pct(l.leads, l.visitas)}</td>}
      <td className={`${td} tabular text-right`}>{pct(l.responderam, l.leads)}</td>
      <td className={`${td} tabular text-right`}>{numero(l.qualificados)} <span className="text-xs text-zinc-500">({pct(l.qualificados, l.qualificados + l.nao_qualificados)})</span></td>
      <td className={`${td} tabular text-right`}>{numero(l.no_grupo)} <span className="text-xs text-zinc-500">({pct(l.no_grupo, l.leads)})</span></td>
    </tr>
  );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Páginas</h1>
          <p className="text-sm text-zinc-500">{atual.nome} · funil por página de captura e de gracias</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {resumos.map((r) => (
            <Link key={r.slug} href={montarHref("/paginas", { l: r.slug })} className={`rounded-full border px-3 py-1 text-xs font-medium ${atual.slug === r.slug ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900" : "border-zinc-300 dark:border-zinc-700"}`}>{r.nome}</Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi rotulo="Visitas" valor={numero(visitas)} detalhe="páginas com o aviso de visita" />
        <Kpi rotulo="Leads (pessoas)" valor={numero(leads)} detalhe={visitas ? `${pct(leads, visitas)} das visitas` : undefined} />
        <Kpi rotulo="Responderam" valor={numero(responderam)} detalhe={pct(responderam, leads)} />
        <Kpi rotulo="Calificados" valor={numero(qualificados)} destaque="verde" detalhe={pct(qualificados, responderam) + " de quem respondeu"} />
        <Kpi rotulo="No grupo" valor={numero(noGrupo)} detalhe={pct(noGrupo, leads)} />
      </div>

      <Cartao titulo="Páginas de captura">
        <Tabela cabecalho={["Landing", "Visitas", "Leads (% do total)", "Conversão", "Responderam", "Calificados (% de quem respondeu)", "No grupo"]} vazio={landings.length === 0}>
          {landings.map((l) => linhaFunil(l, leads, true))}
        </Tabela>
        <p className="mt-3 text-xs text-zinc-500">
          A coluna &quot;% do total&quot; mostra a divisão real do tráfego. Num teste de 3 páginas com 33% cada, cada uma deve ficar perto de 33%.
          Páginas antigas aparecem pelo nome que mandavam (ex.: Gen-Argentina); as novas, pelo endereço (/v1, /v2…).
        </p>
      </Cartao>

      <Cartao titulo="Páginas de gracias">
        <Tabela cabecalho={["Gracias", "Leads (% do total)", "Responderam", "Calificados (% de quem respondeu)", "No grupo"]} vazio={gracias.length === 0}>
          {gracias.map((l) => linhaFunil(l, leads, false))}
        </Tabela>
      </Cartao>

      {paginasGracias.length > 1 && (
        <Cartao titulo="Divisão: landing × gracias">
          <Tabela cabecalho={["Landing", ...paginasGracias]}>
            {[...porLanding.entries()].map(([landing, m]) => {
              const total = [...m.values()].reduce((a, b) => a + b, 0);
              return (
                <tr key={landing}>
                  <td className={`${td} font-medium`}>{landing}</td>
                  {paginasGracias.map((g) => (
                    <td key={g} className={`${td} tabular text-right`}>{numero(m.get(g) ?? 0)} <span className="text-xs text-zinc-500">({pct(m.get(g) ?? 0, total)})</span></td>
                  ))}
                </tr>
              );
            })}
          </Tabela>
        </Cartao>
      )}
    </>
  );
}
