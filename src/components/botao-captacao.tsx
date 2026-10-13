import { alternarCaptacao } from "@/lib/acoes";

/** Liga/desliga a exibição do lançamento na Visão geral. Desligado = mostra a campanha do grupo gratuito. */
export function BotaoCaptacao({ id, nome, ligada }: { id: number; nome: string; ligada: boolean }) {
  return (
    <form action={alternarCaptacao} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="ligar" value={ligada ? "0" : "1"} />
      <span className="hidden text-xs text-zinc-500 sm:inline">
        {nome}: {ligada ? "captação ligada" : "captação desligada"}
      </span>
      <button
        type="submit"
        title={ligada ? "Volta a Visão geral para a campanha do grupo gratuito" : "Passa a mostrar os dados do lançamento na Visão geral"}
        className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium ${
          ligada
            ? "border border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            : "bg-emerald-600 text-white hover:bg-emerald-500"
        }`}
      >
        <span className={`h-2 w-2 rounded-full ${ligada ? "animate-pulse bg-emerald-500" : "bg-white/80"}`} />
        {ligada ? "Desligar lançamento" : "Ligar lançamento"}
      </button>
    </form>
  );
}
