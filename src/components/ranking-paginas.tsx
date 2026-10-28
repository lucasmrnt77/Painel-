import { td } from "@/components/ui";
import { listaPaises, MIN_LEADS_CPL, MIN_VISITAS, NOME_PAIS, PAISES, type Celula, type PaisGrupo, type RankingSite } from "@/lib/criativos";
import { numero } from "@/lib/formato";

type T = (s: string, v?: Record<string, string | number>) => string;

const pctN = (v: number | null) => (v == null ? "—" : `${(100 * v).toFixed(1)}%`);
const usd = (v: number | null) => (v == null ? "—" : `US$ ${v.toFixed(2)}`);

function Selo({ children }: { children: React.ReactNode }) {
  return <span className="ml-1 rounded bg-emerald-100 px-1 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">{children}</span>;
}

function CelulaPais({ c, melhor, t }: { c: Celula | undefined; melhor: { insc: boolean; qual: boolean; cpl: boolean }; t: T }) {
  if (!c) return <span className="text-zinc-400">—</span>;
  const n = (v: number) => <span className="text-zinc-400"> · {numero(v)}</span>;
  return (
    <div className="space-y-0.5 text-xs leading-tight">
      <div className="tabular">{pctN(c.taxaInscricao)} {t("inscr.")}{n(c.leads)}{melhor.insc && <Selo>★</Selo>}</div>
      <div className="tabular text-zinc-500">{pctN(c.taxaResponderam)} {t("responderam")}{n(c.responderam)}</div>
      <div className="tabular text-zinc-500">{pctN(c.taxaQualificados)} {t("qualif. (leads)")}{n(c.qualificados)}{melhor.qual && <Selo>★</Selo>}</div>
      <div className="tabular text-zinc-500">{pctN(c.taxaQualificadosVisitas)} {t("qualif. (visitas)")}{n(c.qualificados)}</div>
      <div className="tabular text-zinc-500">{pctN(c.taxaNoGrupo)} {t("no grupo (visitas)")}{n(c.noGrupo)}</div>
      {c.gasto != null && <div className="tabular text-zinc-500">{usd(c.cpl)} {t("por lead")}{melhor.cpl && <Selo>★</Selo>}</div>}
      <div className="tabular text-[10px] text-zinc-400">{numero(c.visitas)} {t("visitas")}</div>
    </div>
  );
}

export function RankingPaginas({ ranking, comGasto, idioma, t }: { ranking: RankingSite[]; comGasto: boolean; idioma: "pt" | "es"; t: T }) {
  if (ranking.length === 0) return null;
  const nomes = idioma === "es"
    ? ({ AR: "Argentina", UY: "Uruguay", CL: "Chile", Outros: "Otros países" } as Record<PaisGrupo, string>)
    : NOME_PAIS;
  const e = idioma === "es" ? "y" : "e";
  return (
    <div className="space-y-4">
      <h2 className="pt-2 text-base font-semibold">{t("Melhor variação por país")}</h2>
      {ranking.map((r) => {
        const paises = PAISES.filter((p) => r.variacoes.some((v) => r.celulas[v]?.[p]));
        return (
          <details key={r.site} className="group rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
              <span className="inline-block text-xs text-zinc-500 transition-transform group-open:rotate-90">▶</span>
              {t("Página {s}: variação × país", { s: r.site })}
            </summary>
            <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
            <div className="mb-3 space-y-1 text-sm">
              {r.resumo.length === 0 ? (
                <p className="text-zinc-500">{t("Ainda sem visitas suficientes para comparar (mínimo de {n} visitas por variação e país).", { n: MIN_VISITAS })}</p>
              ) : (
                r.resumo.map((x) => (
                  <p key={x.variacao}>
                    <strong>{r.site}{x.variacao === "/" ? "" : x.variacao}</strong> — {listaPaises(x.paises, nomes, e)}
                    <span className="text-xs text-zinc-500"> · {t("melhor taxa de inscrição")}</span>
                  </p>
                ))
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800">
                    <th className="px-4 py-2 font-medium">{t("Variação")}</th>
                    {paises.map((p) => <th key={p} className="px-4 py-2 font-medium">{nomes[p]}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {r.variacoes.map((v) => (
                    <tr key={v} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60">
                      <td className={`${td} font-medium`}>{t(v)}</td>
                      {paises.map((p) => {
                        const m = r.melhor[p];
                        return (
                          <td key={p} className={td}>
                            <CelulaPais c={r.celulas[v]?.[p]} melhor={{ insc: m?.taxaInscricao === v, qual: m?.taxaQualificados === v, cpl: m?.cpl === v }} t={t} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </div>
          </details>
        );
      })}
      <p className="text-xs text-zinc-500">
        {t("Clique no nome da página para abrir ou fechar. Ao lado de cada % está o número de pessoas. inscr. = leads ÷ visitas · responderam = responderam as 3 perguntas ÷ leads · qualif. (leads) = qualificados ÷ todos os leads, respondendo ou não · qualif. (visitas) = qualificados ÷ visitas · no grupo (visitas) = entraram no grupo do WhatsApp ÷ visitas. ★ = melhor do país: maior inscr., maior qualif. (leads) e menor custo por lead. Só disputam variações com pelo menos {v} visitas no país (e {l} leads para a qualificação e o custo).", { v: MIN_VISITAS, l: MIN_LEADS_CPL })}{" "}
        {comGasto
          ? t("Custo por lead: investimento da base da Paola ligado à página pela aba Criativos (ou pelo prefixo [T], [G], [JG] do anúncio). Quando o criativo usa a divisão normal da página, o investimento é dividido entre as variações pela proporção de visitas (estimativa).")
          : t("Custo por lead aparece quando o lançamento tiver dados de anúncios na base da Paola.")}
      </p>
    </div>
  );
}
