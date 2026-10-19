import { db } from "@/lib/supabase";
import { Cartao, Chips, Tabela, montarHref, td } from "@/components/ui";
import { AutoAtualizar } from "@/components/auto-atualizar";
import { AcoesGrupo, FormAdicionar, FormImportar } from "@/components/redirecionador";
import { SubmenuRedirecionador } from "@/components/redirecionador-submenu";
import type { Funil, Grupo } from "@/lib/redirecionador";
import { tradutor } from "@/lib/i18n/servidor";
import { traduzirDetalhe } from "@/lib/testes-casos";

export const dynamic = "force-dynamic";

type Resumo = { funil: Funil & { criado_em?: string }; grupos: Grupo[] };
type Evento = { id: number; criado_em: string; funil: string; grupo_id: number | null; tipo: string; detalhe: Record<string, unknown> };

const STATUS: Record<string, { rotulo: string; cor: string }> = {
  ativo: { rotulo: "Na fila", cor: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  cheio: { rotulo: "Cheio", cor: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
  invalido: { rotulo: "Convite inválido", cor: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300" },
  redefinindo: { rotulo: "Aguardando Sendflow", cor: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300" },
  pausado: { rotulo: "Pausado", cor: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-300" },
};
const VERIF: Record<string, string> = { valido: "✅ válido", invalido: "🚫 inválido", inconclusivo: "❔ inconclusivo" };
const EVENTO: Record<string, string> = {
  cheio: "📦 Grupo cheio", invalido: "🚫 Convite inválido", link_novo: "🔗 Link novo", sem_grupos: "🆘 Sem grupos",
  redefinicao_pedida: "🔄 Atualização pedida ao Sendflow", link_mantido: "✔️ Link continua o mesmo", importacao: "📥 Importação do Sendflow", redefinicao_falhou: "⚠️ Sendflow recusou", redefinicao_sem_retorno: "⚠️ Sendflow sem retorno",
};

const hora = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Montevideo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "—";

export default async function GruposRedirecionador({ searchParams }: PageProps<"/redirecionador/grupos">) {
  const t = await tradutor();
  const sp = (await searchParams) as { funil?: string; status?: string };
  const { data: resumo, error } = await db().rpc("redir_resumo");
  if (error) {
    return <Cartao titulo={t("Redirecionador de grupos")}><p className="text-sm text-rose-600">{t("Aplique a migração {m} no Supabase.", { m: "010-redirecionador.sql" })} ({error.message})</p></Cartao>;
  }
  const todos = ((resumo ?? []) as Resumo[]).sort((a, b) => String(a.funil.criado_em ?? "").localeCompare(String(b.funil.criado_em ?? "")) || a.funil.nome.localeCompare(b.funil.nome));
  const atual = todos.some((r) => r.funil.slug === sp.funil) ? sp.funil! : null;
  const status = sp.status && STATUS[sp.status] ? sp.status : null;
  const mostrar = atual ? todos.filter((r) => r.funil.slug === atual) : todos;

  let q = db().from("redir_eventos").select("*").order("criado_em", { ascending: false }).limit(40);
  if (atual) q = q.eq("funil", atual);
  const { data: evs } = await q;
  const eventos = (evs ?? []) as Evento[];

  const nomeFunil = (slug: string) => todos.find((r) => r.funil.slug === slug)?.funil.nome ?? slug;
  const nomeGrupo = (id: number | null) => {
    for (const r of todos) { const g = r.grupos.find((x) => x.id === id); if (g) return g.nome || g.titulo_whatsapp || `#${g.id}`; }
    return id ? `#${id}` : "";
  };
  const opcoes = todos.map((r) => ({ slug: r.funil.slug, nome: r.funil.nome, temCampanha: !!r.funil.sendflow_release_id }));
  const totalGrupos = todos.reduce((s, r) => s + r.grupos.length, 0);
  const gruposVisiveis = mostrar.flatMap((r) => r.grupos);

  return (
    <>
      <AutoAtualizar segundos={30} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t("Grupos do redirecionador")}</h1>
          <p className="text-sm text-zinc-500">{t("Todos os grupos de cada funil, na ordem da fila, e a importação de grupos novos.")}</p>
        </div>
        <SubmenuRedirecionador ativo="grupos" />
      </div>

      <div className="space-y-2">
        <Chips
          ativo={atual ?? "todos"}
          itens={[
            { valor: "todos", rotulo: t("Todos os funis"), href: montarHref("/redirecionador/grupos", { status }), qtd: totalGrupos },
            ...todos.map((r) => ({ valor: r.funil.slug, rotulo: r.funil.nome, href: montarHref("/redirecionador/grupos", { funil: r.funil.slug, status }), qtd: r.grupos.length })),
          ]}
        />
        <Chips
          ativo={status ?? "todos"}
          itens={[
            { valor: "todos", rotulo: t("Todos os status"), href: montarHref("/redirecionador/grupos", { funil: atual }), qtd: gruposVisiveis.length },
            ...Object.entries(STATUS).map(([k, v]) => ({ valor: k, rotulo: t(v.rotulo), href: montarHref("/redirecionador/grupos", { funil: atual, status: k }), qtd: gruposVisiveis.filter((g) => g.status === k).length })),
          ]}
        />
      </div>

      {mostrar.map(({ funil: f, grupos }) => {
        const daVez = grupos.find((g) => g.status === "ativo");
        const lista = status ? grupos.filter((g) => g.status === status) : grupos;
        return (
          <Cartao key={f.slug} titulo={`${f.nome} — ${t("{n} grupos", { n: grupos.length })}`}>
            <Tabela cabecalho={["#", t("Grupo"), t("Status"), t("Cliques"), t("Convite"), t("Ações")]} vazio={lista.length === 0}>
              {lista.map((g) => {
                const pct = Math.min(100, Math.round((g.cliques / f.limite_cliques) * 100));
                const s = STATUS[g.status];
                const posicao = grupos.findIndex((x) => x.id === g.id) + 1;
                return (
                  <tr key={g.id} className={g.id === daVez?.id ? "bg-emerald-50/60 dark:bg-emerald-950/30" : ""}>
                    <td className={`${td} tabular text-zinc-500`}>{posicao}</td>
                    <td className={`${td} max-w-[260px]`}>
                      <div className="truncate font-medium">{g.nome || g.titulo_whatsapp || t("Sem nome")}{g.id === daVez?.id && <span className="ml-2 text-xs text-emerald-700 dark:text-emerald-400">← {t("da vez")}</span>}</div>
                      <a href={`https://chat.whatsapp.com/${g.codigo}`} target="_blank" rel="noreferrer" className="block truncate text-xs text-zinc-500 hover:underline">chat.whatsapp.com/{g.codigo}</a>
                      {g.sendflow_group_id && <div className="text-[11px] text-zinc-400">Sendflow: {g.sendflow_group_id}</div>}
                    </td>
                    <td className={td}>
                      <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${s.cor}`}>{t(s.rotulo)}</span>
                      {g.motivo && <div className="mt-1 text-[11px] text-zinc-500">{traduzirDetalhe(t, g.motivo)}</div>}
                    </td>
                    <td className={`${td} min-w-[120px]`}>
                      <div className="tabular text-sm">{g.cliques} <span className="text-zinc-500">/ {f.limite_cliques}</span></div>
                      <div className="mt-1 h-1.5 w-full rounded-full bg-zinc-200 dark:bg-zinc-800">
                        <div className="h-full rounded-full bg-zinc-700 dark:bg-zinc-300" style={{ width: `${pct}%` }} />
                      </div>
                    </td>
                    <td className={`${td} whitespace-nowrap text-xs`}>
                      <div>{g.verificacao ? t(VERIF[g.verificacao]) : t("não verificado")}</div>
                      <div className="text-zinc-500">{hora(g.verificado_em)}</div>
                      {g.titulo_whatsapp && <div className="max-w-[160px] truncate text-zinc-500" title={g.titulo_whatsapp}>“{g.titulo_whatsapp}”</div>}
                    </td>
                    <td className={td}><AcoesGrupo id={g.id} status={g.status} temSendflow={!!g.sendflow_group_id} /></td>
                  </tr>
                );
              })}
            </Tabela>
          </Cartao>
        );
      })}

      <section id="importar" className="scroll-mt-4">
        <Cartao titulo={atual ? t("Adicionar grupos ao funil {nome}", { nome: nomeFunil(atual) }) : t("Adicionar grupos")}>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">{t("Colar links")}</h3>
              <p className="text-xs text-zinc-500">{t("Os grupos entram no fim da fila do funil.")}</p>
              <FormAdicionar funis={opcoes} atual={atual} />
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">{t("Trazer do Sendflow")}</h3>
              <p className="text-xs text-zinc-500">{t("Adiciona os grupos da campanha (com o ID de cada um, necessário para pedir link novo) e atualiza os links que mudaram. Limite do Sendflow: 1 consulta a cada 10 min.")}</p>
              <FormImportar funis={opcoes} atual={atual} />
            </div>
          </div>
        </Cartao>
      </section>

      <Cartao titulo={t("Histórico")}>
        <Tabela cabecalho={[t("Quando"), t("Funil"), t("O que aconteceu"), t("Grupo"), t("Detalhe")]} vazio={eventos.length === 0}>
          {eventos.map((e) => (
            <tr key={e.id}>
              <td className={`${td} tabular whitespace-nowrap`}>{hora(e.criado_em)}</td>
              <td className={td}>{nomeFunil(e.funil)}</td>
              <td className={`${td} whitespace-nowrap`}>{EVENTO[e.tipo] ? t(EVENTO[e.tipo]) : e.tipo}</td>
              <td className={td}>{nomeGrupo(e.grupo_id)}</td>
              <td className={`${td} max-w-[320px] truncate text-xs text-zinc-500`} title={JSON.stringify(e.detalhe)}>
                {e.tipo === "cheio" ? t("{n} cliques", { n: String(e.detalhe.cliques) }) : e.tipo === "link_novo" ? t("origem: {o}", { o: String(e.detalhe.origem) }) : e.tipo === "invalido" ? traduzirDetalhe(t, String(e.detalhe.detalhe ?? "")) : e.tipo === "redefinicao_pedida" ? `${e.detalhe.manual ? t("pedido manual") : t("automático")} · ${t("Sendflow respondeu {http}", { http: String(e.detalhe.http ?? "?") })}: ${String(e.detalhe.resposta ?? "").slice(0, 160)}` : e.tipo === "importacao" ? `${t("{g} grupos · {n} novos · {a} atualizados", { g: String(e.detalhe.grupos), n: String(e.detalhe.novos), a: String(e.detalhe.atualizados) })}${e.detalhe.sem_gid ? ` · ${t("{n} sem gid (campos: {c})", { n: String(e.detalhe.sem_gid), c: (e.detalhe.campos as string[] ?? []).join(", ") })}` : ""}` : e.tipo === "sem_grupos" ? (e.detalhe.reserva ? t("indo para o link reserva") : t("sem link reserva")) : JSON.stringify(e.detalhe)}
              </td>
            </tr>
          ))}
        </Tabela>
      </Cartao>
    </>
  );
}
