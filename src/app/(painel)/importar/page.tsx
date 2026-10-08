import { redirect } from "next/navigation";
import { param } from "@/lib/contexto";
import { montarHref } from "@/components/ui";

/** A importação agora fica junto dos eventos (Sendflow e importação). */
export default async function Importar({ searchParams }: PageProps<"/importar">) {
  const sp = await searchParams;
  redirect(montarHref("/eventos", { l: param(sp, "l") }) + "#importar");
}
