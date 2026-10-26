/**
 * Catálogo de alertas: todas as alertas que o painel gera, quando disparam,
 * se vão para o WhatsApp, a mensagem atual (gerada pelas mesmas funções que enviam)
 * e o que olhar para resolver. Puro — testado em tests/catalogo-alertas.test.ts.
 *
 * Ao criar uma alerta nova ou mudar uma mensagem, atualize esta lista: o teste
 * confere que todo tipo que aparece no histórico tem entrada aqui.
 */
import { mensagemAlerta, mensagemRedirecionador } from "./mensagens";
import { mensagemSaude } from "./meta-saude-regras";
import { mensagemAds } from "./meta-ads-regras";
import { mensagemTestes, type Execucao } from "./testes-casos";
import type { Modelos } from "./modelos-alertas";

type Texto = { pt: string; es: string };
type Lista = { pt: string[]; es: string[] };

export type Area = "lancamento" | "grupo" | "planilha" | "redirecionador" | "eventos" | "meta" | "ads";
export type Envio = "whatsapp" | "condicional" | "painel" | "manual";

export type ItemCatalogo = {
  tipo: string;
  area: Area;
  nome: Texto;
  envio: Envio;
  /** Quando vai para o WhatsApp (complementa `envio`). */
  envioDetalhe: Texto;
  quando: Texto;
  repeticao: Texto;
  diagnostico: Texto;
  verificar: Lista;
  /** Qual configuração do painel define o prazo (para mostrar o valor atual). */
  config?: "lancamento" | "grupo";
  exemplo: (modelos?: Modelos) => string;
};

export const AREAS: Record<Area, Texto> = {
  lancamento: { pt: "Lançamento", es: "Lanzamiento" },
  grupo: { pt: "Grupo gratuito (OP Futuros)", es: "Grupo gratuito (OP Futuros)" },
  planilha: { pt: "Planilhas", es: "Planillas" },
  redirecionador: { pt: "Redirecionador de grupos", es: "Redireccionador de grupos" },
  eventos: { pt: "Testes diários dos eventos Meta", es: "Pruebas diarias de los eventos Meta" },
  meta: { pt: "Saúde na Meta", es: "Salud en Meta" },
  ads: { pt: "Campanhas na Meta (gasto e custo por lead)", es: "Campañas en Meta (gasto y costo por lead)" },
};

// Datas de exemplo fixas para a mensagem de amostra
const H = (h: number, m = 0) => new Date(Date.UTC(2026, 11, 7, h + 3, m)).toISOString(); // horário UY
const LANC = "Lançamento Dezembro";

const execucaoExemplo = {
  origem: "servidor", disparo: "agendado", ok: false, total: 42, falhas: 2,
  resumo: [{ nome: "Lead General", total: 20, falhas: 2 }],
  detalhes: [
    { teste: "AR · Sí · hombre · 35-44 → Lead Qualificado", motivo: "o evento não chegou à Meta (status 400)" },
    { teste: "UY · No hoy → Lead Qualificado", motivo: "event_id diferente entre pixel e servidor" },
  ],
} as unknown as Execucao;

