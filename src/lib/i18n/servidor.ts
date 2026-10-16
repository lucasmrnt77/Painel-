import "server-only";
import { cookies } from "next/headers";
import { COOKIE_IDIOMA, criarT, idiomaValido, type Idioma, type T } from "./index";

export async function idiomaAtual(): Promise<Idioma> {
  return idiomaValido((await cookies()).get(COOKIE_IDIOMA)?.value);
}

/** `const t = await tradutor();` em páginas, layouts, ações e rotas. */
export async function tradutor(): Promise<T> {
  return criarT(await idiomaAtual());
}
