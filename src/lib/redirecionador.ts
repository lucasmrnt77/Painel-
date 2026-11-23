import "server-only"
import { db } from "./supabase"
import { verificarConvite } from "./convite"
import { listarGruposCampanha, pedirNovoConvite } from "./sendflow-grupos"
import { enviarWhatsapp, envioConfigurado } from "./whatsapp"
import { redirecionadorVaiProWhatsapp } from "./politica-alertas"
import { mensagemRedirecionador } from "./mensagens"
import { modelosAlertas } from "./textos-alertas"
import { paradosParaConferir, decidirConfirmacao } from "./redir-parados"

export type Funil = {
  slug: string; nome: string; limite_cliques: number; verificar_a_cada: number; link_reserva: string | null
  sendflow_release_id: string | null; auto_redefinir: boolean; sendflow_consultado_em: string | null
  /** Quantos grupos recebem cliques ao mesmo tempo (migração 065; 1 = um por vez) */
  grupos_simultaneos?: number
}
export type Grupo = {
  id: number; funil: string; ordem: number; nome: string | null; codigo: string; sendflow_group_id: string | null; sendflow_gid: string | null
  status: "ativo" | "cheio" | "invalido" | "redefinindo" | "pausado"; cliques: number; cliques_desde_verificacao: number
  verificacao: "valido" | "invalido" | "inconclusivo" | null; verificado_em: string | null; titulo_whatsapp: string | null
  redefinicao_pedida_em: string | null; motivo: string | null
  /** Convite parou de funcionar e ainda não foi confirmado no Sendflow (migração 069) */
  suspensao_pendente_desde?: string | null
}

const LIMITE_REDEFINICOES = 4 // por 15 min na conta Sendflow
const CONSULTA_GRUPOS_MIN = 10 // min entre consultas de grupos por campanha
const VERIFICAR_PARADO_MIN = 15 // confere o grupo da vez mesmo sem cliques
const ESPERA_LINK_NOVO_MIN = 30 // depois disso, avisa que o Sendflow não devolveu
const SINCRONIZAR_MIN = 30 // links de todos os grupos conferidos na lista do Sendflow a cada 30 min
const PARADOS_POR_RODADA = 1 // 1 grupo por rodada do cron (2 min): espalha as consultas ao WhatsApp

export const MOTIVO_RECUSA = "Sendflow recusou"
/** Tira a mensagem do JSON de erro do Sendflow ({"message":"…"}); senão devolve o texto como veio. */
export function textoRecusa(resposta: unknown): string {
  const s = resposta == null ? "" : String(resposta)
  try { const j = JSON.parse(s) as { message?: string }; if (j?.message) return j.message } catch { /* não é JSON */ }
  return s
}

const minutosDesde = (iso: string | null) => (iso ? (Date.now() - new Date(iso).getTime()) / 60000 : Infinity)

async function evento(funil: string, grupoId: number | null, tipo: string, detalhe: Record<string, unknown>, alertar = false) {
  await db().from("redir_eventos").insert({ funil, grupo_id: grupoId, tipo, detalhe, alertar })
}

async function lerFunil(slug: string): Promise<Funil | null> {
  const { data } = await db().from("redir_funis").select("*").eq("slug", slug).maybeSingle()
  return (data as Funil) ?? null
}

/** Confere o convite de um grupo e registra; se saiu da fila, pede link novo ao Sendflow. */
export async function verificarGrupo(grupoId: number) {
  const { data: g } = await db().from("redir_grupos").select("*").eq("id", grupoId).maybeSingle()
  if (!g) return { ok: false, erro: "grupo não encontrado" }
  const grupo = g as Grupo
  const r = await verificarConvite(grupo.codigo)
  const { data, error } = await db().rpc("redir_registrar_verificacao", {
    p_grupo_id: grupo.id, p_resultado: r.resultado, p_titulo: r.titulo, p_detalhe: r.detalhe,
  })
  if (error) throw new Error(`[redir] registrar verificação: ${error.message}`)
  // Saiu da fila: o link novo vem da lista de grupos do Sendflow (confirmarSuspensoes). A ação "atualizar convite"
  // do Sendflow falha desde 21/11 (conta da campanha não existe mais), então não é mais pedida automaticamente.
  void data
  return { ok: true, ...r }
}

