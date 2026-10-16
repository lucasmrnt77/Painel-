"use client";

import { createContext, useContext, useMemo } from "react";
import { criarT, IDIOMA_PADRAO, type Idioma, type T, type Vars } from "./index";

const Contexto = createContext<Idioma>(IDIOMA_PADRAO);

export function ProvedorIdioma({ idioma, children }: { idioma: Idioma; children: React.ReactNode }) {
  return <Contexto.Provider value={idioma}>{children}</Contexto.Provider>;
}

export function useIdioma(): Idioma {
  return useContext(Contexto);
}

export function useT(): T {
  const idioma = useContext(Contexto);
  return useMemo(() => criarT(idioma), [idioma]);
}

/** Traduz um texto dentro de componentes que não são async nem "use client" (ex.: components/ui.tsx). */
export function Tx({ children, vars }: { children: string; vars?: Vars }) {
  return <>{useT()(children, vars)}</>;
}
