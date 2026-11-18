import { contexto, param, type Busca as Sp } from "@/lib/contexto";
import { db } from "@/lib/supabase";
import { numero } from "@/lib/formato";
import { Cartao, Chips, Kpi, Tabela, montarHref, td } from "@/components/ui";
import { CabecalhoPagina, SemLancamento } from "@/components/cabecalho";
import { tradutor } from "@/lib/i18n/servidor";
import { ATIVO, MULTIPLO_SEM_LEAD, agrupar, alvoDe, decidir, faixaCusto, type Decisao, type LinhaAnuncio, type Premissa } from "@/lib/decisao-anuncios";

export const dynamic = "force-dynamic";

const usd = (v: number | null) => (v == null || !Number.isFinite(v) ? "—" : `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const curto = (v: number) => (Number.isFinite(v) ? v.toLocaleString("pt-BR", { maximumFractionDigits: v >= 100 ? 0 : 1 }) : "∞");
const FUNIS = ["trader", "general", "jubilados"] as const;
const PAISES = ["AR", "UY", "CL", "US"] as const;
const COR: Record<Decisao, string> = {
  escalar: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  manter: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  pausar: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
};

/**
 * Decisão por anúncio (18/11/2026): tudo o que cada anúncio já trouxe desde o primeiro dia, com o custo por
 * lead qualificado, a faixa provável (95%) e a recomendação Escalar / Manter / Pausar (regras em lib/decisao-anuncios.ts).
 * Filtros: ?funil=trader|general|jubilados · ?pais=AR|UY|CL|US · ?status=ativos|todos · ?por=criativo|anuncio.
 * Dados: decisao_anuncios() (migração 060) + premissas do lançamento (pc_lancamento_funil_pais).
 */
export default async function DecisaoAnuncios({ searchParams }: { searchParams: Promise<Sp> }) {
  const sp = await searchParams;
  const t = await tradutor();
  const { resumos, atual } = await contexto(sp, { semTestes: true });
  if (!atual) return (<><CabecalhoPagina titulo={t("Decisão por anúncio")} resumos={resumos} atual={null} /><SemLancamento /></>);

  const funil = (FUNIS as readonly string[]).includes(param(sp, "funil") ?? "") ? param(sp, "funil")! : null;
  const pais = (PAISES as readonly string[]).includes(param(sp, "pais") ?? "") ? param(sp, "pais")! : null;
  const status = param(sp, "status") === "todos" ? "todos" : "ativos";
  const por = param(sp, "por") === "anuncio" ? "anuncio" : "criativo";
  const href = (extra: Record<string, string | undefined>) =>
    montarHref("/anuncios", { l: atual.slug, funil: funil ?? undefined, pais: pais ?? undefined, status, por, ...extra });

  const [r, lanc] = await Promise.all([
    db().rpc("decisao_anuncios", { p_lancamento: atual.lancamento_id }),
    db().from("lancamentos").select("ads_lancamento").eq("id", atual.lancamento_id).maybeSingle(),
  ]);
  const adsLanc = (lanc.data as { ads_lancamento?: string | null } | null)?.ads_lancamento ?? null;
  const pr = adsLanc ? await db().from("pc_lancamento_funil_pais").select("funil, pais, cpl_base").eq("lancamento", adsLanc) : { data: [] };
  const premissas = ((pr.data ?? []) as Premissa[]).map((p) => ({ ...p, cpl_base: p.cpl_base == null ? null : Number(p.cpl_base) }));

  const todas: LinhaAnuncio[] = ((r.data ?? []) as Record<string, unknown>[]).map((x) => ({
    ad_id: String(x.ad_id), funil: String(x.funil ?? ""), pais: String(x.pais ?? ""), campanha: (x.campanha as string) ?? null,
    publico: (x.publico as string) ?? null, criativo: (x.criativo as string) ?? null, ad_status: (x.ad_status as string) ?? null,
    investimento: Number(x.investimento ?? 0), visitas: Number(x.visitas ?? 0), primeiro_dia: String(x.primeiro_dia), ultimo_dia: String(x.ultimo_dia),
    leads: Number(x.leads ?? 0), qualificados: Number(x.qualificados ?? 0), no_grupo: Number(x.no_grupo ?? 0), qualificados_no_grupo: Number(x.qualificados_no_grupo ?? 0),
  }));
  const filtradas = todas.filter((l) => (!funil || l.funil === funil) && (!pais || l.pais === pais) && l.investimento > 0);
  const linhas = agrupar(filtradas, por)
    .filter((g) => status === "todos" || g.ativos > 0)
    .map((g) => {
      const alvo = alvoDe(premissas, g.funil, g.pais);
      return { g, alvo, f: faixaCusto(g.investimento, g.qualificados), d: decidir(g.investimento, g.qualificados, alvo) };
    })
    .sort((a, b) => b.g.investimento - a.g.investimento);

  const conta = (d: Decisao) => linhas.filter((x) => x.d.decisao === d);
  const verba = (xs: typeof linhas) => xs.reduce((s, x) => s + x.g.investimento, 0);
  const motivo = (m: string, vezes: number | null, alvo: number | null) =>
    m === "sem_qualificado" ? t("Gastou {x}× o custo previsto sem nenhum qualificado", { x: curto(vezes ?? 0) })
    : m === "acima_do_alvo" ? t("Mesmo no melhor caso fica acima do previsto ({a})", { a: usd(alvo) })
    : m === "abaixo_do_alvo" ? t("Mesmo no pior caso fica abaixo do previsto ({a})", { a: usd(alvo) })
    : m === "faixa_inclui_alvo" ? t("Faltam dados: a faixa ainda inclui o previsto ({a})", { a: usd(alvo) })
    : m === "pouca_verba" ? t("Faltam dados: gastou {x}× o previsto, sem qualificado ainda", { x: curto(vezes ?? 0) })
    : t("Sem custo previsto para este funil e país nas premissas");
  const rotuloDecisao: Record<Decisao, string> = { escalar: t("Escalar"), manter: t("Manter"), pausar: t("Pausar") };
  const rotuloFunil: Record<string, string> = { trader: "Trader", general: "General", jubilados: "Jubilados" };

  return (
    <>
      <CabecalhoPagina titulo={t("Decisão por anúncio")} resumos={resumos} atual={atual}
        subtitulo={t("Tudo o que cada anúncio já trouxe desde o primeiro dia, com a recomendação de escalar, manter ou pausar")} />
      {r.error ? (
        <Cartao><p className="text-sm text-rose-600">{t("Aplique a migração {m} no Supabase.", { m: "060-decisao-anuncios.sql" })} ({r.error.message})</p></Cartao>
      ) : (
        <>
          <Cartao>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-zinc-500">{t("Funil")}</span>
                <Chips ativo={funil ?? "todos"} itens={[{ valor: "todos", rotulo: t("Todos"), href: href({ funil: undefined }) },
                  ...FUNIS.map((f) => ({ valor: f, rotulo: rotuloFunil[f], href: href({ funil: f }) }))]} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-zinc-500">{t("País")}</span>
                <Chips ativo={pais ?? "todos"} itens={[{ valor: "todos", rotulo: t("Todos"), href: href({ pais: undefined }) },
                  ...PAISES.map((p) => ({ valor: p, rotulo: p === "US" ? "EUA" : p, href: href({ pais: p }) }))]} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-zinc-500">{t("Anúncios")}</span>
                <Chips ativo={status} itens={[{ valor: "ativos", rotulo: t("Ativos"), href: href({ status: "ativos" }) }, { valor: "todos", rotulo: t("Todos (inclui pausados)"), href: href({ status: "todos" }) }]} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-zinc-500">{t("Agrupar")}</span>
                <Chips ativo={por} itens={[{ valor: "criativo", rotulo: t("Por criativo (soma os públicos)"), href: href({ por: "criativo" }) }, { valor: "anuncio", rotulo: t("Por anúncio (cada público)"), href: href({ por: "anuncio" }) }]} />
              </div>
            </div>
          </Cartao>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Kpi rotulo={t("Escalar")} valor={numero(conta("escalar").length)} destaque="verde" detalhe={t("Verba até agora: {v}", { v: usd(verba(conta("escalar"))) })} />
            <Kpi rotulo={t("Manter (faltam dados)")} valor={numero(conta("manter").length)} detalhe={t("Verba até agora: {v}", { v: usd(verba(conta("manter"))) })} />
            <Kpi rotulo={t("Pausar")} valor={numero(conta("pausar").length)} destaque="vermelho" detalhe={t("Verba até agora: {v}", { v: usd(verba(conta("pausar"))) })} />
          </div>

          <Cartao titulo={t("Anúncios · somando todos os dias")}>
            <div className="overflow-x-auto">
              <Tabela vazio={linhas.length === 0} cabecalho={[t("Anúncio"), t("Funil · país"), t("Situação na Meta"), t("Verba"), t("Leads"), t("Qualificados"), t("Qualificados no grupo"),
                t("Custo por qualificado"), t("Faixa provável (95%)"), t("Custo previsto"), t("Decisão")]}>
                {linhas.map(({ g, alvo, f, d }) => (
                  <tr key={g.chave}>
                    <td className={`${td} font-medium`}>
                      <div>{g.codigo}</div>
                      <div className="text-xs font-normal text-zinc-500">
                        {por === "anuncio" ? (g.publico ?? "—") : t("{n} anúncio(s) · {a} ativo(s)", { n: g.anuncios, a: g.ativos })}
                      </div>
                    </td>
                    <td className={`${td} whitespace-nowrap`}>{rotuloFunil[g.funil] ?? g.funil} · {g.pais === "US" ? "EUA" : g.pais}</td>
                    <td className={`${td} whitespace-nowrap text-xs`}>{g.ativos > 0 || ATIVO(g.ad_status) ? t("Ativo") : t("Pausado")}
                      <div className="text-zinc-500">{g.primeiro_dia.slice(8, 10)}/{g.primeiro_dia.slice(5, 7)} – {g.ultimo_dia.slice(8, 10)}/{g.ultimo_dia.slice(5, 7)}</div></td>
                    <td className={`${td} tabular text-right whitespace-nowrap`}>{usd(g.investimento)}</td>
                    <td className={`${td} tabular text-right`}>{numero(g.leads)}</td>
                    <td className={`${td} tabular text-right`}>{numero(g.qualificados)}</td>
                    <td className={`${td} tabular text-right`}>{numero(g.qualificados_no_grupo)}</td>
                    <td className={`${td} tabular text-right whitespace-nowrap font-medium`}>{usd(f.custo)}</td>
                    <td className={`${td} tabular text-right whitespace-nowrap text-xs`}>{curto(f.min)} – {curto(f.max)}</td>
                    <td className={`${td} tabular text-right whitespace-nowrap text-xs`}>{usd(alvo)}</td>
                    <td className={`${td} min-w-56`}>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${COR[d.decisao]}`}>{rotuloDecisao[d.decisao]}</span>
                      <div className="mt-1 text-xs text-zinc-500">{motivo(d.motivo, d.vezesAlvo, alvo)}</div>
                      {d.decisao === "escalar" && g.ativos === 0 && <div className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">{t("Está pausado: vale reativar")}</div>}
                    </td>
                  </tr>
                ))}
              </Tabela>
            </div>
          </Cartao>

          <Cartao titulo={t("Como a decisão é feita")}>
            <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-300">
              <li>{t("Soma todos os dias de cada anúncio. Olhar um dia isolado engana: com 2 leads, um a mais ou a menos muda tudo.")}</li>
              <li>{t("Métrica: custo por lead qualificado (o mesmo evento que vai para a Meta), comparado ao custo previsto nas premissas do lançamento. Jubilados usa o da General.")}</li>
              <li>{t("Faixa provável: onde o custo real deve estar, com 95% de confiança. Quanto mais qualificados, mais estreita a faixa.")}</li>
              <li>{t("Pausar: gastou {x}× o custo previsto sem nenhum qualificado, ou a faixa inteira ficou acima do previsto.", { x: MULTIPLO_SEM_LEAD })}</li>
              <li>{t("Escalar: a faixa inteira ficou abaixo do previsto. Em geral isso exige uns 20 qualificados.")}</li>
              <li>{t("Manter: a faixa ainda inclui o custo previsto. Falta verba para concluir; não é sinal de que o anúncio é ruim.")}</li>
              <li>{t("Leads e qualificados chegam ao anúncio pelo id no utm_term. Verba e visitas vêm da base da Meta.")}</li>
            </ul>
          </Cartao>
        </>
      )}
    </>
  );
}
