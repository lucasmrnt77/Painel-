"use server";

import { revalidatePath } from "next/cache";
import { db } from "./supabase";
import { exigirLogin } from "./sessao";
import { extrairCodigo } from "./convite";
import { listarGruposCampanha } from "./sendflow-grupos";
import { solicitarRedefinicao, verificarGrupo } from "./redirecionador";
import type { EstadoForm } from "./acoes";
import { tradutor } from "./i18n/servidor";
import { SLUG_FUNIL, slugDoNome } from "./redir-status";
import { dominioLinks } from "./links";

const CAMINHO = "/redirecionador";
const txt = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? null : v;
};
const funilValido = (s: string | null): s is string => !!s && SLUG_FUNIL.test(s);

type Tradutor = Awaited<ReturnType<typeof tradutor>>;

/** Campos de configuração comuns ao criar e ao editar um funil. */
function lerConfig(fd: FormData, t: Tradutor): { erro: string } | { config: Record<string, unknown> } {
  const nome = txt(fd, "nome");
  const limite = Number(txt(fd, "limite_cliques") ?? "600");
  const cada = Number(txt(fd, "verificar_a_cada") ?? "20");
  const reserva = txt(fd, "link_reserva");
  if (!nome || nome.length < 2 || nome.length > 60) return { erro: t("Informe o nome do funil (2 a 60 caracteres)") };
  if (!Number.isInteger(limite) || limite < 1 || limite > 100000) return { erro: t("Limite de cliques entre 1 e 100.000") };
  if (!Number.isInteger(cada) || cada < 1 || cada > 10000) return { erro: t("Verificar a cada: entre 1 e 10.000 cliques") };
  if (reserva && !/^https:\/\//.test(reserva)) return { erro: t("O link reserva deve começar com https://") };
  return {
    config: {
      nome, limite_cliques: limite, verificar_a_cada: cada, link_reserva: reserva,
      sendflow_release_id: txt(fd, "sendflow_release_id"), auto_redefinir: fd.get("auto_redefinir") === "on",
    },
  };
}

function revalidar() {
  revalidatePath(CAMINHO, "layout");
}

export async function salvarFunil(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await exigirLogin();
  const t = await tradutor();
  const slug = txt(fd, "slug");
  if (!funilValido(slug)) return { erro: t("Funil inválido") };
  const r = lerConfig(fd, t);
  if ("erro" in r) return r;
  const { error } = await db().from("redir_funis").update(r.config).eq("slug", slug);
  if (error) return { erro: error.message };
  revalidar();
  return { ok: t("Configuração salva") };
}

/** Funil novo: o final do link (slug) não muda depois de criado, porque é o link que vai nas páginas. */
export async function criarFunil(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await exigirLogin();
  const t = await tradutor();
  const slug = (txt(fd, "slug") ?? slugDoNome(txt(fd, "nome") ?? "")).toLowerCase();
  if (!funilValido(slug)) return { erro: t('O final do link deve ter de 2 a 30 caracteres: letras minúsculas, números e "-".') };
  const r = lerConfig(fd, t);
  if ("erro" in r) return r;
  const [{ data: existe }, { data: link }] = await Promise.all([
    db().from("redir_funis").select("slug").eq("slug", slug).maybeSingle(),
    db().from("links").select("slug").ilike("slug", slug).maybeSingle(),
  ]);
  if (existe) return { erro: t('Já existe um funil com o link "{slug}".', { slug }) };
  if (link) return { erro: t('"{slug}" já é um link curto da aba Links. Escolha outro final.', { slug }) };
  const { error } = await db().from("redir_funis").insert({ slug, ...r.config });
  if (error) return { erro: error.code === "23505" ? t('Já existe um funil com o link "{slug}".', { slug }) : error.message };
  revalidar();
  return { ok: t('Funil criado: {link}. Agora adicione ou importe os grupos.', { link: `${dominioLinks()}/${slug}` }) };
}

async function proximaOrdem(funil: string) {
  const { data } = await db().from("redir_grupos").select("ordem").eq("funil", funil).order("ordem", { ascending: false }).limit(1);
  return ((data?.[0] as { ordem: number } | undefined)?.ordem ?? 0) + 1;
}

/** Cola vários links (um por linha). Opcional: "Nome do grupo | link". */
export async function adicionarGrupos(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await exigirLogin();
  const t = await tradutor();
  const funil = txt(fd, "funil");
  if (!funilValido(funil)) return { erro: t("Funil inválido") };
  const linhas = String(fd.get("links") ?? "").split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (linhas.length === 0) return { erro: t("Cole pelo menos um link") };
  if (linhas.length > 200) return { erro: t("Máximo de 200 links por vez") };
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
  if (novos.length === 0) return { erro: t("Nenhum link válido do WhatsApp. Ex.: https://chat.whatsapp.com/AbC123…") };
  const { data, error } = await db().from("redir_grupos").upsert(novos, { onConflict: "funil,codigo", ignoreDuplicates: true }).select("id");
  if (error) return { erro: error.message };
  revalidar();
  const inseridos = data?.length ?? 0;
  return { ok: t("{n} grupo(s) adicionado(s)", { n: inseridos }) + (novos.length > inseridos ? t(", {n} já estavam na lista", { n: novos.length - inseridos }) : "") + (ruins.length ? t(". Ignorados (sem link válido): {l}", { l: ruins.join(", ") }) : "") };
}

/** Traz os grupos da campanha do Sendflow: adiciona os novos e atualiza links/IDs dos existentes. */
export async function importarDoSendflow(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await exigirLogin();
  const t = await tradutor();
  const funil = txt(fd, "funil");
  if (!funilValido(funil)) return { erro: t("Funil inválido") };
  const { data: f } = await db().from("redir_funis").select("sendflow_release_id, sendflow_consultado_em").eq("slug", funil).single();
  const release = (f as { sendflow_release_id: string | null } | null)?.sendflow_release_id;
  if (!release) return { erro: t("Salve antes o ID da campanha do Sendflow deste funil") };
  const ultima = (f as { sendflow_consultado_em: string | null }).sendflow_consultado_em;
  if (ultima && Date.now() - new Date(ultima).getTime() < 10 * 60000) {
    const falta = Math.ceil(10 - (Date.now() - new Date(ultima).getTime()) / 60000);
    return { erro: t("O Sendflow só permite consultar os grupos da campanha a cada 10 min. Tente em {n} min.", { n: falta }) };
  }
  await db().from("redir_funis").update({ sendflow_consultado_em: new Date().toISOString() }).eq("slug", funil);
  const r = await listarGruposCampanha(release);
  if (r.erro) return { erro: t(r.erro) };
  if (r.grupos.length === 0) return { erro: t("A campanha não retornou grupos") };

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
      await db().from("redir_grupos").update({ nome: g.nome || null, sendflow_gid: g.gid }).eq("id", porId.id);
    } else if (porCodigo) {
      await db().from("redir_grupos").update({ sendflow_group_id: g.id, sendflow_gid: g.gid, nome: g.nome || null }).eq("id", porCodigo.id);
      atualizados++;
    } else {
      const { error } = await db().from("redir_grupos").insert({ funil, ordem: ordem++, nome: g.nome || null, codigo: g.codigo, sendflow_group_id: g.id, sendflow_gid: g.gid });
      if (!error) novos++;
    }
  }
  const semGid = r.grupos.filter((g) => !g.gid).length;
  await db().from("redir_eventos").insert({ funil, tipo: "importacao", detalhe: { grupos: r.grupos.length, novos, atualizados, sem_gid: semGid, campos: r.campos ?? [] } });
  revalidar();
  return { ok: t("Sendflow: {g} grupo(s) na campanha · {n} novo(s) · {a} atualizado(s)", { g: r.grupos.length, n: novos, a: atualizados }) + (semLink ? ` · ${t("{n} sem link", { n: semLink })}` : "") };
}

