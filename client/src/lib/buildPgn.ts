import { Chess } from "chess.js";
import { stripInlineNotesForTokenization, type PgnGame } from "./pgn";

const RESULT_TOKENS = new Set(["1-0", "0-1", "1/2-1/2", "½-½", "*"]);
const ILLEGIBLE_RAW = new Set(["?", "??", "?!", "...", "…"]);

export type BuildPlyKind = "move" | "illegible" | "blank";

export interface BuildPly {
  /** Raw token as transcribed (already stripped of move numbers). */
  raw: string;
  kind: BuildPlyKind;
}

/**
 * Tokenize a single scoresheet's free-text transcription into plies.
 * Mirrors the Verify-mode tokenizer (illegible markers preserved as plies),
 * but additionally lets the caller represent explicit "blank" / unrecorded
 * plies with `-` or `_` (handy when one sheet skipped a move).
 */
export function tokenizeBuildSheet(text: string): BuildPly[] {
  if (!text) return [];
  let t = stripInlineNotesForTokenization(text).replace(/\r\n/g, "\n").trim();
  if (!t) return [];
  // Strip braces and RAVs
  t = t.replace(/\{[^}]*\}/g, " ");
  let prev: string;
  do { prev = t; t = t.replace(/\([^()]*\)/g, " "); } while (t !== prev);
  // Strip move numbers (12. or 12...)
  t = t.replace(/\d+\.(\.\.)?/g, " ");
  // Single-token markers
  t = t.replace(/\[illegible\]/gi, " [illegible] ");
  t = t.replace(/\[\?\]/g, " [?] ");
  const tokens = t.split(/\s+/).filter(Boolean);
  const out: BuildPly[] = [];
  for (const raw of tokens) {
    if (RESULT_TOKENS.has(raw)) break;
    const lower = raw.toLowerCase();
    if (lower === "[illegible]" || lower === "[?]" || ILLEGIBLE_RAW.has(raw)) {
      out.push({ raw, kind: "illegible" });
    } else if (raw === "-" || raw === "_" || raw === "—") {
      out.push({ raw, kind: "blank" });
    } else {
      out.push({ raw, kind: "move" });
    }
  }
  return out;
}

export type AcceptedSource = "blank" | "white" | "black" | "manual" | "working";

export interface AcceptedEntry {
  /** Raw SAN as the reviewer accepted it (or blank). */
  raw: string;
  /** Where this entry came from — used to label the table. */
  source: AcceptedSource;
}

export type IssueLevel = "info" | "warn" | "error";

export type IssueKind =
  | "ok"
  | "missing"
  | "conflict"
  | "illegible"
  | "illegal"
  | "blocked"
  | "blank";

export interface BuildRowIssue {
  kind: IssueKind;
  level: IssueLevel;
  message: string;
}

export interface BuildRow {
  /** 0-indexed ply. */
  ply: number;
  moveNumber: number;
  side: "White" | "Black";
  white: BuildPly | null;
  black: BuildPly | null;
  accepted: AcceptedEntry;
  /** chess.js-normalized accepted SAN, when legal. */
  acceptedSan: string | null;
  /** Whether the accepted entry is legal in the running position. */
  legal: boolean;
  /** Whether the white-sheet token agrees with the accepted move (after normalization). */
  whiteAgrees: boolean | null;
  /** Whether the black-sheet token agrees with the accepted move. */
  blackAgrees: boolean | null;
  issues: BuildRowIssue[];
}

export interface BuildMeta {
  Event: string;
  Site: string;
  Date: string;
  Round: string;
  Board: string;
  White: string;
  Black: string;
  WhiteElo: string;
  BlackElo: string;
  Result: string;
}

export const DEFAULT_BUILD_META: BuildMeta = {
  Event: "",
  Site: "",
  Date: new Date().toISOString().slice(0, 10).replace(/-/g, "."),
  Round: "",
  Board: "",
  White: "",
  Black: "",
  WhiteElo: "",
  BlackElo: "",
  Result: "*",
};

