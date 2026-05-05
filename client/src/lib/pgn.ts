import { Chess } from "chess.js";

export interface PgnGame {
  index: number;
  headers: Record<string, string>;
  rawMoveText: string;
  /** SAN moves (white & black interleaved), comments and clock tags stripped */
  moves: string[];
  /** Result string from PGN — e.g. "1-0", "0-1", "1/2-1/2", "*" */
  result: string;
  /** Per-move legality (only set after validateGame) */
  legalityErrorAt?: number | null;
  /** SAN moves normalized via chess.js when legal */
  normalizedMoves?: string[];
}

const RESULT_TOKENS = new Set(["1-0", "0-1", "1/2-1/2", "½-½", "*"]);

/**
 * Split a multi-game PGN file into individual game blocks.
 * Each block keeps its tag pairs and movetext.
 */
export function splitPgnGames(pgnText: string): string[] {
  // PGN games begin with [Tag "..."] lines. Split before each [Event ...] tag.
  // But more robustly: split on a blank line followed by [.
  const normalized = pgnText.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const blocks: string[] = [];
  const lines = normalized.split("\n");
  let current: string[] = [];
  let inMoveText = false;

  for (const line of lines) {
    const isTag = /^\[\w+\s+"/.test(line.trim());
    if (isTag && inMoveText && current.length > 0) {
      blocks.push(current.join("\n"));
      current = [line];
      inMoveText = false;
    } else {
      current.push(line);
      if (!isTag && line.trim() !== "") inMoveText = true;
    }
  }
  if (current.length > 0) blocks.push(current.join("\n"));
  return blocks.filter((b) => b.trim().length > 0);
}

export function parsePgnHeaders(block: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const re = /\[(\w+)\s+"([^"]*)"\]/g;
  let m;
  while ((m = re.exec(block)) !== null) {
    headers[m[1]] = m[2];
  }
  return headers;
}

/** Strip braces/comments/clock tags and tokenize SAN moves. */
export function tokenizePgnMoves(movetext: string): { moves: string[]; result: string } {
  let text = movetext;
  // Remove brace comments {..} (non-greedy, no newlines crossing — but PGN can have them; remove non-greedy across)
  text = text.replace(/\{[^}]*\}/g, " ");
  // Remove ; line comments
  text = text.replace(/;[^\n]*/g, " ");
  // Remove RAVs (parenthetical variations)
  // Iteratively to handle nested
  let prev;
  do {
    prev = text;
    text = text.replace(/\([^()]*\)/g, " ");
  } while (text !== prev);
  // Remove NAGs like $1
  text = text.replace(/\$\d+/g, " ");
  // Remove move numbers like "12." or "12..."
  text = text.replace(/\d+\.(\.\.)?/g, " ");
  // Collapse whitespace
  const tokens = text.split(/\s+/).filter(Boolean);

  let result = "*";
  const moves: string[] = [];
  for (const tok of tokens) {
    if (RESULT_TOKENS.has(tok)) {
      result = tok === "½-½" ? "1/2-1/2" : tok;
      break;
    }
    moves.push(tok);
  }
  return { moves, result };
}

export function parsePgn(pgnText: string): PgnGame[] {
  const blocks = splitPgnGames(pgnText);
  return blocks.map((block, index) => {
    const headers = parsePgnHeaders(block);
    // Movetext = part after the last header line
    const lines = block.split("\n");
    let bodyStart = 0;
    for (let i = 0; i < lines.length; i++) {
      if (!/^\[\w+\s+"/.test(lines[i].trim()) && lines[i].trim() !== "") {
        bodyStart = i;
        break;
      }
    }
    const movetext = lines.slice(bodyStart).join("\n").trim();
    const { moves, result } = tokenizePgnMoves(movetext);
    return {
      index,
      headers,
      rawMoveText: movetext,
      moves,
      result: headers.Result || result || "*",
    };
  });
}

/** Validate moves against chess rules; return normalized SAN list and first illegal index. */
export function validateMoves(moves: string[]): {
  normalized: string[];
  firstIllegalAt: number | null;
} {
  const chess = new Chess();
  const normalized: string[] = [];
  for (let i = 0; i < moves.length; i++) {
    try {
      const m = chess.move(moves[i], { strict: false } as any);
      if (!m) {
        return { normalized, firstIllegalAt: i };
      }
      normalized.push(m.san);
    } catch {
      return { normalized, firstIllegalAt: i };
    }
  }
  return { normalized, firstIllegalAt: null };
}

/** Parse a free-text scoresheet transcription into ply tokens.
 * Examples accepted:
 *   1. e4 e5 2. Nf3 ...
 *   1.e4 e5 2.Nf3
 *   e4 e5 Nf3
 *   1. e4 ?? 2. Nf3 [illegible]
 */
export interface TranscribedPly {
  raw: string;
  /** True if the user marked this ply as illegible */
  illegible: boolean;
}

const ILLEGIBLE_TOKENS = new Set(["?", "??", "?!", "[illegible]", "[?]", "...", "…"]);

/** Strip inline `--` notes from raw transcription text so the comparison is
 * not polluted by reviewer scratch-notes. Two cases:
 *   1. A whole line that is an explicit-target note (e.g. `4w -- typo`) is removed.
 *   2. A trailing `-- ...` segment on a move line is removed (left-side moves preserved).
 * The transcription itself is not modified — this only sanitizes the tokenization input. */
export function stripInlineNotesForTokenization(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    // Explicit-target note line — drop entirely
    if (/^\s*\d+\s*[wWbB]\s*[:.]?\s*-{2,}/.test(line)) continue;
    // Trailing inline note on a move line — strip from "--" onwards
    const idx = line.indexOf("--");
    if (idx >= 0) {
      out.push(line.slice(0, idx));
    } else {
      out.push(line);
    }
  }
  return out.join("\n");
}

