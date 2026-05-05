import { useEffect, useState } from "react";
import VerifyMode from "@/pages/VerifyMode";
import BuildMode from "@/pages/BuildMode";
import { TopBar, FooterDisclaimer, type AppMode } from "@/components/Chrome";

export default function ReconcilePage() {
  const [dark, setDark] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  const [mode, setMode] = useState<AppMode>("verify");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col" data-testid="page-reconcile">
      <TopBar dark={dark} setDark={setDark} mode={mode} setMode={setMode} />

      {/* Mobile mode switch — visible only on small screens where the top-bar tabs are hidden. */}
      <div className="sm:hidden border-b bg-card/60 px-4 py-2 flex items-center gap-2" data-testid="mobile-mode-switch">
        <button
          onClick={() => setMode("verify")}
          className={
            "flex-1 px-3 py-1.5 rounded-md text-xs font-medium border " +
            (mode === "verify"
              ? "bg-primary/15 border-primary/40 text-foreground"
              : "border-transparent text-muted-foreground")
          }
          data-testid="button-mobile-mode-verify"
        >
          Verify PGN
        </button>
        <button
          onClick={() => setMode("build")}
          className={
            "flex-1 px-3 py-1.5 rounded-md text-xs font-medium border " +
            (mode === "build"
              ? "bg-primary/15 border-primary/40 text-foreground"
              : "border-transparent text-muted-foreground")
          }
          data-testid="button-mobile-mode-build"
        >
          Build PGN
        </button>
      </div>

      {mode === "verify" ? <VerifyMode /> : <BuildMode />}

      <FooterDisclaimer mode={mode} />
    </div>
  );
}
