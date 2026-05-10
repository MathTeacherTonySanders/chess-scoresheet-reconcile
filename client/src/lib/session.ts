/**
 * Session export / import for Reconcile.
 *
 * This is **file-based** persistence only — the saved state lives in a JSON
 * file the user downloads to their local disk and re-imports later. No
 * browser storage (localStorage / sessionStorage / IndexedDB / cookies) is
 * used; doing so is intentionally forbidden in the sandboxed iframe.
 *
 * The current focus is Build PGN mode (the user's immediate problem: saving
 * a partially completed Build PGN task and resuming it later). The format is
 * a discriminated, versioned wrapper so we can extend it to Verify mode and
 * future modes without breaking older session files.
 */
import {
  DEFAULT_BUILD_META,
  type AcceptedEntry,
  type BuildMeta,
} from "./buildPgn";

export const SESSION_APP = "reconcile";
/**
 * Bump only when the schema changes in a way old files can't be auto-migrated.
 *  - 1: original two-sheet Build state (whiteText + blackText).
 *  - 2: single-transcription Build state (workingText).
 */
export const SESSION_VERSION = 2;

export type ImageLayoutMode = "toggle" | "split";
export type PageLayoutMode = "toggle" | "stack";
export type ActiveSheet = "white" | "black";

/** Build PGN mode state captured in a session file. */
export interface BuildSessionState {
  /** Sample id loaded into the workbench (if any), so import can re-pick it. */
  activeSampleId: string | null;
  /** Multi-page layout state for the workbench image. */
  activePage: number;
  imageLayout: ImageLayoutMode;
  pageLayout: PageLayoutMode;
  activeSheet: ActiveSheet;
  /** PGN metadata used for the exported PGN headers. */
  meta: BuildMeta;
  /** The single working transcription the user is decoding from the sheets. */
  workingText: string;
  /** Accepted move entries indexed by ply (sparse). */
  accepted: Record<number, AcceptedEntry>;
  /** Per-ply reviewer notes, indexed by ply. */
  notes: Record<number, string>;
  /** Current board ply (0 = start position, N = after N plies). */
  boardPly: number;
}

export interface SessionEnvelope {
  app: typeof SESSION_APP;
  version: number;
  /** ISO timestamp written when the session was exported. */
  exportedAt: string;
  /** Free-form note from the user — currently always empty. */
  label?: string;
  /** Build PGN mode state, if present in this session. */
  build?: BuildSessionState;
  /** Reserved for future Verify mode state. */
  verify?: unknown;
}

export function defaultBuildSessionState(): BuildSessionState {
  return {
    activeSampleId: null,
    activePage: 0,
    imageLayout: "toggle",
    pageLayout: "toggle",
    activeSheet: "white",
    meta: { ...DEFAULT_BUILD_META },
    workingText: "",
    accepted: {},
    notes: {},
    boardPly: 0,
  };
}

/** Build a fresh session envelope around current Build state. */
export function createSessionEnvelope(build: BuildSessionState): SessionEnvelope {
  return {
    app: SESSION_APP,
    version: SESSION_VERSION,
    exportedAt: new Date().toISOString(),
    build,
  };
}

/** Suggested filename for an exported session: includes player names + date. */
export function suggestSessionFilename(build: BuildSessionState | null): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const slug = build
    ? `${(build.meta.White || "white").replace(/\W+/g, "_")}-vs-${(
        build.meta.Black || "black"
      ).replace(/\W+/g, "_")}`
    : "session";
  return `reconcile-session-${stamp}-${slug}.json`;
}

/* ── Validation / migration ───────────────────────────────────────────── */