export function parseTranscription(text: string): TranscribedPly[] {
  let t = stripInlineNotesForTokenization(text);
  t = t.replace(/\r\n/g, "\n").trim();
  if (!t) return [];
  // Remove brace comments
  t = t.replace(/\{[^}]*\}/g, " ");
  // Remove RAVs
  let prev;
  do { prev = t; t = t.replace(/\([^()]*\)/g, " "); } while (t !== prev);
  // Strip move numbers like 12. or 12...
  t = t.replace(/\d+\.(\.\.)?/g, " ");
  // [illegible] or [?] should stay as a single token
  t = t.replace(/\[illegible\]/gi, " [illegible] ");
  t = t.replace(/\[\?\]/g, " [?] ");
  const tokens = t.split(/\s+/).filter(Boolean);
  const out: TranscribedPly[] = [];
  for (const raw of tokens) {
    if (RESULT_TOKENS.has(raw)) break;
    const lower = raw.toLowerCase();
    const illegible =
      ILLEGIBLE_TOKENS.has(raw) ||
      lower === "[illegible]" ||
      lower === "[?]" ||
      raw === "?" ||
      raw === "??";
    out.push({ raw, illegible });
  }
  return out;
}

/**
 * A single detected inline-note candidate. Each candidate corresponds to one
 * suggested per-ply attachment that the reviewer can apply, edit, or skip.
 *
 * The primary detection path is move-pair lines that carry a `--` note,
 * optionally with `Nw` / `Nb` sub-target markers inside the note body that
 * split it across multiple plies, e.g.
 *
 *     4. Nxe4 Nf6 -- Player typo 4w wrote Nxd4. 4b wrote Nc6
 *
 * yields two candidates targeting White ply 7 and Black ply 8.
 *
 * Kinds:
 *   - `targeted`   note body had an explicit `Nw`/`Nb` sub-target;
 *                  the parser pre-selected the matching ply.
 *   - `ambiguous`  pair-level `--` note with no sub-target; reviewer picks
 *                  White, Black, or both (or skip) in the review UI.
 *   - `explicit`   line-level `4w -- ...` / `4b -- ...` shorthand (kept as a
 *                  secondary syntax).
 */
export interface InlineNoteCandidate {
  /** Stable id, used as React key + cleanup map key. */
  id: string;
  kind: "targeted" | "ambiguous" | "explicit";
  /** Original full line text (for display in the review UI). */
  sourceLine: string;
  /** 1-indexed move number this note belongs to. */
  moveNumber: number;
  /** "w" | "b" for targeted/explicit; null for ambiguous (caller picks). */
  side: "w" | "b" | null;
  /** 0-indexed ply when the side is known; null for ambiguous. */
  ply: number | null;
  /** Choices presented in the review UI when ambiguous. */
  candidatePlies: { ply: number; label: string }[];
  /** The suggested note text after marker normalization. Editable in the UI. */
  note: string;
}

/** Internal: split a `--` note body into segments anchored at `Nw` / `Nb`
 * sub-target markers that match the line's move number. Returns one entry
 * per detected target, plus optionally a leading "preamble" entry when the
 * body begins with text before the first marker.
 */
