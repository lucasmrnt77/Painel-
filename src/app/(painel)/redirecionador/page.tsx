import { headers } from "next/headers";
import { db } from "@/lib/supabase";
import { Cartao, Kpi, Tabela, td } from "@/components/ui";
import { AutoAtualizar } from "@/components/auto-atualizar";
import { AcoesGrupo, CopiarLink, FormAdicionar, FormFunil, FormImportar } from "@/components/redirecionador";
import type { Funil, Grupo } from "@/lib/redirecionador";

export const dynamic = "force-dynamic";

type Resumo = { funil: Funil; grupos: Grupo[]; cliques_hoje: number; cliques_1h: number; cliques_sem_grupo_hoje: number };
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

export default async function Redirecionador() {
  const [{ data: resumo, error }, { data: evs }] = await Promise.all([
    db().rpc("redir_resumo"),
    db().from("redir_eventos").select("*").order("criado_em", { ascending: false }).limit(40),
  ]);
  if (error) {
    return <Cartao titulo="Redirecionador de grupos"><p className="text-sm text-rose-600">Aplique a migração 010-redirecionador.sql no Supabase. ({error.message})</p></Cartao>;
  }
  const h = await headers();
  const base = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const funis = (resumo ?? []) as Resumo[];
  const eventos = (evs ?? []) as Evento[];
  const nomeGrupo = (id: number | null) => {
    for (const f of funis) { const g = f.grupos.find((x) => x.id === id); if (g) return g.nome || g.titulo_whatsapp || `#${g.id}`; }
    return id ? `#${id}` : "";
  };

  return (
    <>
      <AutoAtualizar segundos={30} />
      <div>
        <h1 className="text-xl font-semibold">Redirecionador de grupos</h1>
        <p className="text-sm text-zinc-500">Um link por funil. Cada clique vai para o primeiro grupo da fila; o convite é conferido a cada N cliques e o grupo sai da fila quando o convite cai ou quando chega no limite.</p>
      </div>

      {funis.map(({ funil: f, grupos, cliques_hoje, cliques_1h, cliques_sem_grupo_hoje }) => {
        const daVez = grupos.find((g) => g.status === "ativo");
        const naFila = grupos.filter((g) => g.status === "ativo");
        const capacidade = naFila.reduce((s, g) => s + Math.max(0, f.limite_cliques - g.cliques), 0);
        return (
          <section key={f.slug} className="space-y-3">
            <Cartao titulo={`Funil ${f.nome}`} acao={<CopiarLink url={`${base}/g/${f.slug}`} />}>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <Kpi rotulo="Grupo da vez" valor={daVez ? daVez.nome || daVez.titulo_whatsapp || `#${daVez.id}` : "Nenhum"} destaque={daVez ? undefined : "vermelho"}
                  detalhe={daVez ? `${daVez.cliques} de ${f.limite_cliques} cliques` : f.link_reserva ? "indo para o link reserva" : "sem link reserva"} />
                <Kpi rotulo="Grupos na fila" valor={String(naFila.length)} detalhe={`${grupos.length} no total`} destaque={naFila.length <= 1 ? "ambar" : undefined} />
                <Kpi rotulo="Vagas na fila" valor={capacidade.toLocaleString("pt-BR")} detalhe="cliques até acabar" destaque={capacidade < f.limite_cliques ? "ambar" : undefined} />
                <Kpi rotulo="Cliques hoje" valor={cliques_hoje.toLocaleString("pt-BR")} detalhe={cliques_sem_grupo_hoje ? `${cliques_sem_grupo_hoje} sem grupo` : undefined} destaque={cliques_sem_grupo_hoje ? "vermelho" : undefined} />
                <Kpi rotulo="Última hora" valor={cliques_1h.toLocaleString("pt-BR")} />
              </div>
            </Cartao>

            <Cartao titulo={`Grupos — ${f.nome}`}>
              <Tabela cabecalho={["#", "Grupo", "Status", "Cliques", "Convite", "Ações"]} vazio={grupos.length === 0}>
                {grupos.map((g, i) => {
                  const pct = Math.min(100, Math.round((g.cliques / f.limite_cliques) * 100));
                  const s = STATUS[g.status];
                  return (
                    <tr key={g.id} className={g.id === daVez?.id ? "bg-emerald-50/60 dark:bg-emerald-950/30" : ""}>
                      <td className={`${td} tabular text-zinc-500`}>{i + 1}</td>
                      <td className={`${td} max-w-[260px]`}>
                        <div className="truncate font-medium">{g.nome || g.titulo_whatsapp || "Sem nome"}{g.id === daVez?.id && <span className="ml-2 text-xs text-emerald-700 dark:text-emerald-400">← da vez</span>}</div>
                        <a href={`https://chat.whatsapp.com/${g.codigo}`} target="_blank" rel="noreferrer" className="block truncate text-xs text-zinc-500 hover:underline">chat.whatsapp.com/{g.codigo}</a>
                        {g.sendflow_group_id && <div className="text-[11px] text-zinc-400">Sendflow: {g.sendflow_group_id}</div>}
                      </td>
                      <td className={td}>
                        <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${s.cor}`}>{s.rotulo}</span>
                        {g.motivo && <div className="mt-1 text-[11px] text-zinc-500">{g.motivo}</div>}
                      </td>
                      <td className={`${td} min-w-[120px]`}>
                        <div className="tabular text-sm">{g.cliques} <span className="text-zinc-500">/ {f.limite_cliques}</span></div>
                        <div className="mt-1 h-1.5 w-full rounded-full bg-zinc-200 dark:bg-zinc-800">
                          <div className="h-full rounded-full bg-zinc-700 dark:bg-zinc-300" style={{ width: `${pct}%` }} />
                        </div>
                      </td>
                      <td className={`${td} whitespace-nowrap text-xs`}>
                        <div>{g.verificacao ? VERIF[g.verificacao] : "não verificado"}</div>
                        <div className="text-zinc-500">{hora(g.verificado_em)}</div>
                        {g.titulo_whatsapp && <div className="max-w-[160px] truncate text-zinc-500" title={g.titulo_whatsapp}>“{g.titulo_whatsapp}”</div>}
                      </td>
                      <td className={td}><AcoesGrupo id={g.id} status={g.status} temSendflow={!!g.sendflow_group_id} /></td>
                    </tr>
                  );
                })}
              </Tabela>
              <div className="mt-4 grid gap-4 border-t border-zinc-200 pt-4 lg:grid-cols-2 dark:border-zinc-800">
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Adicionar grupos</h3>
                  <FormAdicionar funil={f.slug} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Trazer do Sendflow</h3>
                  <p className="text-xs text-zinc-500">Adiciona os grupos da campanha (com o ID de cada um, necessário para pedir link novo) e atualiza os links que mudaram. Limite do Sendflow: 1 consulta a cada 10 min.</p>
                  <FormImportar funil={f.slug} temCampanha={!!f.sendflow_release_id} />
                </div>
              </div>
            </Cartao>

            <details className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <summary className="cursor-pointer text-sm font-semibold">Configuração do funil {f.nome}</summary>
              <div className="mt-4"><FormFunil funil={f} /></div>
            </details>
          </section>
        );
      })}

      <Cartao titulo="Histórico">
        <Tabela cabecalho={["Quando", "Funil", "O que aconteceu", "Grupo", "Detalhe"]} vazio={eventos.length === 0}>
          {eventos.map((e) => (
            <tr key={e.id}>
              <td className={`${td} tabular whitespace-nowrap`}>{hora(e.criado_em)}</td>
              <td className={td}>{e.funil}</td>
              <td className={`${td} whitespace-nowrap`}>{EVENTO[e.tipo] ?? e.tipo}</td>
              <td className={td}>{nomeGrupo(e.grupo_id)}</td>
              <td className={`${td} max-w-[320px] truncate text-xs text-zinc-500`} title={JSON.stringify(e.detalhe)}>
                {e.tipo === "cheio" ? `${e.detalhe.cliques} cliques` : e.tipo === "link_novo" ? `origem: ${e.detalhe.origem}` : e.tipo === "invalido" ? String(e.detalhe.detalhe ?? "") : e.tipo === "redefinicao_pedida" ? `${e.detalhe.manual ? "pedido manual" : "automático"} · Sendflow respondeu ${e.detalhe.http ?? "?"}: ${String(e.detalhe.resposta ?? "").slice(0, 160)}` : e.tipo === "importacao" ? `${e.detalhe.grupos} grupos · ${e.detalhe.novos} novos · ${e.detalhe.atualizados} atualizados${e.detalhe.sem_gid ? ` · ${e.detalhe.sem_gid} sem gid (campos: ${(e.detalhe.campos as string[] ?? []).join(", ")})` : ""}` : e.tipo === "sem_grupos" ? (e.detalhe.reserva ? "indo para o link reserva" : "sem link reserva") : JSON.stringify(e.detalhe)}
              </td>
            </tr>
          ))}
        </Tabela>
      </Cartao>
    </>
  );
}
