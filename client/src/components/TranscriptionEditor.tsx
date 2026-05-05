import { useEffect, useMemo, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { TranscribedPly, PgnGame, InlineNoteCandidate } from "@/lib/pgn";
import { parseTranscription, extractInlineNotes, removeInlineNoteMarkers, lineNoOfCandidate } from "@/lib/pgn";
import { HelpCircle, Trash2, StickyNote, ChevronRight, Pencil } from "lucide-react";

interface Props {
  text: string;
  setText: (s: string) => void;
  scoresheetResult: string;
  setScoresheetResult: (s: string) => void;
  pgn: PgnGame | null;
  /** Append `note` to the existing reviewer note for this 0-indexed ply.
   * If a note already exists, the new note is appended on a newline so nothing is overwritten silently. */
  mergeNoteIntoPly?: (ply: number, note: string) => void;
  /** Look up an existing reviewer note for a 0-indexed ply (used to show "merge" hints in the review UI). */
  getExistingNote?: (ply: number) => string;
}

/** Per-row state in the review dialog. */
interface RowState {
  /** Current edited note text. */
  note: string;
  /** Selected target ply (only used for `pair` candidates; explicit candidates ignore this). */
  selectedPly: number | null;
  /** True after the user clicks Apply for this row. */
  applied: boolean;
  /** True after the user clicks Skip for this row. */
  skipped: boolean;
}

export function TranscriptionEditor({
  text,
  setText,
  scoresheetResult,
  setScoresheetResult,
  pgn,
  mergeNoteIntoPly,
  getExistingNote,
}: Props) {
  const plies: TranscribedPly[] = parseTranscription(text);
  const inlineNotes = useMemo(() => extractInlineNotes(text), [text]);
  const [reviewOpen, setReviewOpen] = useState(false);

  function appendToken(tok: string) {
    const trimmed = text.trimEnd();
    const expectedPly = plies.length;
    const moveNum = Math.floor(expectedPly / 2) + 1;
    const isWhite = expectedPly % 2 === 0;
    let prefix = "";
    if (isWhite) {
      // Start a new move number on a new line for readability
      prefix = trimmed === "" ? `${moveNum}. ` : `\n${moveNum}. `;
    } else {
      prefix = " ";
    }
    setText(trimmed + prefix + tok);
  }

  function copyFromPgn() {
    if (!pgn) return;
    const lines: string[] = [];
    for (let i = 0; i < pgn.moves.length; i += 2) {
      const num = i / 2 + 1;
      const w = pgn.moves[i];
      const b = pgn.moves[i + 1];
      lines.push(`${num}. ${w}${b ? ` ${b}` : ""}`);
    }
    setText(lines.join("\n"));
  }

  return (
    <div className="flex flex-col h-full" data-testid="transcription-editor">
      <Tabs defaultValue="text" className="flex flex-col h-full">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b bg-card">
          <TabsList className="h-8">
            <TabsTrigger value="text" className="text-xs" data-testid="tab-text">
              Free-text
            </TabsTrigger>
            <TabsTrigger value="ply" className="text-xs" data-testid="tab-ply">
              Per-ply ({plies.length})
            </TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setReviewOpen(true)}
              disabled={inlineNotes.length === 0 || !pgn}
              data-testid="button-extract-inline-notes"
              title={
                inlineNotes.length === 0
                  ? "No inline `--` notes detected in the transcription."
                  : `Review ${inlineNotes.length} detected inline note${inlineNotes.length === 1 ? "" : "s"}.`
              }
            >
              <StickyNote className="size-3.5 mr-1" />
              Extract notes
              {inlineNotes.length > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-1.5 h-4 px-1 text-[10px] font-mono tabular-nums"
                  data-testid="badge-inline-note-count"
                >
                  {inlineNotes.length}
                </Badge>
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setText("")}
              data-testid="button-clear-transcription"
            >
              <Trash2 className="size-3.5 mr-1" /> Clear
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={copyFromPgn}
              disabled={!pgn}
              data-testid="button-copy-from-pgn"
              title="Pre-fill the transcription from the selected PGN game (useful for testing)"
            >
              Copy from PGN
            </Button>
          </div>
        </div>

        <TabsContent value="text" className="flex-1 m-0 p-0 flex flex-col">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"1. e4 e5\n2. Nf3 Nc6\n3. Bb5 ?? — use ? or ?? or [illegible] for unreadable moves\n4. Nxe4 Nf6 -- Player typo 4w wrote Nxd4. 4b wrote Nc6"}
            className="flex-1 rounded-none border-0 font-mono text-sm leading-relaxed resize-none focus-visible:ring-0 focus-visible:ring-offset-0"
            data-testid="textarea-transcription"
          />
          <div className="px-3 py-2 border-t bg-muted/30 text-xs text-muted-foreground flex flex-col gap-1">
            <div className="flex items-start gap-2">
              <HelpCircle className="size-3.5 shrink-0 mt-0.5" />
              <span>
                Type SAN moves as you read them. Mark unreadable moves with{" "}
                <code className="font-mono px-1 py-0.5 rounded bg-card border">?</code>,{" "}
                <code className="font-mono px-1 py-0.5 rounded bg-card border">??</code>, or{" "}
                <code className="font-mono px-1 py-0.5 rounded bg-card border">[illegible]</code>.
              </span>
            </div>
            <div className="flex items-start gap-2 pl-5" data-testid="helper-inline-notes">
              <span>
                <span className="font-medium text-foreground/80">Inline notes:</span>{" "}
                jot reviewer notes after a move pair using{" "}
                <code className="font-mono px-1 py-0.5 rounded bg-card border">--</code>.
                Mark sub-targets inside the note with{" "}
                <code className="font-mono px-1 py-0.5 rounded bg-card border">4w</code>{" "}
                /{" "}
                <code className="font-mono px-1 py-0.5 rounded bg-card border">4b</code>.
                Example:{" "}
                <code className="font-mono px-1 py-0.5 rounded bg-card border whitespace-nowrap">
                  4. Nxe4 Nf6 -- Player typo 4w wrote Nxd4. 4b wrote Nc6
                </code>
                . Then click{" "}
                <span className="font-medium text-foreground/80">Extract notes</span>{" "}
                to review and attach them.
              </span>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="ply" className="flex-1 m-0 overflow-auto bg-card">
          <PerPlyEditor text={text} setText={setText} appendToken={appendToken} pgn={pgn} />
        </TabsContent>

        <div className="px-3 py-2 border-t bg-card flex items-center gap-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Scoresheet result
          </Label>
          <Select value={scoresheetResult || "none"} onValueChange={(v) => setScoresheetResult(v === "none" ? "" : v)}>
            <SelectTrigger className="w-[140px] h-8 text-xs" data-testid="select-result">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— not recorded —</SelectItem>
              <SelectItem value="1-0">1–0 (White wins)</SelectItem>
              <SelectItem value="0-1">0–1 (Black wins)</SelectItem>
              <SelectItem value="1/2-1/2">½–½ (Draw)</SelectItem>
              <SelectItem value="*">* (Other / unknown)</SelectItem>
            </SelectContent>
          </Select>
          {pgn && (
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground ml-auto">
              PGN result: <span className="font-mono text-foreground">{pgn.result}</span>
            </span>
          )}
        </div>
      </Tabs>

      <InlineNoteReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        notes={inlineNotes}
        text={text}
        setText={setText}
        getExistingNote={getExistingNote}
        mergeNoteIntoPly={mergeNoteIntoPly}
      />
    </div>
  );
}

