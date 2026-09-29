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
  faixa_etaria: string | null;
  genero: string | null;
  resposta_dinheiro: string | null;
  grupo: boolean | null;
};

export type LinhaEntrada = {
  chave: string;
  entrou_em: string;
  telefone: string;
  grupo_nome: string | null;
};

export type ResultadoConversao = {
  linhas: LinhaPlanilha[];
  rejeitadas: { linha: number; motivo: string; valor: string }[];
  colunasFaltando: string[];
  /** A coluna Grupo tem nomes de grupos, não TRUE/FALSE: parece a lista de entradas no grupo. */
  pareceListaDeGrupo?: boolean;
};

export type ResultadoEntradas = {
  linhas: LinhaEntrada[];
  rejeitadas: { linha: number; motivo: string; valor: string }[];
  colunasFaltando: string[];
};

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// cabeçalho normalizado → campo
const COLUNAS: Record<string, keyof LinhaPlanilha | "fecha" | "hora" | "landing_variante"> = {
  fecha: "fecha", data: "fecha",
  hora: "hora",
  experiencia: "experiencia",
  telefono: "telefone", telefone: "telefone", whatsapp: "telefone",
  campana: "utm_campaign", campanha: "utm_campaign", campaign: "utm_campaign", utm_campaign: "utm_campaign",
  anuncio: "utm_content", utm_content: "utm_content",
  utm_source: "utm_source",
  utm_medium: "utm_medium",
  utm_term: "utm_term",
  landing: "landing",
  // Na planilha "Nunca operou", Pagina_captura traz a variante da página (Gen-Argentina, Jub-Uruguay...)
  pagina_captura: "landing_variante", "pagina captura": "landing_variante",
  "pagina de gracias": "pagina_obrigado", "pagina de obrigado": "pagina_obrigado", "pag.gracias": "pagina_obrigado",
  "pag. gracias": "pagina_obrigado", "pagina gracias": "pagina_obrigado",
  edad: "faixa_etaria", idade: "faixa_etaria", faixa_etaria: "faixa_etaria",
  genero: "genero", sexo: "genero",
  respuesta_dinero: "resposta_dinheiro", resposta_dinheiro: "resposta_dinheiro", dinero: "resposta_dinheiro",
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
  let t = (bruto ?? "").split("#")[0].trim();
  // Números exportados do Excel como decimal: "59899605956.0"
  if (/^\d+\.0+$/.test(t)) t = t.replace(/\.0+$/, "");
  // Notação científica perde dígitos — não dá para recuperar
  if (/^\d+(\.\d+)?e\+?\d+$/i.test(t)) return "";
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
  const bruto = (fecha ?? "").trim().split(/[ T]/)[0];
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(bruto);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bruto);
  const f = br ?? (iso ? [iso[0], iso[3], iso[2], iso[1]] : null);
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

  // Coluna Grupo com nomes de grupo em vez de TRUE/FALSE → é a lista de entradas
  let pareceListaDeGrupo = false;
  if (indice.grupo !== undefined) {
    const valores = dados.map((r) => (r[indice.grupo!] ?? "").trim()).filter(Boolean).slice(0, 200);
    const naoBool = valores.filter((v) => booleano(v) === null).length;
    pareceListaDeGrupo = valores.length > 0 && naoBool / valores.length > 0.5;
  }

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
    const variante = val(r, "landing_variante");
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
      landing: variante && variante !== "/" ? variante : val(r, "landing"),
      pagina_obrigado: val(r, "pagina_obrigado"),
      faixa_etaria: val(r, "faixa_etaria"),
      genero: val(r, "genero"),
      resposta_dinheiro: val(r, "resposta_dinheiro"),
      grupo: pareceListaDeGrupo ? null : booleano(val(r, "grupo") ?? ""),
    });
  });
  return { linhas, rejeitadas, colunasFaltando, pareceListaDeGrupo };
}