export const CATALOGO: ItemCatalogo[] = [
  // ------------------------------------------------------------------ Lançamento
  {
    tipo: "sem_entradas", area: "lancamento", envio: "whatsapp", config: "lancamento",
    nome: { pt: "Sem entradas no grupo", es: "Sin entradas al grupo" },
    envioDetalhe: { pt: "Sempre.", es: "Siempre." },
    quando: {
      pt: "Com o monitor do lançamento ligado, ninguém entrou nos grupos do WhatsApp (evento \"entrou\" do Sendflow) dentro do prazo configurado. O prazo conta da última entrada ou de quando o monitor foi ligado.",
      es: "Con el monitor del lanzamiento encendido, nadie entró a los grupos de WhatsApp (evento \"entró\" de Sendflow) dentro del plazo configurado. El plazo cuenta desde la última entrada o desde que se encendió el monitor.",
    },
    repeticao: { pt: "Uma vez a cada prazo inteiro de silêncio (ex.: prazo de 1 h → alerta com 1 h, 2 h, 3 h…).", es: "Una vez por cada plazo completo de silencio (ej.: plazo de 1 h → alerta a la 1 h, 2 h, 3 h…)." },
    diagnostico: {
      pt: "O funil parou em algum ponto entre o anúncio e o grupo. A mensagem já diz qual lado: se houve inscrições no período, as pessoas se inscrevem mas não chegam ao grupo; se não houve nenhuma, o tráfego parou.",
      es: "El embudo se cortó en algún punto entre el anuncio y el grupo. El mensaje ya indica qué lado: si hubo inscripciones en el período, la gente se inscribe pero no llega al grupo; si no hubo ninguna, el tráfico se detuvo.",
    },
    verificar: {
      pt: [
        "Sem inscrições: Gerenciador de Anúncios — campanhas pausadas, sem saldo, reprovadas ou com orçamento esgotado.",
        "Sem inscrições: abrir a página de captura no celular e conferir se carrega e se o formulário envia.",
        "Com inscrições: abrir a página de obrigado e tocar no botão do grupo — tem que abrir o WhatsApp.",
        "Com inscrições: aba Redirecionador — o funil está \"Funcionando\" ou ficou sem grupo na fila?",
        "Se as pessoas entram mas o painel não vê: no Sendflow, conferir se o webhook da campanha continua ativo (aba Eventos do painel mostra o último recebido).",
      ],
      es: [
        "Sin inscripciones: Administrador de anuncios — campañas pausadas, sin saldo, rechazadas o con presupuesto agotado.",
        "Sin inscripciones: abrir la página de captura en el celular y revisar que carga y que el formulario envía.",
        "Con inscripciones: abrir la página de gracias y tocar el botón del grupo — tiene que abrir WhatsApp.",
        "Con inscripciones: pestaña Redireccionador — ¿el embudo está \"Funcionando\" o se quedó sin grupo en la fila?",
        "Si la gente entra pero el panel no lo ve: en Sendflow, revisar que el webhook de la campaña siga activo (la pestaña Eventos del panel muestra el último recibido).",
      ],
    },
    exemplo: (m?: Modelos) => mensagemAlerta("sem_entradas", LANC, {
      minutos_sem_entrada: 75, ultima_entrada_em: H(10, 5),
      janela: { inscricoes: 14, entradas: 0, saidas: 0, inscritos_no_grupo: 0, de: H(10, 5), ate: H(11, 20) },
    }, m),
  },
  {
    tipo: "entradas_retomadas", area: "lancamento", envio: "painel",
    nome: { pt: "Entradas retomadas", es: "Entradas retomadas" },
    envioDetalhe: { pt: "Nunca: é um aviso de que voltou a funcionar.", es: "Nunca: es un aviso de que volvió a funcionar." },
    quando: { pt: "Depois de um alerta \"Sem entradas\", alguém volta a entrar no grupo.", es: "Después de una alerta \"Sin entradas\", alguien vuelve a entrar al grupo." },
    repeticao: { pt: "Uma vez por alerta de silêncio.", es: "Una vez por alerta de silencio." },
    diagnostico: { pt: "O problema anterior se resolveu (sozinho ou pelo ajuste feito).", es: "El problema anterior se resolvió (solo o por el ajuste hecho)." },
    verificar: { pt: ["Nada a fazer. Serve para saber quanto tempo o funil ficou parado."], es: ["Nada que hacer. Sirve para saber cuánto tiempo estuvo detenido el embudo."] },
    exemplo: (m?: Modelos) => mensagemAlerta("entradas_retomadas", LANC, { retomada_em: H(12, 40), minutos_sem_entrada: 155 }, m),
  },
  {
    tipo: "resumo", area: "lancamento", envio: "painel",
    nome: { pt: "Resumo periódico", es: "Resumen periódico" },
    envioDetalhe: { pt: "Nunca: fica só no histórico do painel.", es: "Nunca: queda solo en el historial del panel." },
    quando: { pt: "A cada intervalo de resumo configurado no lançamento (ex.: de hora em hora, alinhado ao relógio).", es: "Cada intervalo de resumen configurado en el lanzamiento (ej.: cada hora, alineado al reloj)." },
    repeticao: { pt: "Um por intervalo.", es: "Uno por intervalo." },
    diagnostico: { pt: "Informativo: inscrições, entradas e saídas do período.", es: "Informativo: inscripciones, entradas y salidas del período." },
    verificar: { pt: ["Comparar a % de inscritos que já estão no grupo com as horas anteriores."], es: ["Comparar el % de inscritos que ya están en el grupo con las horas anteriores."] },
    exemplo: (m?: Modelos) => mensagemAlerta("resumo", LANC, { janela: { inscricoes: 52, entradas: 41, saidas: 3, inscritos_no_grupo: 39, de: H(10), ate: H(11) } }, m),
  },
  {
    tipo: "teste", area: "lancamento", envio: "manual",
    nome: { pt: "Mensagem de teste", es: "Mensaje de prueba" },
    envioDetalhe: { pt: "Só quando alguém clica em \"Enviar alerta de teste\" na aba Alertas.", es: "Solo cuando alguien hace clic en \"Enviar alerta de prueba\" en la pestaña Alertas." },
    quando: { pt: "Clique manual, para confirmar que o envio para o WhatsApp funciona.", es: "Clic manual, para confirmar que el envío a WhatsApp funciona." },
    repeticao: { pt: "Uma por clique.", es: "Una por clic." },
    diagnostico: { pt: "Se não chegar no grupo de alertas, nenhuma outra alerta vai chegar.", es: "Si no llega al grupo de alertas, ninguna otra alerta va a llegar." },
    verificar: { pt: ["Se não chegou: card \"Envio dos alertas por WhatsApp\" na aba Alertas mostra o modo de envio e o erro.", "Conferir se a campanha de alertas do Sendflow tem o grupo da equipe."], es: ["Si no llegó: la tarjeta \"Envío de las alertas por WhatsApp\" en la pestaña Alertas muestra el modo de envío y el error.", "Revisar que la campaña de alertas de Sendflow tenga el grupo del equipo."] },
    exemplo: (m?: Modelos) => mensagemAlerta("teste", LANC, {}, m),
  },

  // ------------------------------------------------------------------ Grupo gratuito
  {
    tipo: "sem_leads", area: "grupo", envio: "whatsapp", config: "grupo",
    nome: { pt: "Sem leads na página do grupo gratuito", es: "Sin leads en la página del grupo gratuito" },
    envioDetalhe: { pt: "Sempre.", es: "Siempre." },
    quando: {
      pt: "Nenhuma inscrição nova na página do grupo gratuito (OP Futuros) dentro do prazo configurado (padrão 24 h). O prazo conta do último lead ou de quando o monitor foi ligado.",
      es: "Ninguna inscripción nueva en la página del grupo gratuito (OP Futuros) dentro del plazo configurado (por defecto 24 h). El plazo cuenta desde el último lead o desde que se encendió el monitor.",
    },
    repeticao: { pt: "Uma vez a cada prazo inteiro sem leads.", es: "Una vez por cada plazo completo sin leads." },
    diagnostico: { pt: "A página não está recebendo inscrições: ou o tráfego parou, ou a página/formulário quebrou.", es: "La página no está recibiendo inscripciones: o se detuvo el tráfico, o se rompió la página/formulario." },
    verificar: {
      pt: [
        "Gerenciador de Anúncios: campanha OP Futuros ativa, com saldo e anúncios aprovados.",
        "Abrir a página do grupo gratuito e fazer uma inscrição de teste (?tde_teste=1).",
        "Aba Grupo gratuito: conferir a hora do último lead e se o gráfico caiu de repente (quebra) ou aos poucos (anúncio cansado).",
      ],
      es: [
        "Administrador de anuncios: campaña OP Futuros activa, con saldo y anuncios aprobados.",
        "Abrir la página del grupo gratuito y hacer una inscripción de prueba (?tde_teste=1).",
        "Pestaña Grupo gratuito: revisar la hora del último lead y si el gráfico cayó de golpe (rotura) o de a poco (anuncio cansado).",
      ],
    },
    exemplo: (m?: Modelos) => mensagemAlerta("sem_leads", "OP Futuros", { minutos_sem_lead: 1500, ultimo_lead_em: H(9, 12) }, m),
  },
  {
    tipo: "leads_retomados", area: "grupo", envio: "painel",
    nome: { pt: "Leads retomados", es: "Leads retomados" },
    envioDetalhe: { pt: "Nunca: é um aviso de que voltou a funcionar.", es: "Nunca: es un aviso de que volvió a funcionar." },
    quando: { pt: "Depois de um alerta \"Sem leads\", entra um lead novo na página.", es: "Después de una alerta \"Sin leads\", entra un lead nuevo en la página." },
    repeticao: { pt: "Uma vez por alerta.", es: "Una vez por alerta." },
    diagnostico: { pt: "O problema anterior se resolveu.", es: "El problema anterior se resolvió." },
    verificar: { pt: ["Nada a fazer."], es: ["Nada que hacer."] },
    exemplo: (m?: Modelos) => mensagemAlerta("leads_retomados", "OP Futuros", { retomada_em: H(15, 30), minutos_sem_lead: 1700 }, m),
  },

  // ------------------------------------------------------------------ Planilhas
  {
    tipo: "planilha_parada", area: "planilha", envio: "whatsapp",
    nome: { pt: "Planilha parada", es: "Planilla detenida" },
    envioDetalhe: { pt: "Sempre.", es: "Siempre." },
    quando: {
      pt: "Uma planilha ligada ao painel (script unificada.gs) ficou 15 min sem buscar dados. Só vale para planilhas que buscaram nos últimos 3 dias (as abandonadas não alertam).",
      es: "Una planilla conectada al panel (script unificada.gs) estuvo 15 min sin buscar datos. Solo aplica a planillas que buscaron en los últimos 3 días (las abandonadas no alertan).",
    },
    repeticao: { pt: "Uma vez por parada.", es: "Una vez por parada." },
    diagnostico: { pt: "Os leads continuam salvos no painel; só a cópia na planilha está atrasada. Quando a planilha volta, ela recupera tudo sozinha.", es: "Los leads siguen guardados en el panel; solo la copia en la planilla está atrasada. Cuando la planilla vuelve, recupera todo sola." },
    verificar: {
      pt: [
        "Na planilha: Extensões → Apps Script → Execuções — ver o erro da última execução.",
        "Acionadores (gatilho de tempo) ainda existem? Às vezes o Google desativa depois de muitos erros.",
        "Erro 401: o PLANILHA_TOKEN da planilha é diferente do configurado no painel (Vercel).",
        "Erro de cota/tempo do Google: costuma passar sozinho; se repetir, avisar para revisar o script.",
      ],
      es: [
        "En la planilla: Extensiones → Apps Script → Ejecuciones — ver el error de la última ejecución.",
        "¿Los activadores (disparador de tiempo) siguen existiendo? A veces Google los desactiva después de muchos errores.",
        "Error 401: el PLANILHA_TOKEN de la planilla es distinto al configurado en el panel (Vercel).",
        "Error de cuota/tiempo de Google: suele pasar solo; si se repite, avisar para revisar el script.",
      ],
    },
    exemplo: (m?: Modelos) => mensagemAlerta("planilha_parada", "Planilha \"Leads Dezembro\"", { minutos_parada: 22, ultima_em: H(14, 3) }, m),
  },

  // ------------------------------------------------------------------ Redirecionador
  {
    tipo: "sem_grupos", area: "redirecionador", envio: "whatsapp",
    nome: { pt: "Redirecionador sem grupos", es: "Redireccionador sin grupos" },
    envioDetalhe: { pt: "Sempre.", es: "Siempre." },
    quando: { pt: "Alguém clicou no link de um funil e não havia nenhum grupo na fila (todos cheios, pausados ou com convite inválido).", es: "Alguien hizo clic en el link de un embudo y no había ningún grupo en la fila (todos llenos, pausados o con invitación inválida)." },
    repeticao: { pt: "Uma vez por funil até voltar a ter grupo.", es: "Una vez por embudo hasta que vuelva a tener grupo." },
    diagnostico: { pt: "Leads estão sendo perdidos agora: os cliques vão para o link reserva ou para a página \"grupos completos\".", es: "Se están perdiendo leads ahora: los clics van al link de reserva o a la página \"grupos completos\"." },
    verificar: {
      pt: ["Redirecionador → Grupos e importação: adicionar grupos novos ou importar do Sendflow.", "Se há grupos \"Convite inválido\": pedir link novo (Atualizar link) ou colar o link novo (Trocar link).", "Grupos \"Cheio\" com espaço real no WhatsApp: usar \"Zerar cliques\"."],
      es: ["Redireccionador → Grupos e importación: agregar grupos nuevos o importar de Sendflow.", "Si hay grupos \"Invitación inválida\": pedir link nuevo (Actualizar link) o pegar el link nuevo (Cambiar link).", "Grupos \"Lleno\" con lugar real en WhatsApp: usar \"Poner clics en cero\"."],
    },
    exemplo: (m?: Modelos) => mensagemRedirecionador("sem_grupos", "Geral", { reserva: null }, m) ?? "",
  },
  {
    tipo: "cheio", area: "redirecionador", envio: "condicional",
    nome: { pt: "Grupo cheio", es: "Grupo lleno" },
    envioDetalhe: { pt: "Só se não sobrou outro grupo na fila; se sobrou, fica só no painel.", es: "Solo si no quedó otro grupo en la fila; si quedó, queda solo en el panel." },
    quando: { pt: "O grupo da vez chegou ao limite de cliques do funil e saiu da fila.", es: "El grupo de turno llegó al límite de clics del embudo y salió de la fila." },
    repeticao: { pt: "Uma vez por grupo.", es: "Una vez por grupo." },
    diagnostico: { pt: "Normal durante o lançamento. Só é problema se a fila ficou vazia.", es: "Normal durante el lanzamiento. Solo es problema si la fila quedó vacía." },
    verificar: { pt: ["Conferir quantos grupos restam na fila e adicionar mais antes de acabar."], es: ["Revisar cuántos grupos quedan en la fila y agregar más antes de que se acaben."] },
    exemplo: (m?: Modelos) => mensagemRedirecionador("cheio", "Geral", { grupo: "La Semana del Inversionista #36", cliques: 600, proximo: "La Semana del Inversionista #37 (0 cliques)", restantes: 5 }, m) ?? "",
  },
  {
    tipo: "invalido", area: "redirecionador", envio: "condicional",
    nome: { pt: "Convite do grupo inválido", es: "Invitación del grupo inválida" },
    envioDetalhe: { pt: "Só se não sobrou outro grupo na fila; se sobrou, fica só no painel.", es: "Solo si no quedó otro grupo en la fila; si quedó, queda solo en el panel." },
    quando: { pt: "Na verificação automática (a cada N cliques ou a cada 15 min no grupo da vez), o link do grupo deixou de funcionar.", es: "En la verificación automática (cada N clics o cada 15 min en el grupo de turno), el link del grupo dejó de funcionar." },
    repeticao: { pt: "Uma vez por queda do convite.", es: "Una vez por caída de la invitación." },
    diagnostico: { pt: "Alguém redefiniu ou revogou o link do grupo no WhatsApp/Sendflow. Com o ID do Sendflow, o painel já pede link novo sozinho.", es: "Alguien redefinió o revocó el link del grupo en WhatsApp/Sendflow. Con el ID de Sendflow, el panel ya pide link nuevo solo." },
    verificar: { pt: ["Esperar alguns minutos pelo link novo (status \"Aguardando Sendflow\").", "Se não voltar: copiar o link atual no WhatsApp/Sendflow e usar \"Trocar link\"."], es: ["Esperar unos minutos por el link nuevo (estado \"Esperando a Sendflow\").", "Si no vuelve: copiar el link actual en WhatsApp/Sendflow y usar \"Cambiar link\"."] },
    exemplo: (m?: Modelos) => mensagemRedirecionador("invalido", "Trader", { grupo: "La Semana del Inversionista #2", proximo: null, restantes: 0 }, m) ?? "",
  },
  {
    tipo: "link_novo", area: "redirecionador", envio: "painel",
    nome: { pt: "Link novo recebido", es: "Link nuevo recibido" },
    envioDetalhe: { pt: "Nunca: é um aviso de que voltou a funcionar.", es: "Nunca: es un aviso de que volvió a funcionar." },
    quando: { pt: "Um grupo com convite inválido recebeu link novo (do Sendflow, da importação ou colado à mão) e voltou para a fila.", es: "Un grupo con invitación inválida recibió link nuevo (de Sendflow, de la importación o pegado a mano) y volvió a la fila." },
    repeticao: { pt: "Uma vez por troca.", es: "Una vez por cambio." },
    diagnostico: { pt: "Resolvido.", es: "Resuelto." },
    verificar: { pt: ["Nada a fazer."], es: ["Nada que hacer."] },
    exemplo: (m?: Modelos) => mensagemRedirecionador("link_novo", "Geral", { grupo: "La Semana del Inversionista #38", origem: "sendflow" }, m) ?? "",
  },
  {
    tipo: "redefinicao_sem_retorno", area: "redirecionador", envio: "whatsapp",
    nome: { pt: "Sendflow não devolveu o link novo", es: "Sendflow no devolvió el link nuevo" },
    envioDetalhe: { pt: "Sempre.", es: "Siempre." },
    quando: { pt: "O painel pediu link novo ao Sendflow e, 30 min depois, o link ainda não mudou.", es: "El panel pidió link nuevo a Sendflow y, 30 min después, el link todavía no cambió." },
    repeticao: { pt: "Uma vez por pedido.", es: "Una vez por pedido." },
    diagnostico: { pt: "O grupo continua fora da fila. O Sendflow pode estar lento, com o número desconectado ou sem permissão no grupo.", es: "El grupo sigue fuera de la fila. Sendflow puede estar lento, con el número desconectado o sin permiso en el grupo." },
    verificar: { pt: ["No Sendflow: o número/conta está conectado e é admin do grupo?", "Redefinir o link pelo Sendflow ou pelo WhatsApp e colar no painel (Trocar link)."], es: ["En Sendflow: ¿el número/cuenta está conectado y es admin del grupo?", "Redefinir el link por Sendflow o por WhatsApp y pegarlo en el panel (Cambiar link)."] },
    exemplo: (m?: Modelos) => mensagemRedirecionador("redefinicao_sem_retorno", "Geral", { grupo: "La Semana del Inversionista #39", minutos: 31 }, m) ?? "",
  },
  {
    tipo: "redefinicao_falhou", area: "redirecionador", envio: "whatsapp",
    nome: { pt: "Sendflow recusou o pedido de link novo", es: "Sendflow rechazó el pedido de link nuevo" },
    envioDetalhe: { pt: "Sempre.", es: "Siempre." },
    quando: { pt: "A API do Sendflow respondeu com erro ao pedido de link novo (limite: 4 pedidos a cada 15 min).", es: "La API de Sendflow respondió con error al pedido de link nuevo (límite: 4 pedidos cada 15 min)." },
    repeticao: { pt: "Uma vez por pedido recusado.", es: "Una vez por pedido rechazado." },
    diagnostico: { pt: "O link novo não vai chegar sozinho.", es: "El link nuevo no va a llegar solo." },
    verificar: { pt: ["Erro 401/403: token da API do Sendflow vencido ou trocado (variáveis da Vercel).", "Erro 429: muitos pedidos; o painel tenta de novo, mas dá para redefinir à mão.", "Redefinir pelo Sendflow e colar o link no painel."], es: ["Error 401/403: token de la API de Sendflow vencido o cambiado (variables de Vercel).", "Error 429: demasiados pedidos; el panel reintenta, pero se puede redefinir a mano.", "Redefinir por Sendflow y pegar el link en el panel."] },
    exemplo: (m?: Modelos) => mensagemRedirecionador("redefinicao_falhou", "Trader", { grupo: "La Semana del Inversionista #3", http: 429 }, m) ?? "",
  },

  // ------------------------------------------------------------------ Eventos Meta
  {
    tipo: "testes_falharam", area: "eventos", envio: "whatsapp",
    nome: { pt: "Testes dos eventos Meta falharam", es: "Fallaron las pruebas de los eventos Meta" },
    envioDetalhe: { pt: "Sempre que algum teste falha.", es: "Siempre que alguna prueba falla." },
    quando: {
      pt: "Todo dia às 07:17 (UY), ou no botão \"Rodar testes do servidor agora\", o painel simula inscrições (como TESTE) e confere se cada evento (Lead General, Lead Qualificado, Lead Trader…) chega à Meta, com o event_id certo e seguindo as regras de qualificação.",
      es: "Todos los días a las 07:17 (UY), o con el botón \"Ejecutar pruebas del servidor ahora\", el panel simula inscripciones (como PRUEBA) y revisa que cada evento (Lead General, Lead Qualificado, Lead Trader…) llegue a Meta, con el event_id correcto y siguiendo las reglas de calificación.",
    },
    repeticao: { pt: "Uma por execução com falha.", es: "Una por ejecución con falla." },
    diagnostico: { pt: "Algum evento deixou de chegar ou chega errado — a Meta otimiza as campanhas com dados ruins até corrigir.", es: "Algún evento dejó de llegar o llega mal — Meta optimiza las campañas con datos malos hasta que se corrija." },
    verificar: { pt: ["Aba Alertas → Testes diários: ver quais casos falharam e o motivo.", "Se alguém mudou uma página há pouco, conferir o formulário e a página de obrigado dela.", "Status 400/401 da Meta: token da API de Conversões no serviço de tracking."], es: ["Pestaña Alertas → Pruebas diarias: ver qué casos fallaron y el motivo.", "Si alguien cambió una página hace poco, revisar su formulario y su página de gracias.", "Status 400/401 de Meta: token de la API de Conversiones en el servicio de tracking."] },
    exemplo: (m?: Modelos) => mensagemTestes(execucaoExemplo, false, m),
  },
  {
    tipo: "testes_voltaram", area: "eventos", envio: "painel",
    nome: { pt: "Testes dos eventos Meta voltaram a passar", es: "Las pruebas de los eventos Meta volvieron a pasar" },
    envioDetalhe: { pt: "Nunca: é um aviso de que voltou a funcionar.", es: "Nunca: es un aviso de que volvió a funcionar." },
    quando: { pt: "Depois de uma execução com falha, a seguinte passa sem erros.", es: "Después de una ejecución con falla, la siguiente pasa sin errores." },
    repeticao: { pt: "Uma vez.", es: "Una vez." },
    diagnostico: { pt: "Resolvido.", es: "Resuelto." },
    verificar: { pt: ["Nada a fazer."], es: ["Nada que hacer."] },
    exemplo: (m?: Modelos) => mensagemTestes({ ...execucaoExemplo, ok: true, falhas: 0, detalhes: [] } as Execucao, true, m),
  },

  // ------------------------------------------------------------------ Saúde na Meta
  {
    tipo: "meta_saude", area: "meta", envio: "whatsapp",
    nome: { pt: "Problema nos eventos segundo a Meta", es: "Problema en los eventos según Meta" },
    envioDetalhe: { pt: "Só quando há problema (avisos ficam no painel).", es: "Solo cuando hay problema (los avisos quedan en el panel)." },
    quando: {
      pt: "Todo dia às 07:47 (UY) o painel lê os dados de qualidade da própria Meta. Vira problema quando menos de 80% dos eventos de lead (pixel ou servidor) chegam com event_id — a Meta pode contar em dobro —, quando não dá para consultar a Meta, ou quando a Meta registrou nas últimas 24 h menos de 80% dos eventos de lead que nós enviamos — a Meta com MAIS é normal (ela soma navegador + servidor antes de juntar os repetidos, e parte dos testes) (Lead = inscrições da página do grupo; Lead Qualificado, Lead General etc. = eventos enviados pelo painel). A comparação só vale a partir de 10 eventos. No WhatsApp só chega o que é crítico: os problemas de event_id, a consulta recusada e a Meta recebendo MENOS do que enviamos (10+ eventos, mais de 20% faltando); a Meta com MAIS fica só no painel. Leads qualificados (os 4 eventos de qualificado) são comparados à parte, separando navegador e servidor: se a Meta tiver MAIS de 20% acima do que enviamos (envio em dobro) ou o servidor dela tiver MENOS de 80% (eventos perdidos), vai para o WhatsApp.",
      es: "Todos los días a las 07:47 (UY) el panel lee los datos de calidad de la propia Meta. Es problema cuando menos del 80% de los eventos de lead (pixel o servidor) llegan con event_id — Meta puede contar doble —, cuando no se puede consultar a Meta, o cuando Meta registró en las últimas 24 h menos del 80% de los eventos de lead que enviamos — Meta con MÁS es normal (suma navegador + servidor antes de unir los repetidos, y parte de las pruebas) (Lead = inscripciones de la página del grupo; Lead Qualificado, Lead General etc. = eventos enviados por el panel). La comparación vale a partir de 10 eventos. Al WhatsApp solo llega lo crítico: los problemas de event_id, la consulta rechazada y Meta recibiendo MENOS de lo que enviamos (10+ eventos, más de 20% faltando); Meta con MÁS queda solo en el panel. Los leads calificados (los 4 eventos de calificado) se comparan aparte, separando navegador y servidor: si Meta tiene MÁS de 20% por encima de lo que enviamos (envío duplicado) o su servidor tiene MENOS del 80% (eventos perdidos), va al WhatsApp.",
    },
    repeticao: { pt: "Uma por dia enquanto o problema continuar.", es: "Una por día mientras el problema continúe." },
    diagnostico: { pt: "Os resultados das campanhas podem estar inflados (duplicados) ou a Meta está recebendo menos dados do que devia.", es: "Los resultados de las campañas pueden estar inflados (duplicados) o Meta está recibiendo menos datos de los que debería." },
    verificar: { pt: ["Aba Saúde na Meta: qual evento e qual lado (pixel ou servidor) está sem event_id.", "Conferir se alguma página nova dispara o pixel sem passar pelo serviço de tracking.", "\"Não consegui consultar a Meta\": token da Meta ou TESTES_TOKEN do serviço de tracking.", "Diferença Meta × nosso: se a Meta recebeu MENOS, o pixel/servidor está perdendo eventos (página nova sem tracking, bloqueio); se recebeu MAIS, há eventos duplicados ou disparados fora da inscrição."], es: ["Pestaña Salud en Meta: qué evento y qué lado (pixel o servidor) está sin event_id.", "Revisar si alguna página nueva dispara el pixel sin pasar por el servicio de tracking.", "\"No pude consultar a Meta\": token de Meta o TESTES_TOKEN del servicio de tracking.", "Diferencia Meta × nosotros: si Meta recibió MENOS, el pixel/servidor está perdiendo eventos (página nueva sin tracking, bloqueo); si recibió MÁS, hay eventos duplicados o disparados fuera de la inscripción."] },
    exemplo: (m?: Modelos) => mensagemSaude(["Lead General: só 62% dos eventos do pixel (navegador) chegam com event_id — a Meta pode contar em dobro.", "Lead: a Meta recebeu 31 nas últimas 24 h e nós registramos 42 (26% de diferença, limite 20%)."], m),
  },

  // ------------------------------------------------------------------ Campanhas na Meta
  {
    tipo: "ads_sem_gasto", area: "ads", envio: "whatsapp",
    nome: { pt: "A Meta parou de gastar", es: "Meta dejó de gastar" },
    envioDetalhe: { pt: "Sempre.", es: "Siempre." },
    quando: {
      pt: "Com os dados das campanhas que a Paola sincroniza (~2x por dia). (1) Dia de ontem fechado: gasto abaixo de 30% da média dos 3 dias anteriores, com anúncios ativos. (2) Parcial de hoje: só com dados sincronizados depois do meio-dia — nada gasto hoje, com anúncios ativos e gasto ontem. Só vale para campanhas que gastam pelo menos US$ 2/dia em média. A campanha de cada lançamento é configurada no banco (OP Futuros = \"Aquecimento de Conta\").",
      es: "Con los datos de las campañas que Paola sincroniza (~2 veces por día). (1) Día de ayer cerrado: gasto debajo del 30% del promedio de los 3 días anteriores, con anuncios activos. (2) Parcial de hoy: solo con datos sincronizados después del mediodía — nada gastado hoy, con anuncios activos y gasto ayer. Solo vale para campañas que gastan al menos US$ 2/día en promedio. La campaña de cada lanzamiento se configura en la base (OP Futuros = \"Aquecimento de Conta\").",
    },
    repeticao: { pt: "No máximo uma por dia (se a parcial já avisou, o dia fechado não repete).", es: "Como máximo una por día (si la parcial ya avisó, el día cerrado no repite)." },
    diagnostico: { pt: "A Meta não está entregando os anúncios: pagamento recusado ou sem saldo, anúncio reprovado/limitado, campanha pausada por engano ou limite de gasto da conta.", es: "Meta no está entregando los anuncios: pago rechazado o sin saldo, anuncio rechazado/limitado, campaña pausada por error o límite de gasto de la cuenta." },
    verificar: {
      pt: ["Gerenciador de Anúncios → Cobrança: pagamento e limite de gasto da conta.", "Status dos anúncios (reprovado, em análise, limitado).", "Se a campanha foi pausada de propósito, ignorar."],
      es: ["Administrador de anuncios → Facturación: pago y límite de gasto de la cuenta.", "Estado de los anuncios (rechazado, en revisión, limitado).", "Si la campaña se pausó a propósito, ignorar."],
    },
    exemplo: (m?: Modelos) => mensagemAds("ads_sem_gasto", "OP Futuros (grupo gratuito)", { moeda: "USD", dia: "2026-12-06", investimento: 0.4, ativos: 4, media: 10.2 }, m),
  },
  {
    tipo: "ads_cpl_alto", area: "ads", envio: "whatsapp",
    nome: { pt: "Custo por lead acima do limite", es: "Costo por lead arriba del límite" },
    envioDetalhe: { pt: "Sempre.", es: "Siempre." },
    quando: {
      pt: "Investimento do dia ÷ leads do dia acima do limite (padrão US$ 8, regra do Emi). Grupo gratuito: leads = inscrições da página do grupo; lançamento: leads qualificados. (1) Dia de ontem fechado. (2) Parcial de hoje: só com dados sincronizados depois do meio-dia e com pelo menos US$ 8 já gastos — assim o começo do dia não dá falso alarme.",
      es: "Inversión del día ÷ leads del día arriba del límite (por defecto US$ 8, regla de Emi). Grupo gratuito: leads = inscripciones de la página del grupo; lanzamiento: leads calificados. (1) Día de ayer cerrado. (2) Parcial de hoy: solo con datos sincronizados después del mediodía y con al menos US$ 8 ya gastados — así el comienzo del día no da falsa alarma.",
    },
    repeticao: { pt: "No máximo uma por dia (se a parcial já avisou, o dia fechado não repete).", es: "Como máximo una por día (si la parcial ya avisó, el día cerrado no repite)." },
    diagnostico: { pt: "A Meta está gastando mas os leads não estão entrando (ou não estão qualificando): página quebrada, link errado no anúncio, eventos sem chegar à Meta ou público/criativo cansado.", es: "Meta está gastando pero los leads no entran (o no califican): página rota, link equivocado en el anuncio, eventos que no llegan a Meta o público/creativo cansado." },
    verificar: {
      pt: ["Fazer uma inscrição de teste na página (?tde_teste=1).", "Conferir o link de destino dos anúncios.", "Alertas → Saúde na Meta e Testes diários.", "Se a página está ok: CPM/CTR no Gerenciador (público ou criativo cansado)."],
      es: ["Hacer una inscripción de prueba en la página (?tde_teste=1).", "Revisar el link de destino de los anuncios.", "Alertas → Salud en Meta y Pruebas diarias.", "Si la página está ok: CPM/CTR en el Administrador (público o creativo cansado)."],
    },
    exemplo: (m?: Modelos) => mensagemAds("ads_cpl_alto", "OP Futuros (grupo gratuito)", { moeda: "USD", dia: "2026-12-06", investimento: 11.3, leads: 1, limite: 8 }, m),
  },
  {
    tipo: "ads_sem_dados", area: "ads", envio: "whatsapp",
    nome: { pt: "Dados das campanhas sem atualizar", es: "Datos de las campañas sin actualizar" },
    envioDetalhe: { pt: "Sempre.", es: "Siempre." },
    quando: { pt: "A sincronização das campanhas da Meta (feita pela Paola) não atualiza há 20 h ou mais. Enquanto isso as outras alertas de campanha ficam paradas.", es: "La sincronización de las campañas de Meta (hecha por Paola) no se actualiza hace 20 h o más. Mientras tanto las otras alertas de campaña quedan detenidas." },
    repeticao: { pt: "Uma vez por parada.", es: "Una vez por parada." },
    diagnostico: { pt: "A automação da Paola que copia os dados da Meta para o banco parou.", es: "La automatización de Paola que copia los datos de Meta a la base se detuvo." },
    verificar: { pt: ["Avisar a Paola para conferir a sincronização (tabela pc_ads_meta_anuncio_dia)."], es: ["Avisar a Paola para revisar la sincronización (tabla pc_ads_meta_anuncio_dia)."] },
    exemplo: (m?: Modelos) => mensagemAds("ads_sem_dados", "OP Futuros (grupo gratuito)", { ultima_sync: "2026-12-06T09:00:00Z", horas: 22 }, m),
  },
];

