import { exigirLogin } from "@/lib/sessao";
import { historicoSaude, type RegistroSaude } from "@/lib/meta-saude";
import { dedupEventId, EVENTOS_MONITORADOS, LIMITE_DEDUP, semCalculoDaMeta, type EventoQualidade } from "@/lib/meta-saude-regras";
import { dataHora, numero } from "@/lib/formato";
import { Cartao, Tabela, td } from "@/components/ui";
import { BotaoAtualizarSaude } from "@/components/meta-saude";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // botão "Atualizar agora"

const FREQ: Record<string, string> = { real_time: "tempo real", hourly: "de hora em hora", daily: "diária" };

function Pct({ v, limite, meta }: { v: number | null; limite?: number; meta?: number | null }) {
  if (v == null) return <span className="text-zinc-600">—</span>;
  const ruim = (limite != null && v < limite) || (meta != null && v < meta);
  return <span className={`tabular font-medium ${ruim ? "text-rose-400" : "text-emerald-400"}`}>{Math.round(v)}%</span>;
}

export default async function SaudeMeta() {
  await exigirLogin();
  let hist: RegistroSaude[] | null = null;
  let erroBanco: string | null = null;
  try { hist = await historicoSaude(14); } catch (e) { erroBanco = e instanceof Error ? e.message : String(e); }
  const ultimo = hist?.[0] ?? null;
  const d = ultimo?.dados && "ok" in ultimo.dados && ultimo.dados.ok ? ultimo.dados : null;
  const eventos: EventoQualidade[] = d && d.qualidade.ok ? d.qualidade.eventos : [];
  const monitorados = eventos.filter((e) => EVENTOS_MONITORADOS.includes(e.evento));
  const outros = eventos.filter((e) => !EVENTOS_MONITORADOS.includes(e.evento));
  const volume = d && d.volume_24h.ok ? d.volume_24h.eventos : null;
  const nomesOutros = [...new Set([...outros.map((e) => e.evento), ...(volume ?? []).map((v) => v.evento)])].filter((n) => !EVENTOS_MONITORADOS.includes(n));
  const testes = ((d as unknown as { testes_24h?: Record<string, number> } | null)?.testes_24h) ?? {};
  // A Meta conta os eventos de teste junto no volume do pixel: desconta os testes automáticos
  const vol = (ev: string) => {
    const t = volume?.find((v) => v.evento === ev)?.total ?? (volume ? 0 : null);
    return t == null ? null : Math.max(0, t - (testes[ev] ?? 0));
  };

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Saúde na Meta</h1>
          <p className="max-w-3xl text-sm text-zinc-500">
            Números da <b>própria Meta</b> sobre o pixel{d ? ` ${d.pixel}` : ""}, com o tráfego real: se os eventos chegam com <b>event_id</b> no
            navegador e no servidor (deduplicação), quanto do pixel também chega pela API de Conversões e a qualidade dos dados.
            A Meta calcula com os <b>últimos 7 dias</b>. Atualiza sozinho todo dia às 07:47; alerta no WhatsApp só se a deduplicação cair abaixo de {LIMITE_DEDUP}%.
          </p>
        </div>
        <BotaoAtualizarSaude />
      </div>

      {erroBanco && <Cartao><p className="text-sm text-zinc-400">Aplique a migração <code>016-meta-saude.sql</code> no Supabase do painel. ({erroBanco})</p></Cartao>}
      {!erroBanco && !ultimo && <Cartao><p className="text-sm text-zinc-400">Ainda não consultou. Clique em &quot;Atualizar agora&quot;.</p></Cartao>}

      {ultimo && (
        <section className={`rounded-xl border p-4 ${ultimo.ok ? "border-emerald-500/30 bg-emerald-500/5" : "border-rose-500/40 bg-rose-500/5"}`}>
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span className={`h-2 w-2 rounded-full ${ultimo.ok ? "bg-emerald-500" : "bg-rose-500"}`} />
            Última consulta {dataHora(ultimo.criado_em)}{ultimo.disparo === "manual" ? " (manual)" : ""}
          </div>
          <div className="mt-1 text-lg font-semibold">{ultimo.ok ? "Tudo certo na Meta" : `${ultimo.problemas.length} problema(s)`}</div>
          {ultimo.problemas.length > 0 && <ul className="mt-2 space-y-1 text-sm text-rose-300">{ultimo.problemas.map((p, i) => <li key={i}>• {p}</li>)}</ul>}
          {ultimo.avisos.length > 0 && <ul className="mt-2 space-y-1 text-xs text-amber-300/90">{ultimo.avisos.map((p, i) => <li key={i}>• {p}</li>)}</ul>}
        </section>
      )}

      {monitorados.length > 0 && (
        <Cartao titulo="Eventos de lead">
          <Tabela cabecalho={["Evento", "event_id no navegador", "event_id no servidor", "Cobertura API de Conversões", "Qualidade (0–10)", "Envio do servidor", "Eventos reais 24 h"]}>
            {monitorados.map((e) => {
              const dd = dedupEventId(e);
              const personalizado = semCalculoDaMeta(e);
              return (
                <tr key={e.evento}>
                  <td className={`${td} font-medium`}>{e.evento}</td>
                  {personalizado ? (
                    <td className={`${td} text-xs text-zinc-500`} colSpan={3}>
                      Evento personalizado: a Meta não calcula deduplicação nem cobertura. O event_id é garantido pelos testes diários.
                    </td>
                  ) : (
                    <>
                      <td className={td}><Pct v={dd?.navegador ?? null} limite={LIMITE_DEDUP} /></td>
                      <td className={td}><Pct v={dd?.servidor ?? null} limite={LIMITE_DEDUP} /></td>
                      <td className={td}><Pct v={e.cobertura} meta={e.cobertura_meta} />{e.cobertura_meta != null && <span className="text-xs text-zinc-500"> / meta {Math.round(e.cobertura_meta)}%</span>}</td>
                    </>
                  )}
                  <td className={`${td} tabular`}>{e.emq ?? "—"}</td>
                  <td className={`${td} text-zinc-400`}>{e.frequencia ? FREQ[e.frequencia] ?? e.frequencia : "—"}</td>
                  <td className={`${td} tabular`}>{vol(e.evento) == null ? "—" : numero(vol(e.evento)!)}</td>
                </tr>
              );
            })}
          </Tabela>
        </Cartao>
      )}

      {monitorados.length > 0 && (
        <p className="-mt-2 text-xs text-zinc-500">
          &quot;Eventos reais 24 h&quot; = o que a Meta recebeu nas últimas 24 h menos os eventos dos testes automáticos.
          A Meta conta o que chega pelo pixel e pelo servidor antes de juntar os duplicados, então o número pode ser maior que o de pessoas.
        </p>
      )}

      {nomesOutros.length > 0 && (
        <Cartao titulo="Outros eventos do pixel">
          <Tabela cabecalho={["Evento", "event_id navegador", "event_id servidor", "Cobertura", "Eventos reais 24 h"]}>
            {nomesOutros.map((n) => {
                const e = outros.find((x) => x.evento === n);
                const dd = e ? dedupEventId(e) : null;
                return (
                  <tr key={n}>
                    <td className={td}>{n}</td>
                    <td className={td}><Pct v={dd?.navegador ?? null} /></td>
                    <td className={td}><Pct v={dd?.servidor ?? null} /></td>
                    <td className={td}><Pct v={e?.cobertura ?? null} /></td>
                    <td className={`${td} tabular`}>{vol(n) == null ? "—" : numero(vol(n)!)}</td>
                  </tr>
                );
              })}
          </Tabela>
        </Cartao>
      )}

      {hist && hist.length > 1 && (
        <Cartao titulo="Histórico">
          <div className="flex flex-wrap gap-1.5">
            {hist.map((h) => (
              <span key={h.id} title={h.problemas.join(" · ") || "ok"}
                className={`rounded px-2 py-0.5 text-[11px] ${h.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/15 text-rose-300"}`}>
                {dataHora(h.criado_em)}
              </span>
            ))}
          </div>
        </Cartao>
      )}
    </>
  );
}