export interface BuildState {
  meta: BuildMeta;
  whiteText: string;
  blackText: string;
  /** Raw accepted entries indexed by ply. Sparse: missing entries are treated as blank. */
  accepted: Record<number, AcceptedEntry>;
}

/** Equivalence after light normalization (case + check/mate marks). */
function softMatches(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .replace(/^0-0-0$/, "O-O-O")
      .replace(/^0-0$/, "O-O")
      .replace(/[!?#+]+$/g, "")
      .toLowerCase();
  return norm(a) === norm(b);
}

function pickAccepted(
  ply: number,
  accepted: Record<number, AcceptedEntry>,
  white: BuildPly | null,
  black: BuildPly | null
): AcceptedEntry {
  const explicit = accepted[ply];
  if (explicit && (explicit.raw.trim() !== "" || explicit.source === "manual")) return explicit;
  // No explicit entry: empty/blank (the reviewer hasn't seeded yet).
  return { raw: "", source: "blank" };
}

/**
 * Build the per-ply reconciliation rows. Walks chess.js along the
 * accepted line and surfaces issues at each ply.
 */
export function computeBuildRows(state: BuildState): {
  rows: BuildRow[];
  firstIllegalPly: number | null;
  totals: {
    plies: number;
    legal: number;
    conflicts: number;
    illegible: number;
    illegal: number;
    blocked: number;
    blank: number;
  };
} {
  const whitePlies = tokenizeBuildSheet(state.whiteText);
  const blackPlies = tokenizeBuildSheet(state.blackText);
  const explicitMaxPly = Math.max(
    -1,
    ...Object.keys(state.accepted).map((n) => Number(n))
  );
  const len = Math.max(whitePlies.length, blackPlies.length, explicitMaxPly + 1);

  const walker = new Chess();
  let blocked = false;
  let firstIllegalPly: number | null = null;
  const rows: BuildRow[] = [];
  let legalCount = 0;
  let conflictCount = 0;
  let illegibleCount = 0;
  let illegalCount = 0;
  let blockedCount = 0;
  let blankCount = 0;

  for (let i = 0; i < len; i++) {
    const w = whitePlies[i] ?? null;
    const b = blackPlies[i] ?? null;
    const accepted = pickAccepted(i, state.accepted, w, b);
    const issues: BuildRowIssue[] = [];

    let acceptedSan: string | null = null;
    let legal = false;
    let whiteAgrees: boolean | null = null;
    let blackAgrees: boolean | null = null;

    const acceptedRaw = accepted.raw.trim();
    const isAcceptedIllegible =
      ILLEGIBLE_RAW.has(acceptedRaw) ||
      acceptedRaw.toLowerCase() === "[illegible]" ||
      acceptedRaw.toLowerCase() === "[?]";

    // Detect conflicts/illegibles even before checking legality so the row
    // surfaces source-level problems clearly.
    const wRaw = w?.raw ?? null;
    const bRaw = b?.raw ?? null;
    const wIsIllegible = w?.kind === "illegible";
    const bIsIllegible = b?.kind === "illegible";
    const wIsBlank = w === null || w.kind === "blank";
    const bIsBlank = b === null || b.kind === "blank";

    if (wIsIllegible || bIsIllegible) {
      issues.push({
        kind: "illegible",
        level: "warn",
        message:
          wIsIllegible && bIsIllegible
            ? "Both sheets marked illegible — needs human review."
            : `${wIsIllegible ? "White" : "Black"} sheet marked illegible.`,
      });
      illegibleCount++;
    }

    if (!wIsIllegible && !bIsIllegible && !wIsBlank && !bIsBlank && wRaw && bRaw) {
      // Both transcribed real tokens — flag if they disagree.
      if (!softMatches(wRaw, bRaw)) {
        issues.push({
          kind: "conflict",
          level: "warn",
          message: `White sheet says “${wRaw}”, Black sheet says “${bRaw}” — review and pick one.`,
        });
        conflictCount++;
      }
    }

    // Legality of accepted move
    if (blocked) {
      issues.push({
        kind: "blocked",
        level: "warn",
        message:
          "Earlier ambiguity blocks legality checking here — resolve the previous flagged ply first.",
      });
      blockedCount++;
    } else if (acceptedRaw === "") {
      issues.push({
        kind: "blank",
        level: "info",
        message: "Accepted move not yet set.",
      });
      blankCount++;
    } else if (isAcceptedIllegible) {
      issues.push({
        kind: "illegible",
        level: "warn",
        message: "Accepted entry is an illegibility marker — replace with a real move.",
      });
      // Prevents downstream legality checks until cleared.
      blocked = true;
      if (firstIllegalPly === null) firstIllegalPly = i;
    } else {
      // Try to play the accepted SAN.
      const cleaned = acceptedRaw
        .replace(/^0-0-0$/, "O-O-O")
        .replace(/^0-0$/, "O-O");
      let played: ReturnType<Chess["move"]> | null = null;
      try {
        played = walker.move(cleaned, { strict: false } as any);
      } catch {
        played = null;
      }
      if (!played) {
        issues.push({
          kind: "illegal",
          level: "error",
          message: `“${acceptedRaw}” is not a legal move from this position.`,
        });
        illegalCount++;
        blocked = true;
        if (firstIllegalPly === null) firstIllegalPly = i;
      } else {
        legal = true;
        acceptedSan = played.san;
        legalCount++;
        if (!wIsBlank && !wIsIllegible && wRaw) {
          whiteAgrees = softMatches(wRaw, played.san);
        }
        if (!bIsBlank && !bIsIllegible && bRaw) {
          blackAgrees = softMatches(bRaw, played.san);
        }
        if (whiteAgrees === false && blackAgrees === true) {
          issues.push({
            kind: "ok",
            level: "info",
            message: "Accepted matches Black sheet; White sheet differs.",
          });
        } else if (whiteAgrees === true && blackAgrees === false) {
          issues.push({
            kind: "ok",
            level: "info",
            message: "Accepted matches White sheet; Black sheet differs.",
          });
        }
        if (issues.length === 0) {
          // No-op: row is clean. We don't push an "ok" issue to keep the table quiet.
        }
      }
    }

    rows.push({
      ply: i,
      moveNumber: Math.floor(i / 2) + 1,
      side: i % 2 === 0 ? "White" : "Black",
      white: w,
      black: b,
      accepted,
      acceptedSan,
      legal,
      whiteAgrees,
      blackAgrees,
      issues,
    });
  }

  return {
    rows,
    firstIllegalPly,
    totals: {
      plies: rows.length,
      legal: legalCount,
      conflicts: conflictCount,
      illegible: illegibleCount,
      illegal: illegalCount,
      blocked: blockedCount,
      blank: blankCount,
    },
  };
}

/**
 * Seed accepted entries from a sheet's tokens. Illegible/blank tokens
 * become blank accepted entries so the user sees the gap.
 */
export function seedAcceptedFromSheet(
  text: string,
  sheet: "white" | "black"
): Record<number, AcceptedEntry> {
  const plies = tokenizeBuildSheet(text);
  const out: Record<number, AcceptedEntry> = {};
  for (let i = 0; i < plies.length; i++) {
    const p = plies[i];
    if (p.kind === "move") {
      out[i] = { raw: p.raw, source: sheet };
    } else {
      out[i] = { raw: "", source: sheet };
    }
  }
  return out;
}

/**
 * Seed accepted entries from the single working transcription. Illegible /
 * blank tokens preserve the reviewer's marker so the row continues to surface
 * the gap.
 */
export function seedAcceptedFromWorking(
  text: string
): Record<number, AcceptedEntry> {
  const plies = tokenizeBuildSheet(text);
  const out: Record<number, AcceptedEntry> = {};
  for (let i = 0; i < plies.length; i++) {
    const p = plies[i];
    if (p.kind === "move") {
      out[i] = { raw: p.raw, source: "working" };
    } else if (p.kind === "illegible") {
      out[i] = { raw: p.raw, source: "working" };
    } else {
      out[i] = { raw: "", source: "working" };
    }
  }
  return out;
}

/**
 * Seed accepted entries from BOTH sheets, preferring entries where the two
 * sheets agree. Conflicts are left blank with `source: "manual"` so the row
 * shows a "needs review" state.
 */
export function seedAcceptedFromBoth(
  whiteText: string,
  blackText: string
): Record<number, AcceptedEntry> {
  const w = tokenizeBuildSheet(whiteText);
  const b = tokenizeBuildSheet(blackText);
  const out: Record<number, AcceptedEntry> = {};
  const len = Math.max(w.length, b.length);
  for (let i = 0; i < len; i++) {
    const wp = w[i] ?? null;
    const bp = b[i] ?? null;
    const wMove = wp?.kind === "move" ? wp.raw : null;
    const bMove = bp?.kind === "move" ? bp.raw : null;
    if (wMove && bMove) {
      if (softMatches(wMove, bMove)) {
        // Prefer the white-side spelling since chess.js will normalize anyway.
        out[i] = { raw: wMove, source: "white" };
      } else {
        out[i] = { raw: "", source: "manual" };
      }
    } else if (wMove) {
      out[i] = { raw: wMove, source: "white" };
    } else if (bMove) {
      out[i] = { raw: bMove, source: "black" };
    } else {
      // Both blank/illegible
      out[i] = { raw: "", source: "manual" };
    }
  }
  return out;
}

/** Build the legal-only accepted SAN list (truncated at the first illegal ply). */
export function legalAcceptedMoves(rows: BuildRow[]): string[] {
  const out: string[] = [];
  for (const r of rows) {
    if (!r.legal || !r.acceptedSan) break;
    out.push(r.acceptedSan);
  }
  return out;
}

/** Construct a synthetic `PgnGame` from accepted moves so we can reuse the
 *  existing ChessBoardViewer for the replay panel. */
export function syntheticGameFromAccepted(
  meta: BuildMeta,
  rows: BuildRow[]
): PgnGame {
  const moves = legalAcceptedMoves(rows);
  const headers: Record<string, string> = {};
  (Object.keys(meta) as (keyof BuildMeta)[]).forEach((k) => {
    if (meta[k] !== "") headers[k] = meta[k];
  });
  return {
    index: 0,
    headers,
    rawMoveText: moves.join(" "),
    moves,
    result: meta.Result || "*",
  };
}

const PGN_SAFE_HEADER = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

/** Serialize the accepted line + metadata as a clean single-game PGN. */
export function buildPgnText(meta: BuildMeta, rows: BuildRow[]): string {
  const moves = legalAcceptedMoves(rows);
  const headerOrder: (keyof BuildMeta)[] = [
    "Event",
    "Site",
    "Date",
    "Round",
    "White",
    "Black",
    "Result",
    "Board",
    "WhiteElo",
    "BlackElo",
  ];
  const lines: string[] = [];
  for (const k of headerOrder) {
    const v = meta[k];
    if (k === "Event" || k === "Site" || k === "Date" || k === "Round" || k === "White" || k === "Black" || k === "Result") {
      // The seven STR (Seven Tag Roster) tags are always emitted, with sensible defaults.
      lines.push(`[${k} "${PGN_SAFE_HEADER(v || (k === "Result" ? "*" : "?"))}"]`);
    } else if (v && v.trim() !== "") {
      lines.push(`[${k} "${PGN_SAFE_HEADER(v)}"]`);
    }
  }
  lines.push("");
  // Emit move text with line wrapping at ~80 chars.
  const tokens: string[] = [];
  for (let i = 0; i < moves.length; i++) {
    if (i % 2 === 0) tokens.push(`${i / 2 + 1}.`);
    tokens.push(moves[i]);
  }
  const result = meta.Result || "*";
  tokens.push(result);
  // Wrap
  const wrapped: string[] = [];
  let buf = "";
  for (const tok of tokens) {
    if (buf.length === 0) {
      buf = tok;
    } else if (buf.length + 1 + tok.length > 80) {
      wrapped.push(buf);
      buf = tok;
    } else {
      buf += " " + tok;
    }
  }
  if (buf) wrapped.push(buf);
  lines.push(...wrapped);
  lines.push("");
  return lines.join("\n");
}

/** Markdown issue report for the Build mode. */
export function buildIssueReportMarkdown(
  meta: BuildMeta,
  rows: BuildRow[],
  reviewerNotes: Record<number, string> = {}
): string {
  const lines: string[] = [];
  const title = `${meta.White || "?"} vs ${meta.Black || "?"}`;
  lines.push(`# Build PGN Issue Report — ${title}`);
  lines.push("");
  lines.push(`- Event: ${meta.Event || "—"}`);
  lines.push(`- Round: ${meta.Round || "—"}  Board: ${meta.Board || "—"}`);
  lines.push(`- Date: ${meta.Date || "—"}`);
  lines.push(`- Result: \`${meta.Result || "*"}\``);
  lines.push("");
  const flagged = rows.filter((r) => r.issues.some((i) => i.level !== "info") || !r.legal);
  lines.push(
    `Plies: ${rows.length}. Legal: ${rows.filter((r) => r.legal).length}. Flagged for review: ${flagged.length}.`
  );
  lines.push("");
  lines.push("| # | Side | White sheet | Black sheet | Accepted | Status | Notes | Reviewer note |");
  lines.push("|---|------|-------------|-------------|----------|--------|-------|----------------|");
  for (const r of rows) {
    const status =
      r.issues.find((i) => i.level === "error")?.kind ??
      r.issues.find((i) => i.level === "warn")?.kind ??
      (r.legal ? "ok" : r.accepted.raw ? "blocked" : "blank");
    const note = (reviewerNotes[r.ply] ?? "").trim().replace(/\|/g, "\\|").replace(/\n+/g, " ");
    lines.push(
      `| ${r.moveNumber} | ${r.side} | ${r.white?.raw ?? "—"} | ${r.black?.raw ?? "—"} | ${r.acceptedSan ?? (r.accepted.raw || "—")} | ${status} | ${r.issues.map((i) => i.message).join(" ").replace(/\|/g, "\\|")} | ${note} |`
    );
  }
  lines.push("");
  lines.push("> Generated by Reconcile (Build PGN mode). The app helps reconcile two scoresheets into a legal PGN; it does not perform OCR or decide which sheet is correct.");
  return lines.join("\n");
}

export function buildIssueReportCsv(
  rows: BuildRow[],
  reviewerNotes: Record<number, string> = {}
): string {
  const esc = (s: string) => `"${(s ?? "").replace(/"/g, '""')}"`;
  const out: string[] = [
    ["move", "side", "white_sheet", "black_sheet", "accepted", "legal", "status", "issues", "reviewer_note"].join(","),
  ];
  for (const r of rows) {
    const status =
      r.issues.find((i) => i.level === "error")?.kind ??
      r.issues.find((i) => i.level === "warn")?.kind ??
      (r.legal ? "ok" : r.accepted.raw ? "blocked" : "blank");
    out.push(
      [
        r.moveNumber,
        r.side,
        r.white?.raw ?? "",
        r.black?.raw ?? "",
        r.acceptedSan ?? r.accepted.raw,
        r.legal ? "yes" : "no",
        status,
        r.issues.map((i) => i.message).join(" "),
        (reviewerNotes[r.ply] ?? "").trim(),
      ]
        .map((v) => esc(String(v)))
        .join(",")
    );
  }
  return out.join("\n");
}