export function itemDoCatalogo(tipo: string): ItemCatalogo | undefined {
  return CATALOGO.find((i) => i.tipo === tipo);
}

/** Textos editados no painel (tabela alertas_textos); campo vazio = padrão. */
export type TextosEditados = {
  mensagem?: string | null;
  diagnostico_pt?: string | null;
  diagnostico_es?: string | null;
  verificar_pt?: string[] | null;
  verificar_es?: string[] | null;
};

const cheio = (s?: string | null) => (s && s.trim() ? s.trim() : null);
const lista = (xs?: string[] | null) => (xs && xs.some((x) => x.trim()) ? xs.map((x) => x.trim()).filter(Boolean) : null);

/** Item do catálogo com os textos editados aplicados, e o que foi editado. */
export function comTextos(item: ItemCatalogo, ed?: TextosEditados | null) {
  const diagnostico = { pt: cheio(ed?.diagnostico_pt) ?? item.diagnostico.pt, es: cheio(ed?.diagnostico_es) ?? item.diagnostico.es };
  const verificar = { pt: lista(ed?.verificar_pt) ?? item.verificar.pt, es: lista(ed?.verificar_es) ?? item.verificar.es };
  return {
    ...item, diagnostico, verificar,
    editado: {
      mensagem: !!cheio(ed?.mensagem),
      diagnostico: !!(cheio(ed?.diagnostico_pt) || cheio(ed?.diagnostico_es)),
      verificar: !!(lista(ed?.verificar_pt) || lista(ed?.verificar_es)),
    },
  };
}

