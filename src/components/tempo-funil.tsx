import { td } from "@/components/ui";
import { numero } from "@/lib/formato";
import { PAISES_TEMPO, SITES_TEMPO, type TempoFunil } from "@/lib/engajamento";

type T = (s: string, v?: Record<string, string | number>) => string;

const seg = (v: number | null) => (v == null ? "—" : `${v.toFixed(v < 10 ? 1 : 0)} s`);
const pct = (p: number, t: number) => (t > 0 ? `${Math.round((100 * p) / t)}%` : "—");

/**
 * Tempo na página por funil × país (058): mediana do tempo com a aba visível, todas as variações juntas.
 * Para comparar países e funis sem precisar abrir variação por variação.
 */
export function TempoFunil({ linhas, nomesPais, t }: { linhas: TempoFunil[]; nomesPais: Record<string, string>; t: T }) {
  const cel = (site: string, pais: string) => linhas.find((l) => l.site === site && l.pais === pais);
  const sites = SITES_TEMPO.filter((s) => linhas.some((l) => l.site === s));
  if (sites.length === 0) return null;
  return (
    <div className="space-y-2">
      <h2 className="pt-2 text-base font-semibold">{t("Tempo na página por funil e país")}</h2>
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800">
              <th className="px-4 py-2 font-medium">{t("Funil")}</th>
              {PAISES_TEMPO.map((p) => <th key={p} className="px-4 py-2 text-right font-medium">{p === "Todos" ? t("Todos os países") : (nomesPais[p] ?? p)}</th>)}
            </tr>
          </thead>
          <tbody>
            {sites.map((s) => (
              <tr key={s} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60">
                <td className={`${td} font-medium`}>{s}</td>
                {PAISES_TEMPO.map((p) => {
                  const c = cel(s, p);
                  return (
                    <td key={p} className={`${td} text-right ${p === "Todos" ? "bg-zinc-50 dark:bg-zinc-800/40" : ""}`}>
                      {!c || c.comTempo === 0 ? <span className="text-zinc-400">—</span> : (
                        <>
                          <div className="tabular font-semibold">{seg(c.medianaSegundos)}</div>
                          <div className="tabular text-[11px] text-zinc-500">{t("{s} saiu em < 5 s", { s: pct(c.saiuRapido, c.comTempo) })}</div>
                          <div className="tabular text-[11px] text-zinc-400">{t("{n} visitas · {i} inscritos", { n: numero(c.visitas), i: pct(c.inscreveu, c.visitas) })}</div>
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-500">
        {t("Tempo mediano com a aba visível (metade das visitas ficou menos que isso), todas as variações da página juntas. \"Saiu em < 5 s\" = saiu sem se inscrever antes de 5 segundos. \"Inscritos\" = visitas que viraram inscrição. País pelo IP da visita. Medido desde 05/11/2026. Para ver por variação, use a tabela de comportamento abaixo.")}
      </p>
    </div>
  );
}
