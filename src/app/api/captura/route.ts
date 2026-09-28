import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { db } from "@/lib/supabase";
import { tokenValido } from "@/lib/seguranca";
import { lerCorpo, CorpoGrandeDemais } from "@/lib/corpo";
import { extrairCaptura } from "@/lib/captura";

/**
 * POST /api/captura?token=CAPTURA_TOKEN[&lancamento=slug][&redirect=1]
 * Recebe o formulário da página de captura (JSON, urlencoded ou multipart).
 * Campos aceitos: nome/name, email, telefone/phone/whatsapp, utm_*, lancamento.
 */

function cabecalhosCors(req: Request): Record<string, string> {
  const origem = req.headers.get("origin");
  const permitidas = env.capturaOrigens();
  if (!origem || permitidas.length === 0) return {};
  if (!permitidas.includes("*") && !permitidas.includes(origem)) return {};
  return {
    "Access-Control-Allow-Origin": permitidas.includes("*") ? "*" : origem,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, x-api-token, authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function responder(req: Request, corpo: object, status: number) {
  return NextResponse.json(corpo, { status, headers: cabecalhosCors(req) });
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: cabecalhosCors(req) });
}

const STATUS_ERRO: Record<string, number> = {
  lancamento_inexistente: 404,
  sem_lancamento_ativo: 409,
  telefone_invalido: 400,
};

export async function POST(req: Request) {
  if (!tokenValido(req, env.capturaToken())) {
    return responder(req, { ok: false, erro: "nao_autorizado" }, 401);
  }

  let bruto: unknown;
  try {
    bruto = await lerCorpo(req);
  } catch (e) {
    if (e instanceof CorpoGrandeDemais) return responder(req, { ok: false, erro: "corpo_grande_demais" }, 413);
    return responder(req, { ok: false, erro: "corpo_invalido" }, 400);
  }

  const url = new URL(req.url);
  const dados = extrairCaptura(bruto, url.searchParams);
  if (!dados.telefone) {
    return responder(req, { ok: false, erro: "telefone_obrigatorio" }, 400);
  }

  const { data, error } = await db().rpc("registrar_inscricao", {
    p_lancamento_slug: dados.lancamento,
    p_nome: dados.nome,
    p_email: dados.email,
    p_telefone: dados.telefone,
    p_utm: dados.utm,
    p_pagina: dados.pagina ?? req.headers.get("referer"),
    p_payload: bruto,
  });

  if (error) {
    console.error("[captura] erro no banco", error);
    return responder(req, { ok: false, erro: "erro_interno" }, 500);
  }

  const r = data as { ok: boolean; erro?: string; inscricao_id?: number; link_grupo?: string | null };
  if (!r.ok) {
    return responder(req, { ok: false, erro: r.erro }, STATUS_ERRO[r.erro ?? ""] ?? 400);
  }

  if (url.searchParams.get("redirect") === "1" && r.link_grupo) {
    return NextResponse.redirect(r.link_grupo, { status: 303, headers: cabecalhosCors(req) });
  }
  return responder(req, { ok: true, inscricao_id: r.inscricao_id, link_grupo: r.link_grupo ?? null }, 200);
}
