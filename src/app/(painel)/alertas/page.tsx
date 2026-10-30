import Link from "next/link";
import { contexto, param } from "@/lib/contexto";
import { db } from "@/lib/supabase";
import { grupoGratuito, situacaoMonitor, ultimosAlertas, type SituacaoMonitor } from "@/lib/dados";
import { grupoConfigurado, rpcGrupo, ultimoLeadGrupo } from "@/lib/grupo";
import { situacaoPorLeads } from "@/lib/visao-grupo";
import { modoEnvio } from "@/lib/whatsapp";
import { dataHora } from "@/lib/formato";
import { duracao } from "@/lib/mensagens";
import { CartaoMonitor } from "@/components/monitor";
import { FormAlertas, type ConfigAds } from "@/components/formularios";
import { lerContaMeta, metaContaConfigurada, type ResultadoConta } from "@/lib/meta-conta";
import { minutosDoDia, SITUACAO_CONTA, somaGasto, somaOrcamento } from "@/lib/meta-conta-regras";
import { CartaoEnvioAlertas } from "@/components/envio-alertas";
import { AutoAtualizar } from "@/components/auto-atualizar";
import { Cartao, Tabela, td } from "@/components/ui";
import { CabecalhoPagina } from "@/components/cabecalho";
import { TestesEventos } from "@/components/testes";
import { historicoTestes, type Execucao } from "@/lib/testes-eventos";
import { traduzirDetalhe } from "@/lib/testes-casos";
import { tradutor } from "@/lib/i18n/servidor";
import type { T } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // botão "Rodar testes agora"

type Historico = { quando: string; origem: string; tipo: string; texto: string; envio: string | null };

