/** Reconcile mark — two interlocking squares forming a chevron of a stylized rook crown. */
export function Logo({ size = 28, withText = true }: { size?: number; withText?: boolean }) {
  return (
    <div className="inline-flex items-center gap-2.5" data-testid="brand-logo">
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        aria-label="Reconcile logo"
        className="text-primary"
      >
        <rect
          x="1.5"
          y="1.5"
          width="29"
          height="29"
          rx="6"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
        />
        {/* Stylized rook crown: three notches */}
        <path
          d="M9 9h3v2h2V9h4v2h2V9h3v4l-2 1v8l2 1v3H9v-3l2-1v-8l-2-1V9z"
          fill="currentColor"
        />
        {/* Diagonal split — implies "compare two sources" */}
        <path
          d="M2 30 L30 2"
          stroke="currentColor"
          strokeWidth="1"
          opacity="0.25"
        />
      </svg>
      {withText && (
        <div className="leading-none">
          <div className="font-display text-[15px] font-semibold tracking-tight text-foreground">
            Reconcile
          </div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Scoresheet × PGN
          </div>
        </div>
      )}
    </div>
  );
}
