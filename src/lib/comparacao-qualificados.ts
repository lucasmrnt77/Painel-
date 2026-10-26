/**
 * Leads qualificados: NÓS × META (pedido do Emi, 24/10). Puro — tests/comparacao-qualificados.test.ts.
 *
 * Nós = quantos eventos de qualificado o servidor enviou nas últimas 24 h (eventos_meta, sem testes).
 * Meta = quantos ela registrou do mesmo evento, separado por origem (pixel do navegador e servidor),
 * pelas estatísticas do pixel (aggregation=event_source), que o serviço de tracking consulta.
 *
 * Cada lead manda 1 evento pelo navegador e 1 pelo servidor com o mesmo event_id, então o esperado é:
 *   servidor da Meta ≈ nós   e   navegador da Meta ≈ nós (ou um pouco menos: bloqueador de anúncios).
 * Problema (vai para o WhatsApp):
 *   • Meta com MAIS (servidor ou navegador acima de nós + testes, +20%): algo envia em dobro
 *     (ex.: o GTM também disparando o evento, ou a página mandando duas vezes) → a Meta infla os resultados.
 *   • Servidor da Meta com MENOS de 80% do que enviamos: eventos se perdendo no caminho.
 * Abaixo de 10 eventos não compara (ruído).
 */

export const QUALIFICADOS = ["Lead General Qualificado", "Lead Jubilado Qualificado", "Lead Qualificado GeneralJubilados", "Lead Trader Qualificado"];
export const MARGEM = 0.2;
export const MINIMO = 10;

export type FontesMeta = { evento: string; ok: boolean; navegador: number | null; servidor: number | null; fontes?: { valor: string; total: number }[]; erro?: string };

export type Situacao = "ok" | "meta_mais" | "meta_menos" | "poucos" | "sem_dados";

export type LinhaComparacao = {
  evento: string;
  nosso: number;
  testes: number;
  metaServidor: number | null;
  metaNavegador: number | null;
  situacao: Situacao;
  problemas: string[];
};

export function compararQualificados(
  fontes: FontesMeta[] | null | undefined,
  nossos: Record<string, number>,
  testes: Record<string, number>,
  eventos: string[] = QUALIFICADOS,
): LinhaComparacao[] {
  return eventos.map((evento): LinhaComparacao => {
    const nosso = nossos[evento] ?? 0;
    const t = testes[evento] ?? 0;
    const f = fontes?.find((x) => x.evento === evento);
    const base = { evento, nosso, testes: t, metaServidor: f?.servidor ?? null, metaNavegador: f?.navegador ?? null, problemas: [] as string[] };
    if (!f || !f.ok || (f.servidor == null && f.navegador == null)) return { ...base, situacao: "sem_dados" };
    const srv = f.servidor, nav = f.navegador;
    if (Math.max(nosso, srv ?? 0, nav ?? 0) < MINIMO) return { ...base, situacao: "poucos" };

    // Teto: o que enviamos + os testes do período (a Meta pode contar parte deles), com a margem
    const teto = (nosso + t) * (1 + MARGEM);
    const problemas: string[] = [];
    let situacao: Situacao = "ok";
    if (srv != null && srv > teto) {
      situacao = "meta_mais";
      problemas.push(`${evento}: a Meta registrou ${srv} pelo servidor nas últimas 24 h e nós enviamos ${nosso} — tem envio em dobro (a Meta está contando a mais).`);
    }
    if (nav != null && nav > teto) {
      situacao = "meta_mais";
      problemas.push(`${evento}: o pixel do navegador registrou ${nav} na Meta e nós enviamos ${nosso} — o evento está disparando mais de uma vez no navegador (ex.: GTM também mandando).`);
    }
    if (srv != null && nosso >= MINIMO && srv < nosso * (1 - MARGEM)) {
      situacao = situacao === "meta_mais" ? situacao : "meta_menos";
      problemas.push(`${evento}: nós enviamos ${nosso} nas últimas 24 h e a Meta só registrou ${srv} pelo servidor (faltam ${Math.round(((nosso - srv) / nosso) * 100)}%).`);
    }
    return { ...base, situacao, problemas };
  });
}
