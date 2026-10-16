import type { Dic, Padroes } from "./tipos";
import { ES_COMUM, PADROES_COMUM } from "./comum";
import { ES_BASE_LEADS, PADROES_BASE_LEADS } from "./base-leads";
import { ES_LANCAMENTO, PADROES_LANCAMENTO } from "./lancamento";
import { ES_CAPTACAO, PADROES_CAPTACAO } from "./captacao";
import { ES_OP, PADROES_OP } from "./op";

export const DICIONARIO_ES: Dic = { ...ES_COMUM, ...ES_BASE_LEADS, ...ES_LANCAMENTO, ...ES_CAPTACAO, ...ES_OP };
export const PADROES_ES: Padroes = [...PADROES_COMUM, ...PADROES_BASE_LEADS, ...PADROES_LANCAMENTO, ...PADROES_CAPTACAO, ...PADROES_OP];
