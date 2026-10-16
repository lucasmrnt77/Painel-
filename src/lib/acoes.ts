"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { env } from "./env";
import { db } from "./supabase";
import { iguaisSeguro } from "./seguranca";
import { gravarSessao, apagarSessao, exigirLogin } from "./sessao";
import { normalizarTelefone } from "./telefone";
import { enviarTeste } from "./monitor";
import { tradutor } from "./i18n/servidor";
import type { T } from "./i18n";

export type EstadoForm = { erro?: string; ok?: string } | undefined;

export async function entrar(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const senha = String(fd.get("senha") ?? "");
  if (!senha || !iguaisSeguro(senha, env.painelSenha())) {
    await new Promise((r) => setTimeout(r, 600)); // freia tentativa e erro
    return { erro: (await tradutor())("Senha incorreta") };
  }
  await gravarSessao();
  redirect("/");
}

export async function sair() {
  await apagarSessao();
  redirect("/login");
}

function texto(fd: FormData, k: string): string | null {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? null : v;
}

const RESUMOS = [0, 15, 20, 30, 60, 120, 180, 240, 360, 720, 1440];

function validarAlerta(t: T, alertaMin: number, resumoMin: number): string | null {
  if (!Number.isInteger(alertaMin) || alertaMin < 5 || alertaMin > 2880) return t("Alerta: entre 5 minutos e 48 horas sem entrada");
  if (!RESUMOS.includes(resumoMin)) return t("Resumo inválido");
  return null;
}

function lerTelefones(tr: T, fd: FormData): { telefones: string[] } | { erro: string } {
  const telefones: string[] = [];
  for (const item of String(fd.get("alerta_telefones") ?? "").split(/[\n,;]+/)) {
    if (!item.trim()) continue;
    const t = normalizarTelefone(item);
    if (!t || t.length < 11) return { erro: tr("Telefone de alerta inválido (use DDI): {x}", { x: item.trim() }) };
    if (!telefones.includes(t)) telefones.push(t);
  }
  if (telefones.length > 10) return { erro: tr("Máximo de 10 telefones de alerta") };
  return { telefones };
}

/** Configuração dos alertas de um monitor (lançamento ou grupo gratuito), na aba Alertas. */
export async function salvarAlertas(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await exigirLogin();
  const t = await tradutor();
  const id = Number(fd.get("id"));
  if (!Number.isInteger(id)) return { erro: t("Monitor inválido") };
  const alertaMin = Number(texto(fd, "alerta_minutos_sem_entrada") ?? "20");
  const resumoMin = Number(texto(fd, "resumo_minutos") ?? "0");
  const erroAlerta = validarAlerta(t, alertaMin, resumoMin);
  if (erroAlerta) return { erro: erroAlerta };
  const tel = lerTelefones(t, fd);
  if ("erro" in tel) return { erro: tel.erro };
  const linha: Record<string, unknown> = { alerta_minutos_sem_entrada: alertaMin, resumo_minutos: resumoMin, alerta_telefones: tel.telefones };
  if (fd.has("sendflow_ref")) linha.sendflow_ref = texto(fd, "sendflow_ref");
  const { error } = await db().from("lancamentos").update(linha).eq("id", id);
  if (error) {
    if (error.code === "23505") return { erro: t("Essa referência do Sendflow já está em outro lançamento") };
    return { erro: error.message };
  }
  revalidatePath("/", "layout");
  return { ok: t("Alertas salvos") };
}

