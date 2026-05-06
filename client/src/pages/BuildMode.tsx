import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  Upload,
  Info,
  Copy,
  Download,
  ChevronRight,
  StickyNote,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  CircleSlash,
  Wand2,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
  Rows2,
  Columns2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ImageViewer } from "@/components/ImageViewer";
import { ChessBoardViewer } from "@/components/ChessBoardViewer";
import { PanelHeader } from "@/components/Chrome";
import { SAMPLE_SHEETS, type SampleSheet } from "@/lib/samples";
import {
  DEFAULT_BUILD_META,
  computeBuildRows,
  seedAcceptedFromSheet,
  seedAcceptedFromBoth,
  buildPgnText,
  buildIssueReportMarkdown,
  buildIssueReportCsv,
  syntheticGameFromAccepted,
  type AcceptedEntry,
  type BuildMeta,
  type BuildRow,
} from "@/lib/buildPgn";

type ActiveSheet = "white" | "black";
type ImageLayoutMode = "toggle" | "split";
type PageLayoutMode = "toggle" | "stack";
type BuildReviewerNotes = Record<number, string>;

interface SheetSource {
  pages: string[];
  label: string;
  activePage: number;
  sampleId?: string;
}

function makeSheetSource(sample: SampleSheet | null): SheetSource {
  if (!sample) return { pages: [], label: "", activePage: 0 };
  const pages = sample.pages && sample.pages.length > 0 ? sample.pages : [sample.url];
  return { pages, label: sample.label, activePage: 0, sampleId: sample.id };
}

function makeUploadSource(url: string, label: string): SheetSource {
  return { pages: [url], label, activePage: 0 };
}

