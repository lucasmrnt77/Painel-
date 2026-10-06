"use server";

import { revalidatePath } from "next/cache";
import { db } from "./supabase";
import { exigirLogin } from "./sessao";
import { extrairCodigo } from "./convite";
import { listarGruposCampanha } from "./sendflow-grupos";
import { solicitarRedefinicao, verificarGrupo } from "./redirecionador";
import type { EstadoForm } from "./acoes";

const CAMINHO = "/redirecionador";
const txt = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? null : v;
};
const funilValido = (s: string | null): s is string => !!s && /^[a-z0-9-]{2,30}$/.test(s);

export async function salvarFunil(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await exigirLogin();
  const slug = txt(fd, "slug");
  if (!funilValido(slug)) return { erro: "Funil inválido" };
  const limite = Number(txt(fd, "limite_cliques") ?? "600");
  const cada = Number(txt(fd, "verificar_a_cada") ?? "20");
  const reserva = txt(fd, "link_reserva");
  if (!Number.isInteger(limite) || limite < 1 || limite > 100000) return { erro: "Limite de cliques entre 1 e 100.000" };
  if (!Number.isInteger(cada) || cada < 1 || cada > 10000) return { erro: "Verificar a cada: entre 1 e 10.000 cliques" };
  if (reserva && !/^https:\/\//.test(reserva)) return { erro: "O link reserva deve começar com https://" };
  const { error } = await db().from("redir_funis").update({
    limite_cliques: limite, verificar_a_cada: cada, link_reserva: reserva,
    sendflow_release_id: txt(fd, "sendflow_release_id"), auto_redefinir: fd.get("auto_redefinir") === "on",
  }).eq("slug", slug);
  if (error) return { erro: error.message };
  revalidatePath(CAMINHO);
  return { ok: "Configuração salva" };
}

async function proximaOrdem(funil: string) {
  const { data } = await db().from("redir_grupos").select("ordem").eq("funil", funil).order("ordem", { ascending: false }).limit(1);
  return ((data?.[0] as { ordem: number } | undefined)?.ordem ?? 0) + 1;
}

/** Cola vários links (um por linha). Opcional: "Nome do grupo | link". */
export async function adicionarGrupos(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await exigirLogin();
  const funil = txt(fd, "funil");
  if (!funilValido(funil)) return { erro: "Funil inválido" };
  const linhas = String(fd.get("links") ?? "").split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (linhas.length === 0) return { erro: "Cole pelo menos um link" };
  if (linhas.length > 200) return { erro: "Máximo de 200 links por vez" };
  let ordem = await proximaOrdem(funil);
  const novos: { funil: string; ordem: number; nome: string | null; codigo: string }[] = [];
  const ruins: string[] = [];
  for (const l of linhas) {
    const [a, b] = l.includes("|") ? l.split("|").map((x) => x.trim()) : [null, l];
    const codigo = extrairCodigo(b);
    if (!codigo) { ruins.push(l.slice(0, 40)); continue; }
    if (novos.some((n) => n.codigo === codigo)) continue;
    novos.push({ funil, ordem: ordem++, nome: a || null, codigo });
  }
  if (novos.length === 0) return { erro: `Nenhum link válido do WhatsApp. Ex.: https://chat.whatsapp.com/AbC123…` };
  const { data, error } = await db().from("redir_grupos").upsert(novos, { onConflict: "funil,codigo", ignoreDuplicates: true }).select("id");
  if (error) return { erro: error.message };
  revalidatePath(CAMINHO);
  const inseridos = data?.length ?? 0;
  return { ok: `${inseridos} grupo(s) adicionado(s)` + (novos.length > inseridos ? `, ${novos.length - inseridos} já estavam na lista` : "") + (ruins.length ? `. Ignorados (sem link válido): ${ruins.join(", ")}` : "") };
}

/** Traz os grupos da campanha do Sendflow: adiciona os novos e atualiza links/IDs dos existentes. */
export async function importarDoSendflow(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await exigirLogin();
  const funil = txt(fd, "funil");
  if (!funilValido(funil)) return { erro: "Funil inválido" };
  const { data: f } = await db().from("redir_funis").select("sendflow_release_id, sendflow_consultado_em").eq("slug", funil).single();
  const release = (f as { sendflow_release_id: string | null } | null)?.sendflow_release_id;
  if (!release) return { erro: "Salve antes o ID da campanha do Sendflow deste funil" };
  const ultima = (f as { sendflow_consultado_em: string | null }).sendflow_consultado_em;
  if (ultima && Date.now() - new Date(ultima).getTime() < 10 * 60000) {
    const falta = Math.ceil(10 - (Date.now() - new Date(ultima).getTime()) / 60000);
    return { erro: `O Sendflow só permite consultar os grupos da campanha a cada 10 min. Tente em ${falta} min.` };
  }
  await db().from("redir_funis").update({ sendflow_consultado_em: new Date().toISOString() }).eq("slug", funil);
  const r = await listarGruposCampanha(release);
  if (r.erro) return { erro: r.erro };
  if (r.grupos.length === 0) return { erro: "A campanha não retornou grupos" };

  const { data: atuais } = await db().from("redir_grupos").select("id, codigo, sendflow_group_id, status").eq("funil", funil);
  const lista = (atuais ?? []) as { id: number; codigo: string; sendflow_group_id: string | null; status: string }[];
  let ordem = await proximaOrdem(funil);
  let novos = 0, atualizados = 0, semLink = 0;
  for (const g of r.grupos) {
    if (!g.codigo) { semLink++; continue; }
    const porId = lista.find((x) => x.sendflow_group_id === g.id);
    const porCodigo = lista.find((x) => x.codigo === g.codigo);
    if (porId) {
      if (porId.codigo !== g.codigo) {
        await db().rpc("redir_trocar_codigo", { p_grupo_id: porId.id, p_codigo: g.codigo, p_origem: "importacao" });
        atualizados++;
      }
      await db().from("redir_grupos").update({ nome: g.nome || null }).eq("id", porId.id);
    } else if (porCodigo) {
      await db().from("redir_grupos").update({ sendflow_group_id: g.id, nome: g.nome || null }).eq("id", porCodigo.id);
      atualizados++;
    } else {
      const { error } = await db().from("redir_grupos").insert({ funil, ordem: ordem++, nome: g.nome || null, codigo: g.codigo, sendflow_group_id: g.id });
      if (!error) novos++;
    }
  }
  revalidatePath(CAMINHO);
  return { ok: `Sendflow: ${r.grupos.length} grupo(s) na campanha · ${novos} novo(s) · ${atualizados} atualizado(s)` + (semLink ? ` · ${semLink} sem link` : "") };
}

export async function trocarLink(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await exigirLogin();
  const id = Number(txt(fd, "id"));
  const codigo = extrairCodigo(txt(fd, "link"));
  if (!Number.isInteger(id)) return { erro: "Grupo inválido" };
  if (!codigo) return { erro: "Link do WhatsApp inválido" };
  const { error } = await db().rpc("redir_trocar_codigo", { p_grupo_id: id, p_codigo: codigo, p_origem: "manual" });
  if (error) return { erro: error.code === "23505" ? "Esse link já está em outro grupo do funil" : error.message };
  revalidatePath(CAMINHO);
  return { ok: "Link trocado" };
}

/** Botões da tabela de grupos. */
export async function acaoGrupo(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await exigirLogin();
  const id = Number(fd.get("id"));
  const op = String(fd.get("op") ?? "");
  if (!Number.isInteger(id)) return { erro: "Grupo inválido" };
  const { data: g } = await db().from("redir_grupos").select("id, funil, ordem, status").eq("id", id).single();
  if (!g) return { erro: "Grupo não encontrado" };
  const grupo = g as { id: number; funil: string; ordem: number; status: string };
  const agora = new Date().toISOString();
  let ok = "Feito";

  if (op === "verificar") {
    const r = await verificarGrupo(id);
    ok = r.ok ? `Convite ${"resultado" in r ? r.resultado : ""}${"titulo" in r && r.titulo ? ` · "${r.titulo}"` : ""}` : "Não foi possível verificar";
  } else if (op === "redefinir") {
    const r = await solicitarRedefinicao(id, true);
    revalidatePath(CAMINHO);
    return r.ok ? { ok: r.mensagem } : { erro: r.mensagem };
  } else if (op === "pausar") {
    await db().from("redir_grupos").update({ status: "pausado", atualizado_em: agora }).eq("id", id);
    ok = "Grupo pausado (fora da fila)";
  } else if (op === "reativar") {
    await db().from("redir_grupos").update({ status: "ativo", motivo: null, redefinicao_pedida_em: null, atualizado_em: agora }).eq("id", id);
    ok = "Grupo de volta à fila";
  } else if (op === "zerar") {
    await db().from("redir_grupos").update({ cliques: 0, cliques_desde_verificacao: 0, status: grupo.status === "cheio" ? "ativo" : grupo.status, atualizado_em: agora }).eq("id", id);
    ok = "Contador zerado";
  } else if (op === "subir" || op === "descer") {
    const { data: vizinhos } = await db().from("redir_grupos").select("id, ordem").eq("funil", grupo.funil).order("ordem").order("id");
    const lista = (vizinhos ?? []) as { id: number; ordem: number }[];
    const i = lista.findIndex((x) => x.id === id);
    const j = op === "subir" ? i - 1 : i + 1;
    if (i >= 0 && j >= 0 && j < lista.length) {
      // renumera tudo em sequência e troca os dois de lugar
      [lista[i], lista[j]] = [lista[j], lista[i]];
      for (let k = 0; k < lista.length; k++) await db().from("redir_grupos").update({ ordem: k + 1 }).eq("id", lista[k].id);
    }
    ok = "Ordem atualizada";
  } else if (op === "remover") {
    await db().from("redir_grupos").delete().eq("id", id);
    ok = "Grupo removido";
  } else {
    return { erro: "Ação desconhecida" };
  }
  revalidatePath(CAMINHO);
  return { ok };
}
