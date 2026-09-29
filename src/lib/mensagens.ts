/** Textos dos alertas (puro — testável). */

type Janela = { inscricoes: number; entradas: number; saidas: number; inscritos_no_grupo: number; de: string; ate: string };

const FUSO = "America/Montevideo";
const hora = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "—";
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((100 * a) / b)}%` : "—");

export function mensagemAlerta(tipo: string, lancamento: string, dados: Record<string, unknown>): string {
  if (tipo === "sem_entradas") {
    const j = dados.janela as Janela;
    const min = Number(dados.minutos_sem_entrada);
    const ultima = dados.ultima_entrada_em as string | null;
    const diagnostico =
      j.inscricoes === 0
        ? "Nenhuma inscrição nesse período: o tráfego parece parado. Confira os anúncios."
        : `${j.inscricoes} inscrição(ões) nesse período, mas ninguém entrou: confira a página de obrigado e o link do grupo.`;
    return [
      `⚠️ *${lancamento}*`,
      `Sem entradas no grupo há *${min} min*.`,
      ultima ? `Última entrada: ${hora(ultima)}.` : "Nenhuma entrada desde que o monitor foi ligado.",
      diagnostico,
    ].join("\n");
  }
  if (tipo === "entradas_retomadas") {
    return `✅ *${lancamento}*\nEntradas retomadas às ${hora(dados.retomada_em as string)} depois de ${dados.minutos_sem_entrada} min sem entradas.`;
  }
  if (tipo === "resumo") {
    const j = dados.janela as Janela;
    return [
      `📊 *${lancamento}* — ${hora(j.de)} às ${hora(j.ate)}`,
      `Inscrições: ${j.inscricoes}`,
      `Entradas no grupo: ${j.entradas}` + (j.saidas ? ` · Saídas: ${j.saidas}` : ""),
      `Dos inscritos no período, ${pct(j.inscritos_no_grupo, j.inscricoes)} já estão no grupo.`,
    ].join("\n");
  }
  if (tipo === "teste") {
    return `🔔 *${lancamento}*\nMensagem de teste do monitor do painel Sendflow.`;
  }
  return `${lancamento}: ${tipo}`;
}
