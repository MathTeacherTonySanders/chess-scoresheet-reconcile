import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Info, Moon, Sun } from "lucide-react";

export type AppMode = "verify" | "build";

interface TopBarProps {
  dark: boolean;
  setDark: (b: boolean) => void;
  mode: AppMode;
  setMode: (m: AppMode) => void;
}

export function TopBar({ dark, setDark, mode, setMode }: TopBarProps) {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur-md">
      <div className="px-4 lg:px-6 h-14 flex items-center justify-between gap-3">
        <Logo />

        <ModeTabs mode={mode} setMode={setMode} />

        <div className="flex items-center gap-2">
          <AboutDialog />
          <Button
            variant="outline"
            size="icon"
            onClick={() => setDark(!dark)}
            data-testid="button-theme-toggle"
            aria-label="Toggle theme"
          >
            {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
        </div>
      </div>
    </header>
  );
}

function ModeTabs({ mode, setMode }: { mode: AppMode; setMode: (m: AppMode) => void }) {
  // Compact pill segmented control. Custom-rolled (rather than shadcn Tabs)
  // because we want it to read as a top-of-app mode switch — same visual
  // weight as the logo, not as a body-content tab strip.
  const items: { id: AppMode; label: string; subtitle: string }[] = [
    { id: "verify", label: "Verify PGN", subtitle: "scoresheet vs PGN" },
    { id: "build", label: "Build PGN", subtitle: "from scoresheets" },
  ];
  return (
    <nav
      className="hidden sm:flex items-center gap-1 p-1 rounded-md border bg-card/60"
      data-testid="nav-mode"
      role="tablist"
      aria-label="Application mode"
    >
      {items.map((it) => {
        const active = mode === it.id;
        return (
          <button
            key={it.id}
            role="tab"
            aria-selected={active}
            onClick={() => setMode(it.id)}
            data-testid={`button-mode-${it.id}`}
            className={
              "px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-baseline gap-2 " +
              (active
                ? "bg-primary/15 text-foreground border border-primary/40"
                : "text-muted-foreground hover:text-foreground border border-transparent")
            }
          >
            <span>{it.label}</span>
            <span className="hidden lg:inline text-[10px] uppercase tracking-wider text-muted-foreground/80">
              · {it.subtitle}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function AboutDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid="button-about">
          <Info className="size-3.5 mr-1.5" /> About
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>About Reconcile</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm text-foreground/90 leading-relaxed">
          <p>
            <strong>Reconcile</strong> is a workbench for tournament directors and coaches who handle
            handwritten chess scoresheets.
          </p>
          <p>
            <strong className="text-foreground">No OCR.</strong> The reviewer transcribes what they
            see — including marking moves illegible — and the app validates and reconciles using
            chess.js.
          </p>
          <p>
            <strong>Verify PGN</strong> compares one scoresheet against an authoritative PGN to flag
            divergences for human review.
          </p>
          <p>
            <strong>Build PGN</strong> reconciles one or two scoresheets into a legal PGN — useful
            when the digital source (e.g. an idChess device) failed and only paper remains.
          </p>
          <p className="text-muted-foreground text-xs">
            The app does not decide which source is correct; it surfaces issues for a human reviewer.
            All processing happens locally in your browser.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function FooterDisclaimer({ mode }: { mode: AppMode }) {
  return (
    <footer
      className="border-t bg-card/60 px-4 lg:px-6 py-6 text-xs text-muted-foreground space-y-2"
      data-testid="footer"
    >
      <div className="font-medium text-foreground">Limitations of this prototype</div>
      <ul className="list-disc list-inside space-y-1 marker:text-primary/70">
        <li><strong>No OCR.</strong> The app does not attempt to read handwriting. The reviewer transcribes the sheet manually.</li>
        {mode === "verify" ? (
          <li><strong>No truth claim.</strong> When sheet and PGN diverge, the app does not decide which is correct — it flags the divergence for human review.</li>
        ) : (
          <li><strong>No truth claim.</strong> When two scoresheets disagree, the app flags the conflict; the reviewer chooses the accepted move.</li>
        )}
        <li><strong>SAN normalization.</strong> The chess.js engine normalizes most SAN variants (e.g. <code className="font-mono">0-0</code> → <code className="font-mono">O-O</code>); ambiguous shorthand may still be flagged as illegal.</li>
        <li><strong>No persistence.</strong> Your work lives in this browser session only — nothing is uploaded or stored.</li>
      </ul>
    </footer>
  );
}

export function PanelHeader({
  eyebrow,
  title,
  right,
  standalone = false,
}: {
  eyebrow: string;
  title: string;
  right?: React.ReactNode;
  standalone?: boolean;
}) {
  return (
    <div
      className={
        standalone
          ? "flex items-end justify-between gap-3 mb-3 mt-2"
          : "flex items-center justify-between gap-3 px-4 py-2.5 border-b bg-card"
      }
    >
      <div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</div>
        <h2 className="font-display text-base lg:text-lg font-semibold">{title}</h2>
      </div>
      {right}
    </div>
  );
}
