import type { Dic, Padroes } from "./tipos";

/** Decisão por anúncio (18/11/2026). */
export const ES_ANUNCIOS: Dic = {
  "Decisão por anúncio": "Decisión por anuncio",
  "Tudo o que cada anúncio já trouxe desde o primeiro dia, com a recomendação de escalar, manter ou pausar":
    "Todo lo que cada anuncio trajo desde el primer día, con la recomendación de escalar, mantener o pausar",
  "Funil": "Embudo",
  "Todos": "Todos",
  "País": "País",
  "Anúncios": "Anuncios",
  "Ativos": "Activos",
  "Todos (inclui pausados)": "Todos (incluye pausados)",
  "Agrupar": "Agrupar",
  "Por criativo (soma os públicos)": "Por creativo (suma los públicos)",
  "Por anúncio (cada público)": "Por anuncio (cada público)",
  "Escalar": "Escalar",
  "Manter": "Mantener",
  "Pausar": "Pausar",
  "Manter (faltam dados)": "Mantener (faltan datos)",
  "Verba até agora: {v}": "Inversión hasta ahora: {v}",
  "Anúncios · somando todos os dias": "Anuncios · sumando todos los días",
  "Anúncio": "Anuncio",
  "Funil · país": "Embudo · país",
  "Situação na Meta": "Estado en Meta",
  "Verba": "Inversión",
  "Leads": "Leads",
  "Qualificados": "Calificados",
  "Qualificados no grupo": "Calificados en el grupo",
  "Custo por qualificado": "Costo por calificado",
  "Faixa provável (95%)": "Rango probable (95%)",
  "Custo previsto": "Costo previsto",
  "Decisão": "Decisión",
  "{n} anúncio(s) · {a} ativo(s)": "{n} anuncio(s) · {a} activo(s)",
  "Ativo": "Activo",
  "Pausado": "Pausado",
  "Está pausado: vale reativar": "Está pausado: conviene reactivarlo",
  "Gastou {x}× o custo previsto sem nenhum qualificado": "Gastó {x}× el costo previsto sin ningún calificado",
  "Mesmo no melhor caso fica acima do previsto ({a})": "Incluso en el mejor caso queda por encima de lo previsto ({a})",
  "Mesmo no pior caso fica abaixo do previsto ({a})": "Incluso en el peor caso queda por debajo de lo previsto ({a})",
  "Faltam dados: a faixa ainda inclui o previsto ({a})": "Faltan datos: el rango todavía incluye lo previsto ({a})",
  "Faltam dados: gastou {x}× o previsto, sem qualificado ainda": "Faltan datos: gastó {x}× lo previsto, todavía sin calificados",
  "Sem custo previsto para este funil e país nas premissas": "Sin costo previsto para este embudo y país en las premisas",
  "Como a decisão é feita": "Cómo se toma la decisión",
  "Soma todos os dias de cada anúncio. Olhar um dia isolado engana: com 2 leads, um a mais ou a menos muda tudo.":
    "Suma todos los días de cada anuncio. Mirar un día aislado engaña: con 2 leads, uno de más o de menos cambia todo.",
  "Métrica: custo por lead qualificado (o mesmo evento que vai para a Meta), comparado ao custo previsto nas premissas do lançamento. Jubilados usa o da General.":
    "Métrica: costo por lead calificado (el mismo evento que va a Meta), comparado con el costo previsto en las premisas del lanzamiento. Jubilados usa el de General.",
  "Faixa provável: onde o custo real deve estar, com 95% de confiança. Quanto mais qualificados, mais estreita a faixa.":
    "Rango probable: dónde debería estar el costo real, con 95% de confianza. Cuantos más calificados, más angosto el rango.",
  "Pausar: gastou {x}× o custo previsto sem nenhum qualificado, ou a faixa inteira ficou acima do previsto.":
    "Pausar: gastó {x}× el costo previsto sin ningún calificado, o el rango entero quedó por encima de lo previsto.",
  "Escalar: a faixa inteira ficou abaixo do previsto. Em geral isso exige uns 20 qualificados.":
    "Escalar: el rango entero quedó por debajo de lo previsto. En general eso requiere unos 20 calificados.",
  "Manter: a faixa ainda inclui o custo previsto. Falta verba para concluir; não é sinal de que o anúncio é ruim.":
    "Mantener: el rango todavía incluye el costo previsto. Falta inversión para concluir; no es señal de que el anuncio sea malo.",
  "Leads e qualificados chegam ao anúncio pelo id no utm_term. Verba e visitas vêm da base da Meta.":
    "Los leads y calificados se asignan al anuncio por el id en el utm_term. La inversión y las visitas vienen de la base de Meta.",
};

export const PADROES_ANUNCIOS: Padroes = [];
