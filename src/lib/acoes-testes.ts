"use server";

import { revalidatePath } from "next/cache";
import { exigirLogin } from "./sessao";
import { executarTestesServidor } from "./testes-eventos";
import type { EstadoForm } from "./acoes";

/** Botão "Rodar agora" na aba Alertas. */
export async function rodarTestesAgora(): Promise<EstadoForm> {
  await exigirLogin();
  try {
    const r = await executarTestesServidor("manual");
    revalidatePath("/alertas");
    return r.ok
      ? { ok: `Tudo certo: ${r.total} verificações passaram.` }
      : { erro: `${r.falhas} de ${r.total} verificações falharam — veja abaixo.` };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : String(e) };
  }
}