export async function trocarLink(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await exigirLogin();
  const t = await tradutor();
  const id = Number(txt(fd, "id"));
  const codigo = extrairCodigo(txt(fd, "link"));
  if (!Number.isInteger(id)) return { erro: t("Grupo inválido") };
  if (!codigo) return { erro: t("Link do WhatsApp inválido") };
  const { error } = await db().rpc("redir_trocar_codigo", { p_grupo_id: id, p_codigo: codigo, p_origem: "manual" });
  if (error) return { erro: error.code === "23505" ? t("Esse link já está em outro grupo do funil") : error.message };
  revalidar();
  return { ok: t("Link trocado") };
}

/** Botões da tabela de grupos. */
export async function acaoGrupo(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await exigirLogin();
  const t = await tradutor();
  const id = Number(fd.get("id"));
  const op = String(fd.get("op") ?? "");
  if (!Number.isInteger(id)) return { erro: t("Grupo inválido") };
  const { data: g } = await db().from("redir_grupos").select("id, funil, ordem, status").eq("id", id).single();
  if (!g) return { erro: t("Grupo não encontrado") };
  const grupo = g as { id: number; funil: string; ordem: number; status: string };
  const agora = new Date().toISOString();
  let ok = t("Feito");

  if (op === "verificar") {
    const r = await verificarGrupo(id);
    ok = r.ok ? `${t("Convite {r}", { r: "resultado" in r ? t(r.resultado) : "" })}${"titulo" in r && r.titulo ? ` · "${r.titulo}"` : ""}` : t("Não foi possível verificar");
  } else if (op === "redefinir") {
    const r = await solicitarRedefinicao(id, true);
    revalidar();
    return r.ok ? { ok: t(r.mensagem) } : { erro: t(r.mensagem) };
  } else if (op === "pausar") {
    await db().from("redir_grupos").update({ status: "pausado", atualizado_em: agora }).eq("id", id);
    ok = t("Grupo pausado (fora da fila)");
  } else if (op === "reativar") {
    await db().from("redir_grupos").update({ status: "ativo", motivo: null, redefinicao_pedida_em: null, atualizado_em: agora }).eq("id", id);
    ok = t("Grupo de volta à fila");
  } else if (op === "zerar") {
    await db().from("redir_grupos").update({ cliques: 0, cliques_desde_verificacao: 0, status: grupo.status === "cheio" ? "ativo" : grupo.status, atualizado_em: agora }).eq("id", id);
    ok = t("Contador zerado");
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
    ok = t("Ordem atualizada");
  } else if (op === "remover") {
    await db().from("redir_grupos").delete().eq("id", id);
    ok = t("Grupo removido");
  } else {
    return { erro: t("Ação desconhecida") };
  }
  revalidar();
  return { ok };
}
