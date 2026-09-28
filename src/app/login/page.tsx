import { redirect } from "next/navigation";
import { estaLogado } from "@/lib/sessao";
import { FormLogin } from "@/components/formularios";

export default async function Login() {
  if (await estaLogado()) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-lg font-semibold">Painel Sendflow</h1>
        <p className="mb-5 mt-1 text-sm text-zinc-500">Inscrições x membros do grupo</p>
        <FormLogin />
      </div>
    </main>
  );
}
