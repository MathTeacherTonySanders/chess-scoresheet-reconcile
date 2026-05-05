import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ZoomIn, ZoomOut, RotateCw, Maximize2, ImageOff } from "lucide-react";

interface ImageViewerProps {
  src: string | null;
  caption?: string;
}

export function ImageViewer({ src, caption }: ImageViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [rot, setRot] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  function reset() {
    setZoom(1);
    setRot(0);
    setPan({ x: 0, y: 0 });
  }

  return (
    <div className="flex flex-col h-full" data-testid="image-viewer">
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-card">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setZoom((z) => Math.max(0.25, +(z - 0.25).toFixed(2)))}
          disabled={!src}
          data-testid="button-zoom-out"
          aria-label="Zoom out"
        >
          <ZoomOut className="size-4" />
        </Button>
        <div className="flex-1 max-w-[180px]">
          <Slider
            value={[zoom * 100]}
            min={25}
            max={400}
            step={5}
            onValueChange={(v) => setZoom(v[0] / 100)}
            disabled={!src}
            data-testid="slider-zoom"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))}
          disabled={!src}
          data-testid="button-zoom-in"
          aria-label="Zoom in"
        >
          <ZoomIn className="size-4" />
        </Button>
        <span className="font-mono text-xs text-muted-foreground tabular-nums w-12 text-center" data-testid="text-zoom-level">
          {Math.round(zoom * 100)}%
        </span>
        <div className="w-px h-5 bg-border mx-1" />
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRot((r) => (r + 90) % 360)}
          disabled={!src}
          data-testid="button-rotate"
          aria-label="Rotate 90°"
        >
          <RotateCw className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={reset}
          disabled={!src}
          data-testid="button-fit"
          aria-label="Reset view"
        >
          <Maximize2 className="size-4" />
        </Button>
      </div>
      <div
        className="relative flex-1 overflow-hidden bg-muted/40 chess-grid select-none"
        onMouseDown={(e) => {
          if (!src) return;
          dragRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
        }}
        onMouseMove={(e) => {
          if (!dragRef.current) return;
          const dx = e.clientX - dragRef.current.x;
          const dy = e.clientY - dragRef.current.y;
          setPan({ x: dragRef.current.px + dx, y: dragRef.current.py + dy });
        }}
        onMouseUp={() => (dragRef.current = null)}
        onMouseLeave={() => (dragRef.current = null)}
      >
        {src ? (
          <img
            src={src}
            alt={caption || "Scoresheet"}
            draggable={false}
            data-testid="img-scoresheet"
            style={{
              transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) rotate(${rot}deg) scale(${zoom})`,
              transformOrigin: "center center",
              position: "absolute",
              top: "50%",
              left: "50%",
              maxWidth: "none",
              maxHeight: "none",
              pointerEvents: "none",
              filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.18))",
            }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <div className="flex flex-col items-center gap-2 text-center">
              <ImageOff className="size-8 opacity-50" />
              <p className="text-sm">No scoresheet loaded.</p>
              <p className="text-xs">Pick a sample on the left or upload one.</p>
            </div>
          </div>
        )}
      </div>
      {caption && (
        <div className="px-3 py-2 border-t bg-card text-xs text-muted-foreground" data-testid="text-image-caption">
          {caption}
        </div>
      )}
    </div>
  );
}
