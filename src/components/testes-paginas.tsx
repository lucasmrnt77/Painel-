import Link from "next/link";
import { Cartao, Tabela, montarHref, td } from "@/components/ui";
import { numero } from "@/lib/formato";
import { rotuloPeriodo, type Periodo } from "@/lib/periodo";
import { nomePagina, SITES_TESTE, VARIACOES_TESTE, MIN_LEADS_TESTE, MIN_VISITAS_TESTE, type LinhaTeste } from "@/lib/teste-paginas";
import type { TestePagina } from "@/lib/metricas-paginas";
import { excluirTestePagina, salvarTestePagina } from "@/lib/acoes-testes-paginas";

type T = (s: string, v?: Record<string, string | number>) => string;

const campo = "rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950";
const chip = (ativo: boolean) =>
  `rounded-full border px-3 py-1 text-xs font-medium ${ativo ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900" : "border-zinc-300 dark:border-zinc-700"}`;
const pctN = (v: number | null) => (v == null ? "—" : `${(100 * v).toFixed(1)}%`);

function Estrela() {
  return <span className="ml-1 rounded bg-emerald-100 px-1 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">★</span>;
}

/** Formulário de teste: nome, páginas (marcar) e período. Com `teste`, edita esse. */
function FormTeste({ lancamentoId, slug, teste, t }: { lancamentoId: number; slug: string; teste?: TestePagina; t: T }) {
  const marcadas = new Set(teste?.paginas ?? []);
  return (
    <form action={salvarTestePagina} className="space-y-3">
      <input type="hidden" name="lancamento_id" value={lancamentoId} />
      <input type="hidden" name="l" value={slug} />
      {teste && <input type="hidden" name="id" value={teste.id} />}
      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-xs text-zinc-500"><span className="block">{t("Nome do teste")}</span>
          <input name="nome" required maxLength={80} defaultValue={teste?.nome} placeholder={t("Ex.: Teste 1 · Headline")} className={`${campo} w-64`} /></label>
        <label className="space-y-1 text-xs text-zinc-500"><span className="block">{t("Início")}</span>
          <input type="date" name="inicio" required defaultValue={teste?.inicio} className={campo} /></label>
        <label className="space-y-1 text-xs text-zinc-500"><span className="block">{t("Fim")}</span>
          <input type="date" name="fim" required defaultValue={teste?.fim} className={campo} /></label>
      </div>
      <div className="space-y-1">
        <span className="block text-xs text-zinc-500">{t("Páginas do teste")}</span>
        {SITES_TESTE.map((site) => (
          <div key={site} className="flex flex-wrap items-center gap-3 text-sm">
            <span className="w-16 font-medium">{site}</span>
            {VARIACOES_TESTE.map((v) => {
              const p = nomePagina(site, v);
              return (
                <label key={p} className="inline-flex items-center gap-1">
                  <input type="checkbox" name="paginas" value={p} defaultChecked={marcadas.has(p)} />
                  <span className="tabular">{v === "/" ? t("principal") : v}</span>
                </label>
              );
            })}
          </div>
        ))}
      </div>
      <button className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">{teste ? t("Salvar alterações") : t("Criar teste")}</button>
    </form>
  );
}

