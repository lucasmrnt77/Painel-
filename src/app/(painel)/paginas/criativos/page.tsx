import Link from "next/link";
import { exigirLogin } from "@/lib/sessao";
import { db } from "@/lib/supabase";
import { contexto, param } from "@/lib/contexto";
import { escolherLancamento } from "@/lib/dados";
import { numero } from "@/lib/formato";
import { desempenhoAnuncios } from "@/lib/metricas-paginas";
import { MIN_LEADS, MIN_VISUALIZACOES, urlDoAnuncio } from "@/lib/anuncios";
import { SITES } from "@/lib/criativos";
import { Cartao, Kpi, Tabela, montarHref, td } from "@/components/ui";
import { apagarCriativo, salvarCriativo } from "@/lib/acoes-criativos";
import { tradutor } from "@/lib/i18n/servidor";

export const dynamic = "force-dynamic";

type SiteC = { site: "general" | "trader" | "jubilar"; nome: string; url_base: string };
type Hist = { criativo_id: number; desde: string };

const VARIACOES = ["/", "/v1", "/v2", "/v3", "/v4", "/v5"];
const campo = "rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const botao = "rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800";
const pct = (v: number | null) => (v == null ? "—" : `${(100 * v).toFixed(1)}%`);
const usd = (v: number | null) => (v == null ? "—" : `US$ ${v.toFixed(2)}`);
const dataBr = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Montevideo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

function Seletores({ pagina, variacao, t }: { pagina: string | null; variacao: string | null; t: (s: string) => string }) {
  return (
    <>
      <select name="pagina" defaultValue={pagina ?? ""} className={campo} aria-label={t("Página")}>
        <option value="">{t("— página —")}</option>
        {SITES.map((s) => <option key={s.site} value={s.site}>{s.nome}</option>)}
      </select>
      <select name="variacao" defaultValue={variacao ?? ""} className={campo} aria-label={t("Variação")}>
        <option value="">{t("— variação —")}</option>
        {VARIACOES.map((v) => <option key={v} value={v}>{v === "/" ? t("/ (principal)") : v}</option>)}
      </select>
    </>
  );
}

function Estrela() {
  return <span className="ml-1 rounded bg-emerald-100 px-1 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">★</span>;
}

