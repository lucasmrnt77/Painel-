/** Textos dos alertas (puro — testável). */

type Janela = { inscricoes: number; entradas: number; saidas: number; inscritos_no_grupo: number; de: string; ate: string };

const FUSO = "America/Montevideo";
const hora = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "—";
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((100 * a) / b)}%` : "—");

/** 45 → "45 min" · 180 → "3 h" · 200 → "3 h 20 min" · 3000 → "2 dias 2 h" */
export function duracao(minutos: number): string {
  const m = Math.max(0, Math.floor(minutos));
  if (m < 60) return `${m} min`;
  const dias = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const resto = m % 60;
  if (dias > 0) return `${dias} dia${dias > 1 ? "s" : ""}${h ? ` ${h} h` : ""}`;
  return `${h} h${resto ? ` ${resto} min` : ""}`;
}

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
      `Sem entradas no grupo há *${duracao(min)}*.`,
      ultima ? `Última entrada: ${hora(ultima)}.` : "Nenhuma entrada desde que o monitor foi ligado.",
      diagnostico,
    ].join("\n");
  }
  if (tipo === "entradas_retomadas") {
    return `✅ *${lancamento}*\nEntradas retomadas às ${hora(dados.retomada_em as string)} depois de ${duracao(Number(dados.minutos_sem_entrada))} sem entradas.`;
  }
  if (tipo === "resumo") {
    const j = dados.janela as Janela;
    return [
      `📊 *${lancamento}* — ${hora(j.de)} às ${hora(j.ate)}`,
      `Inscrições: ${j.inscricoes}`,
      `Entradas no grupo: ${j.entradas}` + (j.saidas ? ` · Saídas: ${j.saidas}` : ""),
      dados.inscricoes_externas ? "" : `Dos inscritos no período, ${pct(j.inscritos_no_grupo, j.inscricoes)} já estão no grupo.`,
    ].filter(Boolean).join("\n");
  }
  if (tipo === "teste") {
    return `🔔 *${lancamento}*\nMensagem de teste do monitor do painel Sendflow.`;
  }
  return `${lancamento}: ${tipo}`;
}

/** Alertas do redirecionador de grupos (puro — testável). */
export function mensagemRedirecionador(tipo: string, funil: string, d: Record<string, unknown>): string | null {
  const proximo = d.proximo ? `Agora os cliques vão para *${d.proximo}*.` : "⚠️ Não há outro grupo disponível na fila!"
  const fila = typeof d.restantes === "number" ? `Grupos ativos na fila: ${d.restantes}.` : ""
  if (tipo === "cheio") {
    return [`📦 *Redirecionador ${funil}*`, `O grupo *${d.grupo}* chegou a ${d.cliques} cliques e foi considerado cheio.`, proximo, fila].filter(Boolean).join("\n")
  }
  if (tipo === "invalido") {
    return [`🚫 *Redirecionador ${funil}*`, `O convite do grupo *${d.grupo}* deixou de funcionar (link redefinido ou revogado).`, proximo,
      "Se o grupo tiver o ID do Sendflow, já pedimos um link novo.", fila].filter(Boolean).join("\n")
  }
  if (tipo === "link_novo") {
    return [`🔗 *Redirecionador ${funil}*`, `O grupo *${d.grupo}* recebeu link novo${d.origem === "sendflow" ? " do Sendflow" : ""} e voltou para a fila.`].join("\n")
  }
  if (tipo === "sem_grupos") {
    return [`🆘 *Redirecionador ${funil}*`, "Nenhum grupo disponível! Os cliques estão indo para " + (d.reserva ? `o link reserva (${d.reserva}).` : "lugar nenhum (sem link reserva)."),
      "Adicione ou reative grupos no painel."].join("\n")
  }
  if (tipo === "redefinicao_sem_retorno") {
    return `⚠️ *Redirecionador ${funil}*\nPedimos link novo do grupo *${d.grupo}* ao Sendflow há ${d.minutos} min e ainda não chegou. Confira no Sendflow ou cole o link novo no painel.`
  }
  if (tipo === "redefinicao_falhou") {
    return `⚠️ *Redirecionador ${funil}*\nO Sendflow recusou o pedido de link novo do grupo *${d.grupo}* (${d.http ?? "erro de rede"}). Redefina pelo Sendflow e cole o link no painel.`
  }
  return null
}
