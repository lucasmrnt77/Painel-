"use client";

import Papa from "papaparse";
import { celulaParaTexto } from "./planilha";

export type Aba = { nome: string; tabela: string[][] };

/** Lê .csv (uma aba) ou .xlsx (todas as abas) no navegador. */
export async function lerArquivo(arquivo: File): Promise<Aba[]> {
  if (/\.xlsx$/i.test(arquivo.name)) {
    const { default: readExcelFile } = await import("read-excel-file/browser");
    const abas = await readExcelFile(arquivo);
    return abas.map((a) => ({
      nome: a.sheet,
      tabela: a.data.map((linha) => linha.map((c) => celulaParaTexto(c))),
    }));
  }
  if (/\.xls$/i.test(arquivo.name)) {
    throw new Error("Formato .xls antigo não suportado. No Excel/Sheets, salve como .xlsx ou .csv.");
  }
  const tabela = await new Promise<string[][]>((ok, falha) =>
    Papa.parse<string[]>(arquivo, { skipEmptyLines: false, complete: (r) => ok(r.data), error: falha }),
  );
  return [{ nome: arquivo.name.replace(/\.csv$/i, ""), tabela }];
}