export class SessionImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionImportError";
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function coerceString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function coerceNumber(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function coerceMeta(v: unknown): BuildMeta {
  const o = isPlainObject(v) ? v : {};
  return {
    Event: coerceString(o.Event),
    Site: coerceString(o.Site),
    Date: coerceString(o.Date, DEFAULT_BUILD_META.Date),
    Round: coerceString(o.Round),
    Board: coerceString(o.Board),
    White: coerceString(o.White),
    Black: coerceString(o.Black),
    WhiteElo: coerceString(o.WhiteElo),
    BlackElo: coerceString(o.BlackElo),
    Result: coerceString(o.Result, "*"),
  };
}

function coerceAccepted(v: unknown): Record<number, AcceptedEntry> {
  if (!isPlainObject(v)) return {};
  const out: Record<number, AcceptedEntry> = {};
  for (const [k, val] of Object.entries(v)) {
    const ply = Number(k);
    if (!Number.isInteger(ply) || ply < 0) continue;
    if (!isPlainObject(val)) continue;
    const raw = coerceString(val.raw);
    const src = coerceString(val.source, "manual");
    const source: AcceptedEntry["source"] =
      src === "white" || src === "black" || src === "manual" || src === "blank" || src === "working"
        ? src
        : "manual";
    out[ply] = { raw, source };
  }
  return out;
}

function coerceNotes(v: unknown): Record<number, string> {
  if (!isPlainObject(v)) return {};
  const out: Record<number, string> = {};
  for (const [k, val] of Object.entries(v)) {
    const ply = Number(k);
    if (!Number.isInteger(ply) || ply < 0) continue;
    if (typeof val !== "string") continue;
    if (val.trim() === "") continue;
    out[ply] = val;
  }
  return out;
}

function coerceImageLayout(v: unknown): ImageLayoutMode {
  return v === "split" ? "split" : "toggle";
}

function coercePageLayout(v: unknown): PageLayoutMode {
  return v === "stack" ? "stack" : "toggle";
}

function coerceActiveSheet(v: unknown): ActiveSheet {
  return v === "black" ? "black" : "white";
}

function coerceBuildState(v: unknown): BuildSessionState {
  const o = isPlainObject(v) ? v : {};
  // Backwards-compat: a v1 session has whiteText / blackText. We treat
  // whiteText as the working transcription (since the user said he was
  // putting his decided moves there already) and discard blackText.
  const workingTextRaw =
    typeof o.workingText === "string"
      ? o.workingText
      : typeof (o as { whiteText?: unknown }).whiteText === "string"
        ? (o as { whiteText: string }).whiteText
        : "";

  return {
    activeSampleId:
      typeof o.activeSampleId === "string" || o.activeSampleId === null
        ? (o.activeSampleId as string | null)
        : null,
    activePage: Math.max(0, coerceNumber(o.activePage, 0)),
    imageLayout: coerceImageLayout(o.imageLayout),
    pageLayout: coercePageLayout(o.pageLayout),
    activeSheet: coerceActiveSheet(o.activeSheet),
    meta: coerceMeta(o.meta),
    workingText: workingTextRaw,
    accepted: coerceAccepted(o.accepted),
    notes: coerceNotes(o.notes),
    boardPly: Math.max(0, coerceNumber(o.boardPly, 0)),
  };
}

/**
 * Parse a raw JSON string into a usable session envelope.
 * Throws `SessionImportError` with a friendly message if the file isn't a
 * Reconcile session.
 */
export function parseSessionJson(raw: string): SessionEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new SessionImportError("File is not valid JSON.");
  }
  if (!isPlainObject(parsed)) {
    throw new SessionImportError("Session file must be a JSON object.");
  }
  if (parsed.app !== SESSION_APP) {
    throw new SessionImportError(
      `Not a Reconcile session file (expected app="${SESSION_APP}").`
    );
  }
  const version = coerceNumber(parsed.version, 0);
  if (version < 1 || version > SESSION_VERSION) {
    throw new SessionImportError(
      `Unsupported session version: ${parsed.version}. This build supports versions 1–${SESSION_VERSION}.`
    );
  }
  const envelope: SessionEnvelope = {
    app: SESSION_APP,
    version,
    exportedAt: coerceString(parsed.exportedAt, new Date().toISOString()),
    label: typeof parsed.label === "string" ? parsed.label : undefined,
  };
  if (parsed.build !== undefined) {
    envelope.build = coerceBuildState(parsed.build);
  }
  return envelope;
}