async function redefinicoesRecentes() {
  const desde = new Date(Date.now() - 15 * 60000).toISOString()
  const { count } = await db().from("redir_eventos").select("id", { count: "exact", head: true })
    .eq("tipo", "redefinicao_pedida").gte("criado_em", desde)
  return count ?? 0
}

/** Pede ao Sendflow um link novo para o grupo (respeitando 4 pedidos / 15 min). */
export async function solicitarRedefinicao(grupoId: number, manual = false): Promise<{ ok: boolean; mensagem: string }> {
  const { data: g } = await db().from("redir_grupos").select("*").eq("id", grupoId).maybeSingle()
  if (!g) return { ok: false, mensagem: "Grupo não encontrado" }
  const grupo = g as Grupo
  const f = await lerFunil(grupo.funil)
  if (!f?.sendflow_release_id) return { ok: false, mensagem: "Informe a campanha do Sendflow deste funil" }
  if (!grupo.sendflow_group_id) return { ok: false, mensagem: "Este grupo não tem o ID do Sendflow (importe os grupos da campanha)" }
  if (!grupo.sendflow_gid) return { ok: false, mensagem: "Falta o identificador do grupo no WhatsApp: clique em Importar grupos do Sendflow de novo" }
  if ((await redefinicoesRecentes()) >= LIMITE_REDEFINICOES) {
    return { ok: false, mensagem: "Limite do Sendflow: 4 redefinições a cada 15 min. O sistema tenta de novo sozinho." }
  }
  const r = await pedirNovoConvite(f.sendflow_release_id, [grupo.sendflow_gid])
  if (!r.ok) {
    // Recusa do Sendflow (4xx, ex.: "Conta … não encontrada!", grupo suspenso): não adianta repetir a cada 2 min.
    // Marca o grupo, alerta UMA vez e o cron para de pedir; o botão "Atualizar link" continua tentando à mão.
    const jaRecusado = grupo.motivo?.startsWith(MOTIVO_RECUSA) ?? false
    if (r.http && r.http >= 400 && r.http < 500 && r.http !== 429) {
      await db().from("redir_grupos").update({ motivo: `${MOTIVO_RECUSA}: ${textoRecusa(r.resposta)}`.slice(0, 300), atualizado_em: new Date().toISOString() }).eq("id", grupo.id)
    }
    await evento(grupo.funil, grupo.id, "redefinicao_falhou", { http: r.http, resposta: r.resposta, manual }, manual || !jaRecusado)
    return { ok: false, mensagem: `O Sendflow recusou (${r.http ?? "rede"}): ${r.resposta ?? ""}` }
  }
  await db().from("redir_grupos").update({
    status: grupo.status === "pausado" || grupo.status === "cheio" ? grupo.status : "redefinindo",
    redefinicao_pedida_em: new Date().toISOString(), atualizado_em: new Date().toISOString(),
  }).eq("id", grupo.id)
  await evento(grupo.funil, grupo.id, "redefinicao_pedida", { manual, codigo_antigo: grupo.codigo, http: r.http, resposta: r.resposta })
  return { ok: true, mensagem: "Pedido enviado ao Sendflow. O link novo entra sozinho em alguns minutos." }
}

/**
 * Busca no Sendflow os códigos atuais dos grupos que estão esperando link novo
 * (1 consulta por campanha a cada 10 min) e devolve à fila os que voltaram válidos.
 */
