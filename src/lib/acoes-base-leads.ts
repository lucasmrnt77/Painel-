"use server";

import { revalidatePath } from "next/cache";
import { db } from "./supabase";
import { exigirLogin } from "./sessao";

const CAMINHO = "/base-leads";

function texto(fd: FormData, k: string): string {
  return String(fd.get(k) ?? "").trim();
}

/** Aprova a sugestão (ou um número digitado) para um telefone da lista de revisão. */
export async function aprovarTelefone(fd: FormData) {
  await exigirLogin();
  const original = texto(fd, "original").replace(/\D/g, "");
  const telefone = texto(fd, "telefone").replace(/\D/g, "");
  if (!original || telefone.length < 10 || telefone.length > 15) return;
  const { error } = await db().rpc("bd_decidir_telefone", { p_original: original, p_telefone: telefone, p_situacao: "aprovada" });
  if (error) throw new Error(error.message);
  revalidatePath(CAMINHO);
}

/** Marca o telefone como inválido: sai das estatísticas. */
export async function descartarTelefone(fd: FormData) {
  await exigirLogin();
  const original = texto(fd, "original").replace(/\D/g, "");
  if (!original) return;
  const { error } = await db().rpc("bd_decidir_telefone", { p_original: original, p_telefone: null, p_situacao: "descartada" });
  if (error) throw new Error(error.message);
  revalidatePath(CAMINHO);
}

/** Aprova de uma vez todas as sugestões automáticas da regra (ex.: tirar o 15 na Argentina). */
export async function aprovarTodasSugestoes() {
  await exigirLogin();
  const { error } = await db().rpc("bd_aprovar_sugestoes");
  if (error) throw new Error(error.message);
  revalidatePath(CAMINHO);
}

/** Recalcula as estatísticas (as revisões de telefone só entram nos números depois disso). */
export async function atualizarBase() {
  await exigirLogin();
  await cruzarTelefones();
  const { error } = await db().rpc("bd_atualizar_base");
  if (error) throw new Error(error.message);
  revalidatePath(CAMINHO);
}

export async function criarEdicao(fd: FormData) {
  await exigirLogin();
  const codigo = texto(fd, "codigo").toLowerCase();
  const nome = texto(fd, "nome");
  const inicio = texto(fd, "inicio");
  if (!/^[a-z0-9-]+$/.test(codigo) || !nome || !/^\d{4}-\d{2}-\d{2}$/.test(inicio)) return;
  const { error } = await db().from("bd_edicoes").insert({
    codigo, nome, inicio, tem_leads: fd.get("tem_leads") === "on", tem_compras: fd.get("tem_compras") === "on",
  });
  if (error) throw new Error(error.message);
  revalidatePath(CAMINHO);
}

export async function alternarEdicao(fd: FormData) {
  await exigirLogin();
  const id = Number(fd.get("id"));
  const campo = texto(fd, "campo");
  if (!Number.isInteger(id) || (campo !== "tem_leads" && campo !== "tem_compras")) return;
  const valor = texto(fd, "valor") === "1";
  const { error } = await db().from("bd_edicoes").update({ [campo]: valor }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(CAMINHO);
}

/** Telefones com erro que aparecem completos em outro registro da base viram correção (migração 027). */
async function cruzarTelefones() {
  const { error } = await db().rpc("bd_cruzar_telefones");
  if (error && error.code !== "PGRST202") throw new Error(error.message); // PGRST202: antes da migração 027
}

/** Só um lançamento recebe as inscrições do painel por vez. */
export async function ativarEdicao(fd: FormData) {
  await exigirLogin();
  const id = Number(fd.get("id"));
  const lanc = Number(fd.get("lancamento_id"));
  if (!Number.isInteger(id)) return;
  const { error } = await db().rpc("bd_ativar_edicao", { p_id: id, p_lancamento_id: Number.isInteger(lanc) && lanc > 0 ? lanc : null });
  if (error) throw new Error(error.message);
  await db().rpc("bd_atualizar_base");
  revalidatePath(CAMINHO);
}

/** Dá o lançamento por terminado: as inscrições novas deixam de entrar na base. */
export async function encerrarEdicao(fd: FormData) {
  await exigirLogin();
  const id = Number(fd.get("id"));
  if (!Number.isInteger(id)) return;
  const { error } = await db().rpc("bd_encerrar_edicao", { p_id: id });
  if (error) throw new Error(error.message);
  revalidatePath(CAMINHO);
}