export async function salvarLancamento(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await exigirLogin();
  const t = await tradutor();
  const id = texto(fd, "id");
  const slug = (texto(fd, "slug") ?? "").toLowerCase();
  const nome = texto(fd, "nome");
  const minutos = Number(texto(fd, "minutos_reenvio") ?? "10");
  const link = texto(fd, "link_grupo");

  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return { erro: t("Slug: só letras minúsculas, números e hífen (ex.: set-2026)") };
  if (!nome) return { erro: t("Informe o nome do lançamento") };
  if (!Number.isInteger(minutos) || minutos < 1 || minutos > 1440) return { erro: t("Minutos para reenvio entre 1 e 1440") };
  if (link && !/^https:\/\//.test(link)) return { erro: t("O link do grupo deve começar com https://") };

  const alertaMin = Number(texto(fd, "alerta_minutos_sem_entrada") ?? "20");
  const resumoMin = Number(texto(fd, "resumo_minutos") ?? "60");
  const erroAlerta = validarAlerta(t, alertaMin, resumoMin);
  if (erroAlerta) return { erro: erroAlerta };
  const tel = lerTelefones(t, fd);
  if ("erro" in tel) return { erro: tel.erro };
  const telefones = tel.telefones;

  const linha = {
    slug, nome, link_grupo: link, sendflow_ref: texto(fd, "sendflow_ref"), minutos_reenvio: minutos,
    alerta_minutos_sem_entrada: alertaMin, resumo_minutos: resumoMin, alerta_telefones: telefones,
  };
  const { error } = id
    ? await db().from("lancamentos").update(linha).eq("id", Number(id))
    : await db().from("lancamentos").insert(linha);
  if (error) {
    if (error.code === "23505") return { erro: t("Já existe um lançamento com esse slug ou essa referência do Sendflow") };
    return { erro: error.message };
  }
  revalidatePath("/", "layout");
  return { ok: id ? t("Lançamento atualizado") : t("Lançamento criado") };
}

export async function ativarLancamento(fd: FormData) {
  await exigirLogin();
  const id = Number(fd.get("id"));
  if (!Number.isInteger(id)) return;
  const { data: alvo } = await db().from("lancamentos").select("tipo").eq("id", id).maybeSingle();
  if ((alvo as { tipo?: string } | null)?.tipo === "grupo_gratuito") return; // o grupo gratuito nunca é o lançamento ativo
  // Desativa o atual e ativa o novo (índice único garante no máximo um).
  const r1 = await db().from("lancamentos").update({ ativo: false }).eq("ativo", true);
  if (r1.error) throw new Error(r1.error.message);
  const r2 = await db().from("lancamentos").update({ ativo: true }).eq("id", id);
  if (r2.error) throw new Error(r2.error.message);
  revalidatePath("/", "layout");
}

export async function desativarLancamento(fd: FormData) {
  await exigirLogin();
  const id = Number(fd.get("id"));
  if (!Number.isInteger(id)) return;
  const r = await db().from("lancamentos").update({ ativo: false }).eq("id", id);
  if (r.error) throw new Error(r.error.message);
  revalidatePath("/", "layout");
}

/**
 * Importa uma lista de números que JÁ estão no grupo (ex.: exportada do
 * Sendflow antes do webhook estar ligado). Um número por linha; aceita
 * CSV — pega o primeiro trecho com cara de telefone de cada linha.
 */
export async function importarMembros(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await exigirLogin();
  const t = await tradutor();
  const lancamentoId = Number(fd.get("lancamento_id"));
  const grupo = texto(fd, "grupo_nome");
  const bruto = String(fd.get("numeros") ?? "");
  if (!Number.isInteger(lancamentoId)) return { erro: t("Lançamento inválido") };

  const numeros: string[] = [];
  let rejeitadas = 0;
  for (const linha of bruto.split(/\r?\n/)) {
    if (!linha.trim()) continue;
    const candidato = linha.split(/[,;\t]/).map((c) => normalizarTelefone(c)).find(Boolean);
    if (candidato) {
      if (!numeros.includes(candidato)) numeros.push(candidato);
    } else {
      rejeitadas++;
    }
  }
  if (numeros.length === 0) return { erro: t("Nenhum número válido encontrado") };
  if (numeros.length > 5000) return { erro: t("Máximo de 5.000 números por importação") };

  const eventos = numeros.map((telefone) => ({
    tipo: "importacao",
    tipo_original: "importacao_manual",
    telefone,
    grupo_id: grupo ?? "",
    grupo_nome: grupo,
    sendflow_ref: null,
  }));
  const { data, error } = await db().rpc("sendflow_registrar_webhook", {
    p_payload: { importacao_manual: true, grupo_nome: grupo, quantidade: numeros.length },
    p_eventos: eventos,
    p_origem: "importacao",
    p_lancamento_id: lancamentoId,
  });
  if (error) return { erro: error.message };
  revalidatePath("/", "layout");
  const aplicados = (data as { aplicados?: number })?.aplicados ?? numeros.length;
  return { ok: t("{n} números importados", { n: aplicados }) + (rejeitadas ? t(" · {n} linhas ignoradas", { n: rejeitadas }) : "") };
}

export async function alternarMonitor(fd: FormData) {
  await exigirLogin();
  const id = Number(fd.get("id"));
  const ativo = fd.get("ativo") === "1";
  if (!Number.isInteger(id)) return;
  const { error } = await db().rpc("monitor_definir", { p_lancamento_id: id, p_ativo: ativo });
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

export async function testarAlerta(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await exigirLogin();
  const t = await tradutor();
  const id = Number(fd.get("id"));
  if (!Number.isInteger(id)) return { erro: t("Lançamento inválido") };
  try {
    const r = await enviarTeste(id);
    revalidatePath("/", "layout");
    const status = r?.envio;
    if (status === "enviado") return { ok: t("Teste enviado para os telefones cadastrados") };
    if (status === "sem_envio") return { ok: t("Teste registrado no painel (envio por WhatsApp ainda não configurado ou sem telefones)") };
    return { erro: t("Falha no envio ({s}). Veja o detalhe no alerta.", { s: String(status) }) };
  } catch (e) {
    return { erro: t(e instanceof Error ? e.message : String(e)) };
  }
}

/** Botão da Visão geral: liga/desliga a exibição dos dados do lançamento (captação iniciada). */
export async function alternarCaptacao(fd: FormData): Promise<void> {
  await exigirLogin();
  const id = Number(fd.get("id"));
  const ligar = String(fd.get("ligar")) === "1";
  if (!Number.isInteger(id)) return;
  const { error } = await db().from("lancamentos").update({ captacao_iniciada: ligar }).eq("id", id).eq("tipo", "lancamento");
  if (error) {
    const t = await tradutor();
    throw new Error(t(ligar ? "Não foi possível ligar a captação: {e}" : "Não foi possível desligar a captação: {e}", { e: error.message }));
  }
  revalidatePath("/");
  redirect(ligar ? "/" : "/?l=op-futuros");
}