async function buscarLinksNovos() {
  const { data } = await db().from("redir_grupos").select("*").not("redefinicao_pedida_em", "is", null)
  const esperando = (data ?? []) as Grupo[]
  if (esperando.length === 0) return 0
  let trocados = 0
  const porFunil = new Map<string, Grupo[]>()
  for (const g of esperando) porFunil.set(g.funil, [...(porFunil.get(g.funil) ?? []), g])

  for (const [slug, grupos] of porFunil) {
    const f = await lerFunil(slug)
    if (!f?.sendflow_release_id) continue
    if (grupos.every((g) => minutosDesde(g.redefinicao_pedida_em) < 1.5)) continue // dá tempo ao Sendflow
    if (minutosDesde(f.sendflow_consultado_em) < CONSULTA_GRUPOS_MIN) continue
    await db().from("redir_funis").update({ sendflow_consultado_em: new Date().toISOString() }).eq("slug", slug)
    const lista = await listarGruposCampanha(f.sendflow_release_id)
    if (lista.erro) continue
    for (const g of grupos) {
      const atual = lista.grupos.find((x) => x.id === g.sendflow_group_id)
      if (atual?.codigo && atual.codigo !== g.codigo) {
        const v = await verificarConvite(atual.codigo)
        if (v.resultado !== "invalido") {
          await db().rpc("redir_trocar_codigo", { p_grupo_id: g.id, p_codigo: atual.codigo, p_origem: "sendflow" })
          trocados++
          continue
        }
      }
      // Mesmo código no Sendflow e o convite antigo ainda vale → nada a trocar: o grupo volta para a fila
      if (atual?.codigo === g.codigo && minutosDesde(g.redefinicao_pedida_em) >= 3) {
        const v = await verificarConvite(g.codigo)
        if (v.resultado === "valido") {
          await db().from("redir_grupos").update({
            status: g.status === "redefinindo" ? "ativo" : g.status, redefinicao_pedida_em: null, motivo: null,
            verificacao: "valido", verificado_em: new Date().toISOString(), atualizado_em: new Date().toISOString(),
          }).eq("id", g.id)
          await evento(slug, g.id, "link_mantido", { codigo: g.codigo })
          continue
        }
      }
      if (minutosDesde(g.redefinicao_pedida_em) > ESPERA_LINK_NOVO_MIN && g.motivo !== "sem retorno do Sendflow") {
        await db().from("redir_grupos").update({ motivo: "sem retorno do Sendflow" }).eq("id", g.id)
        await evento(slug, g.id, "redefinicao_sem_retorno", { minutos: Math.round(minutosDesde(g.redefinicao_pedida_em)) }, true)
      }
    }
  }
  return trocados
}

/** Roda no cron (a cada 2 min). */
export async function executarRedirecionador() {
  const { data: funis } = await db().from("redir_funis").select("*")
  const { data: grupos } = await db().from("redir_grupos").select("*").order("ordem").order("id")
  const todos = (grupos ?? []) as Grupo[]
  let verificados = 0
  let pedidos = 0

  for (const f of (funis ?? []) as Funil[]) {
    // 1) grupos da vez (os N que recebem cliques) sem verificação recente → confere (pega redefinição mesmo com pouco tráfego)
    const daVez = todos.filter((g) => g.funil === f.slug && g.status === "ativo").slice(0, Math.max(1, f.grupos_simultaneos ?? 1))
    for (const g of daVez) {
      if (minutosDesde(g.verificado_em) < VERIFICAR_PARADO_MIN) continue
      await verificarGrupo(g.id)
      verificados++
    }
  }
  const parados = await conferirParados(todos)
  pedidos = await confirmarSuspensoes((funis ?? []) as Funil[])
  const trocados = await buscarLinksNovos()
  const alertas = await despacharAlertas()
  return { verificados, pedidos, trocados, alertas, parados }
}

/** Conferência diária do convite dos grupos parados; se não abre mais, alerta no WhatsApp (uma vez por grupo). */
async function conferirParados(todos: Grupo[]) {
  let conferidos = 0
  for (const g of paradosParaConferir(todos).slice(0, PARADOS_POR_RODADA)) {
    const r = await verificarConvite(g.codigo)
    const { error } = await db().rpc("redir_registrar_verificacao", {
      p_grupo_id: g.id, p_resultado: r.resultado, p_titulo: r.titulo, p_detalhe: r.detalhe,
    })
    if (error) throw new Error(`[redir] registrar verificação: ${error.message}`)
    // não avisa na hora: pode ser só link redefinido; confirmarSuspensoes decide
    if (r.resultado === "invalido") await db().from("redir_grupos").update({ suspensao_pendente_desde: new Date().toISOString() }).eq("id", g.id).is("suspensao_pendente_desde", null)
    conferidos++
  }
  return conferidos
}

