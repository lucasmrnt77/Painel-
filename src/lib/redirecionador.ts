import "server-only"
import { db } from "./supabase"
import { verificarConvite } from "./convite"
import { listarGruposCampanha, pedirNovoConvite } from "./sendflow-grupos"
import { enviarWhatsapp, envioConfigurado } from "./whatsapp"
import { mensagemRedirecionador } from "./mensagens"

export type Funil = {
  slug: string; nome: string; limite_cliques: number; verificar_a_cada: number; link_reserva: string | null
  sendflow_release_id: string | null; auto_redefinir: boolean; sendflow_consultado_em: string | null
}
export type Grupo = {
  id: number; funil: string; ordem: number; nome: string | null; codigo: string; sendflow_group_id: string | null
  status: "ativo" | "cheio" | "invalido" | "redefinindo" | "pausado"; cliques: number; cliques_desde_verificacao: number
  verificacao: "valido" | "invalido" | "inconclusivo" | null; verificado_em: string | null; titulo_whatsapp: string | null
  redefinicao_pedida_em: string | null; motivo: string | null
}

const LIMITE_REDEFINICOES = 4 // por 15 min na conta Sendflow
const CONSULTA_GRUPOS_MIN = 10 // min entre consultas de grupos por campanha
const VERIFICAR_PARADO_MIN = 15 // confere o grupo da vez mesmo sem cliques
const ESPERA_LINK_NOVO_MIN = 30 // depois disso, avisa que o Sendflow não devolveu

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
  if ((data as { saiu_da_fila?: boolean })?.saiu_da_fila) {
    const f = await lerFunil(grupo.funil)
    if (f?.auto_redefinir && f.sendflow_release_id && grupo.sendflow_group_id) await solicitarRedefinicao(grupo.id)
  }
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
  if ((await redefinicoesRecentes()) >= LIMITE_REDEFINICOES) {
    return { ok: false, mensagem: "Limite do Sendflow: 4 redefinições a cada 15 min. O sistema tenta de novo sozinho." }
  }
  const r = await pedirNovoConvite(f.sendflow_release_id, [grupo.sendflow_group_id])
  if (!r.ok) {
    await evento(grupo.funil, grupo.id, "redefinicao_falhou", { http: r.http, resposta: r.resposta, manual }, true)
    return { ok: false, mensagem: `O Sendflow recusou (${r.http ?? "rede"}): ${r.resposta ?? ""}` }
  }
  await db().from("redir_grupos").update({
    status: grupo.status === "pausado" || grupo.status === "cheio" ? grupo.status : "redefinindo",
    redefinicao_pedida_em: new Date().toISOString(), atualizado_em: new Date().toISOString(),
  }).eq("id", grupo.id)
  await evento(grupo.funil, grupo.id, "redefinicao_pedida", { manual, codigo_antigo: grupo.codigo })
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
    // 1) grupo da vez sem verificação recente → confere (pega redefinição mesmo com pouco tráfego)
    const daVez = todos.find((g) => g.funil === f.slug && g.status === "ativo")
    if (daVez && minutosDesde(daVez.verificado_em) >= VERIFICAR_PARADO_MIN) {
      await verificarGrupo(daVez.id)
      verificados++
    }
    // 2) inválidos que ainda não pediram link novo (ex.: o limite de 4/15 min estava cheio)
    if (f.auto_redefinir && f.sendflow_release_id) {
      for (const g of todos.filter((x) => x.funil === f.slug && x.status === "invalido" && x.sendflow_group_id && !x.redefinicao_pedida_em)) {
        const r = await solicitarRedefinicao(g.id)
        if (r.ok) pedidos++
        else break
      }
    }
  }
  const trocados = await buscarLinksNovos()
  const alertas = await despacharAlertas()
  return { verificados, pedidos, trocados, alertas }
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
  const { data: grupos } = await db().from("redir_grupos").select("id, funil, nome, titulo_whatsapp, codigo, status, cliques, ordem").order("ordem").order("id")
  const lg = (grupos ?? []) as Pick<Grupo, "id" | "funil" | "nome" | "titulo_whatsapp" | "codigo" | "status" | "cliques" | "ordem">[]
  let enviados = 0
  for (const e of eventos.filter((x) => meus.has(x.id))) {
    const f = (funis ?? []).find((x) => x.slug === e.funil) as { nome: string; link_reserva: string | null } | undefined
    const g = lg.find((x) => x.id === e.grupo_id)
    const proximo = lg.find((x) => x.funil === e.funil && x.status === "ativo")
    const nomeG = (x?: typeof g) => (x ? x.nome || x.titulo_whatsapp || `grupo #${x.id}` : "—")
    const texto = mensagemRedirecionador(e.tipo, f?.nome ?? e.funil, {
      ...e.detalhe,
      grupo: nomeG(g),
      proximo: proximo ? `${nomeG(proximo)} (${proximo.cliques} cliques)` : null,
      restantes: lg.filter((x) => x.funil === e.funil && x.status === "ativo").length,
      reserva: f?.link_reserva ?? null,
    })
    if (texto) { await enviarWhatsapp([], texto, `redir_${e.tipo}`); enviados++ }
  }
  return enviados
}
