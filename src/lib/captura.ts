export type DadosCaptura = {
  nome: string | null;
  email: string | null;
  telefone: string | null;
  lancamento: string | null;
  pagina: string | null;
  experiencia: string | null;
  landing: string | null;
  pagina_obrigado: string | null;
  pagina_captura: string | null;
  utm: Record<string, string>;
};

const IGNORAR = new Set(["value", "raw_value", "rawvalue", "fields", "form_fields", "formfields", "data", "dados", "form", "0"]);

const ALIAS: Record<string, keyof Omit<DadosCaptura, "utm"> | `utm_${string}`> = {
  nome: "nome", name: "nome", fullname: "nome", full_name: "nome", first_name: "nome", firstname: "nome", nome_completo: "nome",
  email: "email", "e-mail": "email", e_mail: "email", mail: "email", correo: "email",
  telefone: "telefone", phone: "telefone", whatsapp: "telefone", celular: "telefone", tel: "telefone",
  telefono: "telefone", mobile: "telefone", phone_number: "telefone", numero: "telefone", fone: "telefone",
  lancamento: "lancamento", "lançamento": "lancamento", launch: "lancamento", lanzamiento: "lancamento",
  pagina: "pagina", page: "pagina", url: "pagina", page_url: "pagina", referrer: "pagina", origem: "pagina",
  experiencia: "experiencia", experience: "experiencia", nivel: "experiencia", nivel_experiencia: "experiencia",
  landing: "landing", landing_page: "landing",
  pagina_obrigado: "pagina_obrigado", pagina_de_obrigado: "pagina_obrigado", pagina_gracias: "pagina_obrigado",
  pagina_de_gracias: "pagina_obrigado", thank_you_page: "pagina_obrigado", obrigado: "pagina_obrigado",
  pagina_captura: "pagina_captura", pagina_de_captura: "pagina_captura", captura: "pagina_captura",
  persona: "pagina_captura", publico: "pagina_captura",
  utm_source: "utm_source", utm_medium: "utm_medium", utm_campaign: "utm_campaign",
  utm_content: "utm_content", utm_term: "utm_term",
};

/** "fields[email][value]" → "email"; "form_fields.phone" → "phone" */
export function nomeDoCampo(chave: string): string {
  const tokens = chave.split(/[[\].]+/).map((t) => t.trim()).filter(Boolean);
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i].toLowerCase();
    if (!IGNORAR.has(t)) return t;
  }
  return chave.toLowerCase();
}

function achatar(obj: unknown, prefixo = "", saida: Record<string, string> = {}, prof = 0): Record<string, string> {
  if (prof > 5 || obj == null) return saida;
  if (typeof obj !== "object") {
    saida[prefixo] = String(obj);
    return saida;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const p = prefixo ? `${prefixo}[${k}]` : k;
    // Formato Elementor/Typeform: { id: "email", value: "..." }
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      const id = typeof o.id === "string" ? o.id : typeof o.name === "string" ? o.name : null;
      if (id && ("value" in o) && (typeof o.value === "string" || typeof o.value === "number")) {
        saida[`${p}[${id}]`] = String(o.value);
        continue;
      }
    }
    achatar(v, p, saida, prof + 1);
  }
  return saida;
}

export function extrairCaptura(bruto: unknown, query?: URLSearchParams): DadosCaptura {
  const plano = achatar(bruto);
  const out: DadosCaptura = {
    nome: null, email: null, telefone: null, lancamento: null, pagina: null,
    experiencia: null, landing: null, pagina_obrigado: null, pagina_captura: null, utm: {},
  };
  const aplicar = (chave: string, valor: string) => {
    const v = valor.trim();
    if (!v) return;
    const destino = ALIAS[nomeDoCampo(chave)];
    if (!destino) return;
    if (destino.startsWith("utm_")) {
      out.utm[destino] ??= v;
    } else {
      const k = destino as keyof Omit<DadosCaptura, "utm">;
      out[k] ??= v;
    }
  };
  for (const [k, v] of Object.entries(plano)) {
    // Metadados do formulário (Elementor manda form[name], meta[...])
    if (/^(form|meta)\[/i.test(k)) continue;
    aplicar(k, v);
  }
  // Querystring completa lacunas (ex.: ?lancamento=set-2026&utm_source=ig)
  query?.forEach((v, k) => {
    if (k === "token" || k === "redirect") return;
    aplicar(k, v);
  });
  return out;
}
