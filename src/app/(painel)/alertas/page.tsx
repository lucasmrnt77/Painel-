import Link from "next/link";
import { contexto, param } from "@/lib/contexto";
import { db } from "@/lib/supabase";
import { grupoGratuito, situacaoMonitor, ultimosAlertas, type SituacaoMonitor } from "@/lib/dados";
import { grupoConfigurado, rpcGrupo } from "@/lib/grupo";
import { modoEnvio } from "@/lib/whatsapp";
import { dataHora } from "@/lib/formato";
import { duracao } from "@/lib/mensagens";
import { CartaoMonitor } from "@/components/monitor";
import { FormAlertas } from "@/components/formularios";
import { CartaoEnvioAlertas } from "@/components/envio-alertas";
import { AutoAtualizar } from "@/components/auto-atualizar";
import { Cartao, Tabela, td } from "@/components/ui";
import { CabecalhoPagina } from "@/components/cabecalho";
import { TestesEventos } from "@/components/testes";
import { historicoTestes, type Execucao } from "@/lib/testes-eventos";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // botão "Rodar testes agora"

type Historico = { quando: string; origem: string; tipo: string; texto: string; envio: string | null };

const ROTULO_TIPO: Record<string, { rotulo: string; cor: string }> = {
  sem_entradas: { rotulo: "Sem entradas", cor: "text-rose-600 dark:text-rose-400" },
  entradas_retomadas: { rotulo: "Retomadas", cor: "text-emerald-600 dark:text-emerald-400" },
  resumo: { rotulo: "Resumo", cor: "text-sky-600 dark:text-sky-400" },
  teste: { rotulo: "Teste", cor: "text-zinc-500" },
  cheio: { rotulo: "Grupo cheio", cor: "text-amber-600 dark:text-amber-400" },
  invalido: { rotulo: "Convite inválido", cor: "text-rose-600 dark:text-rose-400" },
  sem_grupos: { rotulo: "Sem grupos", cor: "text-rose-600 dark:text-rose-400" },
  link_novo: { rotulo: "Link novo", cor: "text-emerald-600 dark:text-emerald-400" },
  redefinicao_sem_retorno: { rotulo: "Sendflow sem retorno", cor: "text-amber-600 dark:text-amber-400" },
  redefinicao_falhou: { rotulo: "Sendflow recusou", cor: "text-amber-600 dark:text-amber-400" },
  testes_falharam: { rotulo: "Eventos Meta com erro", cor: "text-rose-600 dark:text-rose-400" },
  testes_voltaram: { rotulo: "Eventos Meta ok de novo", cor: "text-emerald-600 dark:text-emerald-400" },
};
const ENVIO: Record<string, string> = { enviado: "enviado", parcial: "envio parcial", falhou: "falhou", sem_envio: "só no painel", pendente: "enviando" };

/** Inscrições da página do grupo nos últimos 20 e 60 min (banco da captura-grupo). */
async function inscricoesGrupo(): Promise<{ ultimos20: number; ultimos60: number } | null> {
  if (!grupoConfigurado()) return null;
  const desde = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
  const args = (min: number) => ({ p_desde: desde(min), p_ate: null, p_pais: null, p_source: null, p_campaign: null, p_content: null });
  try {
    const [a, b] = await Promise.all([rpcGrupo<{ total: number }>("painel_resumo", args(20)), rpcGrupo<{ total: number }>("painel_resumo", args(60))]);
    return { ultimos20: a.total, ultimos60: b.total };
  } catch {
    return null;
  }
}

/** Testes automáticos dos eventos; null se a migração 014 ainda não foi aplicada. */
async function testes(): Promise<{ servidor: Execucao | null; navegador: Execucao | null; historico: Execucao[] } | null> {
  try {
    const h = await historicoTestes(30);
    return { servidor: h.find((e) => e.origem === "servidor") ?? null, navegador: h.find((e) => e.origem === "navegador") ?? null, historico: h.slice(0, 14) };
  } catch {
    return null;
  }
}