export default async function Anuncios({ searchParams }: PageProps<"/paginas/criativos">) {
  await exigirLogin();
  const sp = await searchParams;
  const t = await tradutor();
  const { resumos } = await contexto(sp);
  const atual = escolherLancamento(resumos, param(sp, "l"));
  const [s, h, dados] = await Promise.all([
    db().from("sites_captura").select("site, nome, url_base"),
    db().from("criativos_historico").select("criativo_id, desde").order("desde", { ascending: false }),
    atual ? desempenhoAnuncios(atual.lancamento_id) : Promise.resolve(null),
  ]);
  if (s.error || h.error || dados?.erro) {
    return <Cartao titulo={t("Anúncios × páginas")}><p className="text-sm text-rose-600">{t("Aplique a migração {m} no Supabase.", { m: "031-anuncios-variacoes.sql" })}</p></Cartao>;
  }
  const sites = (s.data ?? []) as SiteC[];
  const site = (x: string | null) => sites.find((y) => y.site === x);
  const ultimaTroca = new Map<number, string>();
  for (const x of (h.data ?? []) as Hist[]) if (!ultimaTroca.has(x.criativo_id)) ultimaTroca.set(x.criativo_id, x.desde);
  const registros = [...(dados?.registros ?? [])].sort((a, b) => a.nome.localeCompare(b.nome, undefined, { numeric: true }));
  const d = dados?.desempenho;
  const linhas = d?.linhas ?? [];
  const chave = (x: string) => x.trim().toLowerCase();

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t("Anúncios × páginas")}</h1>
          <p className="text-sm text-zinc-500">{t("Cada anúncio leva direto para uma página e variação (sem redirecionamento). Aqui fica o registro de para onde cada anúncio aponta e qual anúncio converte melhor em qual variação.")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/paginas" className={botao}>← {t("Páginas")}</Link>
          {resumos.map((r) => (
            <Link key={r.slug} href={montarHref("/paginas/criativos", { l: r.slug })} className={`rounded-full border px-3 py-1 text-xs font-medium ${atual?.slug === r.slug ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900" : "border-zinc-300 dark:border-zinc-700"}`}>{t(r.nome)}</Link>
          ))}
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi rotulo={t("Anúncios registrados")} valor={numero(registros.length)} />
        <Kpi rotulo={t("Anúncios com leads")} valor={numero(new Set(linhas.filter((l) => l.leads > 0).map((l) => chave(l.anuncio))).size)} />
        <Kpi rotulo={t("Leads por anúncio")} valor={numero(linhas.reduce((a, l) => a + l.leads, 0))} detalhe={atual ? t(atual.nome) : undefined} />
        <Kpi rotulo={t("Investimento")} valor={usd(linhas.reduce((a, l) => a + l.investimento, 0) || null)} detalhe={dados?.comMeta ? t("base da Paola") : t("sem dados da Paola")} />
      </section>

      <Cartao titulo={t("Como montar o link do anúncio")}>
        <div className="space-y-2 text-sm">
          <p>{t("No anúncio, use o endereço da página com a variação e os parâmetros abaixo (a Meta troca o nome do conjunto e do anúncio sozinha). Exemplos:")}</p>
          {sites.map((x) => (
            <code key={x.site} className="block break-all rounded bg-zinc-100 px-2 py-1 text-xs dark:bg-zinc-800">{urlDoAnuncio(x.url_base, "/v1")}</code>
          ))}
          <p className="text-zinc-500">{t("Troque /v1 pela variação do teste. O nome do anúncio na Meta tem que ser igual ao registrado aqui (é por ele que o painel junta investimento, visualizações e leads).")}</p>
        </div>
      </Cartao>

      <Cartao titulo={t("Registrar anúncio")}>
        <form action={salvarCriativo} className="flex flex-wrap items-center gap-2">
          <input name="nome" required maxLength={200} placeholder={t("Nome do anúncio na Meta (ex.: [G] Anuncio36_v1)")} className={`${campo} min-w-64 flex-1`} />
          <input name="link" maxLength={2000} placeholder={t("Link do anúncio (opcional: preenche página e variação)")} className={`${campo} min-w-64 flex-1`} />
          <Seletores pagina={null} variacao={null} t={t} />
          <button className={botao}>{t("Salvar")}</button>
        </form>
      </Cartao>

      <Cartao titulo={t("Anúncios registrados ({n})", { n: numero(registros.length) })}>
        <Tabela cabecalho={[t("Anúncio"), t("Aponta para"), t("Desde"), ""]} vazio={registros.length === 0}>
          {registros.map((r) => {
            const st = site(r.pagina);
            return (
              <tr key={r.id}>
                <td className={`${td} font-medium`}>
                  {r.nome}
                  {st && <div className="mt-1 break-all text-[11px] font-normal text-zinc-500">{st.url_base}{!r.variacao || r.variacao === "/" ? "/" : r.variacao}</div>}
                </td>
                <td className={td}>
                  <form action={salvarCriativo} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={r.id} />
                    <Seletores pagina={r.pagina} variacao={r.variacao} t={t} />
                    <button className={botao}>{t("Salvar")}</button>
                  </form>
                </td>
                <td className={`${td} whitespace-nowrap text-xs text-zinc-500`}>{ultimaTroca.get(r.id) ? dataBr(ultimaTroca.get(r.id)!) : "—"}</td>
                <td className={`${td} text-right`}>
                  <form action={apagarCriativo}><input type="hidden" name="id" value={r.id} /><button className={`${botao} text-rose-600`}>{t("Remover")}</button></form>
                </td>
              </tr>
            );
          })}
        </Tabela>
      </Cartao>

      {d && d.melhorPorDestino.length > 0 && (
        <Cartao titulo={t("Melhor anúncio em cada variação")}>
          <Tabela cabecalho={[t("Página/variação"), t("Melhor anúncio"), t("Conversão")]}>
            {d.melhorPorDestino.map((m) => (
              <tr key={m.destino}>
                <td className={`${td} font-medium`}>{m.destino}</td>
                <td className={td}>{m.anuncio}</td>
                <td className={`${td} tabular text-right`}>{pct(m.conversao)}</td>
              </tr>
            ))}
          </Tabela>
        </Cartao>
      )}

      <Cartao titulo={t("Desempenho: anúncio × página/variação")}>
        <Tabela cabecalho={[t("Anúncio"), t("Página/variação"), t("Investimento"), t("Visualizações"), t("Leads"), t("Conversão"), t("Qualificados"), t("Custo/lead"), t("Custo/qualificado")]} vazio={linhas.length === 0}>
          {linhas.map((l) => {
            const melhor = d?.melhorPorAnuncio.get(chave(l.anuncio)) === l.destino;
            return (
              <tr key={`${l.anuncio}|${l.destino}`}>
                <td className={`${td} font-medium`}>
                  {l.anuncio}
                  {!l.registrado && <span className="ml-2 rounded bg-zinc-200 px-1.5 text-[10px] font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">{t("não registrado")}</span>}
                </td>
                <td className={td}>{l.destino}</td>
                <td className={`${td} tabular text-right`}>{l.investimento ? usd(l.investimento) : "—"}</td>
                <td className={`${td} tabular text-right`}>{numero(l.visualizacoes)}</td>
                <td className={`${td} tabular text-right`}>{numero(l.leads)}</td>
                <td className={`${td} tabular text-right`}>{pct(l.conversao)}{melhor && <Estrela />}</td>
                <td className={`${td} tabular text-right`}>{numero(l.qualificados)} <span className="text-xs text-zinc-500">({pct(l.taxaQualificados)})</span></td>
                <td className={`${td} tabular text-right`}>{usd(l.cpl)}</td>
                <td className={`${td} tabular text-right`}>{usd(l.cplQualificado)}</td>
              </tr>
            );
          })}
        </Tabela>
        <p className="mt-3 text-xs text-zinc-500">
          {t("Conversão = leads ÷ visualizações da página (dado da Meta). ★ = variação em que o anúncio converte melhor (mínimo de {v} visualizações e {l} leads). Investimento e visualizações de cada dia vão para a variação em que o anúncio estava naquele dia (histórico das trocas); leads e qualificados contam pela variação em que a pessoa entrou.", { v: MIN_VISUALIZACOES, l: MIN_LEADS })}
        </p>
      </Cartao>
    </>
  );
}
