import type { DiscrepancyRow, DiscrepancyStatus, ReviewerNotes } from "@/lib/pgn";
import { CheckCircle2, XCircle, HelpCircle, ArrowDownToLine, ArrowUpFromLine, AlertTriangle, OctagonAlert, StickyNote } from "lucide-react";

const STATUS_LABEL: Record<DiscrepancyStatus, { text: string; cls: string; rowCls: string; icon: any }> = {
  match: { text: "match", cls: "text-emerald-700 dark:text-emerald-400", rowCls: "row-match", icon: CheckCircle2 },
  mismatch: { text: "mismatch", cls: "text-rose-700 dark:text-rose-400", rowCls: "row-mismatch", icon: XCircle },
  illegible: { text: "illegible", cls: "text-amber-700 dark:text-amber-400", rowCls: "row-illegible", icon: HelpCircle },
  "missing-in-scoresheet": { text: "missing", cls: "text-blue-700 dark:text-blue-300", rowCls: "row-missing", icon: ArrowDownToLine },
  "extra-in-scoresheet": { text: "extra", cls: "text-violet-700 dark:text-violet-300", rowCls: "row-extra", icon: ArrowUpFromLine },
  "illegal-scoresheet": { text: "illegal (sheet)", cls: "text-rose-700 dark:text-rose-400", rowCls: "row-mismatch", icon: AlertTriangle },
  "illegal-pgn": { text: "illegal (PGN)", cls: "text-rose-700 dark:text-rose-400", rowCls: "row-mismatch", icon: OctagonAlert },
  "result-mismatch": { text: "result mismatch", cls: "text-rose-700 dark:text-rose-400", rowCls: "row-mismatch", icon: AlertTriangle },
  "after-divergence": { text: "after divergence", cls: "text-muted-foreground", rowCls: "", icon: HelpCircle },
};

interface Props {
  rows: DiscrepancyRow[];
  firstDivergencePly: number | null;
  /** When provided, clicking a row jumps the board viewer to that ply (0-indexed). */
  onJumpToPly?: (ply: number) => void;
  /** Currently displayed ply (0-indexed) — highlights the corresponding row. */
  activePly?: number | null;
  /** Reviewer notes keyed by 0-indexed ply. */
  reviewerNotes?: ReviewerNotes;
  /** Compact density — tighter row padding to fit more above the fold. */
  compact?: boolean;
}

export function DiscrepancyTable({ rows, firstDivergencePly, onJumpToPly, activePly, reviewerNotes, compact }: Props) {
  if (rows.length === 0) {
    return (
      <div className="border rounded-md p-8 bg-card text-center text-muted-foreground text-sm">
        No comparison yet. Pick a PGN game and transcribe at least one move.
      </div>
    );
  }
  return (
    <div className="border rounded-md overflow-hidden bg-card" data-testid="table-discrepancy">
      <div className="overflow-auto max-h-[60vh]">
        <table className="w-full text-sm font-mono">
          <thead className="bg-muted/50 sticky top-0 backdrop-blur z-10">
            <tr className="text-xs uppercase tracking-wider text-muted-foreground">
              <th className="text-left px-3 py-2 font-medium w-14">Move</th>
              <th className="text-left px-3 py-2 font-medium w-16">Side</th>
              <th className="text-left px-3 py-2 font-medium">Scoresheet</th>
              <th className="text-left px-3 py-2 font-medium">PGN</th>
              <th className="text-left px-3 py-2 font-medium w-32">Status</th>
              <th className="text-left px-3 py-2 font-medium">Notes</th>
              <th className="text-left px-3 py-2 font-medium">Reviewer note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const ply = (r.moveNumber - 1) * 2 + (r.side === "White" ? 0 : 1);
              const status = STATUS_LABEL[r.status];
              const Icon = status.icon;
              const isFirstDiv = firstDivergencePly === ply;
              const isActive = activePly === ply;
              const clickable = !!onJumpToPly;
              return (
                <tr
                  key={i}
                  className={`border-t ${status.rowCls} ${isFirstDiv ? "outline outline-2 outline-amber-500/60 outline-offset-[-2px]" : ""} ${isActive ? "bg-primary/10" : ""} ${clickable ? "cursor-pointer hover:bg-accent/50" : ""}`}
                  data-testid={`row-discrepancy-${i}`}
                  data-status={r.status}
                  data-ply={ply}
                  onClick={clickable ? () => onJumpToPly!(ply) : undefined}
                  title={clickable ? "Jump board to this ply" : undefined}
                >
                  <td className={`px-3 ${compact ? "py-0.5" : "py-1.5"} tabular-nums text-muted-foreground`}>{r.moveNumber}.</td>
                  <td className={`px-3 ${compact ? "py-0.5" : "py-1.5"} text-xs uppercase tracking-wider text-muted-foreground`}>{r.side[0]}</td>
                  <td className={`px-3 ${compact ? "py-0.5" : "py-1.5"} font-medium`}>{r.scoresheet ?? <span className="text-muted-foreground">—</span>}</td>
                  <td className={`px-3 ${compact ? "py-0.5" : "py-1.5"} font-medium`}>{r.pgn ?? <span className="text-muted-foreground">—</span>}</td>
                  <td className={`px-3 ${compact ? "py-0.5" : "py-1.5"} ${status.cls}`}>
                    <span className="inline-flex items-center gap-1.5">
                      <Icon className="size-3.5" />
                      <span className="text-[11px] uppercase tracking-wider font-sans font-medium">
                        {isFirstDiv ? "first divergence — " : ""}{status.text}
                      </span>
                    </span>
                  </td>
                  <td className={`px-3 ${compact ? "py-0.5" : "py-1.5"} text-xs text-muted-foreground font-sans`}>
                    {r.notes}
                  </td>
                  <td className={`px-3 ${compact ? "py-0.5" : "py-1.5"} text-xs font-sans align-top`}>
                    {(() => {
                      const note = (reviewerNotes?.[ply] ?? "").trim();
                      if (!note) return <span className="text-muted-foreground/50">—</span>;
                      return (
                        <span
                          className="inline-flex items-start gap-1.5 text-amber-800 dark:text-amber-300"
                          data-testid={`row-reviewer-note-${i}`}
                        >
                          <StickyNote
                            className="size-3.5 shrink-0 mt-0.5"
                            data-testid={`row-note-indicator-${i}`}
                            aria-label="reviewer note"
                          />
                          <span className="whitespace-pre-wrap break-words leading-snug">{note}</span>
                        </span>
                      );
                    })()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
