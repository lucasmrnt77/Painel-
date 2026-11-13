"use server";

import { revalidatePath } from "next/cache";
import { db } from "./supabase";
import { exigirLogin } from "./sessao";
import { proximaRecarga } from "./linhas";
import { hojeUY } from "./grupo-filtros";
import type { EstadoForm } from "./acoes";
import { tradutor } from "./i18n/servidor";

const CAMINHO = "/linhas";
const DIA = /^\d{4}-\d{2}-\d{2}$/;
const txt = (fd: FormData, k: string, max = 300) => {
  const v = String(fd.get(k) ?? "").trim().slice(0, max);
  return v || null;
};

/** Cria ou edita uma linha. Ao informar a última recarga, a próxima é calculada (+6 meses), a não ser que venha preenchida. */
export async function salvarLinha(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await exigirLogin();
  const t = await tradutor();
  const id = Number(fd.get("id"));
  const linha = txt(fd, "linha", 40);
  if (!linha || linha.replace(/\D/g, "").length < 6) return { erro: t("Informe o número da linha.") };
  const estado = fd.get("estado") === "perdida" ? "perdida" : "ativa";
  const ultima = txt(fd, "ultima_recarga", 10);
  let proxima = txt(fd, "proxima_recarga", 10);
  if (ultima && !DIA.test(ultima)) return { erro: t("Data da última recarga inválida.") };
  if (proxima && !DIA.test(proxima)) return { erro: t("Data da próxima recarga inválida.") };
  if (ultima && !proxima) proxima = proximaRecarga(ultima);
  const dados = {
    linha, estado, ultima_recarga: ultima, proxima_recarga: proxima,
    celular: txt(fd, "celular"), whatsapp: txt(fd, "whatsapp"), descricao: txt(fd, "descricao", 1000),
    pin: txt(fd, "pin", 20), puk: txt(fd, "puk", 20), chip: txt(fd, "chip", 40),
    atualizado_em: new Date().toISOString(),
  };
  const r = Number.isInteger(id) && id > 0
    ? await db().from("linhas_telefonicas").update(dados).eq("id", id)
    : await db().from("linhas_telefonicas").insert(dados);
  if (r.error) return { erro: r.error.code === "23505" ? t("Essa linha já está cadastrada.") : r.error.message };
  revalidatePath(CAMINHO);
  return { ok: t("Salvo: {l}", { l: linha }) };
}

/** "Recarga feita": última = hoje (UY), próxima = hoje + 6 meses. Também volta a linha para ativa. */
export async function registrarRecarga(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await exigirLogin();
  const t = await tradutor();
  const id = Number(fd.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { erro: t("Linha inválida") };
  const hoje = hojeUY();
  const proxima = proximaRecarga(hoje);
  const { error } = await db().from("linhas_telefonicas")
    .update({ ultima_recarga: hoje, proxima_recarga: proxima, atualizado_em: new Date().toISOString() }).eq("id", id);
  if (error) return { erro: error.message };
  revalidatePath(CAMINHO);
  return { ok: t("Recarga registrada. Próxima: {d}", { d: proxima.split("-").reverse().join("/") }) };
}

export async function excluirLinha(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await exigirLogin();
  const t = await tradutor();
  const id = Number(fd.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { erro: t("Linha inválida") };
  const { error } = await db().from("linhas_telefonicas").delete().eq("id", id);
  if (error) return { erro: error.message };
  revalidatePath(CAMINHO);
  return { ok: t("Excluída") };
}