function splitBodyByTargets(
  body: string,
  moveNumber: number
): { side: "w" | "b"; text: string }[] | null {
  // Match `4w` or `4b` (case-insensitive) only when the move number matches.
  // Use a global regex with lastIndex tracking so we can keep the
  // surrounding text per segment. Disallow cases like `Nf4` by requiring a
  // word boundary before the digit and a non-word char (or end) after the side.
  const reTarget = /\b(\d+)\s*([wWbB])\b(?![a-zA-Z0-9])/g;
  const matches: { idx: number; len: number; side: "w" | "b" }[] = [];
  let m;
  while ((m = reTarget.exec(body)) !== null) {
    const num = parseInt(m[1], 10);
    if (num !== moveNumber) continue;
    matches.push({ idx: m.index, len: m[0].length, side: m[2].toLowerCase() as "w" | "b" });
  }
  if (matches.length === 0) return null;

  // Build segments. The text from the start of the body up to the first
  // marker is a shared preamble ("Player typo "). Each marker's own segment
  // runs from after the marker up to the next marker (or end). Trailing
  // sentence punctuation between segments is trimmed cleanly.
  const preamble = body.slice(0, matches[0].idx).trim().replace(/[\s.,;:\-]+$/g, "");
  const segments: { side: "w" | "b"; text: string }[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].idx + matches[i].len;
    const end = i + 1 < matches.length ? matches[i + 1].idx : body.length;
    const raw = body.slice(start, end).trim().replace(/^[\s.,;:\-]+/, "").replace(/[\s.,;:\-]+$/g, "");
    const combined = preamble && raw ? `${preamble}: ${raw}` : preamble || raw || "";
    if (combined.trim() === "") continue;
    segments.push({ side: matches[i].side, text: combined });
  }
  return segments.length > 0 ? segments : null;
}

/** Detect inline `--` notes in transcription text.
 *
 * Primary syntax (preferred):
 *   `4. Nxe4 Nf6 -- Player typo 4w wrote Nxd4. 4b wrote Nc6`
 *   produces two candidates (one per sub-target).
 *
 * Without sub-targets:
 *   `4. Nxe4 Nf6 -- something happened here`
 *   produces a single ambiguous candidate; the reviewer picks White, Black,
 *   or both in the UI.
 *
 * Secondary syntax (line-level shorthand):
 *   `4w -- text` / `4b -- text` produce an `explicit` candidate.
 */
