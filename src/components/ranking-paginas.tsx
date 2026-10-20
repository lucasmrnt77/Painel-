import { Cartao, td } from "@/components/ui";
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
  return (
    <div className="space-y-0.5 text-xs leading-tight">
      <div className="tabular">{pctN(c.taxaInscricao)} {t("inscr.")}{melhor.insc && <Selo>★</Selo>}</div>
      <div className="tabular text-zinc-500">{pctN(c.taxaQualificados)} {t("qualif.")}{melhor.qual && <Selo>★</Selo>}</div>
      {c.gasto != null && <div className="tabular text-zinc-500">{usd(c.cpl)} {t("por lead")}{melhor.cpl && <Selo>★</Selo>}</div>}
      <div className="tabular text-[10px] text-zinc-400">{numero(c.visitas)} {t("visitas")} · {numero(c.leads)} {t("leads")}</div>
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
          <Cartao key={r.site} titulo={t("Página {s}: variação × país", { s: r.site })}>
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
          </Cartao>
        );
      })}
      <p className="text-xs text-zinc-500">
        {t("★ = melhor do país: maior taxa de inscrição (leads ÷ visitas), maior taxa de qualificados (qualificados ÷ visitas) e menor custo por lead. Só disputam variações com pelo menos {v} visitas no país (e {l} leads para o custo).", { v: MIN_VISITAS, l: MIN_LEADS_CPL })}{" "}
        {comGasto
          ? t("Custo por lead: investimento da base da Paola ligado à página pela aba Criativos (ou pelo prefixo [T], [G], [JG] do anúncio). Quando o criativo usa a divisão normal da página, o investimento é dividido entre as variações pela proporção de visitas (estimativa).")
          : t("Custo por lead aparece quando o lançamento tiver dados de anúncios na base da Paola.")}
      </p>
    </div>
  );
}
