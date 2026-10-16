"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { COOKIE_IDIOMA, idiomaValido } from "./index";

export async function trocarIdioma(valor: string) {
  (await cookies()).set(COOKIE_IDIOMA, idiomaValido(valor), {
    path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365, secure: process.env.NODE_ENV === "production",
  });
  revalidatePath("/", "layout");
}
