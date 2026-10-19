import Link from "next/link";
import { dominioLinks } from "@/lib/links";
import { db } from "@/lib/supabase";
import { Cartao } from "@/components/ui";
import { AutoAtualizar } from "@/components/auto-atualizar";
import { CopiarLink, FormFunil, FormNovoFunil } from "@/components/redirecionador";
import { SubmenuRedirecionador } from "@/components/redirecionador-submenu";
import type { Funil, Grupo } from "@/lib/redirecionador";
import { estadoFunil, type NivelFunil } from "@/lib/redir-status";
import { tradutor } from "@/lib/i18n/servidor";

export const dynamic = "force-dynamic";

type Resumo = { funil: Funil & { criado_em?: string }; grupos: Grupo[]; cliques_hoje: number; cliques_1h: number; cliques_sem_grupo_hoje: number };

const COR_NIVEL: Record<NivelFunil, { selo: string; borda: string }> = {
  ok: { selo: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300", borda: "border-l-emerald-500" },
  atencao: { selo: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-300", borda: "border-l-amber-500" },
  parado: { selo: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300", borda: "border-l-rose-500" },
  vazio: { selo: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300", borda: "border-l-zinc-400" },
};

function Dado({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">{rotulo}</div>
      <div className="tabular truncate text-sm font-semibold" title={valor}>{valor}</div>
      {detalhe && <div className="truncate text-[11px] text-zinc-500">{detalhe}</div>}
    </div>
  );
}

export default async function Redirecionador() {
  const t = await tradutor();
  const { data: resumo, error } = await db().rpc("redir_resumo");
  if (error) {
    return <Cartao titulo={t("Redirecionador de grupos")}><p className="text-sm text-rose-600">{t("Aplique a migração {m} no Supabase.", { m: "010-redirecionador.sql" })} ({error.message})</p></Cartao>;
  }
  const dominio = dominioLinks();
  const funis = ((resumo ?? []) as Resumo[]).sort((a, b) => String(a.funil.criado_em ?? "").localeCompare(String(b.funil.criado_em ?? "")) || a.funil.nome.localeCompare(b.funil.nome));
  const estados = funis.map((r) => estadoFunil(r.funil, r.grupos, r.cliques_sem_grupo_hoje));
  const problemas = estados.filter((e) => e.nivel === "parado" || e.nivel === "atencao").length;

  return (
    <>
      <AutoAtualizar segundos={30} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t("Redirecionador de grupos")}</h1>
          <p className="text-sm text-zinc-500">{t("Um link por funil. Cada clique vai para o primeiro grupo da fila; o convite é conferido a cada N cliques e o grupo sai da fila quando o convite cai ou quando chega no limite.")}</p>
        </div>
        <SubmenuRedirecionador ativo="funis" />
      </div>

      <div className="text-sm text-zinc-600 dark:text-zinc-400">
        {t("{n} funis", { n: funis.length })} · {problemas === 0 ? t("todos funcionando") : t("{n} precisam de atenção", { n: problemas })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {funis.map(({ funil: f, grupos, cliques_hoje, cliques_1h }, i) => {
          const e = estados[i];
          const cor = COR_NIVEL[e.nivel];
          const daVez = grupos.find((g) => g.status === "ativo");
          const link = `https://${dominio}/${f.slug}`;
          return (
            <section key={f.slug} className={`flex min-w-0 flex-col rounded-xl border border-l-4 border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 ${cor.borda}`}>
              <header className="space-y-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold">{f.nome}</h2>
                    <div className="text-xs text-zinc-500">{t("Funil")}: <code>{f.slug}</code></div>
                  </div>
                  <span className={`inline-flex shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${cor.selo}`}>{t(e.rotulo)}</span>
                </div>
                <CopiarLink url={link} />
                <p className="text-xs text-zinc-600 dark:text-zinc-400">{t(e.detalhe, e.params)}</p>
              </header>

              <div className="grid grid-cols-2 gap-3 px-4 py-3 sm:grid-cols-4">
                <Dado rotulo={t("Grupo da vez")} valor={daVez ? daVez.nome || daVez.titulo_whatsapp || `#${daVez.id}` : t("Nenhum")}
                  detalhe={daVez ? t("{n} de {limite} cliques", { n: daVez.cliques, limite: f.limite_cliques }) : undefined} />
                <Dado rotulo={t("Grupos na fila")} valor={`${e.naFila} / ${e.total}`} detalhe={e.aguardandoLink ? t("{n} aguardando link", { n: e.aguardandoLink }) : undefined} />
                <Dado rotulo={t("Vagas na fila")} valor={e.vagas.toLocaleString("pt-BR")} detalhe={t("cliques até acabar")} />
                <Dado rotulo={t("Cliques hoje")} valor={cliques_hoje.toLocaleString("pt-BR")} detalhe={t("{n} na última hora", { n: cliques_1h })} />
              </div>

              <dl className="grid grid-cols-1 gap-x-4 gap-y-1 border-t border-zinc-100 px-4 py-3 text-xs sm:grid-cols-2 dark:border-zinc-800">
                <div className="flex min-w-0 gap-1"><dt className="shrink-0 text-zinc-500">{t("Campanha Sendflow")}:</dt><dd className="truncate">{f.sendflow_release_id ? <code>{f.sendflow_release_id}</code> : <span className="text-amber-700 dark:text-amber-400">{t("não conectada")}</span>}</dd></div>
                <div className="flex min-w-0 gap-1"><dt className="shrink-0 text-zinc-500">{t("Link novo automático")}:</dt><dd>{f.auto_redefinir ? t("ligado") : t("desligado")}</dd></div>
                <div className="flex min-w-0 gap-1"><dt className="shrink-0 text-zinc-500">{t("Grupo cheio com")}:</dt><dd className="tabular">{t("{n} cliques", { n: f.limite_cliques })}</dd></div>
                <div className="flex min-w-0 gap-1"><dt className="shrink-0 text-zinc-500">{t("Confere o convite a cada")}:</dt><dd className="tabular">{t("{n} cliques", { n: f.verificar_a_cada })}</dd></div>
                <div className="flex gap-1 sm:col-span-2"><dt className="shrink-0 text-zinc-500">{t("Link reserva")}:</dt><dd className="truncate">{f.link_reserva ?? t("nenhum")}</dd></div>
              </dl>

              <div className="mt-auto space-y-3 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
                <div className="flex flex-wrap gap-2">
                  <Link href={`/redirecionador/grupos?funil=${f.slug}`} className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300">
                    {t("Ver grupos ({n})", { n: e.total })}
                  </Link>
                  <Link href={`/redirecionador/grupos?funil=${f.slug}#importar`} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
                    {t("Adicionar / importar grupos")}
                  </Link>
                </div>
                <details>
                  <summary className="cursor-pointer text-sm font-medium text-zinc-700 dark:text-zinc-300">{t("Editar configuração")}</summary>
                  <div className="mt-3"><FormFunil funil={f} /></div>
                </details>
              </div>
            </section>
          );
        })}

        <section className="rounded-xl border border-dashed border-zinc-300 bg-white p-4 lg:col-span-2 dark:border-zinc-700 dark:bg-zinc-900">
          <details open={funis.length === 0}>
            <summary className="cursor-pointer text-sm font-semibold">+ {t("Novo funil")}</summary>
            <p className="mt-2 text-xs text-zinc-500">{t("Cada funil tem um link próprio e a sua fila de grupos. Depois de criar, adicione ou importe os grupos dele.")}</p>
            <div className="mt-4"><FormNovoFunil dominio={dominio} /></div>
          </details>
        </section>
      </div>
    </>
  );
}
