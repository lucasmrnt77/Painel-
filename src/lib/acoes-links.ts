"use server";

import { revalidatePath } from "next/cache";
import { db } from "./supabase";
import { exigirLogin } from "./sessao";
import { dominioLinks, lerDestinos, lerRebrandly, SLUG_VALIDO, type ItemImportacao } from "./links";
import type { EstadoForm } from "./acoes";

const CAMINHO = "/links";

export async function salvarLink(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await exigirLogin();
  const id = Number(fd.get("id"));
  const slug = String(fd.get("slug") ?? "").trim().replace(/^\/+/, "");
  if (!SLUG_VALIDO.test(slug)) return { erro: 'O final do link só pode ter letras, números, "-", "_" e "." (até 80).' };
  const destinos = lerDestinos(String(fd.get("destinos") ?? "[]"));
  if (!destinos || destinos.length === 0) return { erro: "Informe pelo menos um destino." };

  const { data, error } = await db().rpc("link_salvar", {
    p_id: Number.isInteger(id) && id > 0 ? id : null,
    p_slug: slug,
    p_titulo: String(fd.get("titulo") ?? ""),
    p_ativo: true,
    p_repassar: fd.get("repassar") === "on",
    p_destinos: destinos,
  });
  if (error) return { erro: error.message };
  const r = data as { ok: boolean; erro?: string };
  if (!r.ok) return { erro: r.erro ?? "Não foi possível salvar" };
  revalidatePath(CAMINHO);
  return { ok: `Salvo: ${dominioLinks()}/${slug}` };
}

export async function acaoLink(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await exigirLogin();
  const id = Number(fd.get("id"));
  const op = String(fd.get("op") ?? "");
  if (!Number.isInteger(id)) return { erro: "Link inválido" };
  let resultado;
  if (op === "pausar" || op === "ativar") {
    resultado = await db().from("links").update({ ativo: op === "ativar", atualizado_em: new Date().toISOString() }).eq("id", id);
  } else if (op === "excluir") {
    resultado = await db().from("links").delete().eq("id", id);
  } else {
    return { erro: "Ação desconhecida" };
  }
  if (resultado.error) return { erro: resultado.error.message };
  revalidatePath(CAMINHO);
  return { ok: op === "excluir" ? "Excluído" : op === "pausar" ? "Pausado" : "Ativado" };
}

/** Busca todos os links do domínio na API do Rebrandly e cria os que faltam. A chave não é guardada. */
export async function importarRebrandly(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await exigirLogin();
  const chave = String(fd.get("apikey") ?? "").trim();
  const workspace = String(fd.get("workspace") ?? "").trim();
  if (!chave) return { erro: "Cole a chave da API do Rebrandly" };
  const dominio = dominioLinks();

  const itens: ItemImportacao[] = [];
  let ultimo: string | null = null;
  for (let pagina = 0; pagina < 200; pagina++) {
    const q = new URLSearchParams({ limit: "25", orderBy: "createdAt", orderDir: "desc", "domain.fullName": dominio });
    if (ultimo) q.set("last", ultimo);
    let r: Response;
    try {
      r = await fetch(`https://api.rebrandly.com/v1/links?${q}`, {
        headers: { apikey: chave, ...(workspace ? { workspace } : {}), accept: "application/json" },
        cache: "no-store",
      });
    } catch {
      return { erro: "Não consegui falar com o Rebrandly. Tente de novo." };
    }
    if (r.status === 401 || r.status === 403) return { erro: "O Rebrandly recusou a chave (confira a chave e o workspace)." };
    if (!r.ok) return { erro: `Rebrandly respondeu ${r.status}` };
    const lote = (await r.json()) as unknown[];
    itens.push(...lerRebrandly(lote, dominio));
    if (!Array.isArray(lote) || lote.length < 25) break;
    ultimo = String((lote[lote.length - 1] as { id?: string }).id ?? "");
    if (!ultimo) break;
  }
  if (itens.length === 0) return { erro: `Nenhum link de ${dominio} encontrado nessa conta do Rebrandly.` };

  const { data, error } = await db().rpc("links_importar", { p_itens: itens });
  if (error) return { erro: error.message };
  const c = data as { criados: number; existentes: number; invalidos: number };
  revalidatePath(CAMINHO);
  return { ok: `${itens.length} encontrados no Rebrandly · ${c.criados} importados · ${c.existentes} já existiam · ${c.invalidos} com problema` };
}
