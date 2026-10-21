"use server";

import { revalidatePath } from "next/cache";
import { db } from "./supabase";
import { exigirLogin } from "./sessao";
import { itemDoCatalogo, normalizarEdicao } from "./catalogo-alertas";
import { MODELOS_PADRAO } from "./modelos-alertas";
import { limparCacheTextos } from "./textos-alertas";

const CAMINHO = "/alertas/catalogo";
const campo = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? "").slice(0, max);

/** Salva mensagem, diagnóstico e "o que olhar" de um alerta. O que ficar igual ao padrão não é guardado. */
export async function salvarTextosAlerta(fd: FormData): Promise<void> {
  await exigirLogin();
  const tipo = String(fd.get("tipo") ?? "");
  const item = itemDoCatalogo(tipo);
  if (!item) return;
  const n = normalizarEdicao(item, MODELOS_PADRAO[tipo] ?? "", {
    mensagem: campo(fd, "mensagem", 4000),
    diagnostico_pt: campo(fd, "diagnostico_pt", 2000), diagnostico_es: campo(fd, "diagnostico_es", 2000),
    verificar_pt: campo(fd, "verificar_pt", 6000), verificar_es: campo(fd, "verificar_es", 6000),
  });
  const vazio = Object.values(n).every((x) => x == null);
  const { error } = vazio
    ? await db().from("alertas_textos").delete().eq("tipo", tipo)
    : await db().from("alertas_textos").upsert({ tipo, ...n, atualizado_em: new Date().toISOString() });
  if (error) throw new Error(error.message);
  limparCacheTextos();
  revalidatePath(CAMINHO);
}

/** Volta todos os textos do alerta para o padrão. */
export async function restaurarTextosAlerta(fd: FormData): Promise<void> {
  await exigirLogin();
  const tipo = String(fd.get("tipo") ?? "");
  if (!itemDoCatalogo(tipo)) return;
  const { error } = await db().from("alertas_textos").delete().eq("tipo", tipo);
  if (error) throw new Error(error.message);
  limparCacheTextos();
  revalidatePath(CAMINHO);
}
