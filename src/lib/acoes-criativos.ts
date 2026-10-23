"use server";

import { revalidatePath } from "next/cache";
import { db } from "./supabase";
import { exigirLogin } from "./sessao";
import { VARIACAO, type Site } from "./criativos";
import { lerLinkAnuncio } from "./anuncios";

const CAMINHO = "/paginas/criativos";
const PAGINAS = new Set(["general", "trader", "jubilar", "genjub"]);

/** Página e variação: do link colado do anúncio (se vier) ou dos seletores. */
async function lerCampos(fd: FormData) {
  const link = String(fd.get("link") ?? "").trim();
  if (link) {
    const { data } = await db().from("sites_captura").select("site, url_base");
    const lido = lerLinkAnuncio(link, (data ?? []) as { site: Site; url_base: string }[]);
    if (lido) return lido;
  }
  const pagina = String(fd.get("pagina") ?? "").trim();
  const variacao = String(fd.get("variacao") ?? "").trim();
  return {
    pagina: PAGINAS.has(pagina) ? pagina : null,
    variacao: VARIACAO.test(variacao) ? variacao : null,
  };
}

/** Registra ou altera um anúncio (página e variação). Sem id = novo, pelo nome. Cada troca vai para o histórico. */
export async function salvarCriativo(fd: FormData): Promise<void> {
  await exigirLogin();
  const id = Number(fd.get("id"));
  const { pagina, variacao } = await lerCampos(fd);
  if (Number.isInteger(id) && id > 0) {
    const { error } = await db().from("criativos")
      .update({ pagina, variacao, automatico: false, atualizado_em: new Date().toISOString() }).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    const nome = String(fd.get("nome") ?? "").trim().slice(0, 200);
    if (!nome) return;
    // O nome é único sem diferenciar maiúsculas: se já existe (mesmo com outra grafia), altera esse
    const { data: existe } = await db().from("criativos").select("id").ilike("nome", nome.replace(/[%_\\]/g, "\\$&")).maybeSingle();
    const linha = { pagina, variacao, automatico: false, atualizado_em: new Date().toISOString() };
    const { error } = existe
      ? await db().from("criativos").update(linha).eq("id", existe.id)
      : await db().from("criativos").insert({ nome, ...linha });
    if (error) throw new Error(error.message);
  }
  revalidatePath(CAMINHO);
}

export async function apagarCriativo(fd: FormData): Promise<void> {
  await exigirLogin();
  const id = Number(fd.get("id"));
  if (!Number.isInteger(id) || id <= 0) return;
  const { error } = await db().from("criativos").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(CAMINHO);
}

/** Liga/desliga o roteamento por criativo num link da aba Links. */
export async function definirLinkPorCriativo(fd: FormData): Promise<void> {
  await exigirLogin();
  const id = Number(fd.get("id"));
  if (!Number.isInteger(id) || id <= 0) return;
  const { error } = await db().from("links").update({ por_criativo: fd.get("ligar") === "1" }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(CAMINHO);
}
