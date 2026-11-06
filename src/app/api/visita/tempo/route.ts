import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";

/**
 * POST /api/visita/tempo — comportamento da visita (053): as landings avisam quando a pessoa sai ou troca de aba.
 * Corpo (text/plain, navigator.sendBeacon): { "visita": uuid, "segundos": n, "rolagem": 0–100, "formulario": bool, "carregamento": ms }
 * Público de propósito (sem token): só atualiza a visita com esse código, sempre para o maior valor.
 */
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const inteiro = (v: unknown, max: number): number | null => {
  const n = typeof v === "number" ? v : Number.NaN;
  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), 0), max) : null;
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  let b: Record<string, unknown> = {};
  try {
    const t = await req.text();
    if (t.length > 500) return new NextResponse(null, { status: 413, headers: CORS });
    b = JSON.parse(t || "{}");
  } catch {
    return new NextResponse(null, { status: 400, headers: CORS });
  }
  if (typeof b.visita !== "string" || !UUID.test(b.visita)) return new NextResponse(null, { status: 400, headers: CORS });
  const { error } = await db().rpc("registrar_tempo_visita", {
    p_visita: b.visita.toLowerCase(),
    p_segundos: inteiro(b.segundos, 3600),
    p_rolagem: inteiro(b.rolagem, 100),
    p_formulario: b.formulario === true,
    p_carregamento_ms: inteiro(b.carregamento, 60000),
  });
  if (error) console.error("[visita/tempo]", error.message);
  return new NextResponse(null, { status: 204, headers: CORS });
}