async function historico(nomes: Map<number, string>): Promise<Historico[]> {
  const [mon, redir, tst] = await Promise.all([
    db().from("alertas").select("lancamento_id, tipo, mensagem, criado_em, envio_status").order("id", { ascending: false }).limit(40),
    db().from("redir_eventos").select("funil, tipo, detalhe, criado_em, alertado_em").eq("alertar", true).order("criado_em", { ascending: false }).limit(20),
    // Testes dos eventos que geraram aviso (falha, ou volta ao normal); sem a migração 014 vem erro e é ignorado
    db().from("testes_execucoes").select("origem, ok, falhas, total, criado_em, detalhes, envio_status").not("envio_status", "is", null).order("criado_em", { ascending: false }).limit(20),
  ]);
  const itens: Historico[] = [];
  for (const a of (mon.data ?? []) as { lancamento_id: number; tipo: string; mensagem: string; criado_em: string; envio_status: string }[]) {
    itens.push({ quando: a.criado_em, origem: nomes.get(a.lancamento_id) ?? `#${a.lancamento_id}`, tipo: a.tipo, texto: a.mensagem.split("\n").slice(1).join(" · ").replace(/\*/g, ""), envio: a.envio_status });
  }
  for (const e of (redir.data ?? []) as { funil: string; tipo: string; detalhe: Record<string, unknown>; criado_em: string; alertado_em: string | null }[]) {
    const grupo = typeof e.detalhe?.grupo === "string" ? e.detalhe.grupo : "";
    itens.push({ quando: e.criado_em, origem: `Redirecionador ${e.funil}`, tipo: e.tipo, texto: grupo, envio: e.alertado_em ? "enviado" : "pendente" });
  }
  for (const t of (tst.data ?? []) as { origem: string; ok: boolean; falhas: number; total: number; criado_em: string; detalhes: { teste: string; motivo: string }[]; envio_status: string }[]) {
    const primeira = t.detalhes?.[0];
    itens.push({
      quando: t.criado_em, origem: `Testes · ${t.origem}`, tipo: t.ok ? "testes_voltaram" : "testes_falharam",
      texto: t.ok ? `${t.total} verificações ok` : `${t.falhas}/${t.total} falharam${primeira ? ` · ${primeira.teste}: ${primeira.motivo}` : ""}`,
      envio: t.envio_status,
    });
  }
  return itens.sort((a, b) => b.quando.localeCompare(a.quando)).slice(0, 40);
}

function Estado({ s, nome }: { s: SituacaoMonitor | null; nome: string }) {
  if (!s) return null;
  const min = s.minutos_desde_ultima_entrada;
  const alerta = s.monitor_ativo && min != null && min >= s.alerta_minutos_sem_entrada;
  return (
    <div className={`rounded-xl border p-4 ${alerta ? "border-rose-500/40 bg-rose-500/5" : s.monitor_ativo ? "border-emerald-500/30 bg-emerald-500/5" : "border-zinc-800 bg-zinc-900"}`}>
      <div className="flex items-center gap-2 text-xs text-zinc-400">
        <span className={`h-2 w-2 rounded-full ${s.monitor_ativo ? (alerta ? "bg-rose-500" : "animate-pulse bg-emerald-500") : "bg-zinc-600"}`} />
        {nome}
      </div>
      <div className="mt-1 text-lg font-semibold">
        {!s.monitor_ativo ? "Monitor desligado" : alerta ? `Sem entradas há ${duracao(min!)}` : "Tudo certo"}
      </div>
      <div className="text-xs text-zinc-500">
        {s.monitor_ativo ? `alerta após ${duracao(s.alerta_minutos_sem_entrada)} sem entradas` : "ligue no cartão abaixo"}
        {s.ultima_entrada_em ? ` · última entrada ${dataHora(s.ultima_entrada_em)}` : ""}
      </div>
    </div>
  );
}

