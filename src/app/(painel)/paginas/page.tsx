import Link from "next/link";
import { contexto, param } from "@/lib/contexto";
import { escolherLancamento } from "@/lib/dados";
import { contagensTeste, desempenhoAnuncios, metricasPaginas, pct, pesoNome, rankingPaginas, testesPaginas, type LinhaFunil } from "@/lib/metricas-paginas";
import { lerPeriodo, rotuloPeriodo, temPeriodo, type Periodo } from "@/lib/periodo";
import { resumoTeste } from "@/lib/teste-paginas";
import { ResultadoTeste, SeletorTestes } from "@/components/testes-paginas";
import { RankingPaginas } from "@/components/ranking-paginas";
import { numero } from "@/lib/formato";
import { Cartao, Kpi, Tabela, montarHref, td } from "@/components/ui";
import { SemLancamento } from "@/components/cabecalho";
import { idiomaAtual, tradutor } from "@/lib/i18n/servidor";

export default async function Paginas({ searchParams }: PageProps<"/paginas">) {
  const sp = await searchParams;
  const t = await tradutor();
  const { resumos } = await contexto(sp);
  if (resumos.length === 0) return <SemLancamento />;
  const atual = escolherLancamento(resumos, param(sp, "l"));
  if (!atual) return <SemLancamento />;
  // Teste salvo (?teste=id): páginas + período. Ou só período (?de=&ate=). Sem nada = lançamento inteiro.
  const { testes, erro: erroTestes } = await testesPaginas(atual.lancamento_id);
  const teste = testes.find((x) => x.id === Number(param(sp, "teste"))) ?? null;
  const periodo: Periodo = teste ? { de: teste.inicio, ate: teste.fim } : lerPeriodo(param(sp, "de"), param(sp, "ate"));
  const comPeriodo = temPeriodo(periodo);
  // Com teste, só as páginas do teste: funil, gracias (dos leads dessas páginas) e ranking por país
  const paginasTeste = teste?.paginas ?? null;
  const [{ landings, gracias, cruzado }, rk, idioma, anuncios, contagens] = await Promise.all([
    metricasPaginas(atual.lancamento_id, periodo, paginasTeste), rankingPaginas(atual.lancamento_id, periodo, paginasTeste), idiomaAtual(),
    teste ? desempenhoAnuncios(atual.lancamento_id, periodo) : Promise.resolve(null),
    teste ? contagensTeste(atual.lancamento_id, periodo) : Promise.resolve([]),
  ]);
  const resultado = teste ? resumoTeste(teste.paginas, landings, contagens, anuncios?.desempenho?.linhas ?? []) : null;

  const soma = (k: keyof LinhaFunil, ls: LinhaFunil[]) => ls.reduce((t, l) => t + Number(l[k] ?? 0), 0);
  const visitas = soma("visitas", landings);
  const leads = soma("leads", landings);
  const responderam = soma("responderam", landings);
  const qualificados = soma("qualificados", landings);
  const noGrupo = soma("no_grupo", landings);

  // Cada site (General / Trader) tem as próprias /v1, /v2…: as tabelas e a divisão do tráfego são por site
  const sites = [...new Set([...landings, ...gracias].map((l) => l.site))];
  const leadsSite = (site: string) => soma("leads", landings.filter((l) => l.site === site));

  const linhaFunil = (l: LinhaFunil, totalLeads: number, comVisitas: boolean) => (
    <tr key={`${l.site}${l.chave}`}>
      <td className={`${td} font-medium`}>{t(l.chave)}</td>
      {comVisitas && <td className={`${td} tabular text-right`}>{numero(l.visitas)}</td>}
      <td className={`${td} tabular text-right`}>{numero(l.leads)} <span className="text-xs text-zinc-500">({pct(l.leads, totalLeads)})</span></td>
      {comVisitas && <td className={`${td} tabular text-right`}>{pct(l.leads, l.visitas)}</td>}
      <td className={`${td} tabular text-right`}>{numero(l.responderam)} <span className="text-xs text-zinc-500">({pct(l.responderam, l.leads)})</span></td>
      <td className={`${td} tabular text-right`}>{numero(l.qualificados)} <span className="text-xs text-zinc-500">({pct(l.qualificados, l.leads)})</span></td>
      {comVisitas && <td className={`${td} tabular text-right`}>{pct(l.qualificados, l.visitas)}</td>}
      <td className={`${td} tabular text-right`}>{numero(l.no_grupo)} <span className="text-xs text-zinc-500">({comVisitas ? pct(l.no_grupo, l.visitas) : pct(l.no_grupo, l.leads)})</span></td>
    </tr>
  );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t("Páginas")}</h1>
          <p className="text-sm text-zinc-500">
            {t(atual.nome)} · {t("funil por página de captura e de gracias")}
            {comPeriodo && <> · <span className="font-medium text-zinc-900 dark:text-zinc-100">{teste ? `${teste.nome} · ` : ""}{rotuloPeriodo(periodo, t)}</span></>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/paginas/criativos" className="rounded-lg border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">{t("Anúncios × páginas")}</Link>
          {resumos.map((r) => (
            <Link key={r.slug} href={montarHref("/paginas", { l: r.slug })} className={`rounded-full border px-3 py-1 text-xs font-medium ${atual.slug === r.slug ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900" : "border-zinc-300 dark:border-zinc-700"}`}>{t(r.nome)}</Link>
          ))}
        </div>
      </div>

      <SeletorTestes lancamentoId={atual.lancamento_id} slug={atual.slug} testes={testes} teste={teste} periodo={periodo} comPeriodo={comPeriodo} erro={erroTestes} t={t} />

      {teste && resultado && <ResultadoTeste teste={teste} linhas={resultado} comMeta={!!anuncios?.comMeta} t={t} />}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi rotulo={t("Visitas")} valor={numero(visitas)} detalhe={t("páginas com o aviso de visita")} />
        <Kpi rotulo={t("Leads (pessoas)")} valor={numero(leads)} detalhe={visitas ? t("{p} das visitas", { p: pct(leads, visitas) }) : undefined} />
        <Kpi rotulo={t("Responderam")} valor={numero(responderam)} detalhe={pct(responderam, leads)} />
        <Kpi rotulo={t("Calificados")} valor={numero(qualificados)} destaque="verde" detalhe={t("{p} dos leads · {v} das visitas", { p: pct(qualificados, leads), v: pct(qualificados, visitas) })} />
        <Kpi rotulo={t("No grupo")} valor={numero(noGrupo)} detalhe={t("{p} das visitas", { p: pct(noGrupo, visitas) })} />
      </div>

      {sites.map((site) => {
        const ls = landings.filter((l) => l.site === site);
        const gs = gracias.filter((l) => l.site === site);
        const cs = cruzado.filter((c) => c.site === site);
        const total = leadsSite(site);
        const paginasGracias = [...new Set(cs.map((c) => c.pagina_obrigado))].sort((a, b) => pesoNome(a) - pesoNome(b) || a.localeCompare(b, undefined, { numeric: true }));
        const porLanding = new Map<string, Map<string, number>>();
        for (const c of cs) {
          const m = porLanding.get(c.landing) ?? new Map<string, number>();
          m.set(c.pagina_obrigado, c.leads);
          porLanding.set(c.landing, m);
        }
        const ordemLandings = [...porLanding.keys()].sort((a, b) => pesoNome(a) - pesoNome(b) || a.localeCompare(b, undefined, { numeric: true }));
        const nomeSite = site === "—" ? t("Sem página") : site;
        return (
          <div key={site} className="space-y-4">
            <h2 className="pt-2 text-base font-semibold">{t("Página {s}", { s: nomeSite })}</h2>
            <Cartao titulo={t("Páginas de captura · {s}", { s: nomeSite })}>
              <Tabela cabecalho={[t("Landing"), t("Visitas"), t("Leads (% do total)"), t("Conversão"), t("Responderam (% dos leads)"), t("Calificados (% dos leads)"), t("Calificados ÷ visitas"), t("No grupo (% das visitas)")]} vazio={ls.length === 0}>
                {ls.map((l) => linhaFunil(l, total, true))}
              </Tabela>
            </Cartao>
            <Cartao titulo={t("Páginas de gracias · {s}", { s: nomeSite })}>
              <Tabela cabecalho={[t("Gracias"), t("Leads (% do total)"), t("Responderam (% dos leads)"), t("Calificados (% dos leads)"), t("No grupo (% dos leads)")]} vazio={gs.length === 0}>
                {gs.map((l) => linhaFunil(l, total, false))}
              </Tabela>
            </Cartao>
            {paginasGracias.length > 1 && (
              <Cartao titulo={t("Divisão: landing × gracias · {s}", { s: nomeSite })}>
                <Tabela cabecalho={[t("Landing"), ...paginasGracias.map((g) => t(g))]}>
                  {ordemLandings.map((landing) => {
                    const m = porLanding.get(landing)!;
                    const tot = [...m.values()].reduce((a, b) => a + b, 0);
                    return (
                      <tr key={landing}>
                        <td className={`${td} font-medium`}>{t(landing)}</td>
                        {paginasGracias.map((g) => (
                          <td key={g} className={`${td} tabular text-right`}>{numero(m.get(g) ?? 0)} <span className="text-xs text-zinc-500">({pct(m.get(g) ?? 0, tot)})</span></td>
                        ))}
                      </tr>
                    );
                  })}
                </Tabela>
              </Cartao>
            )}
          </div>
        );
      })}

      {rk.erro ? (
        <Cartao titulo={t("Melhor variação por país")}><p className="text-sm text-rose-600">{t("Aplique a migração {m} no Supabase.", { m: "030-jubilar-criativos-ranking.sql" })}</p></Cartao>
      ) : (
        <RankingPaginas ranking={rk.ranking} comGasto={rk.comGasto} idioma={idioma === "es" ? "es" : "pt"} t={t} />
      )}

      <p className="text-xs text-zinc-500">
        {t("A coluna \"% do total\" mostra a divisão real do tráfego dentro de cada página. Num teste de 3 páginas com 33% cada, cada uma deve ficar perto de 33%.")}{" "}
        {t("Nomenclatura única nas duas páginas: captura /v1, /v2, /v3… e gracias /gracias-v1, /gracias-v2… Nomes antigos (/t1, /gracias-a, /gracias-trader-a) aparecem já convertidos; páginas de lançamentos antigos aparecem pelo nome que mandavam (ex.: Gen-Argentina).")}
      </p>
    </>
  );
}