/**
 * Lista de grupos do Sendflow (1 consulta por campanha, no máx. a cada 10 min — limite do Sendflow):
 * 1) a cada 30 min, atualiza o link de qualquer grupo que mudou (troca de permissões muda o link);
 * 2) grupos com convite inválido aguardando confirmação: link novo → troca sem alerta;
 *    mesmo link / suspenso no Sendflow / 30 min sem confirmar → alerta de suspensão.
 */
async function confirmarSuspensoes(funis: Funil[]) {
  const { data } = await db().from("redir_grupos").select("*")
  const grupos = (data ?? []) as Grupo[]
  const porRelease = new Map<string, Funil[]>()
  for (const f of funis) if (f.sendflow_release_id) porRelease.set(f.sendflow_release_id, [...(porRelease.get(f.sendflow_release_id) ?? []), f])
  let resolvidos = 0
  for (const [release, fs] of porRelease) {
    const slugs = new Set(fs.map((f) => f.slug))
    const doRelease = grupos.filter((g) => slugs.has(g.funil))
    const pendentes = doRelease.filter((g) => g.suspensao_pendente_desde)
    const ultima = fs.map((f) => f.sendflow_consultado_em).filter(Boolean).sort().pop() ?? null
    const desde = minutosDesde(ultima)
    if (desde < CONSULTA_GRUPOS_MIN) { resolvidos += await alertarVencidos(pendentes); continue }
    if (pendentes.length === 0 && desde < SINCRONIZAR_MIN) continue
    await db().from("redir_funis").update({ sendflow_consultado_em: new Date().toISOString() }).in("slug", [...slugs])
    const lista = await listarGruposCampanha(release)
    if (lista.erro) { resolvidos += await alertarVencidos(pendentes); continue }
    for (const g of doRelease) {
      const s = g.sendflow_group_id ? lista.grupos.find((x) => x.id === g.sendflow_group_id) ?? null : null
      const mudou = !!(s?.codigo && s.codigo !== g.codigo)
      if (!g.suspensao_pendente_desde) {
        // sincronização: só troca se o link novo funciona (grupos confirmados como suspensos ficam como estão)
        if (!mudou || g.verificacao === "invalido") continue
        const v = await verificarConvite(s!.codigo!)
        if (v.resultado === "valido") await trocarCodigo(g, s!.codigo!)
        continue
      }
      const v = mudou ? await verificarConvite(s!.codigo!) : null
      const decisao = decidirConfirmacao({
        codigoPainel: g.codigo, noSendflow: s, novoValido: v ? v.resultado === "valido" : null,
        minutosPendente: minutosDesde(g.suspensao_pendente_desde),
      })
      if (decisao === "trocar") { await trocarCodigo(g, s!.codigo!); resolvidos++ }
      else if (decisao === "alertar") { await alertarSuspensao(g, s?.suspenso ? "Sendflow marca o grupo como suspenso" : mudou ? "o link novo do Sendflow também não funciona" : "link não mudou no Sendflow em 30 min"); resolvidos++ }
    }
  }
  return resolvidos
}

/** Troca o link (volta para a fila se estava inválido) e limpa a pendência; grupo pausado por link antigo volta a ativo. */
async function trocarCodigo(g: Grupo, codigo: string) {
  const reativar = g.status === "pausado" && !!g.motivo?.startsWith("link antigo")
  await db().rpc("redir_trocar_codigo", { p_grupo_id: g.id, p_codigo: codigo, p_origem: "sendflow" })
  await db().from("redir_grupos").update({
    suspensao_pendente_desde: null, verificacao: "valido", verificado_em: new Date().toISOString(),
    ...(reativar ? { status: "ativo" } : {}),
  }).eq("id", g.id)
}

