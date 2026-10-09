"use server";

import { revalidatePath } from "next/cache";
import { exigirLogin } from "./sessao";
import { atualizarSaudeMeta } from "./meta-saude";
import type { EstadoForm } from "./acoes";

/** Botão "Atualizar agora" na aba Saúde na Meta. */
export async function atualizarSaudeAgora(): Promise<EstadoForm> {
  await exigirLogin();
  try {
    const r = await atualizarSaudeMeta("manual");
    revalidatePath("/", "layout");
    return r.ok ? { ok: "Atualizado: nenhum problema na Meta." } : { erro: `${r.problemas.length} problema(s) — veja abaixo.` };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : String(e) };
  }
}
