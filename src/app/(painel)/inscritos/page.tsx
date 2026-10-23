import { contexto, param, type Busca as Sp } from "@/lib/contexto";
import { POR_PAGINA } from "@/lib/dados";
import { dataHora, faixaBonita, generoBonito, investimentoBonito, linkWhatsapp, numero } from "@/lib/formato";
import { Busca, Cartao, Chips, Kpi, Paginacao, Selo, Tabela, montarHref, td } from "@/components/ui";
import { CabecalhoPagina, SemLancamento } from "@/components/cabecalho";
import { tradutor } from "@/lib/i18n/servidor";
import { lerPeriodo, rotuloPeriodo, temPeriodo } from "@/lib/periodo";
import { conjuntoEAnuncio, paisDoTelefone, PAISES_INSCRITOS, rotuloSite, rotuloVariacao, SITES_INSCRITOS, VARIACOES_INSCRITOS } from "@/lib/inscritos";
import { contarPorSite, listarInscritos, resumoPaginas } from "@/lib/inscritos-dados";

const campo = "rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950";
const pctN = (v: number | null) => (v == null ? "—" : `${(100 * v).toFixed(1)}%`);

/**
 * Inscritos: todas as inscrições do lançamento, separadas por página (como as abas da planilha),
 * com variação, país, origem, respostas, calificado e clique no grupo. Em cima, o resumo por página.
 * Filtros: ?site= ?v= (variação) ?pais= ?de= ?ate= ?q= ?p=
 */
