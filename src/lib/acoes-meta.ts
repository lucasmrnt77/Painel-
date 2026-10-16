"use server";

import { revalidatePath } from "next/cache";
import { exigirLogin } from "./sessao";
import { atualizarSaudeMeta } from "./meta-saude";
import type { EstadoForm } from "./acoes";
import { tradutor } from "./i18n/servidor";

/** Botão "Atualizar agora" na aba Saúde na Meta. */
export async function atualizarSaudeAgora(): Promise<EstadoForm> {
  await exigirLogin();
  const t = await tradutor();
  try {
    const r = await atualizarSaudeMeta("manual");
    revalidatePath("/", "layout");
    return r.ok ? { ok: t("Atualizado: nenhum problema na Meta.") } : { erro: t("{n} problema(s) — veja abaixo.", { n: r.problemas.length }) };
  } catch (e) {
    return { erro: t(e instanceof Error ? e.message : String(e)) };
  }
}
