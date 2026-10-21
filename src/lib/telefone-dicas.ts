/**
 * Causa provável e como corrigir cada problema de telefone da Base de leads (pelo motivo gerado no banco).
 * Puro — testado em tests/telefone-dicas.test.ts.
 */
export type Dica = {
  causa: string;
  comoCorrigir: string;
  /** A sugestão automática deste tipo é confiável para aprovar em bloco. */
  sugestaoConfiavel: boolean;
  /** Melhor caminho: descartar (não dá para recuperar o número). */
  descartar: boolean;
};

export function dicaDoMotivo(motivo: string | null | undefined): Dica {
  const m = (motivo ?? "").replace(/ \(país informado diferente\)$/, "");
  if (/^Argentina: falta o código de área/.test(m))
    return {
      causa: "A pessoa digitou o 15 (celular) sem o código de área.",
      comoCorrigir: "A sugestão usa o código 11 (Buenos Aires); nos casos que deu para conferir pelo grupo, acertou todos. Pode aprovar em bloco.",
      sugestaoConfiavel: true, descartar: false,
    };
  if (/^Uruguai: parece número argentino/.test(m))
    return {
      causa: "Número argentino digitado com o código do Uruguai (598) na frente.",
      comoCorrigir: "Trocar 598 por 549. Pode aprovar em bloco.",
      sugestaoConfiavel: true, descartar: false,
    };
  if (/^Uruguai: um dígito a mais/.test(m))
    return {
      causa: "Um dígito a mais (normalmente um número digitado duas vezes).",
      comoCorrigir: "Não dá para saber qual dígito sobra: a sugestão tira o último e erra na maioria dos casos. Edite à mão (celular do Uruguai: 598 + 9 + 7 dígitos).",
      sugestaoConfiavel: false, descartar: false,
    };
  if (/^número de teste/.test(m) || m === "vazio")
    return { causa: "Número de teste ou vazio.", comoCorrigir: "Descartar.", sugestaoConfiavel: false, descartar: true };
  if (/faltam dígitos/.test(m))
    return {
      causa: "Número incompleto: faltou o código de área ou parte do número.",
      comoCorrigir: "Só dá para corrigir com o número certo (ex.: conferindo no WhatsApp). Sem isso, descartar.",
      sugestaoConfiavel: false, descartar: false,
    };
  if (/dígitos a mais/.test(m))
    return {
      causa: "Dígitos a mais: número repetido, dois números juntos ou código de país duplicado.",
      comoCorrigir: "Edite à mão se der para ver o número certo; se não, descartar.",
      sugestaoConfiavel: false, descartar: false,
    };
  if (/código de área inválido|celular deveria começar com 9/.test(m))
    return {
      causa: "Formato que não existe no país (código de área ou início do celular errado).",
      comoCorrigir: "Edite à mão se der para ver o número certo; se não, descartar.",
      sugestaoConfiavel: false, descartar: false,
    };
  if (/sem código de país/.test(m))
    return {
      causa: "Sem código de país e num formato que não dá para adivinhar o país.",
      comoCorrigir: "Edite com o código do país (ex.: 549… Argentina, 598… Uruguai) ou descarte.",
      sugestaoConfiavel: false, descartar: false,
    };
  return { causa: m || "Formato desconhecido.", comoCorrigir: "Edite à mão ou descarte.", sugestaoConfiavel: false, descartar: false };
}