export default async function Inscritos({ searchParams }: { searchParams: Promise<Sp> }) {
  const sp = await searchParams;
  const t = await tradutor();
  const { resumos, atual } = await contexto(sp, { semTestes: true });
  if (!atual) return (<><CabecalhoPagina titulo={t("Inscritos")} resumos={resumos} atual={null} /><SemLancamento /></>);

  const siteParam = param(sp, "site");
  const site = SITES_INSCRITOS.find((s) => s.site === siteParam)?.site;
  const vParam = param(sp, "v");
  const landing = (VARIACOES_INSCRITOS as readonly string[]).includes(vParam ?? "") ? vParam : undefined;
  const paisParam = param(sp, "pais");
  const pais = paisParam === "outros" || PAISES_INSCRITOS.some((p) => p.valor === paisParam) ? paisParam : undefined;
  const periodo = lerPeriodo(param(sp, "de"), param(sp, "ate"));
  const q = param(sp, "q");
  const p = Number(param(sp, "p") ?? 1) || 1;

  const [lista, contagem, resumo] = await Promise.all([
    listarInscritos(atual.lancamento_id, { site, landing, pais, q, periodo, pagina: p }),
    contarPorSite(atual.lancamento_id, SITES_INSCRITOS.map((s) => s.site), periodo),
    resumoPaginas(atual.lancamento_id, periodo, site),
  ]);

  const estado = { l: atual.slug, site, v: landing, pais, de: periodo.de ?? undefined, ate: periodo.ate ?? undefined, q };
  const href = (extra: Record<string, string | number | undefined>) => montarHref("/inscritos", { ...estado, p: undefined, ...extra });

  const tot = resumo.linhas.reduce((a, r) => ({ v: a.v + r.visitas, i: a.i + r.inscricoes, c: a.c + r.cliquesGrupo, q: a.q + r.calificados }), { v: 0, i: 0, c: 0, q: 0 });
  const razao = (a: number, b: number) => (b > 0 ? a / b : null);
  const cliquesMeta = resumo.cliquesMeta
    ? Object.entries(resumo.cliquesMeta).filter(([s]) => !site || s === site).reduce((a, [, n]) => a + n, 0)
    : null;

  return (
    <>
      <CabecalhoPagina titulo={t("Inscritos")} resumos={resumos} atual={atual} subtitulo={temPeriodo(periodo) ? rotuloPeriodo(periodo, t) : t("Lançamento inteiro")} />

      <Cartao>
        <div className="space-y-3">
          <Chips
            ativo={site ?? "todas"}
            itens={[
              { valor: "todas", rotulo: t("Todas as páginas"), qtd: contagem.todos, href: href({ site: undefined, v: undefined }) },
              ...SITES_INSCRITOS.map((s) => ({ valor: s.site, rotulo: s.rotulo, qtd: contagem.porSite[s.site] ?? 0, href: href({ site: s.site }) })),
            ]}
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-zinc-500">{t("Variação")}</span>
            <Chips
              ativo={landing ?? "todas"}
              itens={[
                { valor: "todas", rotulo: t("Todas"), href: href({ v: undefined }) },
                ...VARIACOES_INSCRITOS.map((v) => ({ valor: v, rotulo: v === "/" ? t("principal") : v, href: href({ v }) })),
              ]}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-zinc-500">{t("País")}</span>
            <Chips
              ativo={pais ?? "todos"}
              itens={[
                { valor: "todos", rotulo: t("Todos"), href: href({ pais: undefined }) },
                ...PAISES_INSCRITOS.map((x) => ({ valor: x.valor, rotulo: t(x.rotulo), href: href({ pais: x.valor }) })),
                { valor: "outros", rotulo: t("Outros"), href: href({ pais: "outros" }) },
              ]}
            />
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
            <form action="/inscritos" className="flex flex-wrap items-end gap-2">
              {Object.entries({ l: atual.slug, site, v: landing, pais, q }).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
              <label className="space-y-1 text-xs text-zinc-500"><span className="block">{t("De")}</span><input type="date" name="de" defaultValue={periodo.de ?? ""} className={campo} /></label>
              <label className="space-y-1 text-xs text-zinc-500"><span className="block">{t("Até")}</span><input type="date" name="ate" defaultValue={periodo.ate ?? ""} className={campo} /></label>
              <button className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">{t("Filtrar")}</button>
              {temPeriodo(periodo) && <a href={href({ de: undefined, ate: undefined })} className="px-2 py-1.5 text-sm text-zinc-500 hover:underline">{t("limpar")}</a>}
            </form>
            <Busca acao="/inscritos" valor={q} ocultos={{ l: atual.slug, site, v: landing, pais, de: periodo.de ?? undefined, ate: periodo.ate ?? undefined }} placeholder={t("Telefone ou e-mail")} />
          </div>
          <p className="text-xs text-zinc-500">{t("Datas e horas no horário do Uruguai. País pelo DDI do WhatsApp.")}</p>
        </div>
      </Cartao>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi rotulo={t("Visitas")} valor={numero(tot.v)} detalhe={cliquesMeta != null ? t("{n} cliques nos anúncios (Meta)", { n: numero(cliquesMeta) }) : t("page view das páginas")} />
        <Kpi rotulo={t("Inscrições")} valor={numero(tot.i)} detalhe={t("{p} das visitas", { p: pctN(razao(tot.i, tot.v)) })} />
        <Kpi rotulo={t("Clicaram no grupo")} valor={numero(tot.c)} detalhe={t("{p} das inscrições", { p: pctN(razao(tot.c, tot.i)) })} destaque="verde" />
        <Kpi rotulo={t("Calificados")} valor={numero(tot.q)} detalhe={t("{p} das inscrições", { p: pctN(razao(tot.q, tot.i)) })} />
        <Kpi rotulo={t("Na lista abaixo")} valor={numero(lista.total)} detalhe={t("com os filtros escolhidos")} />
      </section>

      <Cartao titulo={t("Por página e variação")}>
        <Tabela
          cabecalho={[t("Página"), t("Variação"), t("Visitas"), t("Inscrições"), t("Conversão"), t("Clicaram no grupo"), t("% clique"), t("Calificados"), t("% calificados")]}
          vazio={resumo.linhas.length === 0}
        >
          {resumo.linhas.map((r) => (
            <tr key={`${r.site}${r.landing}`}>
              <td className={`${td} font-medium`}><a className="hover:underline" href={href({ site: r.site, v: (VARIACOES_INSCRITOS as readonly string[]).includes(r.landing) ? r.landing : undefined })}>{rotuloSite(r.site)}</a></td>
              <td className={td}>{t(rotuloVariacao(r.landing))}</td>
              <td className={`${td} tabular text-right`}>{numero(r.visitas)}</td>
              <td className={`${td} tabular text-right`}>{numero(r.inscricoes)}</td>
              <td className={`${td} tabular text-right`}>{pctN(r.conversao)}</td>
              <td className={`${td} tabular text-right`}>{numero(r.cliquesGrupo)}</td>
              <td className={`${td} tabular text-right`}>{pctN(r.taxaClique)}</td>
              <td className={`${td} tabular text-right`}>{numero(r.calificados)}</td>
              <td className={`${td} tabular text-right`}>{pctN(r.taxaCalificados)}</td>
            </tr>
          ))}
        </Tabela>
        <ul className="mt-2 space-y-0.5 text-xs text-zinc-500">
          <li>{t("Visitas = page view registrado pela própria página. Inscrições = pessoas que preencheram o formulário. Clicaram no grupo = clicaram em \"unirme al grupo\" na página de gracias.")}</li>
          {resumo.cliquesMeta && (
            <li>{t("Cliques nos anúncios (Meta): {lista}", { lista: Object.entries(resumo.cliquesMeta).map(([s, n]) => `${rotuloSite(s)} ${numero(n)}`).join(" · ") })}</li>
          )}
        </ul>
      </Cartao>

      <Cartao titulo={t("Inscrições ({n})", { n: numero(lista.total) })}>
        <Tabela
          cabecalho={[
            t("Data e hora"), "WhatsApp", t("País"), t("Página"), t("Variação"), t("Origem (planilha)"), t("Gracias"),
            t("Experiência"), t("Idade"), t("Gênero"), t("Investimento"), t("Calificado"), t("Clicou no grupo"), t("Grupo"),
            t("Campanha"), t("Conjunto"), t("Anúncio"), "utm_medium", t("E-mail"), t("Envios"),
          ]}
          vazio={lista.linhas.length === 0}
        >
          {lista.linhas.map((l) => {
            const { conjunto, anuncio } = conjuntoEAnuncio(l.utm_source);
            const qual = l.extra?.qualificado;
            return (
              <tr key={l.inscricao_id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                <td className={`${td} tabular whitespace-nowrap text-zinc-500`}>{dataHora(l.inscrito_em)}</td>
                <td className={`${td} tabular whitespace-nowrap`}>
                  {linkWhatsapp(l.telefone) ? <a className="hover:underline" href={linkWhatsapp(l.telefone)!} target="_blank" rel="noreferrer">{l.telefone}</a> : (l.telefone ?? "—")}
                </td>
                <td className={`${td} whitespace-nowrap`}>{t(paisDoTelefone(l.telefone))}</td>
                <td className={`${td} whitespace-nowrap font-medium`}>{rotuloSite(l.site)}</td>
                <td className={`${td} whitespace-nowrap`}>{t(rotuloVariacao(l.landing))}</td>
                <td className={`${td} whitespace-nowrap text-zinc-600 dark:text-zinc-400`}>{l.extra?.origem ?? "—"}</td>
                <td className={`${td} whitespace-nowrap text-zinc-600 dark:text-zinc-400`}>{l.extra?.gracias ?? l.pagina_obrigado ?? "—"}</td>
                <td className={`${td} whitespace-nowrap text-zinc-600 dark:text-zinc-400`}>{l.experiencia ?? "—"}</td>
                <td className={`${td} whitespace-nowrap text-zinc-600 dark:text-zinc-400`}>{t(faixaBonita(l.faixa_etaria))}</td>
                <td className={`${td} whitespace-nowrap text-zinc-600 dark:text-zinc-400`}>{t(generoBonito(l.genero))}</td>
                <td className={`${td} whitespace-nowrap text-zinc-600 dark:text-zinc-400`} title={l.resposta_dinheiro ?? undefined}>{t(investimentoBonito(l.resposta_dinheiro))}</td>
                <td className={`${td} whitespace-nowrap`}>
                  {qual === true ? <span className="text-emerald-700 dark:text-emerald-400">{t("Sim")}</span> : qual === false ? <span className="text-rose-700 dark:text-rose-400">{t("Não")}</span> : "—"}
                </td>
                <td className={`${td} tabular whitespace-nowrap text-zinc-500`}>{l.extra?.clicouEm ? dataHora(l.extra.clicouEm) : "—"}</td>
                <td className={td}><Selo status={l.status} /></td>
                <td className={`${td} whitespace-nowrap text-xs text-zinc-500`}>{l.utm_campaign ?? "—"}</td>
                <td className={`${td} whitespace-nowrap text-xs text-zinc-500`}>{conjunto ?? "—"}</td>
                <td className={`${td} whitespace-nowrap text-xs text-zinc-500`}>{anuncio ?? l.utm_content ?? "—"}</td>
                <td className={`${td} whitespace-nowrap text-xs text-zinc-500`}>{l.utm_medium ?? "—"}</td>
                <td className={`${td} whitespace-nowrap text-xs text-zinc-500`}>{l.email ?? "—"}</td>
                <td className={`${td} tabular text-zinc-500`}>{l.n_envios}</td>
              </tr>
            );
          })}
        </Tabela>
        <div className="mt-4">
          <Paginacao pagina={lista.pagina} total={lista.total} porPagina={POR_PAGINA} href={(n) => montarHref("/inscritos", { ...estado, p: n })} />
        </div>
      </Cartao>
    </>
  );
}
