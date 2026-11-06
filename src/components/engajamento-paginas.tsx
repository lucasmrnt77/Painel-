import { td } from "@/components/ui";
import { numero } from "@/lib/formato";
import { diagnosticar, MIN_VISITAS_ENGAJAMENTO, TEXTO_DIAGNOSTICO, type Diagnostico, type LinhaEngajamento } from "@/lib/engajamento";

type T = (s: string, v?: Record<string, string | number>) => string;

const pct = (p: number, t: number) => (t > 0 ? `${((100 * p) / t).toFixed(1)}%` : "—");
const seg = (v: number | null) => (v == null ? "—" : `${v.toFixed(1)} s`);
const ms = (v: number | null) => (v == null ? "—" : `${(v / 1000).toFixed(1)} s`);

const COR: Record<Diagnostico, string> = {
  poucos_dados: "text-zinc-400",
  ok: "text-zinc-500",
  headline: "text-rose-600 dark:text-rose-400",
  lenta: "text-amber-600 dark:text-amber-400",
  pagina: "text-amber-600 dark:text-amber-400",
  formulario: "text-sky-600 dark:text-sky-400",
};

/**
 * Comportamento na página (053): cada visita cai numa só etapa — inscreveu, começou o formulário e não enviou,
 * saiu em menos de 5 s ou ficou sem tocar no formulário. A maior perda indica onde mexer.
 */
export function EngajamentoPaginas({ linhas, disponivel, desde, nomesPais, t }: {
  linhas: LinhaEngajamento[]; disponivel: boolean; desde: string; nomesPais: Record<string, string>; t: T;
}) {
  return (
    <div className="space-y-3">
      <h2 className="pt-2 text-base font-semibold">{t("Comportamento na página: headline × página × formulário")}</h2>
      {!disponivel ? (
        <p className="text-sm text-zinc-500">{t("Disponível para períodos a partir de {d}: escolha um teste ou um período que comece nesse dia ou depois.", { d: desde.split("-").reverse().join("/") })}</p>
      ) : linhas.length === 0 ? (
        <p className="text-sm text-zinc-500">{t("Ainda sem visitas com o código neste período.")}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 dark:border-zinc-800">
                {[t("Página"), t("País"), t("Visitas"), t("Saiu em < 5 s"), t("Ficou sem tocar no formulário"), t("Começou e não enviou"), t("Inscreveu"),
                  t("Tempo mediano"), t("Rolou ≥ 50%"), t("Carregamento mediano"), t("Onde perde mais")].map((h) => (
                  <th key={h} className="px-4 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const d = diagnosticar(l);
                return (
                  <tr key={`${l.site}${l.landing}${l.pais}`} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60">
                    <td className={`${td} font-medium`}>{l.site}{l.landing === "/" ? "" : l.landing}</td>
                    <td className={td}>{nomesPais[l.pais] ?? l.pais}</td>
                    <td className={`${td} tabular text-right`}>{numero(l.visitas)}{l.comDado < l.visitas && <span className="block text-[10px] text-zinc-400">{t("{n} com dado", { n: numero(l.comDado) })}</span>}</td>
                    <td className={`${td} tabular text-right`}>{pct(l.saiuRapido, l.comDado)}</td>
                    <td className={`${td} tabular text-right`}>{pct(l.ficouSemForm, l.comDado)}</td>
                    <td className={`${td} tabular text-right`}>{pct(l.abandonouForm, l.comDado)}</td>
                    <td className={`${td} tabular text-right`}>{pct(l.inscreveu, l.comDado)}</td>
                    <td className={`${td} tabular text-right`}>{seg(l.medianaSegundos)}</td>
                    <td className={`${td} tabular text-right`}>{pct(l.rolouMetade, l.comDado)}</td>
                    <td className={`${td} tabular text-right`}>{ms(l.medianaCarregamentoMs)}</td>
                    <td className={`${td} text-xs font-medium ${COR[d]}`}>{t(TEXTO_DIAGNOSTICO[d], { n: MIN_VISITAS_ENGAJAMENTO })}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-zinc-500">
        {t("Cada visita entra numa só etapa: inscreveu > começou o formulário e não enviou > saiu em menos de 5 s > ficou sem tocar no formulário. As % somam 100% das visitas com dado (o aviso chega quando a pessoa sai ou troca de aba). Tempo = só com a aba visível. Muita gente saindo em menos de 5 s = a headline / primeira dobra não prende — a não ser que a página demore para abrir (aí o problema é técnico). Muita gente ficando sem tocar no formulário = a página não convence. Muita gente começando e não enviando = atrito no formulário. Diagnóstico com pelo menos {n} visitas.", { n: MIN_VISITAS_ENGAJAMENTO })}
      </p>
    </div>
  );
}
