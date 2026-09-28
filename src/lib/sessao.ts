import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "./env";
import { assinar, iguaisSeguro } from "./seguranca";

export const COOKIE_SESSAO = "painel_sendflow_sessao";
const DURACAO_S = 60 * 60 * 24 * 14; // 14 dias

export function criarValorSessao(agora = Date.now()): string {
  const exp = Math.floor(agora / 1000) + DURACAO_S;
  const corpo = `v1.${exp}`;
  return `${corpo}.${assinar(corpo, env.sessaoSegredo())}`;
}

export function sessaoValida(valor: string | undefined, agora = Date.now()): boolean {
  if (!valor) return false;
  const partes = valor.split(".");
  if (partes.length !== 3 || partes[0] !== "v1") return false;
  const exp = Number(partes[1]);
  if (!Number.isFinite(exp) || exp * 1000 < agora) return false;
  const esperado = assinar(`v1.${partes[1]}`, env.sessaoSegredo());
  return iguaisSeguro(partes[2], esperado);
}

export async function gravarSessao() {
  (await cookies()).set(COOKIE_SESSAO, criarValorSessao(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DURACAO_S,
  });
}

export async function apagarSessao() {
  (await cookies()).delete(COOKIE_SESSAO);
}

export async function estaLogado(): Promise<boolean> {
  return sessaoValida((await cookies()).get(COOKIE_SESSAO)?.value);
}

/** Usar no topo de toda página/ação/rota protegida. */
export async function exigirLogin() {
  if (!(await estaLogado())) redirect("/login");
}