export default async function Alertas({ searchParams }: PageProps<"/alertas">) {
  const sp = await searchParams;
  const { resumos, atual } = await contexto(sp);
  const grupo = await grupoGratuito();
  const modo = modoEnvio();

  const [sLanc, aLanc, sGrupo, aGrupo, inscGrupo] = await Promise.all([
    atual ? situacaoMonitor(atual.lancamento_id) : null,
    atual ? ultimosAlertas(atual.lancamento_id) : [],
    grupo ? situacaoMonitor(grupo.id) : null,
    grupo ? ultimosAlertas(grupo.id) : [],
    grupo ? inscricoesGrupo() : null,
  ]);
  const nomes = new Map<number, string>(resumos.map((r) => [r.lancamento_id, r.nome]));
  if (grupo) nomes.set(grupo.id, grupo.nome);
  const [hist, tst] = await Promise.all([historico(nomes), testes()]);

  return (
    <>
      <AutoAtualizar segundos={60} />
      <CabecalhoPagina titulo="Alertas" resumos={resumos} atual={atual} />
      <p className="-mt-2 text-sm text-zinc-500">
        Avisos no WhatsApp quando ninguém entra no grupo por um tempo, resumos periódicos e os avisos do redirecionador. O monitor
        confere a cada 2 minutos.
      </p>

      <section className="grid gap-3 md:grid-cols-2">
        <Estado s={sLanc} nome={atual ? `Lançamento · ${atual.nome}` : "Lançamento"} />
        <Estado s={sGrupo} nome="Grupo gratuito" />
      </section>

      <section id="testes" className="scroll-mt-6 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Testes diários dos eventos Meta</h2>
        <Cartao>
          {tst ? <TestesEventos {...tst} /> : (
            <p className="text-sm text-zinc-400">Aplique a migração <code>014-testes-automaticos.sql</code> no Supabase do painel para ver os testes.</p>
          )}
        </Cartao>
      </section>

      {atual && sLanc && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Lançamento · {atual.nome}</h2>
          <CartaoMonitor s={sLanc} alertas={aLanc} modo={modo} titulo={`Monitor — ${atual.nome}`} />
          <Cartao titulo="Configuração dos alertas do lançamento">
            <FormAlertas id={atual.lancamento_id} alertaMinutos={sLanc.alerta_minutos_sem_entrada} resumoMinutos={sLanc.resumo_minutos} telefones={sLanc.alerta_telefones} />
          </Cartao>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Grupo gratuito</h2>
        {!grupo || !sGrupo ? (
          <Cartao>
            <p className="text-sm text-zinc-400">Aplique a migração <code>013-alertas-grupo-gratuito.sql</code> no Supabase do painel para monitorar o grupo gratuito.</p>
          </Cartao>
        ) : (
          <>
            {!grupo.sendflow_ref && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-200">
                <p className="font-medium">Falta ligar o grupo gratuito ao Sendflow</p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-amber-100/80">
                  <li>No Sendflow, na campanha do grupo gratuito, cadastre o mesmo webhook usado nas campanhas dos lançamentos (entrada e saída).</li>
                  <li>Abaixo, preencha o nome da campanha exatamente como aparece no Sendflow e salve.</li>
                  <li>Ligue o monitor. Quando alguém entrar no grupo, a entrada aparece aqui.</li>
                </ol>
              </div>
            )}
            <CartaoMonitor s={sGrupo} alertas={aGrupo} modo={modo} titulo="Monitor — Grupo gratuito" inscricoes={inscGrupo} />
            <Cartao titulo="Configuração dos alertas do grupo gratuito">
              <FormAlertas id={grupo.id} alertaMinutos={sGrupo.alerta_minutos_sem_entrada} resumoMinutos={sGrupo.resumo_minutos}
                telefones={sGrupo.alerta_telefones} referencia={{ valor: grupo.sendflow_ref }} />
            </Cartao>
          </>
        )}
      </section>

      <Cartao titulo="Histórico de alertas" acao={<Link href="/redirecionador" className="text-xs text-emerald-700 hover:underline dark:text-emerald-400">redirecionador →</Link>}>
        <Tabela cabecalho={["Quando", "Origem", "Alerta", "Detalhe", "Envio"]} vazio={hist.length === 0}>
          {hist.map((h, i) => (
            <tr key={i} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
              <td className={`${td} tabular whitespace-nowrap text-zinc-500`}>{dataHora(h.quando)}</td>
              <td className={`${td} whitespace-nowrap`}>{h.origem}</td>
              <td className={`${td} whitespace-nowrap font-medium ${ROTULO_TIPO[h.tipo]?.cor ?? ""}`}>{ROTULO_TIPO[h.tipo]?.rotulo ?? h.tipo}</td>
              <td className={`${td} max-w-[520px] truncate text-zinc-400`} title={h.texto}>{h.texto || "—"}</td>
              <td className={`${td} whitespace-nowrap text-xs text-zinc-500`}>{h.envio ? ENVIO[h.envio] ?? h.envio : "—"}</td>
            </tr>
          ))}
        </Tabela>
      </Cartao>

      <CartaoEnvioAlertas verSendflow={param(sp, "sendflow") === "1"} />
    </>
  );
}
