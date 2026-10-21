import Link from "next/link";
import { db } from "@/lib/supabase";
import { modoEnvio } from "@/lib/whatsapp";
import { duracao } from "@/lib/mensagens";
import { Cartao } from "@/components/ui";
import { AREAS, CATALOGO, comTextos, type Area, type Envio, type ItemCatalogo } from "@/lib/catalogo-alertas";
import { MODELOS_PADRAO, VARIAVEIS, variaveisDesconhecidas, type Modelos } from "@/lib/modelos-alertas";
import { textosAlertas } from "@/lib/textos-alertas";
import { restaurarTextosAlerta, salvarTextosAlerta } from "@/lib/acoes-catalogo-alertas";
import { idiomaAtual, tradutor } from "@/lib/i18n/servidor";

export const dynamic = "force-dynamic";

const ENVIO: Record<Envio, { pt: string; es: string; cor: string }> = {
  whatsapp: { pt: "Vai para o WhatsApp", es: "Va a WhatsApp", cor: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300" },
  condicional: { pt: "WhatsApp às vezes", es: "WhatsApp a veces", cor: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-300" },
  painel: { pt: "Só no painel", es: "Solo en el panel", cor: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
  manual: { pt: "Manual", es: "Manual", cor: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300" },
};

const MODO: Record<string, { pt: string; es: string }> = {
  sendflow_grupo: { pt: "pelo Sendflow, no grupo de alertas da equipe", es: "por Sendflow, en el grupo de alertas del equipo" },
  sendflow_direto: { pt: "pelo Sendflow, direto para os telefones cadastrados no lançamento", es: "por Sendflow, directo a los teléfonos cargados en el lanzamiento" },
  webhook: { pt: "por webhook (Make/n8n)", es: "por webhook (Make/n8n)" },
  nenhum: { pt: "não configurado — as alertas ficam só no painel", es: "no configurado — las alertas quedan solo en el panel" },
};

/** Mostra a mensagem como no WhatsApp: *texto* em negrito. */
function Mensagem({ texto }: { texto: string }) {
  return (
    <div className="whitespace-pre-wrap break-words rounded-lg rounded-tl-none bg-emerald-50 px-3 py-2 text-[13px] leading-relaxed text-zinc-800 dark:bg-emerald-950/40 dark:text-zinc-200">
      {texto.split(/(\*[^*\n]+\*)/g).map((p, i) => (p.startsWith("*") && p.endsWith("*") && p.length > 2 ? <strong key={i}>{p.slice(1, -1)}</strong> : <span key={i}>{p}</span>))}
    </div>
  );
}

type Lanc = { nome: string; tipo: string | null; monitor_ativo: boolean; alerta_minutos_sem_entrada: number; resumo_minutos: number };

export default async function CatalogoAlertas({ searchParams }: PageProps<"/alertas/catalogo">) {
  const t = await tradutor();
  const idioma = (await idiomaAtual()) === "es" ? "es" : "pt";
  const sp = (await searchParams) as { area?: string };
  const area = sp.area && sp.area in AREAS ? (sp.area as Area) : null;
  const L = (x: { pt: string; es: string }) => x[idioma];

  const [{ data }, textos] = await Promise.all([
    db().from("lancamentos").select("nome, tipo, monitor_ativo, alerta_minutos_sem_entrada, resumo_minutos").order("id", { ascending: false }),
    textosAlertas(),
  ]);
  const editados = new Map(textos.map((x) => [x.tipo, x]));
  const modelos: Modelos = {};
  for (const x of textos) if (x.mensagem?.trim()) modelos[x.tipo] = x.mensagem;
  const lancs = (data ?? []) as Lanc[];
  const configAtual = (item: ItemCatalogo): string | null => {
    if (!item.config) return null;
    const alvo = lancs.filter((l) => (item.config === "grupo" ? l.tipo === "grupo_gratuito" : l.tipo !== "grupo_gratuito") && l.monitor_ativo);
    if (alvo.length === 0) return idioma === "es" ? "Monitor apagado en todos." : "Monitor desligado em todos.";
    return alvo.map((l) => `${t(l.nome)}: ${duracao(l.alerta_minutos_sem_entrada)}`).join(" · ");
  };

  const modo = MODO[modoEnvio()] ?? MODO.nenhum;
  const todos = CATALOGO.map((i) => comTextos(i, editados.get(i.tipo)));
  const itens = area ? todos.filter((i) => i.area === area) : todos;
  const areas = (Object.keys(AREAS) as Area[]).filter((a) => itens.some((i) => i.area === a));
  const vaoProWhats = CATALOGO.filter((i) => i.envio === "whatsapp" || i.envio === "condicional").length;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t("Catálogo de alertas")}</h1>
          <p className="text-sm text-zinc-500">
            {idioma === "es"
              ? "Todas las alertas del panel: qué las activa, si van a WhatsApp, el mensaje que se envía hoy y qué revisar para resolver."
              : "Todas as alertas do painel: o que dispara, se vão para o WhatsApp, a mensagem enviada hoje e o que olhar para resolver."}
          </p>
        </div>
        <Link href="/alertas" className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">← {t("Alertas")}</Link>
      </div>

      <Cartao>
        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <div><div className="text-xs text-zinc-500">{idioma === "es" ? "Alertas" : "Alertas"}</div><div className="tabular text-2xl font-semibold">{CATALOGO.length}</div></div>
          <div><div className="text-xs text-zinc-500">{idioma === "es" ? "Van a WhatsApp" : "Vão para o WhatsApp"}</div><div className="tabular text-2xl font-semibold">{vaoProWhats}</div></div>
          <div><div className="text-xs text-zinc-500">{idioma === "es" ? "Envío" : "Envio"}</div><div className="text-sm">{L(modo)}</div></div>
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          {idioma === "es"
            ? "Regla: a WhatsApp solo va lo que dejó de funcionar y necesita un ajuste. Los avisos de que volvió a funcionar y los resúmenes quedan solo en el panel. Los mensajes de ejemplo son los textos reales que el sistema envía hoy, con datos inventados."
            : "Regra: para o WhatsApp só vai o que parou de funcionar e precisa de ajuste. Avisos de que voltou a funcionar e resumos ficam só no painel. As mensagens de exemplo são os textos reais que o sistema envia hoje, com dados inventados."}
        </p>
      </Cartao>

      <nav className="flex flex-wrap gap-2">
        {[null, ...(Object.keys(AREAS) as Area[])].map((a) => {
          const ativo = a === area;
          const n = a ? CATALOGO.filter((i) => i.area === a).length : CATALOGO.length;
          return (
            <Link key={a ?? "todas"} href={a ? `/alertas/catalogo?area=${a}` : "/alertas/catalogo"}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${ativo ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900" : "border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"}`}>
              {a ? L(AREAS[a]) : idioma === "es" ? "Todas" : "Todas"} <span className="tabular opacity-70">{n}</span>
            </Link>
          );
        })}
      </nav>

      {areas.map((a) => (
        <section key={a} className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">{L(AREAS[a])}</h2>
          {itens.filter((i) => i.area === a).map((i) => {
            const e = ENVIO[i.envio];
            const cfg = configAtual(i);
            return (
              <article key={i.tipo} id={i.tipo} className="scroll-mt-4 rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
                  <div className="min-w-0">
                    <h3 className="font-semibold">{L(i.nome)}</h3>
                    <code className="text-[11px] text-zinc-500">{i.tipo}</code>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {(i.editado.mensagem || i.editado.diagnostico || i.editado.verificar) && (
                      <span className="inline-flex rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-800 dark:bg-violet-900/40 dark:text-violet-300">{idioma === "es" ? "Editado" : "Editado"}</span>
                    )}
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${e.cor}`}>{L(e)}</span>
                  </div>
                </header>
                <div className="grid gap-4 p-4 lg:grid-cols-[1fr_minmax(0,380px)]">
                  <dl className="min-w-0 space-y-3 text-sm">
                    <div>
                      <dt className="text-xs font-semibold text-zinc-500">{idioma === "es" ? "Cuándo se activa" : "Quando dispara"}</dt>
                      <dd>{L(i.quando)}</dd>
                      {cfg && <dd className="mt-1 text-xs text-zinc-600 dark:text-zinc-400"><span className="font-medium">{idioma === "es" ? "Plazo configurado ahora" : "Prazo configurado agora"}:</span> {cfg}</dd>}
                    </div>
                    <div>
                      <dt className="text-xs font-semibold text-zinc-500">{idioma === "es" ? "Repetición" : "Repetição"}</dt>
                      <dd>{L(i.repeticao)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold text-zinc-500">WhatsApp</dt>
                      <dd>{L(i.envioDetalhe)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold text-zinc-500">{idioma === "es" ? "Diagnóstico (qué está pasando)" : "Diagnóstico (o que está acontecendo)"}</dt>
                      <dd>{L(i.diagnostico)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold text-zinc-500">{idioma === "es" ? "Qué revisar / cómo resolver" : "O que olhar / como resolver"}</dt>
                      <dd>
                        <ul className="mt-1 list-disc space-y-1 pl-5">
                          {i.verificar[idioma].map((v) => <li key={v}>{v}</li>)}
                        </ul>
                      </dd>
                    </div>
                  </dl>
                  <div className="min-w-0 space-y-1">
                    <div className="text-xs font-semibold text-zinc-500">{idioma === "es" ? "Mensaje actual (ejemplo)" : "Mensagem atual (exemplo)"}</div>
                    <Mensagem texto={i.exemplo(modelos)} />
                  </div>
                </div>
                <Editor item={i} idioma={idioma} modelo={modelos[i.tipo] ?? MODELOS_PADRAO[i.tipo] ?? ""} editado={i.editado} />
              </article>
            );
          })}
        </section>
      ))}
    </>
  );
}

const campoCls = "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950";
const rotuloCls = "text-xs font-semibold text-zinc-500";

/** Formulário para editar a mensagem, o diagnóstico e o "o que olhar" de um alerta. */
function Editor({ item, idioma, modelo, editado }: {
  item: ItemCatalogo; idioma: "pt" | "es"; modelo: string; editado: { mensagem: boolean; diagnostico: boolean; verificar: boolean };
}) {
  const es = idioma === "es";
  const vars = VARIAVEIS[item.tipo] ?? [];
  const desconhecidas = variaveisDesconhecidas(item.tipo, modelo);
  const algum = editado.mensagem || editado.diagnostico || editado.verificar;
  return (
    <details className="border-t border-zinc-200 dark:border-zinc-800">
      <summary className="cursor-pointer select-none px-4 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
        ✏️ {es ? "Editar mensaje, diagnóstico y qué revisar" : "Editar mensagem, diagnóstico e o que olhar"}
      </summary>
      <form action={salvarTextosAlerta} className="space-y-4 px-4 pb-4">
        <input type="hidden" name="tipo" value={item.tipo} />
        <div className="space-y-1">
          <label className={rotuloCls} htmlFor={`m-${item.tipo}`}>
            {es ? "Mensaje (se envía en portugués)" : "Mensagem (enviada em português)"}{editado.mensagem && " · " + (es ? "editado" : "editada")}
          </label>
          <textarea id={`m-${item.tipo}`} name="mensagem" defaultValue={modelo} rows={Math.min(12, modelo.split("\n").length + 2)} className={`${campoCls} font-mono text-[13px]`} />
          <p className="text-xs text-zinc-500">
            {es
              ? "Las palabras entre llaves se reemplazan por los datos reales. *texto* = negrita en WhatsApp. Una línea con variable que queda vacía desaparece."
              : "As palavras entre chaves são trocadas pelos dados reais. *texto* = negrito no WhatsApp. Uma linha com variável que fica vazia some."}
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {vars.map((x) => (
              <li key={x.nome}><code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">{`{${x.nome}}`}</code> <span className="text-zinc-500">{x.desc[idioma]}</span></li>
            ))}
          </ul>
          {desconhecidas.length > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {es ? "Variables que no existen para esta alerta (salen tal cual en el mensaje): " : "Variáveis que não existem para este alerta (saem do jeito que estão na mensagem): "}
              {desconhecidas.map((n) => `{${n}}`).join(", ")}
            </p>
          )}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-1">
            <label className={rotuloCls} htmlFor={`dp-${item.tipo}`}>Diagnóstico — português</label>
            <textarea id={`dp-${item.tipo}`} name="diagnostico_pt" defaultValue={item.diagnostico.pt} rows={3} className={campoCls} />
          </div>
          <div className="space-y-1">
            <label className={rotuloCls} htmlFor={`de-${item.tipo}`}>Diagnóstico — español</label>
            <textarea id={`de-${item.tipo}`} name="diagnostico_es" defaultValue={item.diagnostico.es} rows={3} className={campoCls} />
          </div>
          <div className="space-y-1">
            <label className={rotuloCls} htmlFor={`vp-${item.tipo}`}>{es ? "Qué revisar — portugués (uno por línea)" : "O que olhar — português (um por linha)"}</label>
            <textarea id={`vp-${item.tipo}`} name="verificar_pt" defaultValue={item.verificar.pt.join("\n")} rows={Math.min(10, item.verificar.pt.length + 2)} className={campoCls} />
          </div>
          <div className="space-y-1">
            <label className={rotuloCls} htmlFor={`ve-${item.tipo}`}>{es ? "Qué revisar — español (uno por línea)" : "O que olhar — espanhol (um por linha)"}</label>
            <textarea id={`ve-${item.tipo}`} name="verificar_es" defaultValue={item.verificar.es.join("\n")} rows={Math.min(10, item.verificar.es.length + 2)} className={campoCls} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300">
            {es ? "Guardar" : "Salvar"}
          </button>
          {algum && (
            <button formAction={restaurarTextosAlerta} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
              {es ? "Volver al texto original" : "Voltar ao texto original"}
            </button>
          )}
          <span className="text-xs text-zinc-500">
            {es ? "El mensaje nuevo vale para las próximas alertas (hasta 1 min para aplicarse)." : "A mensagem nova vale para os próximos alertas (até 1 min para valer)."}
          </span>
        </div>
      </form>
    </details>
  );
}
