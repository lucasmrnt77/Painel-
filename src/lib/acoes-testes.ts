"use server";

import { revalidatePath } from "next/cache";
import { exigirLogin } from "./sessao";
import { executarTestesServidor } from "./testes-eventos";
import type { EstadoForm } from "./acoes";
import { tradutor } from "./i18n/servidor";

/** Botão "Rodar agora" na aba Alertas. */
export async function rodarTestesAgora(): Promise<EstadoForm> {
  await exigirLogin();
  const t = await tradutor();
  try {
    const r = await executarTestesServidor("manual");
    revalidatePath("/alertas");
    return r.ok
      ? { ok: t("Tudo certo: {n} verificações passaram.", { n: r.total }) }
      : { erro: t("{f} de {n} verificações falharam — veja abaixo.", { f: r.falhas, n: r.total }) };
  } catch (e) {
    return { erro: t(e instanceof Error ? e.message : String(e)) };
  }
}