export function SeletorTestes({ lancamentoId, slug, testes, teste, periodo, comPeriodo, erro, t }: {
  lancamentoId: number; slug: string; testes: TestePagina[]; teste: TestePagina | null; periodo: Periodo; comPeriodo: boolean; erro: string | null; t: T;
}) {
  if (erro) {
    return <Cartao titulo={t("Testes das páginas")}><p className="text-sm text-rose-600">{t("Aplique a migração {m} no Supabase.", { m: "035-paginas-periodo-testes.sql" })}</p></Cartao>;
  }
  return (
    <Cartao titulo={t("Testes das páginas")}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={montarHref("/paginas", { l: slug })} className={chip(!comPeriodo)}>{t("Lançamento inteiro")}</Link>
          {testes.map((x) => (
            <Link key={x.id} href={montarHref("/paginas", { l: slug, teste: x.id })} className={chip(teste?.id === x.id)}>
              {x.nome} <span className="opacity-70">· {rotuloPeriodo({ de: x.inicio, ate: x.fim }, t)}</span>
            </Link>
          ))}
        </div>

        {teste && (
          <div className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-semibold">{teste.nome}</span>{" "}
                <span className="text-zinc-500">· {rotuloPeriodo({ de: teste.inicio, ate: teste.fim }, t)} · {teste.paginas.join(", ")}</span>
              </div>
              <form action={excluirTestePagina}>
                <input type="hidden" name="id" value={teste.id} />
                <input type="hidden" name="l" value={slug} />
                <button title={t("Apagar só o teste salvo (os dados não são apagados)")} className="text-xs text-zinc-400 hover:text-rose-600">{t("Apagar teste")}</button>
              </form>
            </div>
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-zinc-500">{t("Editar teste")}</summary>
              <div className="pt-3"><FormTeste lancamentoId={lancamentoId} slug={slug} teste={teste} t={t} /></div>
            </details>
          </div>
        )}

        <details>
          <summary className="cursor-pointer text-sm font-medium">{t("+ Novo teste")}</summary>
          <div className="pt-3"><FormTeste lancamentoId={lancamentoId} slug={slug} t={t} /></div>
        </details>

        {!teste && (
          <form action="/paginas" className="flex flex-wrap items-end gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
            <input type="hidden" name="l" value={slug} />
            <span className="pb-2 text-xs text-zinc-500">{t("Ou só um período, com todas as páginas:")}</span>
            <label className="space-y-1 text-xs text-zinc-500"><span className="block">{t("Início")}</span><input type="date" name="de" defaultValue={periodo.de ?? ""} className={campo} /></label>
            <label className="space-y-1 text-xs text-zinc-500"><span className="block">{t("Fim")}</span><input type="date" name="ate" defaultValue={periodo.ate ?? ""} className={campo} /></label>
            <button className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">{t("Filtrar")}</button>
            {comPeriodo && <Link href={montarHref("/paginas", { l: slug })} className="px-2 py-1.5 text-sm text-zinc-500 hover:underline">{t("limpar")}</Link>}
          </form>
        )}
        <p className="text-xs text-zinc-500">{t("Com teste ou período, a aba conta só as pessoas que se inscreveram nesses dias (1ª inscrição no lançamento) e as visitas desses dias, no horário do Uruguai; os dados da Meta são os desses dias. É só uma visão do painel: nada muda nas páginas, nos dados nem na Meta.")}</p>
      </div>
    </Cartao>
  );
}

/** Página × página do teste: as 7 métricas (página + Meta) lado a lado. */
export function ResultadoTeste({ teste, linhas, comMeta, t }: { teste: TestePagina; linhas: LinhaTeste[]; comMeta: boolean; t: T }) {
  const num = `${td} tabular text-right`;
  return (
    <Cartao titulo={t("Resultado · {n}", { n: teste.nome })}>
      <Tabela
        cabecalho={[t("Página"), t("Visitas (page view)"), t("Leads"), t("Leads calificados"), t("Connect rate"), t("Conversão da página"), t("Conversão calificados"), t("Qualificação"), t("Cliques (Meta)")]}
        vazio={linhas.length === 0}
      >
        {linhas.map((l) => (
          <tr key={l.pagina}>
            <td className={`${td} font-medium`}>{l.pagina}</td>
            <td className={num}>{numero(l.visitas)}</td>
            <td className={num}>{numero(l.leads)}</td>
            <td className={num}>{numero(l.leadsQualificados)}</td>
            <td className={num}>{comMeta ? pctN(l.connectRate) : "—"}</td>
            <td className={num}>{pctN(l.conversao)}{l.melhor.conversao && <Estrela />}</td>
            <td className={num}>{pctN(l.conversaoQualificados)}{l.melhor.conversaoQualificados && <Estrela />}</td>
            <td className={num}>{pctN(l.qualificacao)}{l.melhor.qualificacao && <Estrela />}</td>
            <td className={`${num} text-zinc-500`}>{comMeta ? numero(l.cliques) : "—"}</td>
          </tr>
        ))}
      </Tabela>
      <ul className="mt-2 space-y-0.5 text-xs text-zinc-500">
        <li>{t("Leads = pessoas que fizeram o cadastro e clicaram em \"unirme al grupo\" na página de gracias. Leads calificados = os mesmos, só os calificados.")}</li>
        <li>{t("Connect rate = visitas ÷ cliques da Meta · Conversão da página = leads ÷ visitas · Conversão calificados = leads calificados ÷ visitas · Qualificação = leads calificados ÷ leads.")}</li>
        <li>{t("★ = melhor do mesmo site (General, Trader ou Jubilar), só entre páginas com pelo menos {v} visitas e {l} leads.", { v: MIN_VISITAS_TESTE, l: MIN_LEADS_TESTE })}</li>
        <li>{comMeta
          ? t("Cliques vêm da Meta. Com o link único (a Vercel divide as variações), os cliques são do site inteiro e cada página recebe a parte proporcional às suas visitas: o connect rate é o do site.")
          : t("Sem dados da Meta neste período: confira se os anúncios estão registrados em \"Anúncios × páginas\".")}</li>
      </ul>
    </Cartao>
  );
}
