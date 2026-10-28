"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "./supabase";
import { exigirLogin } from "./sessao";
import { lerPeriodo } from "./periodo";
import { lerPaginasTeste, testeQueSobrepoe } from "./teste-paginas";

/** Lê nome, páginas e período do formulário (vazio/inválido = null). */
function lerTeste(fd: FormData) {
  const nome = String(fd.get("nome") ?? "").trim().slice(0, 80);
  const paginas = lerPaginasTeste(fd.getAll("paginas").map(String));
  const p = lerPeriodo(String(fd.get("inicio") ?? ""), String(fd.get("fim") ?? ""));
  if (!nome || paginas.length === 0 || !p.de || !p.ate) return null;
  return { nome, paginas, inicio: p.de, fim: p.ate };
}

/** Cria (sem id) ou altera um teste: nome + páginas + início + fim. Depois abre a aba Páginas nesse teste. */
export async function salvarTestePagina(fd: FormData): Promise<void> {
  await exigirLogin();
  const lancamentoId = Number(fd.get("lancamento_id"));
  const slug = String(fd.get("l") ?? "");
  const id = Number(fd.get("id"));
  const t = lerTeste(fd);
  if (!t || !Number.isInteger(lancamentoId) || lancamentoId <= 0) return;
  // Regra: um teste nunca pode ter dia em comum com outro do mesmo lançamento (dados não se misturam)
  if (t.fim < t.inicio) redirect(`/paginas?${new URLSearchParams({ l: slug, erro_teste: "fim_antes" })}`);
  const { data: outros, error: erroOutros } = await db().from("testes_paginas").select("id, nome, inicio, fim").eq("lancamento_id", lancamentoId);
  if (erroOutros) throw new Error(erroOutros.message);
  const conflito = testeQueSobrepoe(t, (outros ?? []) as { id: number; nome: string; inicio: string; fim: string }[], Number.isInteger(id) && id > 0 ? id : null);
  if (conflito) {
    redirect(`/paginas?${new URLSearchParams({ l: slug, erro_teste: "sobrepoe", conflito: `${conflito.nome} (${conflito.inicio} a ${conflito.fim})` })}`);
  }
  let testeId = id;
  if (Number.isInteger(id) && id > 0) {
    const { error } = await db().from("testes_paginas").update(t).eq("id", id).eq("lancamento_id", lancamentoId);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await db().from("testes_paginas").insert({ lancamento_id: lancamentoId, ...t }).select("id").single();
    if (error) throw new Error(error.message);
    testeId = (data as { id: number }).id;
  }
  revalidatePath("/paginas");
  redirect(`/paginas?${new URLSearchParams({ l: slug, teste: String(testeId) })}`);
}

/** Apaga só o teste salvo (os leads, visitas e dados da Meta não são tocados). */
export async function excluirTestePagina(fd: FormData): Promise<void> {
  await exigirLogin();
  const id = Number(fd.get("id"));
  const slug = String(fd.get("l") ?? "");
  if (!Number.isInteger(id) || id <= 0) return;
  const { error } = await db().from("testes_paginas").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/paginas");
  redirect(`/paginas?${new URLSearchParams({ l: slug })}`);
}