const ROTULO_TIPO: Record<string, { rotulo: string; cor: string }> = {
  sem_entradas: { rotulo: "Sem entradas", cor: "text-rose-600 dark:text-rose-400" },
  entradas_retomadas: { rotulo: "Retomadas", cor: "text-emerald-600 dark:text-emerald-400" },
  resumo: { rotulo: "Resumo", cor: "text-sky-600 dark:text-sky-400" },
  teste: { rotulo: "Teste", cor: "text-zinc-500" },
  sem_leads: { rotulo: "Sem leads", cor: "text-rose-600 dark:text-rose-400" },
  leads_retomados: { rotulo: "Leads retomados", cor: "text-emerald-600 dark:text-emerald-400" },
  planilha_parada: { rotulo: "Planilha parada", cor: "text-rose-600 dark:text-rose-400" },
  cheio: { rotulo: "Grupo cheio", cor: "text-amber-600 dark:text-amber-400" },
  invalido: { rotulo: "Convite inválido", cor: "text-rose-600 dark:text-rose-400" },
  sem_grupos: { rotulo: "Sem grupos", cor: "text-rose-600 dark:text-rose-400" },
  link_novo: { rotulo: "Link novo", cor: "text-emerald-600 dark:text-emerald-400" },
  redefinicao_sem_retorno: { rotulo: "Sendflow sem retorno", cor: "text-amber-600 dark:text-amber-400" },
  redefinicao_falhou: { rotulo: "Sendflow recusou", cor: "text-amber-600 dark:text-amber-400" },
  testes_falharam: { rotulo: "Eventos Meta com erro", cor: "text-rose-600 dark:text-rose-400" },
  testes_voltaram: { rotulo: "Eventos Meta ok de novo", cor: "text-emerald-600 dark:text-emerald-400" },
  ads_sem_gasto: { rotulo: "Meta sem gastar", cor: "text-rose-600 dark:text-rose-400" },
  ads_cpl_alto: { rotulo: "Custo por lead alto", cor: "text-rose-600 dark:text-rose-400" },
  ads_conta_bloqueada: { rotulo: "Conta da Meta com problema", cor: "text-rose-600 dark:text-rose-400" },
  ads_limite_reduzido: { rotulo: "Limite diário da Meta reduzido", cor: "text-rose-600 dark:text-rose-400" },
  ads_ritmo_baixo: { rotulo: "Gasto abaixo do orçamento", cor: "text-rose-600 dark:text-rose-400" },
  ads_sem_dados: { rotulo: "Dados da Meta parados", cor: "text-amber-600 dark:text-amber-400" },
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
/** Configuração dos alertas das campanhas na Meta (migração 047). */
async function configAds(id: number): Promise<ConfigAds | null> {
  const { data, error } = await db().from("lancamentos")
    .select("ads_campanha_filtro, ads_cpl_maximo, ads_hora_inicio").eq("id", id).maybeSingle();
  if (error || !data) return null; // antes da migração 047
  const d = data as { ads_campanha_filtro: string | null; ads_cpl_maximo: number | string; ads_hora_inicio: number };
  return {
    filtro: d.ads_campanha_filtro, cplMaximo: Number(d.ads_cpl_maximo) || 8,
    horaInicio: d.ads_hora_inicio,
  };
}

/** Leitura direta da conta na Meta, para conferir o token e os números (migração 048). */
async function ContaMeta({ filtro, t }: { filtro: string | null; t: T }) {
  if (!metaContaConfigurada()) return <p className="text-sm text-zinc-500">{t("Leitura direta desligada: cadastre META_ADS_TOKEN e META_AD_ACCOUNT_ID na Vercel e faça o redeploy.")}</p>;
  if (!filtro) return null;
  let r: ResultadoConta;
  try {
    r = await lerContaMeta(filtro);
  } catch (e) {
    return <p className="text-sm text-rose-600">{t("A Meta recusou a leitura: {erro}", { erro: e instanceof Error ? e.message : String(e) })}</p>;
  }
  const din = (v: number) => `${r.moeda === "USD" ? "US$" : r.moeda} ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const orc = somaOrcamento(r);
  const gasto = somaGasto(r);
  const esperado = orc * (minutosDoDia(new Date(r.lidoEm)) / 1440);
  const item = (rot: string, val: string, cls = "") => (
    <div><div className="text-xs text-zinc-500">{rot}</div><div className={`tabular mt-0.5 text-lg font-semibold ${cls}`}>{val}</div></div>
  );
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {item(t("Conta"), r.nomeConta ?? "—")}
        {item(t("Situação"), t(SITUACAO_CONTA[r.status] ?? `status ${r.status}`), r.status === 1 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600")}
        {item(t("Limite diário (Meta)"), r.limiteDiario != null ? din(r.limiteDiario) : t("não disponível na API — coberto pelo alerta de ritmo"))}
        {item(t("Orçamento do dia"), din(orc))}
        {item(t("Gasto hoje"), din(gasto))}
        {item(t("Esperado até agora"), `${din(esperado)}${esperado > 0 ? ` · ${Math.round((100 * gasto) / esperado)}%` : ""}`)}
      </div>
      <p className="text-xs text-zinc-500">
        {t("{n} campanhas ativas do lançamento (de {t} ativas na conta) · filtro {f}", { n: r.campanhas.length, t: r.campanhasDaConta, f: filtro })} · {t("lido às {h}", { h: dataHora(r.lidoEm) })}
      </p>
      {r.campanhas.length > 0 && (
        <Tabela cabecalho={[t("Campanha"), t("Orçamento/dia"), t("Gasto hoje")]} vazio={false}>
          {r.campanhas.map((c) => (
            <tr key={c.id}>
              <td className={`${td} text-xs`}>{c.nome}</td>
              <td className={`${td} tabular`}>{din(c.orcamentoDia)}</td>
              <td className={`${td} tabular`}>{din(c.gastoHoje)}</td>
            </tr>
          ))}
        </Tabela>
      )}
    </div>
  );
}

async function testes(): Promise<{ servidor: Execucao | null; navegador: Execucao | null; historico: Execucao[] } | null> {
  try {
    const h = await historicoTestes(30);
    return { servidor: h.find((e) => e.origem === "servidor") ?? null, navegador: h.find((e) => e.origem === "navegador") ?? null, historico: h.slice(0, 14) };
  } catch {
    return null;
  }
}

async function historico(nomes: Map<number, string>, t: T): Promise<Historico[]> {
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
    itens.push({ quando: e.criado_em, origem: `${t("Redirecionador")} ${e.funil}`, tipo: e.tipo, texto: grupo, envio: e.alertado_em ? "enviado" : "pendente" });
  }
  for (const x of (tst.data ?? []) as { origem: string; ok: boolean; falhas: number; total: number; criado_em: string; detalhes: { teste: string; motivo: string }[]; envio_status: string }[]) {
    const primeira = x.detalhes?.[0];
    itens.push({
      quando: x.criado_em, origem: `${t("Testes")} · ${t(x.origem)}`, tipo: x.ok ? "testes_voltaram" : "testes_falharam",
      texto: x.ok ? t("{n} verificações ok", { n: x.total })
        : `${t("{f}/{n} falharam", { f: x.falhas, n: x.total })}${primeira ? ` · ${traduzirDetalhe(t, primeira.teste)}: ${traduzirDetalhe(t, primeira.motivo)}` : ""}`,
      envio: x.envio_status,
    });
  }
  return itens.sort((a, b) => b.quando.localeCompare(a.quando)).slice(0, 40);
}

function Estado({ s, nome, porLeads = false, t }: { s: SituacaoMonitor | null; nome: string; porLeads?: boolean; t: T }) {
  if (!s) return null;
  const termo = porLeads ? "leads" : t("entradas");
  const min = s.minutos_desde_ultima_entrada;
  const alerta = s.monitor_ativo && min != null && min >= s.alerta_minutos_sem_entrada;
  return (
    <div className={`rounded-xl border p-4 ${alerta ? "border-rose-500/40 bg-rose-500/5" : s.monitor_ativo ? "border-emerald-500/30 bg-emerald-500/5" : "border-zinc-800 bg-zinc-900"}`}>
      <div className="flex items-center gap-2 text-xs text-zinc-400">
        <span className={`h-2 w-2 rounded-full ${s.monitor_ativo ? (alerta ? "bg-rose-500" : "animate-pulse bg-emerald-500") : "bg-zinc-600"}`} />
        {nome}
      </div>
      <div className="mt-1 text-lg font-semibold">
        {!s.monitor_ativo ? t("Monitor desligado") : alerta ? t("Sem {termo} há {d}", { termo, d: t(duracao(min!)) }) : t("Tudo certo")}
      </div>
      <div className="text-xs text-zinc-500">
        {s.monitor_ativo ? t("alerta após {d} sem {termo}", { d: t(duracao(s.alerta_minutos_sem_entrada)), termo }) : t("ligue no cartão abaixo")}
        {s.ultima_entrada_em ? ` · ${porLeads ? t("último lead") : t("última entrada")} ${dataHora(s.ultima_entrada_em)}` : ""}
      </div>
    </div>
  );
}

export default async function Alertas({ searchParams }: PageProps<"/alertas">) {
  const sp = await searchParams;
  const t = await tradutor();
  const { resumos, atual } = await contexto(sp);
  const grupo = await grupoGratuito();
  const modo = modoEnvio();

  const [sLanc, aLanc, sGrupoBruto, aGrupo, inscGrupo, ultimoLead] = await Promise.all([
    atual ? situacaoMonitor(atual.lancamento_id) : null,
    atual ? ultimosAlertas(atual.lancamento_id) : [],
    grupo ? situacaoMonitor(grupo.id) : null,
    grupo ? ultimosAlertas(grupo.id) : [],
    grupo ? inscricoesGrupo() : null,
    grupo ? ultimoLeadGrupo() : null,
  ]);
  // Grupo gratuito (OP Futuros): monitor e alerta contam os leads da página, não as entradas no grupo
  const sGrupo = sGrupoBruto ? situacaoPorLeads(sGrupoBruto, ultimoLead) : null;
  const nomes = new Map<number, string>(resumos.map((r) => [r.lancamento_id, r.nome]));
  if (grupo) nomes.set(grupo.id, grupo.nome);
  const [hist, tst, ads] = await Promise.all([historico(nomes, t), testes(), atual ? configAds(atual.lancamento_id) : null]);

  return (
    <>
      <AutoAtualizar segundos={60} />
      <CabecalhoPagina titulo={t("Alertas")} resumos={resumos} atual={atual}>
        <Link href="/alertas/catalogo" className="whitespace-nowrap rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">{t("Catálogo de alertas")} →</Link>
      </CabecalhoPagina>
      <p className="-mt-2 text-sm text-zinc-500">
        {t("O grupo de alertas no WhatsApp só recebe problemas que precisam de ajuste: ninguém entrou no grupo do lançamento dentro do prazo, nenhum lead novo na página do grupo gratuito (OP Futuros) dentro do prazo (padrão 24 h), redirecionador sem grupo disponível ou falha ao pedir link novo, e testes dos eventos com erro.")}{" "}
        {t("Resumos, entradas retomadas e avisos de que voltou a funcionar ficam só aqui no painel. O monitor confere a cada 2 minutos.")}
      </p>

      <section className="grid gap-3 md:grid-cols-2">
        <Estado t={t} s={sLanc} nome={atual ? `${t("Lançamento")} · ${atual.nome}` : t("Lançamento")} />
        <Estado t={t} s={sGrupo} nome={grupo?.nome ?? t("Grupo gratuito")} porLeads />
      </section>

      <section id="testes" className="scroll-mt-6 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">{t("Testes diários dos eventos Meta")}</h2>
        <Cartao>
          {tst ? <TestesEventos {...tst} /> : (
            <p className="text-sm text-zinc-400">{t("Aplique a migração")} <code>014-testes-automaticos.sql</code> {t("no Supabase do painel para ver os testes.")}</p>
          )}
        </Cartao>
      </section>

      {atual && sLanc && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">{t("Lançamento")} · {atual.nome}</h2>
          <CartaoMonitor s={sLanc} alertas={aLanc} modo={modo} titulo={`${t("Monitor")} — ${atual.nome}`} />
          <Cartao titulo={t("Conta de anúncios na Meta (leitura direta)")}>
            <ContaMeta filtro={ads?.filtro ?? null} t={t} />
          </Cartao>
          <Cartao titulo={t("Configuração dos alertas do lançamento")}>
            <FormAlertas id={atual.lancamento_id} alertaMinutos={sLanc.alerta_minutos_sem_entrada} resumoMinutos={sLanc.resumo_minutos} telefones={sLanc.alerta_telefones} ads={ads ?? undefined} />
          </Cartao>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">{t("Grupo gratuito")}</h2>
        {!grupo || !sGrupo ? (
          <Cartao>
            <p className="text-sm text-zinc-400">{t("Aplique a migração")} <code>013-alertas-grupo-gratuito.sql</code> {t("no Supabase do painel para monitorar o grupo gratuito.")}</p>
          </Cartao>
        ) : (
          <>
            {!grupo.sendflow_ref && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-200">
                <p className="font-medium">{t("Falta ligar o grupo gratuito ao Sendflow")}</p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-amber-100/80">
                  <li>{t("No Sendflow, na campanha do grupo gratuito, cadastre o mesmo webhook usado nas campanhas dos lançamentos (entrada e saída).")}</li>
                  <li>{t("Abaixo, preencha o nome da campanha exatamente como aparece no Sendflow e salve.")}</li>
                  <li>{t("Ligue o monitor. Quando alguém entrar no grupo, a entrada aparece aqui.")}</li>
                </ol>
              </div>
            )}
            <CartaoMonitor s={sGrupo} alertas={aGrupo} modo={modo} titulo={`${t("Monitor")} — ${grupo.nome} · ${t("leads da página")}`} inscricoes={inscGrupo} porLeads />
            <Cartao titulo={t("Configuração dos alertas do grupo gratuito")}>
              <FormAlertas id={grupo.id} alertaMinutos={sGrupo.alerta_minutos_sem_entrada} resumoMinutos={sGrupo.resumo_minutos}
                telefones={sGrupo.alerta_telefones} referencia={{ valor: grupo.sendflow_ref }} />
            </Cartao>
          </>
        )}
      </section>

      <Cartao titulo={t("Histórico de alertas")} acao={<Link href="/redirecionador" className="text-xs text-emerald-700 hover:underline dark:text-emerald-400">{t("redirecionador")} →</Link>}>
        <Tabela cabecalho={[t("Quando"), t("Origem"), t("Alerta"), t("Detalhe"), t("Envio")]} vazio={hist.length === 0}>
          {hist.map((h, i) => (
            <tr key={i} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
              <td className={`${td} tabular whitespace-nowrap text-zinc-500`}>{dataHora(h.quando)}</td>
              <td className={`${td} whitespace-nowrap`}>{h.origem}</td>
              <td className={`${td} whitespace-nowrap font-medium ${ROTULO_TIPO[h.tipo]?.cor ?? ""}`}>{ROTULO_TIPO[h.tipo] ? t(ROTULO_TIPO[h.tipo].rotulo) : h.tipo}</td>
              <td className={`${td} max-w-[520px] truncate text-zinc-400`} title={h.texto}>{h.texto || "—"}</td>
              <td className={`${td} whitespace-nowrap text-xs text-zinc-500`}>{h.envio ? (ENVIO[h.envio] ? t(ENVIO[h.envio]) : h.envio) : "—"}</td>
            </tr>
          ))}
        </Tabela>
      </Cartao>

      <CartaoEnvioAlertas verSendflow={param(sp, "sendflow") === "1"} />
    </>
  );
}