export function extractInlineNotes(text: string): InlineNoteCandidate[] {
  if (!text) return [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: InlineNoteCandidate[] = [];

  const reExplicit = /^\s*(\d+)\s*([wWbB])\s*[:.]?\s*-{2,}\s*(.*\S)?\s*$/;
  const rePair = /^(\s*\d+\.\s+\S.*?)\s+-{2,}\s*(.*\S)\s*$/;

  let lineNo = 0;
  for (const rawLine of lines) {
    lineNo++;
    const line = rawLine;

    // 1. Explicit line-level shorthand (secondary syntax).
    const mE = line.match(reExplicit);
    if (mE) {
      const moveNumber = parseInt(mE[1], 10);
      const side = mE[2].toLowerCase() as "w" | "b";
      const note = (mE[3] ?? "").trim();
      if (!note) continue;
      const ply = (moveNumber - 1) * 2 + (side === "w" ? 0 : 1);
      out.push({
        id: `n-${lineNo}-explicit`,
        kind: "explicit",
        sourceLine: line,
        moveNumber,
        side,
        ply,
        candidatePlies: [],
        note,
      });
      continue;
    }

    // 2. Pair-level `--` note (primary syntax).
    const mP = line.match(rePair);
    if (!mP) continue;
    const moveSegment = mP[1].trim();
    const body = mP[2].trim();
    if (!body) continue;
    const numMatch = moveSegment.match(/^(\d+)\./);
    if (!numMatch) continue;
    const moveNumber = parseInt(numMatch[1], 10);
    const wPly = (moveNumber - 1) * 2;
    const bPly = wPly + 1;

    const targeted = splitBodyByTargets(body, moveNumber);
    if (targeted) {
      // One candidate per detected sub-target.
      let seq = 0;
      for (const seg of targeted) {
        seq++;
        const ply = seg.side === "w" ? wPly : bPly;
        out.push({
          id: `n-${lineNo}-pair-${seg.side}-${seq}`,
          kind: "targeted",
          sourceLine: line,
          moveNumber,
          side: seg.side,
          ply,
          candidatePlies: [],
          note: seg.text,
        });
      }
    } else {
      // No sub-targets — ambiguous pair-level note.
      const tokens = moveSegment
        .replace(/^\d+\.(\.\.)?/, "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      const candidatePlies: { ply: number; label: string }[] = [];
      candidatePlies.push({ ply: wPly, label: `${moveNumber}. ${tokens[0] ?? "—"} (White)` });
      candidatePlies.push({ ply: bPly, label: `${moveNumber}… ${tokens[1] ?? "—"} (Black)` });
      out.push({
        id: `n-${lineNo}-pair`,
        kind: "ambiguous",
        sourceLine: line,
        moveNumber,
        side: null,
        ply: null,
        candidatePlies,
        note: body,
      });
    }
  }
  return out;
}

/** Remove inline-note markers from the transcription text. The caller passes
 * a set of *line numbers* whose markers should be cleaned, so multiple
 * candidates that came from the same line are removed together. Used only
 * via an explicit user-triggered cleanup action; never invoked silently. */
export function removeInlineNoteMarkers(text: string, lineNumbers: number[]): string {
  if (!text || lineNumbers.length === 0) return text;
  const lineSet = new Set(lineNumbers);
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  const reExplicit = /^\s*(\d+)\s*([wWbB])\s*[:.]?\s*-{2,}\s*(.*\S)?\s*$/;
  const rePair = /^(\s*\d+\.\s+\S.*?)\s+-{2,}\s*(.*\S)\s*$/;
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = lines[i];
    if (lineSet.has(lineNo)) {
      if (reExplicit.test(line)) continue; // drop the whole line
      const mP = line.match(rePair);
      if (mP) {
        out.push(mP[1].trimEnd());
        continue;
      }
    }
    out.push(line);
  }
  return out.join("\n");
}

/** Pull the original line number out of a candidate id (id format: `n-<lineNo>-...`). */
export function lineNoOfCandidate(id: string): number | null {
  const m = id.match(/^n-(\d+)-/);
  return m ? parseInt(m[1], 10) : null;
}

/** Try to normalize a single SAN move from a transcription against the running engine. */
export function normalizeOneSan(chess: Chess, san: string): { ok: true; san: string } | { ok: false; reason: string } {
  // Light normalization: chess.js accepts most SAN forms; tolerate "0-0" -> "O-O"
  const cleaned = san
    .replace(/^0-0-0$/, "O-O-O")
    .replace(/^0-0$/, "O-O")
    .replace(/[!?#]+$/, "");
  try {
    const m = chess.move(cleaned, { strict: false } as any);
    if (!m) return { ok: false, reason: "illegal move" };
    return { ok: true, san: m.san };
  } catch (e: any) {
    return { ok: false, reason: e?.message || "illegal move" };
  }
}

export type DiscrepancyStatus =
  | "match"
  | "mismatch"
  | "illegible"
  | "missing-in-scoresheet"
  | "extra-in-scoresheet"
  | "illegal-scoresheet"
  | "illegal-pgn"
  | "result-mismatch"
  | "after-divergence";

export interface DiscrepancyRow {
  moveNumber: number;
  side: "White" | "Black";
  scoresheet: string | null;
  pgn: string | null;
  status: DiscrepancyStatus;
  notes: string;
}

export interface ReconcileOptions {
  scoresheetResult?: string | null;
}

export interface ReconcileReport {
  rows: DiscrepancyRow[];
  firstDivergencePly: number | null;
  pgnLegalityFirstIllegalPly: number | null;
  pgnResult: string;
  scoresheetResult: string | null;
  resultMismatch: boolean;
  totals: {
    moves: number;
    matches: number;
    mismatches: number;
    illegible: number;
    missing: number;
    extra: number;
    illegalScoresheet: number;
  };
}

function moveLabel(plyIndex: number): { moveNumber: number; side: "White" | "Black" } {
  return {
    moveNumber: Math.floor(plyIndex / 2) + 1,
    side: plyIndex % 2 === 0 ? "White" : "Black",
  };
}

/**
 * Reconcile transcribed scoresheet plies against PGN moves.
 * Strategy:
 *  - Validate PGN with chess.js (chess.js is forgiving). If a move is illegal, flag and stop normalization there.
 *  - Walk ply-by-ply through the longer of (scoresheet, pgn).
 *  - For each scoresheet ply: if illegible, mark "illegible". Otherwise try chess.js normalize from current position derived from PGN-up-to-now (or scoresheet up-to-now if PGN ran out).
 *  - Compare normalized SAN. After first divergence, continue showing rows but mark as "after-divergence" so user can scan.
 */
export function reconcile(
  pgn: PgnGame,
  transcription: TranscribedPly[],
  opts: ReconcileOptions = {}
): ReconcileReport {
  const { normalized: pgnNormalized, firstIllegalAt: pgnIllegalAt } = validateMoves(pgn.moves);

  // The "ground truth" position walker for normalizing scoresheet moves.
  // We follow PGN positions ply by ply (since that's the reference).
  // If PGN has run out but scoresheet continues, we fall back to walking via scoresheet.
  const positionWalker = new Chess();

  const rows: DiscrepancyRow[] = [];
  const len = Math.max(pgn.moves.length, transcription.length);
  let firstDivergencePly: number | null = null;
  let totals = {
    moves: 0,
    matches: 0,
    mismatches: 0,
    illegible: 0,
    missing: 0,
    extra: 0,
    illegalScoresheet: 0,
  };

  for (let i = 0; i < len; i++) {
    const pgnRaw = pgn.moves[i] ?? null;
    const pgnNorm = pgnNormalized[i] ?? null;
    const ts = transcription[i] ?? null;
    const { moveNumber, side } = moveLabel(i);

    // Advance walker by PGN's move (if legal & present); we'll do that AFTER comparing this ply
    let scoresheetCol: string | null = ts?.raw ?? null;
    let pgnCol: string | null = pgnRaw;
    let status: DiscrepancyStatus = "match";
    let notes = "";

    if (pgnIllegalAt !== null && i >= pgnIllegalAt && pgnRaw !== null) {
      // PGN became illegal at i; we can't normalize from here.
      status = "illegal-pgn";
      notes = `PGN move ${pgnRaw} could not be played from position ${i + 1} (PGN may be malformed).`;
      rows.push({ moveNumber, side, scoresheet: scoresheetCol, pgn: pgnCol, status, notes });
      if (firstDivergencePly === null) firstDivergencePly = i;
      continue;
    }

    if (ts === null && pgnRaw !== null) {
      status = "missing-in-scoresheet";
      notes = "Scoresheet did not record this move.";
      totals.missing++;
      if (firstDivergencePly === null) firstDivergencePly = i;
    } else if (ts !== null && pgnRaw === null) {
      status = "extra-in-scoresheet";
      notes = "Scoresheet has a move beyond where the PGN ends.";
      totals.extra++;
      if (firstDivergencePly === null) firstDivergencePly = i;
    } else if (ts !== null && pgnRaw !== null) {
      if (ts.illegible) {
        status = "illegible";
        notes = "Scoresheet marked illegible/uncertain by reviewer.";
        totals.illegible++;
        if (firstDivergencePly === null) firstDivergencePly = i;
      } else {
        // Normalize scoresheet via walker (which currently reflects pgn position pre-i)
        const tryChess = new Chess(positionWalker.fen());
        const norm = normalizeOneSan(tryChess, ts.raw);
        if (!norm.ok) {
          status = "illegal-scoresheet";
          notes = `Scoresheet move "${ts.raw}" is not legal in the current position.`;
          totals.illegalScoresheet++;
          if (firstDivergencePly === null) firstDivergencePly = i;
        } else {
          if (norm.san === pgnNorm) {
            status = "match";
            totals.matches++;
          } else {
            status = "mismatch";
            notes = `Scoresheet "${norm.san}" vs PGN "${pgnNorm ?? pgnRaw}".`;
            totals.mismatches++;
            if (firstDivergencePly === null) firstDivergencePly = i;
          }
          // overwrite scoresheet col w/ normalized for clarity
          scoresheetCol = norm.san;
        }
      }
    }

    if (pgnRaw !== null) pgnCol = pgnNorm ?? pgnRaw;

    rows.push({ moveNumber, side, scoresheet: scoresheetCol, pgn: pgnCol, status, notes });
    totals.moves++;

    // Advance walker by PGN's move so subsequent normalizations are correct
    if (pgnRaw !== null && pgnIllegalAt === null) {
      try { positionWalker.move(pgnRaw, { strict: false } as any); } catch { /* ignore */ }
    } else if (pgnRaw === null && ts !== null && !ts.illegible) {
      // PGN ran out; advance walker by scoresheet move so we keep validating later moves
      try { positionWalker.move(ts.raw, { strict: false } as any); } catch { /* ignore */ }
    }
  }

  const scoresheetResult = opts.scoresheetResult ?? null;
  const pgnResult = pgn.result;
  const resultMismatch =
    scoresheetResult !== null && scoresheetResult !== "" && scoresheetResult !== pgnResult;

  return {
    rows,
    firstDivergencePly,
    pgnLegalityFirstIllegalPly: pgnIllegalAt,
    pgnResult,
    scoresheetResult,
    resultMismatch,
    totals,
  };
}

/**
 * Reviewer notes keyed by 0-indexed ply (i.e. row index in the report).
 * Empty/blank notes are treated the same as missing.
 */
export type ReviewerNotes = Record<number, string>;

function plyOf(r: DiscrepancyRow): number {
  return (r.moveNumber - 1) * 2 + (r.side === "White" ? 0 : 1);
}

export function reportToMarkdown(
  pgn: PgnGame,
  report: ReconcileReport,
  reviewerNotes: ReviewerNotes = {}
): string {
  const h = pgn.headers;
  const title = `${h.White || "?"} vs ${h.Black || "?"}`;
  const lines: string[] = [];
  lines.push(`# Reconciliation Report — ${title}`);
  lines.push("");
  lines.push(`- Event: ${h.Event || "—"}`);
  lines.push(`- Round: ${h.Round || "—"}  Board: ${h.Board || "—"}`);
  lines.push(`- Date: ${h.Date || "—"}`);
  lines.push(`- PGN result: \`${report.pgnResult}\``);
  if (report.scoresheetResult)
    lines.push(`- Scoresheet result: \`${report.scoresheetResult}\`${report.resultMismatch ? " ⚠ mismatch" : ""}`);
  lines.push("");
  lines.push(
    `Totals — matches ${report.totals.matches}, mismatches ${report.totals.mismatches}, illegible ${report.totals.illegible}, missing ${report.totals.missing}, extra ${report.totals.extra}, illegal scoresheet ${report.totals.illegalScoresheet}.`
  );
  if (report.firstDivergencePly !== null) {
    const { moveNumber, side } = moveLabel(report.firstDivergencePly);
    lines.push(`First divergence at move ${moveNumber} ${side}.`);
  } else {
    lines.push("No divergences detected.");
  }
  lines.push("");

  // Reviewer notes summary section — only emitted when there are notes, so
  // existing exports remain compact when the reviewer hasn't annotated anything.
  const annotated = report.rows
    .map((r) => ({ row: r, ply: plyOf(r), note: (reviewerNotes[plyOf(r)] ?? "").trim() }))
    .filter((x) => x.note.length > 0);
  if (annotated.length > 0) {
    lines.push(`## Reviewer notes (${annotated.length})`);
    lines.push("");
    for (const { row, note } of annotated) {
      const sideTag = row.side === "White" ? "." : "…";
      lines.push(`- **${row.moveNumber}${sideTag} ${row.scoresheet ?? row.pgn ?? "—"}** — ${note.replace(/\n+/g, " ")}`);
    }
    lines.push("");
  }

  lines.push(`| # | Side | Scoresheet | PGN | Status | Notes | Reviewer note |`);
  lines.push(`|---|------|------------|-----|--------|-------|----------------|`);
  for (const r of report.rows) {
    const ply = plyOf(r);
    const reviewerNote = (reviewerNotes[ply] ?? "").trim().replace(/\|/g, "\\|").replace(/\n+/g, " ");
    lines.push(
      `| ${r.moveNumber} | ${r.side} | ${r.scoresheet ?? "—"} | ${r.pgn ?? "—"} | ${r.status} | ${r.notes.replace(/\|/g, "\\|")} | ${reviewerNote || ""} |`
    );
  }
  lines.push("");
  lines.push("> Generated by Reconcile. This tool flags divergences for human review; it does not decide which source is correct.");
  return lines.join("\n");
}

export function reportToCsv(report: ReconcileReport, reviewerNotes: ReviewerNotes = {}): string {
  const esc = (s: string) => `"${(s ?? "").replace(/"/g, '""')}"`;
  const out: string[] = [
    ["move", "side", "scoresheet", "pgn", "status", "notes", "reviewer_note"].join(","),
  ];
  for (const r of report.rows) {
    const ply = plyOf(r);
    const reviewerNote = (reviewerNotes[ply] ?? "").trim();
    out.push([r.moveNumber, r.side, r.scoresheet ?? "", r.pgn ?? "", r.status, r.notes, reviewerNote]
      .map((v) => esc(String(v))).join(","));
  }
  return out.join("\n");
}
