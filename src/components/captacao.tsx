import Link from "next/link";
import { numero } from "@/lib/formato";
import { tradutor } from "@/lib/i18n/servidor";
import type { ResumoFunil, ResumoGrupoGratuito, ResumoLinks } from "@/lib/captacao";

const cartao = "flex flex-col rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900";
const cab = "flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800";
const verTudo = "text-xs text-emerald-700 hover:underline dark:text-emerald-400";

/** "Captação agora": redirecionador, grupo gratuito e links curtos, lado a lado. */
export async function Captacao({ funis, grupo, links }: { funis: ResumoFunil[] | null; grupo: ResumoGrupoGratuito | null; links: ResumoLinks | null }) {
  const t = await tradutor();
  const indisponivel = <p className="px-4 py-6 text-center text-sm text-zinc-500">{t("Sem dados agora.")}</p>;
  return (
    <section className="grid gap-4 xl:grid-cols-3">
      <div className={cartao}>
        <header className={cab}>
          <h2 className="text-sm font-semibold">{t("Redirecionador de grupos")}</h2>
          <Link href="/redirecionador" className={verTudo}>{t("abrir")} →</Link>
        </header>
        {!funis ? indisponivel : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-zinc-500">
                <th className="px-4 pb-1 pt-3 font-medium">{t("Funil")}</th>
                <th className="px-2 pb-1 pt-3 font-medium">{t("Grupo da vez")}</th>
                <th className="px-4 pb-1 pt-3 text-right font-medium">{t("Hoje")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {funis.map((f) => {
                const pct = f.cliques != null ? Math.min(100, Math.round((100 * f.cliques) / Math.max(1, f.limite))) : 0;
                return (
                  <tr key={f.slug}>
                    <td className="px-4 py-2.5 align-top font-medium">{f.nome}</td>
                    <td className="px-2 py-2.5 align-top">
                      {f.grupo ? (
                        <>
                          <div className="truncate">{f.grupo}</div>
                          <div className="mt-1 h-1.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-800">
                            <div className={`h-full rounded-full ${pct >= 90 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
                          </div>
                          <div className="tabular mt-0.5 text-xs text-zinc-500">{numero(f.cliques)} / {numero(f.limite)} · {t("{n} na fila", { n: f.naFila })}</div>
                        </>
                      ) : (
                        <span className="text-rose-600 dark:text-rose-400">{t("Sem grupo na fila")}</span>
                      )}
                    </td>
                    <td className="tabular px-4 py-2.5 text-right align-top">
                      <div className="font-semibold">{numero(f.hoje)}</div>
                      <div className="text-xs text-zinc-500">{t("{n} na última hora", { n: numero(f.ultimaHora) })}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className={cartao}>
        <header className={cab}>
          <h2 className="text-sm font-semibold">{t("Grupo gratuito")}</h2>
          <Link href="/grupo" className={verTudo}>{t("abrir")} →</Link>
        </header>
        {!grupo ? indisponivel : (
          <div className="grid flex-1 grid-cols-2 gap-px bg-zinc-100 dark:bg-zinc-800">
            <div className="bg-white p-4 dark:bg-zinc-900">
              <div className="text-xs text-zinc-500">{t("Inscrições hoje")}</div>
              <div className="tabular mt-1 text-2xl font-semibold text-emerald-600 dark:text-emerald-400">{numero(grupo.hoje)}</div>
            </div>
            <div className="bg-white p-4 dark:bg-zinc-900">
              <div className="text-xs text-zinc-500">{t("Últimos 7 dias")}</div>
              <div className="tabular mt-1 text-2xl font-semibold">{numero(grupo.semana)}</div>
            </div>
            <div className="col-span-2 bg-white px-4 py-3 text-xs text-zinc-500 dark:bg-zinc-900">
              {t("País que mais se inscreveu:")} <span className="text-zinc-800 dark:text-zinc-200">{grupo.pais ? t(grupo.pais) : "—"}</span>
            </div>
          </div>
        )}
      </div>

      <div className={cartao}>
        <header className={cab}>
          <h2 className="text-sm font-semibold">{t("Links curtos · últimas 24h")}</h2>
          <Link href="/links" className={verTudo}>{t("abrir")} →</Link>
        </header>
        {!links ? indisponivel : (
          <div className="flex-1">
            <div className="flex items-baseline justify-between px-4 pt-3">
              <span className="tabular text-2xl font-semibold">{numero(links.cliques24h)}</span>
              <span className="text-xs text-zinc-500">{t("cliques · {n} links ativos", { n: numero(links.ativos) })}</span>
            </div>
            {links.top.length === 0 ? (
              <p className="px-4 py-4 text-sm text-zinc-500">{t("Nenhum clique nas últimas 24h.")}</p>
            ) : (
              <table className="mt-2 w-full table-fixed text-left text-sm">
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {links.top.map((l) => (
                    <tr key={l.slug}>
                      <td className="truncate px-4 py-2 text-zinc-700 dark:text-zinc-300" title={`${links.dominio}/${l.slug}`}>/{l.slug}</td>
                      <td className="tabular w-20 px-4 py-2 text-right font-medium">{numero(l.cliques24h)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