export default function BuildMode() {
  const { toast } = useToast();

  // ── Image sources (per-sheet, may be multi-page) ──
  const [whiteSheet, setWhiteSheet] = useState<SheetSource>(() => makeSheetSource(SAMPLE_SHEETS[1] ?? null));
  const [blackSheet, setBlackSheet] = useState<SheetSource>(() => makeSheetSource(SAMPLE_SHEETS[2] ?? null));
  const [activeSheet, setActiveSheet] = useState<ActiveSheet>("white");
  const [imageLayout, setImageLayout] = useState<ImageLayoutMode>("toggle");
  const [pageLayout, setPageLayout] = useState<PageLayoutMode>("toggle");

  const activeSource = activeSheet === "white" ? whiteSheet : blackSheet;
  const setActiveSource = activeSheet === "white" ? setWhiteSheet : setBlackSheet;
  const whiteImageUrl = whiteSheet.pages[whiteSheet.activePage] ?? null;
  const blackImageUrl = blackSheet.pages[blackSheet.activePage] ?? null;
  const whiteImageLabel = whiteSheet.label;
  const blackImageLabel = blackSheet.label;

  // ── Sheet transcriptions + accepted line ──
  const [whiteText, setWhiteText] = useState<string>("");
  const [blackText, setBlackText] = useState<string>("");
  const [accepted, setAccepted] = useState<Record<number, AcceptedEntry>>({});

  // ── Metadata + reviewer notes ──
  const [meta, setMeta] = useState<BuildMeta>({ ...DEFAULT_BUILD_META });
  const [notes, setNotes] = useState<BuildReviewerNotes>({});

  // ── Board replay ──
  const [boardPly, setBoardPly] = useState<number>(0);
  const [boardOpen, setBoardOpen] = useState<boolean>(true);
  const [transcriptionsOpen, setTranscriptionsOpen] = useState<boolean>(true);

  const compute = useMemo(
    () => computeBuildRows({ meta, whiteText, blackText, accepted }),
    [meta, whiteText, blackText, accepted]
  );
  const rows = compute.rows;

  const syntheticGame = useMemo(() => syntheticGameFromAccepted(meta, rows), [meta, rows]);
  const pgnText = useMemo(() => buildPgnText(meta, rows), [meta, rows]);

  // Keep board ply in valid range as accepted line grows/shrinks.
  useEffect(() => {
    setBoardPly((p) => Math.min(p, syntheticGame.moves.length));
  }, [syntheticGame.moves.length]);

  // Keyboard navigation
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

  // ── Helpers ──
  function pickSampleForActive(sample: SampleSheet) {
    setActiveSource(makeSheetSource(sample));
    // If the sample carries metadata (e.g. multi-page game with known
    // names/ratings), seed the build-mode metadata fields. Existing
    // user-entered values are preserved unless the sample explicitly
    // overrides them.
    if (sample.meta) {
      const sm = sample.meta;
      setMeta((prev) => ({
        ...prev,
        ...(sm.Board !== undefined ? { Board: sm.Board } : {}),
        ...(sm.White !== undefined ? { White: sm.White } : {}),
        ...(sm.Black !== undefined ? { Black: sm.Black } : {}),
        ...(sm.WhiteElo !== undefined ? { WhiteElo: sm.WhiteElo } : {}),
        ...(sm.BlackElo !== undefined ? { BlackElo: sm.BlackElo } : {}),
        ...(sm.Result !== undefined ? { Result: sm.Result } : {}),
      }));
    }
  }
  function uploadForActive(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      setActiveSource(makeUploadSource(url, file.name));
    };
    reader.readAsDataURL(file);
  }
  function setActivePage(idx: number) {
    setActiveSource((prev) => ({ ...prev, activePage: Math.max(0, Math.min(prev.pages.length - 1, idx)) }));
  }

  function setAcceptedAt(ply: number, raw: string) {
    setAccepted((prev) => {
      const next = { ...prev };
      next[ply] = { raw, source: "manual" };
      return next;
    });
  }
  function useWhiteAt(row: BuildRow) {
    if (!row.white || row.white.kind !== "move") return;
    setAccepted((prev) => ({ ...prev, [row.ply]: { raw: row.white!.raw, source: "white" } }));
  }
  function useBlackAt(row: BuildRow) {
    if (!row.black || row.black.kind !== "move") return;
    setAccepted((prev) => ({ ...prev, [row.ply]: { raw: row.black!.raw, source: "black" } }));
  }
  function clearAcceptedAt(ply: number) {
    setAccepted((prev) => {
      const next = { ...prev };
      delete next[ply];
      return next;
    });
  }

  function seedFromWhite() {
    setAccepted(seedAcceptedFromSheet(whiteText, "white"));
    toast({ title: "Seeded from White sheet", description: "Accepted line copied from White-side transcription." });
  }
  function seedFromBlack() {
    setAccepted(seedAcceptedFromSheet(blackText, "black"));
    toast({ title: "Seeded from Black sheet", description: "Accepted line copied from Black-side transcription." });
  }
  function seedFromBoth() {
    setAccepted(seedAcceptedFromBoth(whiteText, blackText));
    toast({
      title: "Seeded from both sheets",
      description: "Where both sheets agree, the move was accepted; conflicts left blank for review.",
    });
  }
  function clearAccepted() {
    setAccepted({});
  }

  async function copyPgn() {
    try {
      await navigator.clipboard.writeText(pgnText);
      toast({ title: "PGN copied", description: "Generated PGN copied to clipboard." });
    } catch {
      toast({ title: "Copy failed", description: "Use the Download button instead." });
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
  const exportSlug = `build-${(meta.White || "white").replace(/\W+/g, "_")}-vs-${(meta.Black || "black").replace(/\W+/g, "_")}`;

  // Note for currently-selected accepted ply
  const currentNotePly = boardPly > 0 ? boardPly - 1 : null;
  const currentNoteValue = currentNotePly !== null ? notes[currentNotePly] ?? "" : "";
  function setNoteForCurrent(v: string) {
    if (currentNotePly === null) return;
    setNotes((prev) => {
      const next = { ...prev };
      if (v === "") delete next[currentNotePly];
      else next[currentNotePly] = v;
      return next;
    });
  }
  function clearNoteForCurrent() {
    if (currentNotePly === null) return;
    setNotes((prev) => {
      const next = { ...prev };
      delete next[currentNotePly];
      return next;
    });
  }

  const notedChipPlies = useMemo(() => {
    const set = new Set<number>();
    for (const k of Object.keys(notes)) {
      const v = (notes[Number(k)] ?? "").trim();
      if (v) set.add(Number(k) + 1);
    }
    return set;
  }, [notes]);

  return (
    <div
      className="flex-1 grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]"
      data-testid="page-build"
    >
      <aside
        className="border-r bg-sidebar/60 backdrop-blur-sm overflow-y-auto lg:max-h-[calc(100vh-3.5rem)] lg:sticky lg:top-14 lg:self-start"
        data-testid="sidebar-build-sources"
      >
        <BuildSidebar
          activeSheet={activeSheet}
          setActiveSheet={setActiveSheet}
          whiteImageLabel={whiteImageLabel}
          blackImageLabel={blackImageLabel}
          whiteSampleId={whiteSheet.sampleId}
          blackSampleId={blackSheet.sampleId}
          uploadForActive={uploadForActive}
          pickSampleForActive={pickSampleForActive}
          meta={meta}
          setMeta={setMeta}
        />
      </aside>

      <main className="overflow-x-hidden min-w-0" data-testid="build-main">
        <BuildBanner />

        {/* Approved layout (do not regress — see FEATURES.md "Approved layout hierarchy"):
            1. Top workbench: scoresheet images (left)  ‖  transcriptions + accepted-line table (right).
            2. Below the workbench: interactive chess board for the accepted line.
            3. Below the board: notes + issues/PGN export workspace.
            Board and notes/exports must NEVER be stacked above the accepted-line table on desktop. */}

        {/* ── 1. TOP WORKBENCH ── side-by-side image + transcriptions/accepted-line */}
        <section
          className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-3 lg:px-3 lg:py-3 lg:items-start"
          data-testid="build-workbench"
        >
          {/* LEFT: scoresheet image pane — sticky on desktop so it stays visible while the right column scrolls. */}
          <div
            className="px-4 py-4 lg:p-0 lg:h-[calc(100vh-3.5rem-2.5rem)] lg:overflow-hidden lg:sticky lg:top-[calc(3.5rem+0.75rem)] flex flex-col gap-2 min-w-0"
            data-testid="build-image-pane"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex rounded-md border bg-card overflow-hidden" role="tablist" aria-label="Sheet image view">
                <button
                  role="tab"
                  aria-selected={imageLayout === "toggle"}
                  onClick={() => setImageLayout("toggle")}
                  className={
                    "px-2.5 py-1 text-[11px] font-medium inline-flex items-center gap-1.5 transition-colors " +
                    (imageLayout === "toggle"
                      ? "bg-primary/10 text-foreground"
                      : "text-muted-foreground hover:text-foreground")
                  }
                  data-testid="button-image-layout-toggle"
                >
                  <Rows2 className="size-3.5" /> Toggle
                </button>
                <button
                  role="tab"
                  aria-selected={imageLayout === "split"}
                  onClick={() => setImageLayout("split")}
                  className={
                    "px-2.5 py-1 text-[11px] font-medium inline-flex items-center gap-1.5 border-l transition-colors " +
                    (imageLayout === "split"
                      ? "bg-primary/10 text-foreground"
                      : "text-muted-foreground hover:text-foreground")
                  }
                  data-testid="button-image-layout-split"
                >
                  <Columns2 className="size-3.5" /> Split
                </button>
              </div>
              {imageLayout === "toggle" && (
                <div className="inline-flex rounded-md border bg-card overflow-hidden" role="tablist" aria-label="Active sheet">
                  <button
                    role="tab"
                    aria-selected={activeSheet === "white"}
                    onClick={() => setActiveSheet("white")}
                    className={
                      "px-3 py-1 text-[11px] font-medium transition-colors " +
                      (activeSheet === "white"
                        ? "bg-primary/10 text-foreground"
                        : "text-muted-foreground hover:text-foreground")
                    }
                    data-testid="button-show-white"
                  >
                    White / A
                  </button>
                  <button
                    role="tab"
                    aria-selected={activeSheet === "black"}
                    onClick={() => setActiveSheet("black")}
                    className={
                      "px-3 py-1 text-[11px] font-medium border-l transition-colors " +
                      (activeSheet === "black"
                        ? "bg-primary/10 text-foreground"
                        : "text-muted-foreground hover:text-foreground")
                    }
                    data-testid="button-show-black"
                  >
                    Black / B
                  </button>
                </div>
              )}
            </div>

            {/* Page toggle / stack — shown when the active sheet has more than one page (e.g. a two-page scoresheet for a long game). */}
            {activeSource.pages.length > 1 && imageLayout === "toggle" && (
              <div
                className="flex flex-wrap items-center gap-2"
                data-testid="build-page-controls"
              >
                <div
                  className="inline-flex rounded-md border bg-card overflow-hidden"
                  role="tablist"
                  aria-label="Page layout"
                >
                  <button
                    role="tab"
                    aria-selected={pageLayout === "toggle"}
                    onClick={() => setPageLayout("toggle")}
                    className={
                      "px-2.5 py-1 text-[11px] font-medium inline-flex items-center gap-1.5 transition-colors " +
                      (pageLayout === "toggle"
                        ? "bg-primary/10 text-foreground"
                        : "text-muted-foreground hover:text-foreground")
                    }
                    data-testid="button-page-layout-toggle"
                  >
                    <Columns2 className="size-3.5" /> One page
                  </button>
                  <button
                    role="tab"
                    aria-selected={pageLayout === "stack"}
                    onClick={() => setPageLayout("stack")}
                    className={
                      "px-2.5 py-1 text-[11px] font-medium inline-flex items-center gap-1.5 border-l transition-colors " +
                      (pageLayout === "stack"
                        ? "bg-primary/10 text-foreground"
                        : "text-muted-foreground hover:text-foreground")
                    }
                    data-testid="button-page-layout-stack"
                  >
                    <Rows2 className="size-3.5" /> Stack pages
                  </button>
                </div>
                {pageLayout === "toggle" && (
                  <div
                    className="inline-flex rounded-md border bg-card overflow-hidden"
                    role="tablist"
                    aria-label="Active page"
                  >
                    {activeSource.pages.map((_, i) => (
                      <button
                        key={i}
                        role="tab"
                        aria-selected={activeSource.activePage === i}
                        onClick={() => setActivePage(i)}
                        className={
                          "px-3 py-1 text-[11px] font-medium font-mono tabular-nums transition-colors " +
                          (i > 0 ? "border-l " : "") +
                          (activeSource.activePage === i
                            ? "bg-primary/10 text-foreground"
                            : "text-muted-foreground hover:text-foreground")
                        }
                        data-testid={`button-page-${i + 1}`}
                      >
                        Page {i + 1}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {imageLayout === "toggle" ? (
              activeSource.pages.length > 1 && pageLayout === "stack" ? (
                <div
                  className="grid grid-rows-2 gap-2 flex-1 h-[600px] lg:h-auto min-h-0"
                  data-testid="card-build-image-stack"
                >
                  {activeSource.pages.map((page, i) => (
                    <Card
                      key={i}
                      className={`overflow-hidden flex flex-col min-h-0 ${
                        activeSource.activePage === i ? "ring-1 ring-primary/40" : ""
                      }`}
                      data-testid={`card-build-image-page-${i + 1}`}
                      onClick={() => setActivePage(i)}
                    >
                      <PanelHeader
                        eyebrow={`${activeSheet === "white" ? "White / Player A" : "Black / Player B"} \u00b7 Page ${i + 1} of ${activeSource.pages.length}`}
                        title="Scoresheet image"
                        right={
                          <Badge
                            variant="outline"
                            className="text-[10px] uppercase tracking-wider font-mono"
                          >
                            pg {i + 1}/{activeSource.pages.length}
                          </Badge>
                        }
                      />
                      <ImageViewer
                        src={page}
                        caption={`${activeSource.label} \u2014 page ${i + 1}`}
                      />
                    </Card>
                  ))}
                </div>
              ) : (
                <Card className="overflow-hidden flex flex-col flex-1 h-[480px] lg:h-auto" data-testid="card-build-image">
                  <PanelHeader
                    eyebrow={
                      activeSource.pages.length > 1
                        ? `${activeSheet === "white" ? "White / Player A" : "Black / Player B"} \u00b7 Page ${activeSource.activePage + 1} of ${activeSource.pages.length}`
                        : activeSheet === "white"
                          ? "White / Player A"
                          : "Black / Player B"
                    }
                    title="Scoresheet image"
                    right={
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-mono">
                        {activeSource.pages.length > 1
                          ? `pg ${activeSource.activePage + 1}/${activeSource.pages.length}`
                          : "Image"}
                      </Badge>
                    }
                  />
                  <ImageViewer
                    src={activeSheet === "white" ? whiteImageUrl : blackImageUrl}
                    caption={activeSheet === "white" ? whiteImageLabel : blackImageLabel}
                  />
                </Card>
              )
            ) : (
              <div className="grid grid-rows-2 gap-2 flex-1 h-[600px] lg:h-auto min-h-0">
                <Card
                  className={`overflow-hidden flex flex-col min-h-0 ${activeSheet === "white" ? "ring-1 ring-primary/40" : ""}`}
                  data-testid="card-build-image-white"
                  onClick={() => setActiveSheet("white")}
                >
                  <PanelHeader
                    eyebrow="Black / Player B"
                    title="Scoresheet image"
                    right={
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-mono">
                        Image
                      </Badge>
                    }
                  />
                  <ImageViewer src={blackImageUrl} caption={blackImageLabel} />
                </Card>
              </div>
            )}
          </div>

          {/* RIGHT: workspace — transcriptions (collapsible) + accepted-line table.
              Board, notes and exports live BELOW the workbench, not in this column. */}
          <div
            className="px-4 py-4 lg:p-0 flex flex-col gap-3 min-w-0"
            data-testid="build-workspace-pane"
          >
            {/* Transcriptions: collapsible to keep accepted-line table above the fold once filled in */}
            <Card className="overflow-hidden shrink-0" data-testid="card-build-transcriptions">
              <button
                type="button"
                onClick={() => setTranscriptionsOpen((b) => !b)}
                className="w-full flex items-center justify-between gap-3 px-4 py-2 border-b bg-card text-left hover:bg-accent/40 transition-colors"
                data-testid="button-toggle-transcriptions"
                aria-expanded={transcriptionsOpen}
              >
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    Step 1 · transcribe
                  </div>
                  <h2 className="font-display text-sm lg:text-base font-semibold">Sheet transcriptions</h2>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-mono">
                    W {tokenCount(whiteText)} · B {tokenCount(blackText)} ply
                  </Badge>
                  {transcriptionsOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                </div>
              </button>
              {transcriptionsOpen && (
                <div className="grid grid-cols-1 xl:grid-cols-2">
                  <TranscriptionPane
                    sideLabel="White / A"
                    tone="white"
                    text={whiteText}
                    setText={setWhiteText}
                    isActive={activeSheet === "white"}
                    activate={() => setActiveSheet("white")}
                  />
                  <div className="border-t xl:border-t-0 xl:border-l">
                    <TranscriptionPane
                      sideLabel="Black / B"
                      tone="black"
                      text={blackText}
                      setText={setBlackText}
                      isActive={activeSheet === "black"}
                      activate={() => setActiveSheet("black")}
                    />
                  </div>
                </div>
              )}
            </Card>

            {/* Accepted-line table — primary review surface */}
            <div data-testid="build-comparison-block">
              <PanelHeader
                eyebrow="Step 2 · reconcile"
                title="Accepted line"
                right={
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={seedFromWhite}
                      data-testid="button-seed-white"
                    >
                      <Wand2 className="size-3.5 mr-1.5" /> Seed: White
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={seedFromBlack}
                      data-testid="button-seed-black"
                    >
                      <Wand2 className="size-3.5 mr-1.5" /> Seed: Black
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={seedFromBoth}
                      data-testid="button-seed-both"
                    >
                      <Wand2 className="size-3.5 mr-1.5" /> Prefer agree
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={clearAccepted}
                      disabled={Object.keys(accepted).length === 0}
                      data-testid="button-clear-accepted"
                    >
                      <Trash2 className="size-3.5 mr-1.5" /> Clear
                    </Button>
                  </div>
                }
                standalone
              />
              <BuildSummaryStrip totals={compute.totals} />
              <BuildTable
                rows={rows}
                activePly={boardPly > 0 ? boardPly - 1 : null}
                onJumpToPly={(ply) => setBoardPly(ply + 1)}
                onSetAccepted={setAcceptedAt}
                onUseWhite={useWhiteAt}
                onUseBlack={useBlackAt}
                onClearAccepted={clearAcceptedAt}
                notes={notes}
              />
            </div>

          </div>
        </section>

        {/* ── 2. INTERACTIVE BOARD (below the workbench, full width) ── */}
        <section
          className="px-4 lg:px-3 pb-3"
          data-testid="build-board-section"
        >
          <Card className="overflow-hidden" data-testid="card-build-board">
            <button
              type="button"
              onClick={() => setBoardOpen((b) => !b)}
              className="w-full flex items-center justify-between gap-3 px-4 py-2.5 border-b bg-card text-left hover:bg-accent/40 transition-colors"
              data-testid="button-toggle-build-board"
              aria-expanded={boardOpen}
            >
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Accepted line
                </div>
                <h2 className="font-display text-base lg:text-lg font-semibold">
                  Chess board
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-mono">
                  {syntheticGame.moves.length} ply
                </Badge>
                {boardOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
              </div>
            </button>
            {boardOpen && (
              <div className="h-[460px] lg:h-[520px] flex flex-col" data-testid="build-board-container">
                <ChessBoardViewer
                  game={syntheticGame.moves.length > 0 ? syntheticGame : null}
                  currentPly={boardPly}
                  onPlyChange={setBoardPly}
                  notedPlies={notedChipPlies}
                />
              </div>
            )}
          </Card>
        </section>

        {/* ── 3. NOTES + ISSUES/EXPORT (below the board) ── */}
        <section
          className="px-4 lg:px-3 pb-6 grid grid-cols-1 xl:grid-cols-2 gap-3"
          data-testid="build-notes-export-section"
        >
          {/* Per-ply reviewer notes */}
          <Card className="overflow-hidden" data-testid="card-build-notes-wrapper">
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b bg-card">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Reviewer notes
                </div>
                <h2 className="font-display text-base lg:text-lg font-semibold">
                  Per-ply notes
                </h2>
              </div>
              <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-mono" data-testid="badge-build-notes-count-header">
                {Object.values(notes).filter((v) => v.trim() !== "").length} note{Object.values(notes).filter((v) => v.trim() !== "").length === 1 ? "" : "s"}
              </Badge>
            </div>
            <div className="p-4" data-testid="build-note-container">
              <BuildNoteEditor
                currentNotePly={currentNotePly}
                san={currentNotePly !== null ? syntheticGame.moves[currentNotePly] ?? null : null}
                value={currentNoteValue}
                setValue={setNoteForCurrent}
                clear={clearNoteForCurrent}
                total={Object.values(notes).filter((v) => v.trim() !== "").length}
              />
            </div>
          </Card>

          {/* Export bar */}
          <div data-testid="build-export-block">
              <PanelHeader
                eyebrow="Step 3 · export"
                title="Generated PGN & issue report"
                right={
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={copyPgn} data-testid="button-copy-pgn">
                      <Copy className="size-3.5 mr-1.5" /> Copy PGN
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadFile(`${exportSlug}.pgn`, pgnText, "application/x-chess-pgn")}
                      data-testid="button-download-pgn"
                    >
                      <Download className="size-3.5 mr-1.5" /> PGN
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        downloadFile(`${exportSlug}-issues.md`, buildIssueReportMarkdown(meta, rows, notes), "text/markdown")
                      }
                      data-testid="button-download-issue-md"
                    >
                      <Download className="size-3.5 mr-1.5" /> Issues (MD)
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        downloadFile(`${exportSlug}-issues.csv`, buildIssueReportCsv(rows, notes), "text/csv")
                      }
                      data-testid="button-download-issue-csv"
                    >
                      <Download className="size-3.5 mr-1.5" /> Issues (CSV)
                    </Button>
                  </div>
                }
                standalone
              />
              <Card className="p-0 overflow-hidden">
                <div className="px-3 py-2 border-b text-[10px] uppercase tracking-[0.18em] text-muted-foreground bg-muted/40">
                  Live PGN preview — derived from accepted legal line + metadata
                </div>
                <pre
                  className="px-3 py-3 text-xs font-mono whitespace-pre-wrap break-words max-h-64 overflow-auto"
                  data-testid="text-pgn-preview"
                >
                  {pgnText}
                </pre>
              </Card>
          </div>
        </section>
      </main>
    </div>
  );
}

/* ── Banner ── */

function BuildBanner() {
  return (
    <div className="border-b bg-sky-100/40 dark:bg-sky-500/10 px-4 lg:px-6 py-2 flex items-start gap-3 text-[12px]" data-testid="banner-build">
      <Info className="size-3.5 shrink-0 mt-0.5 text-sky-700 dark:text-sky-300" />
      <p className="text-sky-900/90 dark:text-sky-100/90">
        <strong>Build PGN — no OCR.</strong> Use this when there is no PGN source (for example, idChess
        failed). Transcribe one or two scoresheets into the panels; the app reconciles them
        into a legal accepted line, validates it with chess.js, and lets you export the resulting
        PGN. The reviewer decides which sheet is correct when they disagree.
      </p>
    </div>
  );
}

/* ── Sidebar ── */

function BuildSidebar({
  activeSheet,
  setActiveSheet,
  whiteImageLabel,
  blackImageLabel,
  whiteSampleId,
  blackSampleId,
  uploadForActive,
  pickSampleForActive,
  meta,
  setMeta,
}: {
  activeSheet: ActiveSheet;
  setActiveSheet: (s: ActiveSheet) => void;
  whiteImageLabel: string;
  blackImageLabel: string;
  whiteSampleId?: string;
  blackSampleId?: string;
  uploadForActive: (f: File) => void;
  pickSampleForActive: (s: SampleSheet) => void;
  meta: BuildMeta;
  setMeta: (m: BuildMeta) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function field<K extends keyof BuildMeta>(k: K) {
    return {
      value: meta[k],
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => setMeta({ ...meta, [k]: e.target.value }),
    };
  }

  return (
    <div className="p-4 space-y-5">
      <section>
        <SidebarSectionHeader step="1" title="Scoresheet images" subtitle="Toggle between sheets to pick or upload" />
        <div className="mt-2 grid grid-cols-2 gap-2" role="tablist" aria-label="Active sheet">
          <button
            role="tab"
            aria-selected={activeSheet === "white"}
            onClick={() => setActiveSheet("white")}
            data-testid="button-active-white"
            className={
              "px-3 py-2 rounded-md text-xs border text-left flex flex-col gap-0.5 transition-colors " +
              (activeSheet === "white"
                ? "bg-primary/10 border-primary/50"
                : "hover:bg-accent border-border text-muted-foreground")
            }
          >
            <span className="font-medium text-foreground">White / A</span>
            <span className="truncate text-[11px]">{whiteImageLabel || "—"}</span>
          </button>
          <button
            role="tab"
            aria-selected={activeSheet === "black"}
            onClick={() => setActiveSheet("black")}
            data-testid="button-active-black"
            className={
              "px-3 py-2 rounded-md text-xs border text-left flex flex-col gap-0.5 transition-colors " +
              (activeSheet === "black"
                ? "bg-primary/10 border-primary/50"
                : "hover:bg-accent border-border text-muted-foreground")
            }
          >
            <span className="font-medium text-foreground">Black / B</span>
            <span className="truncate text-[11px]">{blackImageLabel || "—"}</span>
          </button>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <input
            type="file"
            accept="image/*"
            ref={inputRef}
            className="hidden"
            onChange={(e) => e.target.files?.[0] && uploadForActive(e.target.files[0])}
            data-testid="input-build-upload"
          />
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => inputRef.current?.click()}
            data-testid="button-build-upload"
          >
            <Upload className="size-3.5 mr-1.5" /> Upload to {activeSheet === "white" ? "White" : "Black"}
          </Button>
        </div>
        <div className="mt-3 space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Samples — assign to active sheet
          </div>
          {SAMPLE_SHEETS.map((s) => {
            const active =
              (activeSheet === "white" && whiteSampleId === s.id) ||
              (activeSheet === "black" && blackSampleId === s.id);
            return (
              <button
                key={s.id}
                onClick={() => pickSampleForActive(s)}
                className={`group w-full text-left px-2.5 py-1.5 rounded-md text-xs flex items-center gap-2 transition-colors ${
                  active
                    ? "bg-primary/10 text-foreground border border-primary/30"
                    : "hover:bg-accent text-muted-foreground hover:text-foreground border border-transparent"
                }`}
                data-testid={`button-build-sample-${s.id}`}
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
        <SidebarSectionHeader step="2" title="Game metadata" subtitle="Used in the exported PGN headers" />
        <div className="grid grid-cols-2 gap-2 mt-2">
          <MetaField id="meta-event" label="Event" {...field("Event")} colSpan={2} />
          <MetaField id="meta-site" label="Site" {...field("Site")} colSpan={2} />
          <MetaField id="meta-date" label="Date" placeholder="YYYY.MM.DD" {...field("Date")} />
          <MetaField id="meta-round" label="Round" {...field("Round")} />
          <MetaField id="meta-board" label="Board" {...field("Board")} />
          <div className="col-span-1">
            <Label htmlFor="meta-result" className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Result
            </Label>
            <Select value={meta.Result || "*"} onValueChange={(v) => setMeta({ ...meta, Result: v })}>
              <SelectTrigger id="meta-result" className="h-8 text-xs mt-1" data-testid="select-meta-result">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="*">* (unknown)</SelectItem>
                <SelectItem value="1-0">1-0</SelectItem>
                <SelectItem value="0-1">0-1</SelectItem>
                <SelectItem value="1/2-1/2">1/2-1/2</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <MetaField id="meta-white" label="White" {...field("White")} colSpan={2} />
          <MetaField id="meta-black" label="Black" {...field("Black")} colSpan={2} />
          <MetaField id="meta-welo" label="WhiteElo" {...field("WhiteElo")} />
          <MetaField id="meta-belo" label="BlackElo" {...field("BlackElo")} />
        </div>
      </section>
    </div>
  );
}

function MetaField({
  id,
  label,
  value,
  onChange,
  placeholder,
  colSpan = 1,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  colSpan?: 1 | 2;
}) {
  return (
    <div className={colSpan === 2 ? "col-span-2" : "col-span-1"}>
      <Label htmlFor={id} className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="h-8 text-xs mt-1"
        data-testid={`input-${id}`}
      />
    </div>
  );
}

function SidebarSectionHeader({ step, title, subtitle }: { step: string; title: string; subtitle?: string }) {
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

/* ── Transcription pane (text-only — image lives in left workbench column now) ── */

function TranscriptionPane({
  sideLabel,
  tone,
  text,
  setText,
  isActive,
  activate,
}: {
  sideLabel: string;
  tone: "white" | "black";
  text: string;
  setText: (v: string) => void;
  isActive: boolean;
  activate: () => void;
}) {
  const accent =
    tone === "white"
      ? "border-l-2 border-l-amber-400/60"
      : "border-l-2 border-l-zinc-400/60 dark:border-l-zinc-500/60";
  return (
    <div className={`flex flex-col ${accent}`} data-testid={`sheet-panel-${tone}`} onFocus={activate}>
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b bg-card/60">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {sideLabel} transcription
          </div>
          <div className="text-xs text-muted-foreground">Type or paste moves</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {!isActive && (
            <Button
              variant="ghost"
              size="sm"
              onClick={activate}
              className="h-6 text-[10px] px-1.5"
              data-testid={`button-activate-${tone}`}
            >
              <ImageIcon className="size-3 mr-1" /> Show
            </Button>
          )}
          <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-mono">
            {tokenCount(text)} ply
          </Badge>
        </div>
      </div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        className="text-xs font-mono resize-y border-0 rounded-none focus-visible:ring-0"
        placeholder={`1. e4 e5\n2. Nf3 Nc6\n3. Bb5 a6\n…\n\nUse ? or [illegible] for unreadable plies.`}
        data-testid={`textarea-sheet-${tone}`}
      />
    </div>
  );
}

function tokenCount(text: string): number {
  // Lightweight pre-count for the badge — real tokenization happens in computeBuildRows.
  return text
    .replace(/\{[^}]*\}/g, " ")
    .replace(/\([^()]*\)/g, " ")
    .replace(/\d+\.(\.\.)?/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !["1-0", "0-1", "1/2-1/2", "½-½", "*"].includes(t)).length;
}

/* ── Reconciliation table ── */

function BuildSummaryStrip({
  totals,
}: {
  totals: ReturnType<typeof computeBuildRows>["totals"];
}) {
  const items: { label: string; value: number; cls: string; testId: string }[] = [
    { label: "legal", value: totals.legal, cls: "text-emerald-700 dark:text-emerald-400", testId: "stat-legal" },
    { label: "conflicts", value: totals.conflicts, cls: "text-rose-700 dark:text-rose-400", testId: "stat-conflicts" },
    { label: "illegible", value: totals.illegible, cls: "text-amber-700 dark:text-amber-400", testId: "stat-build-illegible" },
    { label: "illegal", value: totals.illegal, cls: "text-rose-700 dark:text-rose-400", testId: "stat-build-illegal" },
    { label: "blocked", value: totals.blocked, cls: "text-violet-700 dark:text-violet-300", testId: "stat-blocked" },
    { label: "blank", value: totals.blank, cls: "text-blue-700 dark:text-blue-300", testId: "stat-blank" },
  ];
  return (
    <div className="border rounded-md mb-2 bg-card divide-x grid grid-cols-3 sm:grid-cols-6 overflow-hidden" data-testid="strip-build-summary">
      {items.map((it) => (
        <div key={it.label} className="px-3 py-1.5 flex flex-col gap-0.5" data-testid={it.testId}>
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{it.label}</span>
          <span className={`text-base font-display font-semibold tabular-nums ${it.cls}`}>{it.value}</span>
        </div>
      ))}
    </div>
  );
}

function BuildTable({
  rows,
  activePly,
  onJumpToPly,
  onSetAccepted,
  onUseWhite,
  onUseBlack,
  onClearAccepted,
  notes,
}: {
  rows: BuildRow[];
  activePly: number | null;
  onJumpToPly: (ply: number) => void;
  onSetAccepted: (ply: number, raw: string) => void;
  onUseWhite: (row: BuildRow) => void;
  onUseBlack: (row: BuildRow) => void;
  onClearAccepted: (ply: number) => void;
  notes: BuildReviewerNotes;
}) {
  if (rows.length === 0) {
    return (
      <Card className="p-6 text-sm text-muted-foreground" data-testid="empty-build-table">
        <div className="flex items-start gap-3">
          <Info className="size-4 shrink-0 mt-0.5" />
          <div>
            <div className="font-medium text-foreground">No moves yet</div>
            <p className="mt-1">
              Transcribe moves into the White and/or Black sheet panels above, then click a{" "}
              <span className="font-mono">Seed</span> button to populate the accepted line.
            </p>
          </div>
        </div>
      </Card>
    );
  }
  return (
    <Card className="overflow-hidden">
      <div className="overflow-auto max-h-[55vh]">
        <table className="w-full text-xs" data-testid="table-build">
          <thead className="bg-muted/40 text-[10px] uppercase tracking-[0.18em] text-muted-foreground sticky top-0 backdrop-blur z-10">
            <tr>
              <th className="text-left px-3 py-2 w-12">#</th>
              <th className="text-left px-2 py-2 w-14">Side</th>
              <th className="text-left px-2 py-2">White sheet</th>
              <th className="text-left px-2 py-2">Black sheet</th>
              <th className="text-left px-2 py-2 min-w-[160px]">Accepted</th>
              <th className="text-left px-2 py-2 w-[160px]">Status</th>
              <th className="text-right px-3 py-2 w-[160px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const active = activePly === r.ply;
              const noteText = (notes[r.ply] ?? "").trim();
              return (
                <tr
                  key={r.ply}
                  className={
                    "border-t cursor-pointer hover:bg-accent/40 " +
                    (active ? "bg-primary/10" : "")
                  }
                  onClick={() => onJumpToPly(r.ply)}
                  data-testid={`row-build-${r.ply}`}
                >
                  <td className="px-3 py-1.5 font-mono tabular-nums text-muted-foreground">
                    {r.moveNumber}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-muted-foreground">
                    {r.side === "White" ? "w" : "b"}
                  </td>
                  <td className={`px-2 py-1.5 font-mono ${cellTone(r.white?.kind, r.whiteAgrees)}`}>
                    {r.white ? formatPly(r.white) : <span className="text-muted-foreground/50">—</span>}
                  </td>
                  <td className={`px-2 py-1.5 font-mono ${cellTone(r.black?.kind, r.blackAgrees)}`}>
                    {r.black ? formatPly(r.black) : <span className="text-muted-foreground/50">—</span>}
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      value={r.accepted.raw}
                      onChange={(e) => onSetAccepted(r.ply, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      placeholder="—"
                      className={
                        "w-full bg-transparent border-b border-dashed border-border focus:outline-none focus:border-primary px-1 py-0.5 font-mono " +
                        (r.legal ? "text-foreground" : r.accepted.raw ? "text-rose-700 dark:text-rose-400" : "text-muted-foreground")
                      }
                      data-testid={`input-accepted-${r.ply}`}
                      aria-label={`Accepted move for ply ${r.ply + 1}`}
                    />
                    {noteText && (
                      <div className="mt-0.5 text-[10px] text-amber-700 dark:text-amber-400 flex items-start gap-1">
                        <StickyNote className="size-3 mt-0.5 shrink-0" />
                        <span className="truncate" title={noteText}>{noteText}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <StatusCell row={r} />
                  </td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-1.5 text-[10px]"
                        disabled={!r.white || r.white.kind !== "move"}
                        onClick={() => onUseWhite(r)}
                        data-testid={`button-use-white-${r.ply}`}
                      >
                        Use W
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-1.5 text-[10px]"
                        disabled={!r.black || r.black.kind !== "move"}
                        onClick={() => onUseBlack(r)}
                        data-testid={`button-use-black-${r.ply}`}
                      >
                        Use B
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-[10px]"
                        onClick={() => onClearAccepted(r.ply)}
                        disabled={!r.accepted.raw}
                        data-testid={`button-clear-${r.ply}`}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function formatPly(p: { raw: string; kind: string }): React.ReactNode {
  if (p.kind === "illegible") {
    return <span className="text-amber-700 dark:text-amber-400">{p.raw}</span>;
  }
  if (p.kind === "blank") {
    return <span className="text-muted-foreground/60">—</span>;
  }
  return <span>{p.raw}</span>;
}

function cellTone(kind: string | undefined, agrees: boolean | null): string {
  if (kind === "illegible") return "";
  if (agrees === false) return "text-rose-700 dark:text-rose-400";
  if (agrees === true) return "text-emerald-700 dark:text-emerald-400";
  return "";
}

function StatusCell({ row }: { row: BuildRow }) {
  const error = row.issues.find((i) => i.level === "error");
  const warn = row.issues.find((i) => i.level === "warn");
  if (error) {
    return (
      <span className="inline-flex items-center gap-1.5 text-rose-700 dark:text-rose-400 font-mono text-[11px]" title={error.message}>
        <XCircle className="size-3.5" /> {error.kind}
      </span>
    );
  }
  if (warn) {
    return (
      <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-mono text-[11px]" title={warn.message}>
        <AlertTriangle className="size-3.5" /> {warn.kind}
      </span>
    );
  }
  if (row.legal) {
    return (
      <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-mono text-[11px]">
        <CheckCircle2 className="size-3.5" /> legal
      </span>
    );
  }
  if (row.accepted.raw) {
    return (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground font-mono text-[11px]">
        <CircleSlash className="size-3.5" /> blocked
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground font-mono text-[11px]">
      <CircleSlash className="size-3.5" /> blank
    </span>
  );
}

/* ── Note editor ── */

function BuildNoteEditor({
  currentNotePly,
  san,
  value,
  setValue,
  clear,
  total,
}: {
  currentNotePly: number | null;
  san: string | null;
  value: string;
  setValue: (v: string) => void;
  clear: () => void;
  total: number;
}) {
  const moveNumber = currentNotePly !== null ? Math.floor(currentNotePly / 2) + 1 : null;
  const isWhite = currentNotePly !== null && currentNotePly % 2 === 0;
  const label =
    currentNotePly !== null
      ? `${moveNumber}${isWhite ? ". " : "… "}${san ?? "—"}`
      : "start position — step into a move to annotate";
  return (
    <div data-testid="card-build-note-editor">
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <div className="flex items-baseline gap-2 min-w-0">
          <StickyNote className="size-3.5 shrink-0 self-center text-amber-600 dark:text-amber-400" />
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Note for accepted ply
            </div>
            <div className="text-xs font-mono truncate" data-testid="build-note-context">
              {currentNotePly === null ? (
                <span className="text-muted-foreground">{label}</span>
              ) : (
                <>
                  <span className="text-foreground">{label}</span>
                  <span className="text-muted-foreground"> · ply {currentNotePly + 1}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-mono shrink-0">
          {total} note{total === 1 ? "" : "s"}
        </Badge>
      </div>
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={3}
        disabled={currentNotePly === null}
        placeholder={
          currentNotePly === null
            ? "Step the board forward to attach a note to a specific ply."
            : "Why this move was accepted, what the sheets disagreed about, etc."
        }
        className="text-xs font-mono resize-none"
        data-testid="textarea-build-note"
      />
      <div className="flex items-center justify-between mt-2">
        <span className="text-[10px] text-muted-foreground">
          Notes live only in this session; included in exported reports.
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={clear}
          disabled={currentNotePly === null || value.trim() === ""}
          className="h-7 text-xs"
          data-testid="button-build-note-clear"
        >
          <Trash2 className="size-3 mr-1" /> Clear
        </Button>
      </div>
    </div>
  );
}
