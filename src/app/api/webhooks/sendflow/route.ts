import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { db } from "@/lib/supabase";
import { tokenValido } from "@/lib/seguranca";
import { lerCorpo, CorpoGrandeDemais } from "@/lib/corpo";
import { extrairEventosSendflow, tipoDaQuery } from "@/lib/sendflow";

/**
 * POST /api/webhooks/sendflow?token=SENDFLOW_WEBHOOK_TOKEN[&tipo=entrou|saiu]
 * Grava o payload bruto SEMPRE e aplica entradas/saídas em membros_grupo.
 * Se o Sendflow permitir uma URL por gatilho, use &tipo=entrou e &tipo=saiu.
 */
export async function POST(req: Request) {
  if (!tokenValido(req, env.sendflowWebhookToken())) {
    return NextResponse.json({ ok: false, erro: "nao_autorizado" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await lerCorpo(req);
  } catch (e) {
    if (e instanceof CorpoGrandeDemais) return NextResponse.json({ ok: false, erro: "corpo_grande_demais" }, { status: 413 });
    payload = { _erro_leitura: true };
  }

  const url = new URL(req.url);
  const eventos = extrairEventosSendflow(payload, tipoDaQuery(url.searchParams.get("tipo")));

  const { data, error } = await db().rpc("sendflow_registrar_webhook", {
    p_payload: payload && typeof payload === "object" ? payload : { _valor: payload },
    p_eventos: eventos,
    p_origem: "webhook",
    p_lancamento_id: null,
  });

  if (error) {
    console.error("[webhook sendflow] erro no banco", error);
    // 500 para o Sendflow tentar de novo, se ele fizer retry
    return NextResponse.json({ ok: false, erro: "erro_interno" }, { status: 500 });
  }
  return NextResponse.json(data, { status: 200 });
}

/** Alguns serviços testam a URL com GET antes de salvar. */
export async function GET(req: Request) {
  if (!tokenValido(req, env.sendflowWebhookToken())) {
    return NextResponse.json({ ok: false, erro: "nao_autorizado" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, servico: "painel-sendflow" });
}