/**
 * Normaliza o que veio do formulário de edição: o que for igual ao padrão (ou vazio) vira null,
 * para que mudanças futuras no texto padrão continuem valendo onde ninguém editou.
 */
export function normalizarEdicao(item: ItemCatalogo, modeloPadrao: string, f: {
  mensagem: string; diagnostico_pt: string; diagnostico_es: string; verificar_pt: string; verificar_es: string;
}): Required<TextosEditados> {
  const linhas = (s: string) => s.replace(/\r\n/g, "\n").split("\n").map((x) => x.replace(/^\s*[•\-*]\s+/, "").trim()).filter(Boolean);
  const igual = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
  const msg = f.mensagem.replace(/\r\n/g, "\n").replace(/\s+$/, "");
  const vpt = linhas(f.verificar_pt);
  const ves = linhas(f.verificar_es);
  return {
    mensagem: !msg.trim() || msg === modeloPadrao ? null : msg,
    diagnostico_pt: !f.diagnostico_pt.trim() || f.diagnostico_pt.trim() === item.diagnostico.pt ? null : f.diagnostico_pt.trim(),
    diagnostico_es: !f.diagnostico_es.trim() || f.diagnostico_es.trim() === item.diagnostico.es ? null : f.diagnostico_es.trim(),
    verificar_pt: vpt.length === 0 || igual(vpt, item.verificar.pt) ? null : vpt,
    verificar_es: ves.length === 0 || igual(ves, item.verificar.es) ? null : ves,
  };
}
