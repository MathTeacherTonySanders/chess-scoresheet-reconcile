import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
} from "lucide-react";
import type { PgnGame } from "@/lib/pgn";
import { validateMoves } from "@/lib/pgn";

// Unicode chess pieces
const PIECE_GLYPH: Record<string, string> = {
  p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚",
  P: "♙", N: "♘", B: "♗", R: "♖", Q: "♕", K: "♔",
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1];

/**
 * Which workflow is driving this board.
 *
 * - `verify` (default): the board reflects a previously-imported PGN game.
 *   Empty state nudges the reviewer to pick a PGN. Disclaimer references the
 *   selected PGN.
 * - `build`: the board is driven by the accepted/canonical line currently
 *   being constructed in Build PGN mode. Empty state explains how to seed
 *   accepted moves; disclaimer references the accepted line, not a PGN.
 */
export type BoardMode = "verify" | "build";

interface ChessBoardViewerProps {
  game: PgnGame | null;
  /** Controlled current ply (number of half-moves played from start). 0 = start position. */
  currentPly?: number;
  onPlyChange?: (ply: number) => void;
  /**
   * Set of ply indices (1-based, matching the move chip idx) that currently
   * have reviewer notes attached. Move chips for these plies render a dot.
   */
  notedPlies?: Set<number>;
  /**
   * Workflow context. Defaults to `verify`. In `build` mode the empty-state
   * copy, board title, and disclaimer reference the accepted line being
   * constructed rather than a completed PGN. The board is driven by whatever
   * `game` is passed (Build mode synthesizes one from accepted moves) and
   * never asks the reviewer to "pick a PGN game".
   */
  mode?: BoardMode;
}

interface BoardSnapshot {
  /** Engine state at this ply (after `ply` half-moves played). */
  fen: string;
  /** SAN of the last move that produced this position, if any. */
  lastMoveSan: string | null;
  /** From/To squares of the last move (e.g. "e2", "e4"). */
  lastFrom: string | null;
  lastTo: string | null;
  /** Side to move next ('w' | 'b'). */
  turn: "w" | "b";
  /** Display move number for the ply just played, e.g. "12. e4" or "12... e5". */
  movePrefix: string;
}

function buildSnapshots(moves: string[]): BoardSnapshot[] {
  const chess = new Chess();
  const snaps: BoardSnapshot[] = [
    {
      fen: chess.fen(),
      lastMoveSan: null,
      lastFrom: null,
      lastTo: null,
      turn: "w",
      movePrefix: "",
    },
  ];
  for (let i = 0; i < moves.length; i++) {
    let res;
    try {
      res = chess.move(moves[i], { strict: false } as any);
    } catch {
      res = null;
    }
    if (!res) break;
    const moveNumber = Math.floor(i / 2) + 1;
    const isWhite = i % 2 === 0;
    const movePrefix = isWhite
      ? `${moveNumber}. ${res.san}`
      : `${moveNumber}… ${res.san}`;
    snaps.push({
      fen: chess.fen(),
      lastMoveSan: res.san,
      lastFrom: res.from,
      lastTo: res.to,
      turn: chess.turn(),
      movePrefix,
    });
  }
  return snaps;
}

/** Parse a FEN board portion into an 8x8 array of pieces (rank 8 at index 0). */
function fenToBoard(fen: string): (string | null)[][] {
  const placement = fen.split(" ")[0];
  const ranks = placement.split("/");
  return ranks.map((r) => {
    const row: (string | null)[] = [];
    for (const ch of r) {
      if (/\d/.test(ch)) {
        for (let i = 0; i < parseInt(ch, 10); i++) row.push(null);
      } else {
        row.push(ch);
      }
    }
    return row;
  });
}

