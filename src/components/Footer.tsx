export function Footer() {
  return (
    <footer className="border-t border-border/50 bg-background/50 py-6">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 sm:flex-row sm:justify-between">
        <p className="font-display text-sm text-muted-foreground">
          © 2026 RecurFi. Smart DCA Agent.
        </p>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Built on</span>
          <span className="font-display font-semibold text-foreground">X Layer</span>
          <div className="h-2 w-2 rounded-full bg-success animate-pulse-glow" />
          <span className="mx-1">|</span>
          <span>Powered by</span>
          <span className="font-display font-semibold text-foreground">OKX Onchain OS</span>
        </div>
      </div>
    </footer>
  );
}
