/** Textos dos alertas (puro — testável). Os textos vêm dos modelos em modelos-alertas.ts. */
import { montar, type Modelos } from "./modelos-alertas";

type Janela = { inscricoes: number; entradas: number; saidas: number; inscritos_no_grupo: number; de: string; ate: string };

const FUSO = "America/Montevideo";
const hora = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "—";
const diaHora = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "—";
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

export function mensagemAlerta(tipo: string, lancamento: string, dados: Record<string, unknown>, modelos?: Modelos): string {
  if (tipo === "sem_entradas") {
    const j = dados.janela as Janela;
    const ultima = dados.ultima_entrada_em as string | null;
    const diagnostico =
      j.inscricoes === 0
        ? "Nenhuma inscrição nesse período: o tráfego parece parado. Confira os anúncios."
        : `${j.inscricoes} inscrição(ões) nesse período, mas ninguém entrou: confira a página de obrigado e o link do grupo.`;
    return montar(tipo, {
      lancamento, tempo: duracao(Number(dados.minutos_sem_entrada)), ultima_entrada: hora(ultima), inscricoes: j.inscricoes, diagnostico,
      linha_ultima_entrada: ultima ? `Última entrada: ${hora(ultima)}.` : "Nenhuma entrada desde que o monitor foi ligado.",
    }, modelos);
  }
  if (tipo === "sem_leads") {
    const ultimo = dados.ultimo_lead_em as string | null;
    return montar(tipo, {
      lancamento, tempo: duracao(Number(dados.minutos_sem_lead)), ultimo_lead: diaHora(ultimo),
      linha_ultimo_lead: ultimo ? `Último lead: ${diaHora(ultimo)} (horário UY).` : "Nenhum lead desde que o monitor foi ligado.",
    }, modelos);
  }
  if (tipo === "planilha_parada") {
    return montar(tipo, { lancamento, tempo: duracao(Number(dados.minutos_parada)), ultima_busca: diaHora(dados.ultima_em as string) }, modelos);
  }
  if (tipo === "leads_retomados") {
    return montar(tipo, { lancamento, retomada_em: diaHora(dados.retomada_em as string), tempo: duracao(Number(dados.minutos_sem_lead)) }, modelos);
  }
  if (tipo === "entradas_retomadas") {
    return montar(tipo, { lancamento, retomada_em: hora(dados.retomada_em as string), tempo: duracao(Number(dados.minutos_sem_entrada)) }, modelos);
  }
  if (tipo === "resumo") {
    const j = dados.janela as Janela;
    return montar(tipo, {
      lancamento, de: hora(j.de), ate: hora(j.ate), inscricoes: j.inscricoes, entradas: j.entradas,
      saidas: j.saidas ? ` · Saídas: ${j.saidas}` : "",
      linha_no_grupo: dados.inscricoes_externas ? "" : `Dos inscritos no período, ${pct(j.inscritos_no_grupo, j.inscricoes)} já estão no grupo.`,
    }, modelos);
  }
  if (tipo === "teste") return montar(tipo, { lancamento }, modelos);
  return `${lancamento}: ${tipo}`;
}

/** Alertas do redirecionador de grupos (puro — testável). */
export function mensagemRedirecionador(tipo: string, funil: string, d: Record<string, unknown>, modelos?: Modelos): string | null {
  const base = {
    funil, grupo: d.grupo == null ? "" : String(d.grupo), cliques: d.cliques as number,
    linha_proximo: d.proximo ? `Agora os cliques vão para *${d.proximo}*.` : "⚠️ Não há outro grupo disponível na fila!",
    linha_fila: typeof d.restantes === "number" ? `Grupos ativos na fila: ${d.restantes}.` : "",
  }
  if (tipo === "cheio" || tipo === "invalido") return montar(tipo, base, modelos)
  if (tipo === "link_novo") return montar(tipo, { ...base, do_sendflow: d.origem === "sendflow" ? " do Sendflow" : "" }, modelos)
  if (tipo === "sem_grupos") {
    return montar(tipo, { funil, destino: d.reserva ? `o link reserva (${d.reserva}).` : "lugar nenhum (sem link reserva)." }, modelos)
  }
  if (tipo === "redefinicao_sem_retorno") return montar(tipo, { ...base, minutos: d.minutos as number }, modelos)
  if (tipo === "redefinicao_falhou") return montar(tipo, { ...base, erro: String(d.http ?? "erro de rede") }, modelos)
  return null
}