export function ChessBoardViewer({
  game,
  currentPly,
  onPlyChange,
  notedPlies,
  mode = "verify",
}: ChessBoardViewerProps) {
  const moves = game?.moves ?? [];
  const snapshots = useMemo(() => buildSnapshots(moves), [moves]);
  const maxPly = snapshots.length - 1; // legal-prefix length

  // Detect whether PGN had any illegal move (so we can surface it)
  const validation = useMemo(() => validateMoves(moves), [moves]);

  // Local fallback state if no controlled prop is given
  const [internalPly, setInternalPly] = useState(0);
  const ply = currentPly ?? internalPly;

  // Clamp to legal range when game changes / shorter prefix
  useEffect(() => {
    if (ply > maxPly) {
      const next = maxPly;
      if (onPlyChange) onPlyChange(next);
      else setInternalPly(next);
    }
  }, [maxPly, ply, onPlyChange]);

  function setPly(p: number) {
    const clamped = Math.max(0, Math.min(maxPly, p));
    if (onPlyChange) onPlyChange(clamped);
    else setInternalPly(clamped);
  }

  const snap = snapshots[Math.min(ply, snapshots.length - 1)] ?? snapshots[0];
  const board = fenToBoard(snap.fen);

  // Move chips strip
  const chips = useMemo(() => {
    return snapshots
      .map((s, i) => (i === 0 ? null : { idx: i, label: s.movePrefix }))
      .filter((x): x is { idx: number; label: string } => x !== null);
  }, [snapshots]);

  if (!game) {
    // Build mode never sends `null` (it always synthesizes a PgnGame from the
    // accepted line, even when empty), but we keep a defensive empty state
    // here so the wording stays correct if a future caller does pass null.
    if (mode === "build") {
      return (
        <div
          className="flex flex-col h-full items-center justify-center gap-1 p-6 text-center text-sm text-muted-foreground"
          data-testid="board-empty"
        >
          <div className="font-medium text-foreground">Accepted-line board</div>
          <p>Add accepted moves to display and replay the position.</p>
        </div>
      );
    }
    return (
      <div
        className="flex flex-col h-full items-center justify-center p-6 text-sm text-muted-foreground"
        data-testid="board-empty"
      >
        Pick a PGN game to display the board.
      </div>
    );
  }

  return (
    <div
      className="flex flex-col xl:flex-row 2xl:flex-col h-full overflow-hidden"
      data-testid="chess-board-viewer"
    >
      {/* Left half: board + status + controls */}
      <div className="flex flex-col xl:w-1/2 xl:border-r 2xl:w-full 2xl:border-r-0">
        {/* Board grid — sized to fit available height in panel */}
        <div className="px-3 pt-3 flex justify-center">
          <div
            className="aspect-square w-full max-w-[min(320px,42vh)] select-none border rounded-md overflow-hidden"
            role="grid"
            aria-label="Chess board"
            data-testid="chess-board"
          >
          <div className="grid grid-cols-8 grid-rows-8 h-full w-full">
            {RANKS.map((rank, rIdx) =>
              FILES.map((file, fIdx) => {
                const piece = board[rIdx][fIdx];
                const square = `${file}${rank}`;
                const isLight = (rIdx + fIdx) % 2 === 0;
                const isLastFrom = snap.lastFrom === square;
                const isLastTo = snap.lastTo === square;
                const baseLight = "bg-amber-50 dark:bg-stone-300";
                const baseDark = "bg-amber-200 dark:bg-stone-500";
                const highlight = isLastTo
                  ? "ring-2 ring-amber-500/80 ring-inset"
                  : isLastFrom
                  ? "ring-2 ring-amber-500/40 ring-inset"
                  : "";
                const isWhitePiece = piece && piece === piece?.toUpperCase();
                const pieceColor = isWhitePiece
                  ? "text-stone-900"
                  : "text-stone-900 dark:text-stone-900";
                return (
                  <div
                    key={square}
                    role="gridcell"
                    data-testid={`square-${square}`}
                    data-square={square}
                    data-piece={piece ?? ""}
                    className={`relative flex items-center justify-center text-[clamp(16px,4vw,28px)] leading-none ${
                      isLight ? baseLight : baseDark
                    } ${highlight}`}
                  >
                    {/* Coordinate labels: file letters on rank 1, rank numbers on file a */}
                    {rank === 1 && (
                      <span className="absolute bottom-0 right-0.5 text-[8px] font-mono text-stone-700/70 leading-none">
                        {file}
                      </span>
                    )}
                    {file === "a" && (
                      <span className="absolute top-0 left-0.5 text-[8px] font-mono text-stone-700/70 leading-none">
                        {rank}
                      </span>
                    )}
                    {piece && (
                      <span
                        className={`${pieceColor} font-serif`}
                        style={{
                          textShadow: isWhitePiece
                            ? "0 0 1px #fff, 0 0 2px #fff"
                            : undefined,
                        }}
                        aria-label={piece}
                      >
                        {PIECE_GLYPH[piece] ?? piece}
                      </span>
                    )}
                  </div>
                );
              })
            )}
            </div>
          </div>
        </div>

      {/* Status row */}
      <div
        className="px-3 pt-2 pb-1 flex items-center flex-wrap gap-x-2 gap-y-1 text-[11px] font-mono"
        data-testid="board-status"
      >
        <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
          ply {ply} / {maxPly}
        </Badge>
        <span className="text-muted-foreground truncate flex-1 min-w-0">
          {snap.lastMoveSan
            ? <>last <span className="text-foreground" data-testid="board-last-move">{snap.movePrefix}</span></>
            : <span data-testid="board-last-move">start position</span>}
        </span>
        <span className="text-muted-foreground shrink-0" data-testid="board-side-to-move">
          {snap.turn === "w" ? "white to move" : "black to move"}
        </span>
        <Badge variant="secondary" className="text-[10px] uppercase tracking-wider shrink-0" data-testid="board-result">
          {game.result}
        </Badge>
      </div>

      {/* Controls */}
      <div className="px-3 pt-1 pb-2 flex items-center gap-1.5" data-testid="board-controls">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => setPly(0)}
          disabled={ply === 0}
          aria-label="Start position"
          data-testid="button-board-start"
        >
          <ChevronsLeft className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => setPly(ply - 1)}
          disabled={ply === 0}
          aria-label="Previous ply"
          data-testid="button-board-prev"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => setPly(ply + 1)}
          disabled={ply >= maxPly}
          aria-label="Next ply"
          data-testid="button-board-next"
        >
          <ChevronRight className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => setPly(maxPly)}
          disabled={ply >= maxPly}
          aria-label="Last ply"
          data-testid="button-board-end"
        >
          <ChevronsRight className="size-4" />
        </Button>
        <div className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">
          ← / →
        </div>
      </div>

        {/* Illegal-warning, if any. In Build mode this refers to the accepted
            line; in Verify mode it refers to the imported PGN. We do NOT claim
            any specific source is wrong — just that the line stops being
            legal at this ply. */}
        {validation.firstIllegalAt !== null && (
          <div
            className="mx-3 mb-2 text-[11px] rounded-md border border-rose-500/30 bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200 px-2 py-1.5"
            data-testid={mode === "build" ? "board-accepted-illegal-warning" : "board-pgn-illegal-warning"}
          >
            {mode === "build" ? "Accepted line" : "PGN"} goes illegal at ply{" "}
            {validation.firstIllegalAt + 1}. Board can only be replayed up to ply {maxPly}.
          </div>
        )}
      </div>

      {/* Right half: move list + disclaimer */}
      <div className="flex flex-col xl:w-1/2 2xl:w-full flex-1 min-h-0 overflow-hidden">
      {/* Move chips */}
      <div className="border-t xl:border-t-0 2xl:border-t bg-muted/20 px-2 py-2 flex-1 min-h-0 overflow-y-auto" data-testid="board-move-list">
        {chips.length === 0 ? (
          <div className="text-xs text-muted-foreground p-2">No moves to display.</div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {chips.map((c) => {
              const active = c.idx === ply;
              const hasNote = notedPlies?.has(c.idx) ?? false;
              return (
                <button
                  key={c.idx}
                  onClick={() => setPly(c.idx)}
                  className={`relative text-[11px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card hover:bg-accent border-border text-muted-foreground hover:text-foreground"
                  } ${hasNote ? "pr-3.5" : ""}`}
                  data-testid={`button-board-ply-${c.idx}`}
                  data-ply={c.idx}
                  data-has-note={hasNote ? "true" : undefined}
                  title={hasNote ? `Jump to ${c.label} — has reviewer note` : `Jump to ${c.label}`}
                >
                  {c.label}
                  {hasNote && (
                    <span
                      aria-label="has reviewer note"
                      data-testid={`note-marker-chip-${c.idx}`}
                      className={`absolute right-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full ${
                        active ? "bg-primary-foreground" : "bg-amber-500"
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div
        className="border-t px-3 py-1.5 text-[10px] text-muted-foreground bg-card"
        data-testid="board-disclaimer"
      >
        {mode === "build"
          ? "Board shows the accepted line being constructed. Step through to confirm each accepted move is the position you intended."
          : "Board shows the selected PGN state. It does not prove the PGN is correct — see the discrepancy table for divergence vs. the scoresheet."}
      </div>
      </div>
    </div>
  );
}