async function alertarSuspensao(g: Grupo, porque: string) {
  await db().from("redir_grupos").update({ suspensao_pendente_desde: null, motivo: `suspenso? (${porque})`.slice(0, 300) }).eq("id", g.id)
  const tipo = g.status === "ativo" || g.status === "invalido" || g.status === "redefinindo" ? "invalido" : "parado_invalido"
  await evento(g.funil, g.id, tipo, { codigo: g.codigo, status: g.status, confirmado: porque }, true)
}

/** Sem lista do Sendflow agora: só avisa os que já esperam há mais de 30 min. */
async function alertarVencidos(pendentes: Grupo[]) {
  let n = 0
  for (const g of pendentes) {
    if (decidirConfirmacao({ codigoPainel: g.codigo, noSendflow: null, novoValido: null, minutosPendente: minutosDesde(g.suspensao_pendente_desde ?? null) }) === "alertar") {
      await alertarSuspensao(g, "não deu para confirmar no Sendflow em 30 min"); n++
    }
  }
  return n
}

/** Envia ao grupo de alertas os eventos importantes ainda não avisados. */
export async function despacharAlertas() {
  if (!envioConfigurado()) return 0
  const { data } = await db().from("redir_eventos").select("*").eq("alertar", true).is("alertado_em", null).order("criado_em").limit(10)
  const eventos = (data ?? []) as { id: number; funil: string; grupo_id: number | null; tipo: string; detalhe: Record<string, unknown> }[]
  if (eventos.length === 0) return 0
  // marca antes de enviar: dois processos ao mesmo tempo não mandam em dobro
  const ids = eventos.map((e) => e.id)
  const { data: marcados } = await db().from("redir_eventos").update({ alertado_em: new Date().toISOString() })
    .in("id", ids).is("alertado_em", null).select("id")
  const meus = new Set(((marcados ?? []) as { id: number }[]).map((m) => m.id))
  const { data: funis } = await db().from("redir_funis").select("slug, nome, link_reserva")
  const { data: grupos } = await db().from("redir_grupos").select("id, funil, nome, titulo_whatsapp, codigo, status, cliques, ordem, sendflow_gid").order("ordem").order("id")
  const lg = (grupos ?? []) as Pick<Grupo, "id" | "funil" | "nome" | "titulo_whatsapp" | "codigo" | "status" | "cliques" | "ordem" | "sendflow_gid">[]
  let enviados = 0
  const modelos = await modelosAlertas()
  for (const e of eventos.filter((x) => meus.has(x.id))) {
    const f = (funis ?? []).find((x) => x.slug === e.funil) as { nome: string; link_reserva: string | null } | undefined
    const g = lg.find((x) => x.id === e.grupo_id)
    const proximo = lg.find((x) => x.funil === e.funil && x.status === "ativo")
    const nomeG = (x?: typeof g) => (x ? x.nome || x.titulo_whatsapp || `grupo #${x.id}` : "—")
    // Convite inválido (possível suspensão): quantas pessoas estavam no grupo
    let membros: number | undefined
    if ((e.tipo === "invalido" || e.tipo === "parado_invalido") && g?.sendflow_gid) {
      const { count } = await db().from("membros_grupo").select("id", { count: "exact", head: true }).eq("grupo_id", `${g.sendflow_gid}@g.us`)
      if (typeof count === "number") membros = count
    }
    const texto = mensagemRedirecionador(e.tipo, f?.nome ?? e.funil, {
      ...e.detalhe,
      ...(membros !== undefined ? { membros } : {}),
      grupo: nomeG(g),
      proximo: proximo ? `${nomeG(proximo)} (${proximo.cliques} cliques)` : null,
      restantes: lg.filter((x) => x.funil === e.funil && x.status === "ativo").length,
      reserva: f?.link_reserva ?? null,
      ...(e.tipo === "parado_invalido" ? { estado: e.detalhe?.status === "pausado" ? "pausado" : "cheio" } : {}),
    }, modelos)
    // Só o que precisa de ajuste vai para o WhatsApp (ex.: sem grupo na fila); o resto fica no painel
    if (texto && redirecionadorVaiProWhatsapp(e.tipo, !!proximo)) { await enviarWhatsapp([], texto, `redir_${e.tipo}`); enviados++ }
  }
  return enviados
}
