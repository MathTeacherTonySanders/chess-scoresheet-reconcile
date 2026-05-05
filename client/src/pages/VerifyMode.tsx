import { useEffect, useMemo, useRef, useState } from "react";
import { ImageViewer } from "@/components/ImageViewer";
import { TranscriptionEditor } from "@/components/TranscriptionEditor";
import { DiscrepancyTable } from "@/components/DiscrepancyTable";
import { ChessBoardViewer } from "@/components/ChessBoardViewer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Upload,
  FileText,
  Info,
  Copy,
  Download,
  ChevronRight,
  StickyNote,
  Trash2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  parsePgn,
  parseTranscription,
  reconcile,
  reportToCsv,
  reportToMarkdown,
  type PgnGame,
  type ReviewerNotes,
} from "@/lib/pgn";
import { SAMPLE_PGN_TEXT, SAMPLE_PGN_LABEL, SAMPLE_SHEETS } from "@/lib/samples";
import { PanelHeader } from "@/components/Chrome";

export default function VerifyMode() {
  const { toast } = useToast();

  // ── State ──
  const [pgnText, setPgnText] = useState<string>(SAMPLE_PGN_TEXT);
  const [pgnLabel, setPgnLabel] = useState<string>(SAMPLE_PGN_LABEL);
  const [imageUrl, setImageUrl] = useState<string | null>(SAMPLE_SHEETS[0]?.url ?? null);
  const [imageLabel, setImageLabel] = useState<string>(SAMPLE_SHEETS[0]?.label ?? "");
  const [transcription, setTranscription] = useState<string>("");
  const [scoresheetResult, setScoresheetResult] = useState<string>("");
  const [selectedGameIdx, setSelectedGameIdx] = useState<number>(0);
  const [boardPly, setBoardPly] = useState<number>(0);

  const [allNotes, setAllNotes] = useState<Record<string, ReviewerNotes>>({});

  // Compact density toggle and board collapse — UI affordances for the workbench layout.
  const [compact, setCompact] = useState<boolean>(false);
  const [boardOpen, setBoardOpen] = useState<boolean>(true);

  const games: PgnGame[] = useMemo(() => {
    try {
      return parsePgn(pgnText);
    } catch {
      return [];
    }
  }, [pgnText]);

  useEffect(() => {
    setSelectedGameIdx((prev) => (prev >= games.length ? 0 : prev));
  }, [games.length]);

  useEffect(() => {
    setBoardPly(0);
  }, [selectedGameIdx, pgnText]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || (e.target as HTMLElement | null)?.isContentEditable) return;
      if (e.key === "ArrowRight") setBoardPly((p) => p + 1);
      else if (e.key === "ArrowLeft") setBoardPly((p) => Math.max(0, p - 1));
      else if (e.key === "Home") setBoardPly(0);
      else if (e.key === "End") setBoardPly(9999);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const game = games[selectedGameIdx] ?? null;

  const gameKey = useMemo(() => {
    if (!game) return "";
    const h = game.headers;
    return [h.Event || "", h.Date || "", h.Round || "", h.Board || "", h.White || "", h.Black || ""]
      .map((s) => s.trim())
      .join("│");
  }, [game]);

  const reviewerNotes: ReviewerNotes = allNotes[gameKey] ?? {};
  const currentNotePly = boardPly > 0 ? boardPly - 1 : null;

  function setNoteForCurrentPly(value: string) {
    if (!gameKey || currentNotePly === null) return;
    setAllNotes((prev) => {
      const forGame = { ...(prev[gameKey] ?? {}) };
      if (value === "") delete forGame[currentNotePly];
      else forGame[currentNotePly] = value;
      return { ...prev, [gameKey]: forGame };
    });
  }
  function clearNoteForCurrentPly() {
    if (!gameKey || currentNotePly === null) return;
    setAllNotes((prev) => {
      const forGame = { ...(prev[gameKey] ?? {}) };
      delete forGame[currentNotePly];
      return { ...prev, [gameKey]: forGame };
    });
  }
  function mergeNoteIntoPly(ply: number, note: string) {
    if (!gameKey) {
      toast({
        title: "Pick a game first",
        description: "Inline-note extraction needs a selected PGN game so notes are isolated correctly.",
      });
      return;
    }
    const trimmed = note.trim();
    if (!trimmed) return;
    setAllNotes((prev) => {
      const forGame = { ...(prev[gameKey] ?? {}) };
      const existing = (forGame[ply] ?? "").trim();
      forGame[ply] = existing === "" ? trimmed : `${existing}\n${trimmed}`;
      return { ...prev, [gameKey]: forGame };
    });
    toast({
      title: "Note attached",
      description: `Saved to ply ${ply + 1} (${ply % 2 === 0 ? "White" : "Black"} of move ${Math.floor(ply / 2) + 1}).`,
    });
  }
  function getExistingNoteForPly(ply: number): string {
    return reviewerNotes[ply] ?? "";
  }

  const notedChipPlies = useMemo(() => {
    const set = new Set<number>();
    for (const k of Object.keys(reviewerNotes)) {
      const v = (reviewerNotes[Number(k)] ?? "").trim();
      if (v) set.add(Number(k) + 1);
    }
    return set;
  }, [reviewerNotes]);

  const transcribedPlies = useMemo(() => parseTranscription(transcription), [transcription]);
  const report = useMemo(() => {
    if (!game) return null;
    return reconcile(game, transcribedPlies, { scoresheetResult: scoresheetResult || null });
  }, [game, transcribedPlies, scoresheetResult]);

  function pickSample(idx: number) {
    const s = SAMPLE_SHEETS[idx];
    setImageUrl(s.url);
    setImageLabel(s.label);
    if (s.matchHint) {
      const hint = s.matchHint;
      const gIdx = games.findIndex((g) => {
        const w = (g.headers.White || "").toLowerCase();
        const b = (g.headers.Black || "").toLowerCase();
        return (
          (!hint.white || w.includes(hint.white)) &&
          (!hint.black || b.includes(hint.black))
        );
      });
      if (gIdx >= 0) setSelectedGameIdx(gIdx);
    }
  }

  function uploadImage(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      setImageUrl(reader.result as string);
      setImageLabel(file.name);
    };
    reader.readAsDataURL(file);
  }
  function uploadPgn(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      setPgnText(reader.result as string);
      setPgnLabel(file.name);
    };
    reader.readAsText(file);
  }
  async function copyMarkdown() {
    if (!game || !report) return;
    const md = reportToMarkdown(game, report, reviewerNotes);
    try {
      await navigator.clipboard.writeText(md);
      toast({ title: "Copied", description: "Markdown report copied to clipboard." });
    } catch {
      // Fallback: ignore
    }
  }
  function downloadFile(name: string, contents: string, mime: string) {
    const blob = new Blob([contents], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      className="flex-1 grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)]"
      data-testid="page-verify"
    >
      <aside
        className="border-r bg-sidebar/60 backdrop-blur-sm overflow-y-auto lg:max-h-[calc(100vh-3.5rem)] lg:sticky lg:top-14 lg:self-start"
        data-testid="sidebar-sources"
      >
        <Sidebar
          samples={SAMPLE_SHEETS}
          onPickSample={pickSample}
          activeImageUrl={imageUrl}
          uploadImage={uploadImage}
          uploadPgn={uploadPgn}
          pgnLabel={pgnLabel}
          games={games}
          selectedGameIdx={selectedGameIdx}
          setSelectedGameIdx={setSelectedGameIdx}
        />
      </aside>

      {/* Main workbench: two-column side-by-side on lg+ — image pane (left, sticky/independent
          scroll) and workspace pane (right, scrollable). On mobile/small screens, panes stack. */}
      <main className="overflow-x-hidden min-w-0">
        <DisclaimerBanner />

        <div
          className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-3 lg:px-3 lg:py-3 lg:items-start"
          data-testid="verify-workbench"
        >
          {/* LEFT: Scoresheet image — independently scrollable on desktop */}
          <section
            className="px-4 py-4 lg:p-0 lg:h-[calc(100vh-3.5rem-2.25rem)] lg:overflow-hidden lg:sticky lg:top-[calc(3.5rem+0.75rem)] flex flex-col"
            data-testid="verify-image-pane"
          >
            <Card className="overflow-hidden flex flex-col h-[480px] lg:h-full">
              <PanelHeader
                eyebrow="Source A · scoresheet"
                title="Handwritten scoresheet"
                right={
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-mono">
                    Image
                  </Badge>
                }
              />
              <ImageViewer src={imageUrl} caption={imageLabel} />
            </Card>
          </section>

          {/* RIGHT: workspace pane — board+notes (always visible top), transcription, comparison table */}
          <section
            className="px-4 py-4 lg:p-0 lg:h-[calc(100vh-3.5rem-2.25rem)] lg:overflow-y-auto flex flex-col gap-3 min-w-0"
            data-testid="verify-workspace-pane"
          >
            {game && <GameSummaryInline game={game} report={report} />}

            {/* Board + per-ply notes — promoted to the top of the workspace pane so the
                interactive board and note editor are immediately visible (no hunting / scrolling).
                Collapsible for users who want more vertical room for the table, but default open. */}
            <Card className="overflow-hidden shrink-0" data-testid="card-board-collapsible">
              <button
                type="button"
                onClick={() => setBoardOpen((b) => !b)}
                className="w-full flex items-center justify-between gap-3 px-4 py-2.5 border-b bg-card text-left hover:bg-accent/40 transition-colors"
                data-testid="button-toggle-board"
                aria-expanded={boardOpen}
              >
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    Interactive board · per-ply notes
                  </div>
                  <h2 className="font-display text-base lg:text-lg font-semibold">
                    Chess board &amp; reviewer notes
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-mono">
                    {game?.moves.length ?? 0} ply
                  </Badge>
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-mono" data-testid="badge-notes-count-header">
                    {Object.values(reviewerNotes).filter((v) => v.trim() !== "").length} note{Object.values(reviewerNotes).filter((v) => v.trim() !== "").length === 1 ? "" : "s"}
                  </Badge>
                  {boardOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                </div>
              </button>
              {boardOpen && (
                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-0">
                  <div className="h-[380px] xl:h-[440px] flex flex-col" data-testid="verify-board-container">
                    <ChessBoardViewer
                      game={game}
                      currentPly={boardPly}
                      onPlyChange={setBoardPly}
                      notedPlies={notedChipPlies}
                    />
                  </div>
                  {game && (
                    <div className="border-t xl:border-t-0 xl:border-l p-3" data-testid="verify-note-container">
                      <NoteEditor
                        game={game}
                        currentNotePly={currentNotePly}
                        noteValue={currentNotePly !== null ? reviewerNotes[currentNotePly] ?? "" : ""}
                        setNote={setNoteForCurrentPly}
                        clearNote={clearNoteForCurrentPly}
                        reviewerNotes={reviewerNotes}
                      />
                    </div>
                  )}
                </div>
              )}
            </Card>

            <Card className="flex flex-col shrink-0" data-testid="card-transcription">
              <PanelHeader
                eyebrow="Reviewer transcription"
                title="What the scoresheet says"
                right={
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-mono">
                    {transcribedPlies.length} ply
                  </Badge>
                }
              />
              <TranscriptionEditor
                text={transcription}
                setText={setTranscription}
                scoresheetResult={scoresheetResult}
                setScoresheetResult={setScoresheetResult}
                pgn={game}
                mergeNoteIntoPly={mergeNoteIntoPly}
                getExistingNote={getExistingNoteForPly}
              />
            </Card>

            {/* Discrepancy / comparison table — primary review surface, kept above the fold next to the image */}
            <div data-testid="verify-comparison-block">
              <PanelHeader
                eyebrow="Source B vs Source A"
                title="Discrepancy report"
                right={
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setCompact((c) => !c)}
                      className="h-7 text-[11px]"
                      data-testid="button-toggle-compact"
                      aria-pressed={compact}
                    >
                      {compact ? "Comfortable" : "Compact"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={copyMarkdown}
                      disabled={!report}
                      data-testid="button-copy-markdown"
                    >
                      <Copy className="size-3.5 mr-1.5" /> Copy Markdown
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        report && game && downloadFile(
                          `reconcile-${(game.headers.White || "white").replace(/\W+/g, "_")}-vs-${(game.headers.Black || "black").replace(/\W+/g, "_")}.csv`,
                          reportToCsv(report, reviewerNotes),
                          "text/csv"
                        )
                      }
                      disabled={!report}
                      data-testid="button-download-csv"
                    >
                      <Download className="size-3.5 mr-1.5" /> CSV
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        report && game && downloadFile(
                          `reconcile-${(game.headers.White || "white").replace(/\W+/g, "_")}-vs-${(game.headers.Black || "black").replace(/\W+/g, "_")}.md`,
                          reportToMarkdown(game, report, reviewerNotes),
                          "text/markdown"
                        )
                      }
                      disabled={!report}
                      data-testid="button-download-markdown"
                    >
                      <Download className="size-3.5 mr-1.5" /> Markdown
                    </Button>
                  </div>
                }
                standalone
              />
              {report && <SummaryStrip report={report} />}
              <DiscrepancyTable
                rows={report?.rows ?? []}
                firstDivergencePly={report?.firstDivergencePly ?? null}
                onJumpToPly={(ply) => setBoardPly(ply + 1)}
                activePly={boardPly > 0 ? boardPly - 1 : null}
                reviewerNotes={reviewerNotes}
                compact={compact}
              />
            </div>

          </section>
        </div>
      </main>
    </div>
  );
}

