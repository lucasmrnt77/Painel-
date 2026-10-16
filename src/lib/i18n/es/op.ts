import type { Dic, Padroes } from "./tipos";

/** OP Futuros em Visão geral / Inscritos x grupo / Análise e a nomenclatura da aba Páginas. */
export const ES_OP: Dic = {
  "(não entrou)": "(no entró)",
  "(sem UTM)": "(sin UTM)",
  "(sem país)": "(sin país)",
  "A coluna \"% do total\" mostra a divisão real do tráfego dentro de cada página. Num teste de 3 páginas com 33% cada, cada uma deve ficar perto de 33%.":
    "La columna \"% del total\" muestra la división real del tráfico dentro de cada página. En una prueba de 3 páginas con 33% cada una, cada una debería quedar cerca del 33%.",
  "A taxa de entrada começa a ser calculada quando o webhook da campanha OP - FUTUROS mandar o primeiro evento.":
    "La tasa de entrada se empieza a calcular cuando el webhook de la campaña OP - FUTUROS mande el primer evento.",
  "As taxas contam as inscrições desde {d}, quando o webhook começou a mandar entradas ({n} inscritos). Para incluir quem entrou antes, importe a lista de membros em Inscritos x grupo.":
    "Las tasas cuentan las inscripciones desde {d}, cuando el webhook empezó a mandar entradas ({n} inscritos). Para incluir a quien entró antes, importá la lista de miembros en Inscritos x grupo.",
  "Cada pessoa conta uma vez (primeira inscrição). \"No grupo\" inclui quem entrou e depois saiu. Taxas em cinza têm menos de 30 leads. Verde ≥ 90%, vermelho < 75%.":
    "Cada persona cuenta una vez (primera inscripción). \"En el grupo\" incluye a quien entró y después salió. Tasas en gris tienen menos de 30 leads. Verde ≥ 90%, rojo < 75%.",
  "Divisão: landing × gracias · {s}": "División: landing × gracias · {s}",
  "E-mail ou telefone": "E-mail o teléfono",
  "Nomenclatura única nas duas páginas: captura /v1, /v2, /v3… e gracias /gracias-v1, /gracias-v2… Nomes antigos (/t1, /gracias-a, /gracias-trader-a) aparecem já convertidos; páginas de lançamentos antigos aparecem pelo nome que mandavam (ex.: Gen-Argentina).":
    "Nomenclatura única en las dos páginas: captura /v1, /v2, /v3… y gracias /gracias-v1, /gracias-v2… Los nombres viejos (/t1, /gracias-a, /gracias-trader-a) aparecen ya convertidos; las páginas de lanzamientos anteriores aparecen con el nombre que mandaban (ej.: Gen-Argentina).",
  "Não consegui cruzar inscrições e grupo.": "No pude cruzar inscripciones y grupo.",
  "O painel ainda não recebeu nenhum evento da campanha OP - FUTUROS pelo webhook do Sendflow. Assim que a primeira pessoa entrar, esta tela mostra quem entrou e quem saiu.":
    "El panel todavía no recibió ningún evento de la campaña OP - FUTUROS por el webhook de Sendflow. Apenas entre la primera persona, esta pantalla muestra quién entró y quién salió.",
  "O painel ainda não recebeu nenhum evento da campanha OP - FUTUROS pelo webhook do Sendflow. Até lá, todos aparecem como fora do grupo; dá para importar a lista de membros no fim da página.":
    "El panel todavía no recibió ningún evento de la campaña OP - FUTUROS por el webhook de Sendflow. Hasta entonces, todos aparecen fuera del grupo; podés importar la lista de miembros al final de la página.",
  "OP Futuros — grupo gratuito": "OP Futuros — grupo gratuito",
  "Página {s}": "Página {s}",
  "Páginas de captura · {s}": "Páginas de captura · {s}",
  "Páginas de gracias · {s}": "Páginas de gracias · {s}",
  "aguardando o webhook do Sendflow": "esperando el webhook de Sendflow",
  "{n} hoje · segundo o Sendflow": "{n} hoy · según Sendflow",
  "{n} sem inscrição na página": "{n} sin inscripción en la página",
};

export const PADROES_OP: Padroes = [];
