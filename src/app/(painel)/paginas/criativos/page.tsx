import Link from "next/link";
import { exigirLogin } from "@/lib/sessao";
import { db } from "@/lib/supabase";
import { dominioLinks } from "@/lib/links";
import { numero } from "@/lib/formato";
import { Cartao, Kpi, Tabela, td } from "@/components/ui";
import { apagarCriativo, definirLinkPorCriativo, salvarCriativo } from "@/lib/acoes-criativos";
import { SITES } from "@/lib/criativos";
import { tradutor } from "@/lib/i18n/servidor";

export const dynamic = "force-dynamic";

type Criativo = { id: number; nome: string; pagina: string | null; variacao: string | null; automatico: boolean; cliques: number; ultimo_clique_em: string | null };
type LinkC = { id: number; slug: string; por_criativo: boolean; ativo: boolean };
type SiteC = { site: string; nome: string; url_base: string; link_divisao: string | null };

const VARIACOES = ["/v1", "/v2", "/v3", "/v4", "/v5", "/"];
const campo = "rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const botao = "rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800";

function Seletores({ pagina, variacao, t }: { pagina: string | null; variacao: string | null; t: (s: string) => string }) {
  return (
    <>
      <select name="pagina" defaultValue={pagina ?? ""} className={campo} aria-label={t("Página")}>
        <option value="">{t("— sem página (segue o link) —")}</option>
        {SITES.map((s) => <option key={s.site} value={s.site}>{s.nome}</option>)}
      </select>
      <select name="variacao" defaultValue={variacao ?? ""} className={campo} aria-label={t("Variação")}>
        <option value="">{t("Divisão normal (/v1, /v2, /v3)")}</option>
        {VARIACOES.map((v) => <option key={v} value={v}>{v === "/" ? t("/ (principal)") : v}</option>)}
      </select>
    </>
  );
}

