import Link from "next/link";
import { dadosOp, SLUG_OP, type LeadOp } from "@/lib/op-futuros";
import { FUSO_GRUPO } from "@/lib/grupo-filtros";
import { dataHora, numero } from "@/lib/formato";
import { Cartao, Kpi, montarHref, td } from "@/components/ui";
import { tradutor } from "@/lib/i18n/servidor";
import type { Busca } from "@/lib/contexto";

/** Dimensões da Análise para a OP Futuros (dados da página do grupo gratuito). */
const DIMS: Record<string, { rotulo: string; chave: (l: LeadOp) => string; porChave?: boolean }> = {
  pais: { rotulo: "País", chave: (l) => l.pais ?? "(sem país)" },
  anuncio: { rotulo: "Anúncio", chave: (l) => l.utm_content ?? "(sem UTM)" },
  conjunto: { rotulo: "Conjunto", chave: (l) => l.utm_source ?? "(sem UTM)" },
  campanha_meta: { rotulo: "Campanha (Meta)", chave: (l) => l.utm_campaign ?? "(sem UTM)" },
  grupo: { rotulo: "Grupo", chave: (l) => l.grupo_nome ?? "(não entrou)" },
  dia: { rotulo: "Dia", chave: (l) => diaUY(l.inscrito_em), porChave: true },
  hora: { rotulo: "Hora do dia", chave: (l) => `${horaUY(l.inscrito_em)}h`, porChave: true },
  dia_semana: { rotulo: "Dia da semana", chave: (l) => semanaUY(l.inscrito_em), porChave: true },
};