function DisclaimerBanner() {
  return (
    <div className="border-b bg-amber-100/40 dark:bg-amber-500/10 px-4 lg:px-6 py-2 flex items-center gap-3 text-[12px]" data-testid="banner-disclaimer">
      <Info className="size-3.5 shrink-0 text-amber-700 dark:text-amber-400" />
      <p className="text-amber-900/90 dark:text-amber-100/90">
        <strong>Verify mode — no OCR.</strong> Transcribe the scoresheet by hand and the app will
        flag where it diverges from the PGN. The app surfaces divergences for human review; it does
        not decide which source is correct.
      </p>
    </div>
  );
}

function Sidebar({
  samples,
  onPickSample,
  activeImageUrl,
  uploadImage,
  uploadPgn,
  pgnLabel,
  games,
  selectedGameIdx,
  setSelectedGameIdx,
}: {
  samples: typeof SAMPLE_SHEETS;
  onPickSample: (i: number) => void;
  activeImageUrl: string | null;
  uploadImage: (f: File) => void;
  uploadPgn: (f: File) => void;
  pgnLabel: string;
  games: PgnGame[];
  selectedGameIdx: number;
  setSelectedGameIdx: (i: number) => void;
}) {
  const [pgnTextDialog, setPgnTextDialog] = useState(false);
  const [pgnPaste, setPgnPaste] = useState("");
  const imgInputRef = useRef<HTMLInputElement>(null);
  const pgnInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="p-4 space-y-5">
      <section>
        <SidebarSectionHeader step="1" title="Scoresheet image" subtitle="Upload or pick a sample" />
        <div className="flex items-center gap-2 mt-2">
          <input
            type="file"
            accept="image/*"
            ref={imgInputRef}
            className="hidden"
            onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])}
            data-testid="input-upload-image"
          />
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => imgInputRef.current?.click()}
            data-testid="button-upload-image"
          >
            <Upload className="size-3.5 mr-1.5" /> Upload image
          </Button>
        </div>
        <div className="mt-3 space-y-1" data-testid="list-samples">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Samples — RCC Ladder, R1
          </div>
          {samples.map((s, i) => {
            const active = activeImageUrl === s.url;
            return (
              <button
                key={s.id}
                onClick={() => onPickSample(i)}
                className={`group w-full text-left px-2.5 py-1.5 rounded-md text-xs flex items-center gap-2 transition-colors ${
                  active
                    ? "bg-primary/10 text-foreground border border-primary/30"
                    : "hover:bg-accent text-muted-foreground hover:text-foreground border border-transparent"
                }`}
                data-testid={`button-sample-${s.id}`}
              >
                <span className={`font-mono text-[10px] tabular-nums w-5 ${active ? "text-primary" : ""}`}>
                  {s.id}
                </span>
                <span className="flex-1 truncate">{s.label}</span>
                <ChevronRight className={`size-3 opacity-0 group-hover:opacity-50 ${active ? "opacity-80" : ""}`} />
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <SidebarSectionHeader step="2" title="Tournament PGN" subtitle={pgnLabel} />
        <div className="flex items-center gap-2 mt-2">
          <input
            type="file"
            accept=".pgn,text/plain"
            ref={pgnInputRef}
            className="hidden"
            onChange={(e) => e.target.files?.[0] && uploadPgn(e.target.files[0])}
            data-testid="input-upload-pgn"
          />
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => pgnInputRef.current?.click()}
            data-testid="button-upload-pgn"
          >
            <FileText className="size-3.5 mr-1.5" /> Upload .pgn
          </Button>
          <Dialog open={pgnTextDialog} onOpenChange={setPgnTextDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" data-testid="button-paste-pgn">
                Paste
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Paste PGN text</DialogTitle>
              </DialogHeader>
              <Textarea
                rows={14}
                value={pgnPaste}
                onChange={(e) => setPgnPaste(e.target.value)}
                placeholder='[Event "..."]\n[White "..."]\n...\n\n1. e4 e5 ...'
                className="font-mono text-xs"
                data-testid="textarea-paste-pgn"
              />
              <div className="flex justify-end">
                <Button
                  onClick={() => {
                    uploadPgn(new File([pgnPaste], "pasted.pgn", { type: "text/plain" }));
                    setPgnTextDialog(false);
                  }}
                  data-testid="button-apply-pasted-pgn"
                >
                  Apply
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </section>

      <section>
        <SidebarSectionHeader
          step="3"
          title="Game"
          subtitle={`${games.length} game${games.length === 1 ? "" : "s"} parsed`}
        />
        {games.length > 0 ? (
          <Select value={String(selectedGameIdx)} onValueChange={(v) => setSelectedGameIdx(Number(v))}>
            <SelectTrigger className="w-full mt-2 h-auto py-2" data-testid="select-game">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-[60vh]">
              {games.map((g, i) => (
                <SelectItem key={i} value={String(i)} data-testid={`option-game-${i}`}>
                  <span className="flex flex-col items-start gap-0.5 py-0.5">
                    <span className="text-xs font-mono">
                      Bd {g.headers.Board || "?"} · R{g.headers.Round || "?"} · {g.result}
                    </span>
                    <span className="text-xs">
                      {(g.headers.White || "?").trim()} <span className="text-muted-foreground">vs</span>{" "}
                      {(g.headers.Black || "?").trim()}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="text-xs text-muted-foreground mt-2">No games parsed.</div>
        )}
      </section>
    </div>
  );
}

function SidebarSectionHeader({
  step,
  title,
  subtitle,
}: {
  step: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-mono text-[10px] tabular-nums text-primary border border-primary/40 px-1.5 rounded-sm">
        {step}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium leading-tight">{title}</div>
        {subtitle && (
          <div className="text-[11px] text-muted-foreground truncate" title={subtitle}>
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}

/** Compact game header card — replaces the wide GameSummary banner so it fits inside the
 *  workspace pane next to the scoresheet image. */
function GameSummaryInline({
  game,
  report,
}: {
  game: PgnGame;
  report: ReturnType<typeof reconcile> | null;
}) {
  return (
    <Card className="px-3 py-2.5" data-testid="panel-game-summary">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1.5">
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">White</span>
          <span className="font-display text-sm font-semibold">{(game.headers.White || "—").trim()}</span>
        </div>
        <span className="text-muted-foreground/60 font-mono text-xs">vs</span>
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Black</span>
          <span className="font-display text-sm font-semibold">{(game.headers.Black || "—").trim()}</span>
        </div>
        <Stat label="Result" value={game.result} mono />
        <Stat label="Board" value={game.headers.Board || "—"} mono />
        <Stat label="Round" value={game.headers.Round || "—"} mono />
        <Stat label="PGN plies" value={String(game.moves.length)} mono />
        {report?.scoresheetResult && (
          <Stat
            label="Result match"
            value={report.resultMismatch ? "MISMATCH" : "ok"}
            tone={report.resultMismatch ? "bad" : "good"}
          />
        )}
      </div>
    </Card>
  );
}

function Stat({
  label,
  value,
  mono,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: "good" | "bad";
}) {
  const toneCls =
    tone === "bad" ? "text-rose-700 dark:text-rose-400"
    : tone === "good" ? "text-emerald-700 dark:text-emerald-400"
    : "";
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      <span className={`text-xs ${mono ? "font-mono" : ""} ${toneCls}`}>{value}</span>
    </div>
  );
}

function SummaryStrip({ report }: { report: ReturnType<typeof reconcile> }) {
  const items: { label: string; value: number; cls: string; testId: string }[] = [
    { label: "matches", value: report.totals.matches, cls: "text-emerald-700 dark:text-emerald-400", testId: "stat-matches" },
    { label: "mismatches", value: report.totals.mismatches, cls: "text-rose-700 dark:text-rose-400", testId: "stat-mismatches" },
    { label: "illegible", value: report.totals.illegible, cls: "text-amber-700 dark:text-amber-400", testId: "stat-illegible" },
    { label: "missing", value: report.totals.missing, cls: "text-blue-700 dark:text-blue-300", testId: "stat-missing" },
    { label: "extra", value: report.totals.extra, cls: "text-violet-700 dark:text-violet-300", testId: "stat-extra" },
    { label: "illegal sheet", value: report.totals.illegalScoresheet, cls: "text-rose-700 dark:text-rose-400", testId: "stat-illegal" },
  ];
  return (
    <div className="border rounded-md mb-2 bg-card divide-x grid grid-cols-3 sm:grid-cols-6 overflow-hidden" data-testid="strip-summary">
      {items.map((it) => (
        <div key={it.label} className="px-3 py-1.5 flex flex-col gap-0.5" data-testid={it.testId}>
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{it.label}</span>
          <span className={`text-base font-display font-semibold tabular-nums ${it.cls}`}>{it.value}</span>
        </div>
      ))}
    </div>
  );
}

function NoteEditor({
  game,
  currentNotePly,
  noteValue,
  setNote,
  clearNote,
  reviewerNotes,
}: {
  game: PgnGame;
  currentNotePly: number | null;
  noteValue: string;
  setNote: (v: string) => void;
  clearNote: () => void;
  reviewerNotes: ReviewerNotes;
}) {
  const moveCtx = (() => {
    if (currentNotePly === null) return null;
    const moveNumber = Math.floor(currentNotePly / 2) + 1;
    const isWhite = currentNotePly % 2 === 0;
    const san = game.moves[currentNotePly] ?? null;
    if (!san) return { moveNumber, isWhite, label: `${moveNumber}${isWhite ? "." : "…"} —` };
    return { moveNumber, isWhite, label: `${moveNumber}${isWhite ? ". " : "… "}${san}` };
  })();

  const noteCount = Object.values(reviewerNotes).filter((v) => v.trim() !== "").length;

  return (
    <div data-testid="card-note-editor">
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <div className="flex items-baseline gap-2 min-w-0">
          <StickyNote className="size-3.5 shrink-0 self-center text-amber-600 dark:text-amber-400" />
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Note for current ply
            </div>
            <div className="text-xs font-mono truncate" data-testid="note-current-context">
              {currentNotePly === null ? (
                <span className="text-muted-foreground">start position — step into a move to annotate</span>
              ) : (
                <>
                  <span className="text-foreground">{moveCtx?.label}</span>
                  <span className="text-muted-foreground"> · ply {currentNotePly + 1}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-mono shrink-0" data-testid="badge-note-count">
          {noteCount} note{noteCount === 1 ? "" : "s"}
        </Badge>
      </div>
      <Textarea
        value={noteValue}
        onChange={(e) => setNote(e.target.value)}
        placeholder={
          currentNotePly === null
            ? "Step forward in the board to attach a note to a specific ply."
            : "Scoresheet appears to differ here… (saved automatically; React state only — no persistence)"
        }
        rows={3}
        disabled={currentNotePly === null}
        className="text-xs font-mono resize-none"
        data-testid="textarea-note"
      />
      <div className="flex items-center justify-between mt-2">
        <span className="text-[10px] text-muted-foreground">
          Notes live only in this session and are isolated per game.
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={clearNote}
          disabled={currentNotePly === null || noteValue.trim() === ""}
          data-testid="button-note-clear"
          className="h-7 text-xs"
        >
          <Trash2 className="size-3 mr-1" /> Clear
        </Button>
      </div>
    </div>
  );
}