export default async function Criativos() {
  await exigirLogin();
  const t = await tradutor();
  const [c, l, s] = await Promise.all([
    db().from("criativos").select("id, nome, pagina, variacao, automatico, cliques, ultimo_clique_em").order("automatico", { ascending: false }).order("cliques", { ascending: false }).order("nome"),
    db().from("links").select("id, slug, por_criativo, ativo").order("slug"),
    db().from("sites_captura").select("site, nome, url_base, link_divisao"),
  ]);
  if (c.error || s.error) {
    return <Cartao titulo={t("Criativos")}><p className="text-sm text-rose-600">{t("Aplique a migração {m} no Supabase.", { m: "030-jubilar-criativos-ranking.sql" })}</p></Cartao>;
  }
  const criativos = (c.data ?? []) as Criativo[];
  const links = (l.data ?? []) as LinkC[];
  const sites = (s.data ?? []) as SiteC[];
  const nomeSite = (x: string | null) => sites.find((y) => y.site === x)?.nome ?? "—";
  const dominio = dominioLinks();
  const porCriativo = links.filter((x) => x.por_criativo);
  const revisar = criativos.filter((x) => x.automatico || !x.pagina).length;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t("Criativos → página")}</h1>
          <p className="text-sm text-zinc-500">{t("Cada criativo manda para a página Trader, General ou Jubilar (numa variação fixa ou na divisão normal). Os anúncios usam um link só.")}</p>
        </div>
        <Link href="/paginas" className={botao}>← {t("Páginas")}</Link>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi rotulo={t("Criativos")} valor={numero(criativos.length)} />
        <Kpi rotulo={t("Para revisar")} valor={numero(revisar)} destaque={revisar ? "ambar" : undefined} detalhe={t("novos ou sem página")} />
        <Kpi rotulo={t("Cliques")} valor={numero(criativos.reduce((a, x) => a + Number(x.cliques), 0))} />
        <Kpi rotulo={t("Links por criativo")} valor={numero(porCriativo.length)} />
      </section>

      <Cartao titulo={t("Como usar")}>
        <div className="space-y-2 text-sm">
          <p>{t("No anúncio, use o link:")}</p>
          {porCriativo.map((x) => (
            <code key={x.id} className="block break-all rounded bg-zinc-100 px-2 py-1 text-xs dark:bg-zinc-800">
              https://{dominio}/{x.slug}?utm_source={"{{adset.name}}|{{ad.name}}"}&amp;utm_campaign={"{{campaign.name}}"}&amp;utm_content=…
            </code>
          ))}
          <p className="text-zinc-500">
            {t("O painel procura o criativo pelo nome do anúncio (depois do \"|\" do utm_source) e, se não achar, pelo utm_content. Criativo novo entra sozinho nesta lista: [T] vai para a Trader, [G] para a General e [JG] para a Jubilar; sem prefixo, segue os destinos do próprio link até você escolher a página.")}
          </p>
          <p className="text-zinc-500">
            {t("Divisão normal = sorteio entre /v1, /v2, /v3 pelo link de cada página:")}{" "}
            {sites.map((x) => `${x.nome}: ${x.link_divisao ? `${dominio}/${x.link_divisao}` : x.url_base}`).join(" · ")}
          </p>
        </div>
      </Cartao>

      <Cartao titulo={t("Novo criativo")}>
        <form action={salvarCriativo} className="flex flex-wrap items-center gap-2">
          <input name="nome" required maxLength={200} placeholder={t("Nome do anúncio (ex.: [G] Anuncio36_v1) ou utm_content")} className={`${campo} min-w-72 flex-1`} />
          <Seletores pagina={null} variacao={null} t={t} />
          <button className={botao}>{t("Salvar")}</button>
        </form>
      </Cartao>

      <Cartao titulo={t("Criativos ({n})", { n: numero(criativos.length) })}>
        <Tabela cabecalho={[t("Criativo"), t("Vai para"), t("Cliques"), ""]} vazio={criativos.length === 0}>
          {criativos.map((x) => (
            <tr key={x.id}>
              <td className={`${td} font-medium`}>
                {x.nome}
                {x.automatico && <span className="ml-2 rounded bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">{t("automático")}</span>}
                {!x.pagina && <span className="ml-2 rounded bg-zinc-200 px-1.5 text-[10px] font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">{t("sem página")}</span>}
                <div className="text-xs text-zinc-500">{nomeSite(x.pagina)}{x.pagina ? ` · ${x.variacao ?? t("divisão normal")}` : ""}</div>
              </td>
              <td className={td}>
                <form action={salvarCriativo} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={x.id} />
                  <Seletores pagina={x.pagina} variacao={x.variacao} t={t} />
                  <button className={botao}>{t("Salvar")}</button>
                </form>
              </td>
              <td className={`${td} tabular text-right`}>{numero(x.cliques)}</td>
              <td className={`${td} text-right`}>
                <form action={apagarCriativo}><input type="hidden" name="id" value={x.id} /><button className={`${botao} text-rose-600`}>{t("Remover")}</button></form>
              </td>
            </tr>
          ))}
        </Tabela>
      </Cartao>

      <Cartao titulo={t("Links que mandam pelo criativo")}>
        <Tabela cabecalho={[t("Link"), t("Por criativo"), ""]} vazio={links.length === 0}>
          {links.filter((x) => x.por_criativo || /lanzamiento|evento/i.test(x.slug)).map((x) => (
            <tr key={x.id}>
              <td className={`${td} font-medium`}>{dominio}/{x.slug}</td>
              <td className={td}>{x.por_criativo ? t("Sim") : t("Não")}</td>
              <td className={`${td} text-right`}>
                <form action={definirLinkPorCriativo}>
                  <input type="hidden" name="id" value={x.id} />
                  <input type="hidden" name="ligar" value={x.por_criativo ? "0" : "1"} />
                  <button className={botao}>{x.por_criativo ? t("Desligar") : t("Ligar")}</button>
                </form>
              </td>
            </tr>
          ))}
        </Tabela>
      </Cartao>
    </>
  );
}
