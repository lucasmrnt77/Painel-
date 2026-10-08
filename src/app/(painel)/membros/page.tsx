import { redirect } from "next/navigation";
import { param } from "@/lib/contexto";
import { montarHref } from "@/components/ui";

/** Membros agora ficam junto das inscrições (Inscritos x grupo). */
export default async function Membros({ searchParams }: PageProps<"/membros">) {
  const sp = await searchParams;
  redirect(montarHref("/inscricoes", { l: param(sp, "l"), filtro: param(sp, "filtro"), mq: param(sp, "q") }) + "#membros");
}