function InlineNoteReviewDialog({
  open,
  onOpenChange,
  notes,
  text,
  setText,
  getExistingNote,
  mergeNoteIntoPly,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  notes: InlineNoteCandidate[];
  text: string;
  setText: (s: string) => void;
  getExistingNote?: (ply: number) => string;
  mergeNoteIntoPly?: (ply: number, note: string) => void;
}) {
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [editing, setEditing] = useState<Record<string, boolean>>({});

  // Reset transient state when the dialog reopens with a new set of notes.
  useEffect(() => {
    if (!open) return;
    const fresh: Record<string, RowState> = {};
    for (const n of notes) {
      // Pre-select the parser's pinned ply when the side is known (explicit or
      // targeted); fall back to the first candidate option for ambiguous notes.
      const initialPly =
        n.ply !== null ? n.ply : (n.candidatePlies[0]?.ply ?? null);
      fresh[n.id] = {
        note: n.note,
        selectedPly: initialPly,
        applied: false,
        skipped: false,
      };
    }
    setRowState(fresh);
    setEditing({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function patchRow(id: string, patch: Partial<RowState>) {
    setRowState((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  function applyRow(n: InlineNoteCandidate) {
    const st = rowState[n.id];
    if (!st || st.applied || st.skipped) return;
    if (st.selectedPly === null || !mergeNoteIntoPly) return;
    if (!st.note.trim()) return;
    mergeNoteIntoPly(st.selectedPly, st.note.trim());
    patchRow(n.id, { applied: true });
  }

  function applyAllUnambiguous() {
    for (const n of notes) {
      if (n.kind === "ambiguous") continue;
      const st = rowState[n.id];
      if (!st || st.applied || st.skipped) continue;
      if (st.selectedPly === null || !mergeNoteIntoPly) continue;
      if (!st.note.trim()) continue;
      mergeNoteIntoPly(st.selectedPly, st.note.trim());
    }
    setRowState((prev) => {
      const next = { ...prev };
      for (const n of notes) {
        if (n.kind !== "ambiguous" && next[n.id] && !next[n.id].applied && !next[n.id].skipped) {
          next[n.id] = { ...next[n.id], applied: true };
        }
      }
      return next;
    });
  }

  function cleanupAppliedFromTranscription() {
    // Collect line numbers that should have their markers stripped. Only
    // strip a line when *every* candidate that came from that line is either
    // applied or skipped — otherwise pending candidates would lose their
    // source text and be unrecoverable.
    const byLine = new Map<number, { total: number; resolved: number }>();
    for (const n of notes) {
      const ln = lineNoOfCandidate(n.id);
      if (ln === null) continue;
      const st = rowState[n.id];
      const resolved = !!st && (st.applied || st.skipped);
      const entry = byLine.get(ln) ?? { total: 0, resolved: 0 };
      entry.total += 1;
      if (resolved) entry.resolved += 1;
      byLine.set(ln, entry);
    }
    // Only clean lines where at least one candidate was applied (not just skipped),
    // so the user sees a meaningful effect.
    const appliedLines = new Set<number>();
    for (const n of notes) {
      const ln = lineNoOfCandidate(n.id);
      if (ln === null) continue;
      if (rowState[n.id]?.applied) appliedLines.add(ln);
    }
    const linesToClean: number[] = [];
    appliedLines.forEach((ln) => {
      const entry = byLine.get(ln);
      if (entry && entry.resolved === entry.total) linesToClean.push(ln);
    });
    if (linesToClean.length === 0) return;
    setText(removeInlineNoteMarkers(text, linesToClean));
  }

  const appliedCount = Object.values(rowState).filter((s) => s.applied).length;
  const unambiguousCount = notes.filter((n) => n.kind !== "ambiguous").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col"
        data-testid="dialog-inline-notes-review"
      >
        <DialogHeader>
          <DialogTitle>Review detected inline notes</DialogTitle>
        </DialogHeader>
        <div className="text-xs text-muted-foreground mb-2 leading-relaxed">
          We found {notes.length} candidate{notes.length === 1 ? "" : "s"} marked with{" "}
          <code className="font-mono px-1 py-0.5 rounded bg-muted border">--</code>. Confirm which to attach as
          per-ply reviewer notes. Existing notes are not overwritten — applied notes are appended on a new line.
        </div>
        <div className="flex-1 overflow-y-auto -mx-6 px-6 space-y-2.5">
          {notes.length === 0 && (
            <div className="text-sm text-muted-foreground italic py-6 text-center" data-testid="text-no-inline-notes">
              No inline notes detected. Add lines like{" "}
              <code className="font-mono px-1 py-0.5 rounded bg-muted border">4w -- typo</code> to the transcription
              and try again.
            </div>
          )}
          {notes.map((n) => {
            const st = rowState[n.id];
            if (!st) return null;
            const targetPly = st.selectedPly;
            const existing =
              targetPly !== null && getExistingNote ? getExistingNote(targetPly) : "";
            const willMerge = existing.trim() !== "";
            const status = st.applied ? "applied" : st.skipped ? "skipped" : "pending";
            return (
              <div
                key={n.id}
                className={`border rounded-md p-3 text-sm ${
                  status === "applied"
                    ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300/60 dark:border-emerald-500/30"
                    : status === "skipped"
                      ? "bg-muted/30 opacity-60"
                      : "bg-card"
                }`}
                data-testid={`row-inline-note-${n.id}`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        variant={n.kind === "ambiguous" ? "outline" : "default"}
                        className="text-[10px] uppercase tracking-wider font-mono"
                        data-testid={`badge-kind-${n.id}`}
                      >
                        {n.kind}
                      </Badge>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
                        move {n.moveNumber}
                      </span>
                      <code className="text-[11px] font-mono text-muted-foreground truncate" title={n.sourceLine}>
                        {n.sourceLine.trim()}
                      </code>
                    </div>
                  </div>
                  {status === "applied" && (
                    <Badge
                      variant="outline"
                      className="text-[10px] uppercase tracking-wider font-mono shrink-0 border-emerald-500/50 text-emerald-700 dark:text-emerald-400"
                    >
                      Applied
                    </Badge>
                  )}
                  {status === "skipped" && (
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-mono shrink-0">
                      Skipped
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-2 items-start">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Target</span>
                    {n.kind !== "ambiguous" ? (
                      <span
                        className="text-xs font-mono"
                        data-testid={`text-target-${n.id}`}
                      >
                        Move {n.moveNumber} {n.side === "w" ? "White" : "Black"} · ply{" "}
                        {(n.ply ?? 0) + 1}
                      </span>
                    ) : (
                      <Select
                        value={st.selectedPly === null ? "" : String(st.selectedPly)}
                        onValueChange={(v) => patchRow(n.id, { selectedPly: Number(v) })}
                        disabled={st.applied || st.skipped}
                      >
                        <SelectTrigger
                          className="h-8 text-xs"
                          data-testid={`select-target-${n.id}`}
                        >
                          <SelectValue placeholder="Pick target" />
                        </SelectTrigger>
                        <SelectContent>
                          {n.candidatePlies.map((c) => (
                            <SelectItem key={c.ply} value={String(c.ply)}>
                              {c.label} (ply {c.ply + 1})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Note text</span>
                    {editing[n.id] ? (
                      <Textarea
                        value={st.note}
                        onChange={(e) => patchRow(n.id, { note: e.target.value })}
                        rows={2}
                        className="text-xs font-mono"
                        data-testid={`textarea-edit-note-${n.id}`}
                      />
                    ) : (
                      <div
                        className="text-xs font-mono bg-muted/40 rounded border px-2 py-1 break-words"
                        data-testid={`text-note-${n.id}`}
                      >
                        {st.note}
                      </div>
                    )}
                    {willMerge && !st.applied && !st.skipped && (
                      <div
                        className="text-[10px] text-amber-700 dark:text-amber-400"
                        data-testid={`text-merge-hint-${n.id}`}
                      >
                        ⚠ Ply already has a note — applying will append on a new line.
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-1.5 mt-2">
                  {!st.applied && !st.skipped && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => setEditing((p) => ({ ...p, [n.id]: !p[n.id] }))}
                        data-testid={`button-edit-${n.id}`}
                      >
                        <Pencil className="size-3 mr-1" />
                        {editing[n.id] ? "Done" : "Edit"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => patchRow(n.id, { skipped: true })}
                        data-testid={`button-skip-${n.id}`}
                      >
                        Skip
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => applyRow(n)}
                        disabled={st.selectedPly === null || !st.note.trim()}
                        data-testid={`button-apply-${n.id}`}
                      >
                        <ChevronRight className="size-3 mr-0.5" /> Apply
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <DialogFooter className="flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mt-2 pt-2 border-t">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={cleanupAppliedFromTranscription}
              disabled={appliedCount === 0}
              data-testid="button-cleanup-applied"
              title="Remove applied `--` markers from the transcription text. Leaves un-applied notes in place."
            >
              <Trash2 className="size-3.5 mr-1.5" />
              Remove applied markers from text
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={applyAllUnambiguous}
              disabled={unambiguousCount === 0}
              data-testid="button-apply-all-unambiguous"
              title="Apply every note where the target ply is already known (targeted sub-notes and explicit shorthand). Ambiguous pair-level notes still need a manual choice."
            >
              Apply all unambiguous
            </Button>
            <Button
              size="sm"
              onClick={() => onOpenChange(false)}
              data-testid="button-close-review"
            >
              Done
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PerPlyEditor({
  text,
  setText,
  appendToken,
  pgn,
}: {
  text: string;
  setText: (s: string) => void;
  appendToken: (tok: string) => void;
  pgn: PgnGame | null;
}) {
  const plies = parseTranscription(text);
  // Ensure we render at least pgn.moves.length rows so the user has visible slots
  const targetCount = Math.max(plies.length + 1, pgn ? pgn.moves.length : 0);
  const rows: { num: number; w?: TranscribedPly; b?: TranscribedPly; wIdx?: number; bIdx?: number; pgnW?: string; pgnB?: string }[] = [];
  for (let i = 0; i < targetCount; i += 2) {
    const num = i / 2 + 1;
    rows.push({
      num,
      w: plies[i],
      b: plies[i + 1],
      wIdx: i,
      bIdx: i + 1,
      pgnW: pgn?.moves[i],
      pgnB: pgn?.moves[i + 1],
    });
  }

  function setPly(plyIdx: number, val: string) {
    // Re-tokenize, replace, rebuild
    const all = parseTranscription(text).map((p) => p.raw);
    while (all.length <= plyIdx) all.push("");
    all[plyIdx] = val;
    // Trim trailing empties
    while (all.length > 0 && all[all.length - 1] === "") all.pop();
    // Reformat as `1. e4 e5\n2. Nf3 Nc6`
    const lines: string[] = [];
    for (let i = 0; i < all.length; i += 2) {
      const num = i / 2 + 1;
      lines.push(`${num}. ${all[i] || ""}${all[i + 1] !== undefined ? ` ${all[i + 1] || ""}` : ""}`.trimEnd());
    }
    setText(lines.join("\n"));
  }

  // appendToken kept for future per-ply quick-insert hooks; intentionally not wired here.
  void appendToken;

  return (
    <table className="w-full text-sm font-mono" data-testid="ply-grid">
      <thead className="bg-muted/40 sticky top-0">
        <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
          <th className="text-left px-3 py-2 w-14">#</th>
          <th className="text-left px-3 py-2">White (sheet)</th>
          <th className="text-left px-3 py-2 text-muted-foreground/70">PGN</th>
          <th className="text-left px-3 py-2">Black (sheet)</th>
          <th className="text-left px-3 py-2 text-muted-foreground/70">PGN</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.num} className="border-t">
            <td className="px-3 py-1 tabular-nums text-muted-foreground">{row.num}.</td>
            <td className="px-2 py-1">
              <input
                value={row.w?.raw ?? ""}
                onChange={(e) => setPly(row.wIdx!, e.target.value)}
                className="w-24 bg-transparent border border-input rounded px-2 py-0.5 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="…"
                data-testid={`input-ply-w-${row.num}`}
              />
              <button
                type="button"
                onClick={() => setPly(row.wIdx!, "?")}
                className="ml-1 text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400 hover:underline"
                data-testid={`button-illegible-w-${row.num}`}
              >
                ?
              </button>
            </td>
            <td className="px-2 py-1 text-muted-foreground/80">{row.pgnW ?? ""}</td>
            <td className="px-2 py-1">
              <input
                value={row.b?.raw ?? ""}
                onChange={(e) => setPly(row.bIdx!, e.target.value)}
                className="w-24 bg-transparent border border-input rounded px-2 py-0.5 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="…"
                data-testid={`input-ply-b-${row.num}`}
              />
              <button
                type="button"
                onClick={() => setPly(row.bIdx!, "?")}
                className="ml-1 text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400 hover:underline"
                data-testid={`button-illegible-b-${row.num}`}
              >
                ?
              </button>
            </td>
            <td className="px-2 py-1 text-muted-foreground/80">{row.pgnB ?? ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
