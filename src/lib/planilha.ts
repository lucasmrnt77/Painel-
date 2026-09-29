/**
 * Conversão da planilha histórica de leads ("Pagina de Traders - Leads")
 * para o formato aceito pela RPC importar_planilha. Roda no navegador
 * (e nos testes) — não depende de nada do servidor.
 */

export type LinhaPlanilha = {
  chave: string;
  criado_em: string;
  telefone: string;
  experiencia: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_term: string | null;
  landing: string | null;
  pagina_obrigado: string | null;
  grupo: boolean | null;
};

export type ResultadoConversao = {
  linhas: LinhaPlanilha[];
  rejeitadas: { linha: number; motivo: string; valor: string }[];
  colunasFaltando: string[];
};

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// cabeçalho normalizado → campo
const COLUNAS: Record<string, keyof LinhaPlanilha | "fecha" | "hora"> = {
  fecha: "fecha", data: "fecha",
  hora: "hora",
  experiencia: "experiencia",
  telefono: "telefone", telefone: "telefone", whatsapp: "telefone",
  campana: "utm_campaign", campanha: "utm_campaign", utm_campaign: "utm_campaign",
  anuncio: "utm_content", utm_content: "utm_content",
  utm_source: "utm_source",
  utm_medium: "utm_medium",
  utm_term: "utm_term",
  landing: "landing",
  "pagina de gracias": "pagina_obrigado", "pagina de obrigado": "pagina_obrigado",
  grupo: "grupo",
  // CHEQUEO (controle do fluxo de 10 min) e Pais não são importados
};

const OBRIGATORIAS = ["fecha", "hora", "telefone"];

/**
 * Limpa telefones digitados com lixo:
 *  "59897979053,"      → 59897979053
 *  "59892368710#96"    → 59892368710
 *  "54+54929846781"    → 54929846781  (DDI repetido)
 *  "598+1098487009"    → 5981098487009
 */
export function limparTelefonePlanilha(bruto: string): string {
  let t = (bruto ?? "").split("#")[0];
  if (t.includes("+")) {
    const partes = t.split("+").map((p) => p.replace(/\D/g, "")).filter(Boolean);
    if (partes.length >= 2) {
      const [ddi, ...resto] = partes;
      const numero = resto.join("");
      t = numero.startsWith(ddi) ? numero : ddi + numero;
    }
  }
  return t.replace(/\D/g, "");
}

/** "12/07/2026" + "5:06:40" → "2026-07-12T05:06:40-03:00" (horário do Uruguai) */
export function dataHoraUruguai(fecha: string, hora: string): string | null {
  const f = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((fecha ?? "").trim());
  const h = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec((hora ?? "").trim());
  if (!f || !h) return null;
  const [, d, m, a] = f;
  const [, hh, mm, ss] = h;
  const dia = Number(d), mes = Number(m), hr = Number(hh), mi = Number(mm), se = Number(ss ?? "0");
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || hr > 23 || mi > 59 || se > 59) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${a}-${p(mes)}-${p(dia)}T${p(hr)}:${p(mi)}:${p(se)}-03:00`;
}

function booleano(v: string): boolean | null {
  const t = semAcento(v ?? "");
  if (["true", "verdadero", "verdadeiro", "si", "sim", "1", "x", "ok"].includes(t)) return true;
  if (["false", "falso", "no", "nao", "0"].includes(t)) return false;
  return null;
}

/** Recebe as linhas já separadas em células (primeira = cabeçalho). */
export function converterPlanilha(tabela: string[][]): ResultadoConversao {
  const [cab = [], ...dados] = tabela;
  const indice: Partial<Record<string, number>> = {};
  cab.forEach((c, i) => {
    const campo = COLUNAS[semAcento(c)];
    if (campo && indice[campo] === undefined) indice[campo] = i;
  });
  const colunasFaltando = OBRIGATORIAS.filter((c) => indice[c] === undefined);
  const linhas: LinhaPlanilha[] = [];
  const rejeitadas: ResultadoConversao["rejeitadas"] = [];
  if (colunasFaltando.length) return { linhas, rejeitadas, colunasFaltando };

  const val = (r: string[], campo: string) => {
    const i = indice[campo];
    const v = i === undefined ? "" : (r[i] ?? "").trim();
    return v === "" ? null : v;
  };

  dados.forEach((r, n) => {
    if (r.every((c) => !c || !c.trim())) return; // linha vazia
    const numeroLinha = n + 2; // +1 cabeçalho, +1 base 1
    const fecha = val(r, "fecha") ?? "";
    const hora = val(r, "hora") ?? "";
    const telBruto = val(r, "telefone") ?? "";
    const criado = dataHoraUruguai(fecha, hora);
    if (!criado) {
      rejeitadas.push({ linha: numeroLinha, motivo: "data/hora inválida", valor: `${fecha} ${hora}` });
      return;
    }
    const telefone = limparTelefonePlanilha(telBruto);
    if (telefone.length < 8) {
      rejeitadas.push({ linha: numeroLinha, motivo: "telefone inválido", valor: telBruto });
      return;
    }
    linhas.push({
      chave: `${fecha}|${hora}|${telBruto}`,
      criado_em: criado,
      telefone,
      experiencia: val(r, "experiencia"),
      utm_campaign: val(r, "utm_campaign"),
      utm_content: val(r, "utm_content"),
      utm_source: val(r, "utm_source"),
      utm_medium: val(r, "utm_medium"),
      utm_term: val(r, "utm_term"),
      landing: val(r, "landing"),
      pagina_obrigado: val(r, "pagina_obrigado"),
      grupo: booleano(val(r, "grupo") ?? ""),
    });
  });
  return { linhas, rejeitadas, colunasFaltando };
}