const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-CA", { timeZone: FUSO_GRUPO, ...o });
const diaUY = (iso: string) => fmt({ year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const horaUY = (iso: string) => fmt({ hour: "2-digit", hourCycle: "h23" }).format(new Date(iso)).padStart(2, "0");
const SEMANA = ["1 Seg", "2 Ter", "3 Qua", "4 Qui", "5 Sex", "6 Sáb", "7 Dom"];
const semanaUY = (iso: string) => {
  const d = new Date(`${diaUY(iso)}T12:00:00Z`).getUTCDay();
  return SEMANA[(d + 6) % 7];
};
const um = (sp: Busca, k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) ?? undefined;
const entrou = (l: LeadOp) => l.status === "no_grupo" || l.status === "saiu";

export async function AnaliseOp({ sp, seletor }: { sp: Busca; seletor: React.ReactNode }) {
  const t = await tradutor();
  const op = await dadosOp();
  const por = DIMS[um(sp, "por") ?? ""] ? um(sp, "por")! : "anuncio";
  const pais = um(sp, "pais");
  const de = um(sp, "de");
  const ate = um(sp, "ate");

  const base = op.leads.filter((l) => l.conta);
  const filtrados = base.filter((l) => (!pais || (l.pais ?? "(sem país)") === pais) && (!de || diaUY(l.inscrito_em) >= de) && (!ate || diaUY(l.inscrito_em) <= ate));
  const noGrupo = filtrados.filter(entrou).length;

  const mapa = new Map<string, { leads: number; noGrupo: number }>();
  for (const l of filtrados) {
    const k = DIMS[por].chave(l);
    const g = mapa.get(k) ?? { leads: 0, noGrupo: 0 };
    g.leads++;
    if (entrou(l)) g.noGrupo++;
    mapa.set(k, g);
  }
  const grupos = [...mapa.entries()].map(([chave, g]) => ({ chave, ...g, pct: (100 * g.noGrupo) / g.leads, share: (100 * g.leads) / (filtrados.length || 1) }));
  if (DIMS[por].porChave) grupos.sort((a, b) => a.chave.localeCompare(b.chave));
  else grupos.sort((a, b) => b.leads - a.leads);
  const maxLeads = Math.max(1, ...grupos.map((g) => g.leads));
  const paises = [...new Set(base.map((l) => l.pais ?? "(sem país)"))].sort();

  const estado = { l: SLUG_OP, por, pais, de, ate };
  const href = (extra: Record<string, string | undefined>) => montarHref("/analise", { ...estado, ...extra });
  const campo = "rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950";
  const temFiltro = !!(pais || de || ate);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t("Análise")}</h1>
          <p className="text-sm text-zinc-500">{t("OP Futuros — grupo gratuito")} · {t("taxa de entrada no grupo por dimensão")}</p>
        </div>
        {seletor}
      </div>

      {!op.ok && <p className="rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-300">{t("Não consegui cruzar inscrições e grupo.")} {op.erro}</p>}
      {op.ok && !op.webhookLigado && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-zinc-400">
          <span className="font-medium text-amber-300">{t("Entradas no grupo ainda não aparecem.")}</span>{" "}
          {t("A taxa de entrada começa a ser calculada quando o webhook da campanha OP - FUTUROS mandar o primeiro evento.")}
        </p>
      )}
      {op.corte && (
        <p className="text-xs text-zinc-500">
          {t("As taxas contam as inscrições desde {d}, quando o webhook começou a mandar entradas ({n} inscritos). Para incluir quem entrou antes, importe a lista de membros em Inscritos x grupo.", { d: dataHora(op.corte), n: numero(base.length) })}
        </p>
      )}

      <Cartao>
        <form action="/analise" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="l" value={SLUG_OP} />
          <input type="hidden" name="por" value={por} />
          <label className="space-y-1 text-xs text-zinc-500">
            <span className="block">{t("País")}</span>
            <select name="pais" defaultValue={pais ?? ""} className={`${campo} max-w-44`}>
              <option value="">{t("Todos")}</option>
              {paises.map((o) => <option key={o} value={o}>{t(o)}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs text-zinc-500"><span className="block">{t("De")}</span><input type="date" name="de" defaultValue={de} className={campo} /></label>
          <label className="space-y-1 text-xs text-zinc-500"><span className="block">{t("Até")}</span><input type="date" name="ate" defaultValue={ate} className={campo} /></label>
          <button className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">{t("Filtrar")}</button>
          {temFiltro && <Link href={montarHref("/analise", { l: SLUG_OP, por })} className="px-2 py-1.5 text-sm text-zinc-500 hover:underline">{t("limpar")}</Link>}
        </form>
      </Cartao>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi rotulo={t("Leads (pessoas únicas)")} valor={numero(filtrados.length)} detalhe={temFiltro ? t("de {n} no total", { n: numero(base.length) }) : undefined} />
        <Kpi rotulo={t("Entraram no grupo")} valor={numero(noGrupo)} destaque="verde" />
        <Kpi rotulo={t("Taxa de entrada")} valor={filtrados.length ? `${((100 * noGrupo) / filtrados.length).toFixed(1)}%` : "—"} />
        <Kpi rotulo={t("Itens na tabela")} valor={numero(grupos.length)} detalhe={t(DIMS[por].rotulo)} />
      </div>

      <Cartao>
        <div className="mb-3 flex flex-wrap gap-2">
          {Object.entries(DIMS).map(([k, d]) => (
            <Link key={k} href={href({ por: k })} className={`rounded-full border px-3 py-1 text-xs font-medium ${k === por ? "border-emerald-600 bg-emerald-600 text-white" : "border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"}`}>
              {t(d.rotulo)}
            </Link>
          ))}
        </div>
        <div className="-mx-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-zinc-800">
                <th className="px-4 py-2 font-medium">{t(DIMS[por].rotulo)}</th>
                <th className="px-4 py-2 font-medium text-right">Leads</th>
                <th className="px-4 py-2 font-medium">{t("% do total")}</th>
                <th className="px-4 py-2 font-medium text-right">{t("No grupo")}</th>
                <th className="px-4 py-2 font-medium text-right">{t("Taxa de entrada")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {grupos.slice(0, 300).map((g) => {
                const pouco = g.leads < 30;
                const corTaxa = pouco ? "text-zinc-400" : g.pct >= 90 ? "text-emerald-700 dark:text-emerald-400" : g.pct < 75 ? "text-rose-700 dark:text-rose-400" : "";
                return (
                  <tr key={g.chave} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                    <td className={`${td} max-w-md break-words`}>{t(g.chave)}</td>
                    <td className={`${td} tabular text-right`}>{numero(g.leads)}</td>
                    <td className={td}>
                      <div className="flex items-center gap-2">
                        <div className="h-2 rounded-sm bg-zinc-400" style={{ width: `${Math.max(2, (100 * g.leads) / maxLeads) * 0.6}%` }} />
                        <span className="tabular text-xs text-zinc-500">{g.share.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className={`${td} tabular text-right`}>{numero(g.noGrupo)}</td>
                    <td className={`${td} tabular text-right font-medium ${corTaxa}`} title={pouco ? t("Menos de 30 leads: taxa pouco confiável") : undefined}>{g.pct.toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {grupos.length === 0 && <p className="px-4 py-8 text-center text-sm text-zinc-500">{t("Nenhum lead com esses filtros.")}</p>}
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          {t("Cada pessoa conta uma vez (primeira inscrição). \"No grupo\" inclui quem entrou e depois saiu. Taxas em cinza têm menos de 30 leads. Verde ≥ 90%, vermelho < 75%.")}
        </p>
      </Cartao>
    </>
  );
}