/** Lista de entradas nos grupos (aba "Leads Grupo": Fecha, Hora, Telefono, Grupo). */
export function converterEntradasGrupo(tabela: string[][]): ResultadoEntradas {
  const [cab = [], ...dados] = tabela;
  const idx: Partial<Record<"fecha" | "hora" | "telefone" | "grupo", number>> = {};
  cab.forEach((c, i) => {
    const k = semAcento(c);
    const campo = k === "fecha" || k === "data" ? "fecha" : k === "hora" ? "hora"
      : ["telefono", "telefone", "whatsapp", "numero", "phone"].includes(k) ? "telefone"
      : ["grupo", "group", "grupo_nome"].includes(k) ? "grupo" : null;
    if (campo && idx[campo] === undefined) idx[campo] = i;
  });
  const colunasFaltando = (["fecha", "hora", "telefone"] as const).filter((c) => idx[c] === undefined);
  // Sem cabeçalho "Grupo": procura uma coluna sem título cujo conteúdo seja o nome do grupo
  if (idx.grupo === undefined) {
    const col = colunaDeNomesDeGrupo(tabela);
    if (col !== null) idx.grupo = col;
  }
  const linhas: LinhaEntrada[] = [];
  const rejeitadas: ResultadoEntradas["rejeitadas"] = [];
  if (colunasFaltando.length) return { linhas, rejeitadas, colunasFaltando: [...colunasFaltando] };
  const v = (r: string[], k: keyof typeof idx) => (idx[k] === undefined ? "" : (r[idx[k]!] ?? "").trim());
  dados.forEach((r, n) => {
    if (r.every((c) => !c || !c.trim())) return;
    const fecha = v(r, "fecha"), hora = v(r, "hora"), tel = v(r, "telefone"), grupo = v(r, "grupo");
    const quando = dataHoraUruguai(fecha, hora);
    if (!quando) { rejeitadas.push({ linha: n + 2, motivo: "data/hora inválida", valor: `${fecha} ${hora}` }); return; }
    const telefone = limparTelefonePlanilha(tel);
    if (telefone.length < 8) { rejeitadas.push({ linha: n + 2, motivo: "telefone inválido", valor: tel }); return; }
    linhas.push({ chave: `${fecha}|${hora}|${tel}|${grupo}`, entrou_em: quando, telefone, grupo_nome: grupo || null });
  });
  return { linhas, rejeitadas, colunasFaltando: [] };
}

// ---------------------------------------------------------------------
// Planilhas .xlsx com várias abas
// ---------------------------------------------------------------------

/** Converte o valor de uma célula (.xlsx) no mesmo texto que o Google Sheets exportaria em CSV. */
export function celulaParaTexto(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return "";
    const p = (n: number) => String(n).padStart(2, "0");
    const hora = `${v.getUTCHours()}:${p(v.getUTCMinutes())}:${p(v.getUTCSeconds())}`;
    // Excel guarda horas "puras" como datas em 30/12/1899
    if (v.getUTCFullYear() <= 1900) return hora;
    const data = `${p(v.getUTCDate())}/${p(v.getUTCMonth() + 1)}/${v.getUTCFullYear()}`;
    return v.getUTCHours() || v.getUTCMinutes() || v.getUTCSeconds() ? `${data} ${hora}` : data;
  }
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  return String(v);
}

/** Coluna sem título em que a maioria dos valores é texto (ex.: "La Semana del Inversionista #5"). */
export function colunaDeNomesDeGrupo(tabela: string[][]): number | null {
  const [cab = [], ...dados] = tabela;
  const amostra = dados.slice(0, 500);
  for (let i = 0; i < cab.length; i++) {
    if ((cab[i] ?? "").trim() !== "" && !/^\d+$/.test((cab[i] ?? "").trim())) continue;
    const valores = amostra.map((r) => (r[i] ?? "").trim()).filter(Boolean);
    if (valores.length < Math.max(5, amostra.length * 0.2)) continue;
    const texto = valores.filter((v) => /[A-Za-zÀ-ÿ]/.test(v)).length;
    if (texto / valores.length > 0.8) return i;
  }
  return null;
}

export type TipoAba = "leads" | "entradas" | "ignorar";

/** Descobre o que é cada aba: leads, lista de entradas no grupo, ou nada. */
export function classificarAba(nome: string, tabela: string[][]): { tipo: TipoAba; motivo: string; copia: boolean } {
  const copia = /c[oó]pia|copy|backup/i.test(nome);
  const cab = (tabela[0] ?? []).map((c) => semAcento(c ?? ""));
  const tem = (...ks: string[]) => ks.some((k) => cab.includes(k));
  const linhas = tabela.length - 1;
  if (!tem("fecha", "data") || !tem("hora") || !tem("telefono", "telefone", "whatsapp")) {
    return { tipo: "ignorar", motivo: "sem as colunas Fecha, Hora e Telefono", copia };
  }
  if (linhas < 1) return { tipo: "ignorar", motivo: "vazia", copia };
  const camposDeLead = tem("utm_source", "anuncio", "experiencia", "edad", "campana", "campaign", "pagina_captura", "landing");
  if (camposDeLead) return { tipo: "leads", motivo: "inscrições da página de captura", copia };
  if (tem("grupo")) {
    const r = converterPlanilha(tabela);
    if (r.pareceListaDeGrupo) return { tipo: "entradas", motivo: "lista de quem entrou nos grupos", copia };
    return { tipo: "leads", motivo: "leads com coluna Grupo (TRUE/FALSE)", copia };
  }
  if (colunaDeNomesDeGrupo(tabela) !== null || /grupo|group|entradas|membros/i.test(nome)) {
    return { tipo: "entradas", motivo: "lista de quem entrou nos grupos", copia };
  }
  return { tipo: "ignorar", motivo: "não reconhecida", copia };
}
