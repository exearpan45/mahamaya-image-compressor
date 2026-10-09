import React, { useState, useRef, useCallback } from 'react';
import { Eye, Columns, SplitSquareVertical } from 'lucide-react';

interface ImageComparisonProps {
  originalUrl: string;
  compressedUrl: string;
  originalLabel?: string;
  compressedLabel?: string;
  originalSizeStr: string;
  compressedSizeStr: string;
}

export const ImageComparison: React.FC<ImageComparisonProps> = ({
  originalUrl,
  compressedUrl,
  originalLabel = 'Original',
  compressedLabel = 'Compressed',
  originalSizeStr,
  compressedSizeStr,
}) => {
  const [mode, setMode] = useState<'slider' | 'side-by-side'>('slider');
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMove = useCallback(
    (clientX: number) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
      setSliderPosition(percentage);
    },
    []
  );

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isDragging) {
      handleMove(e.touches[0].clientX);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      handleMove(e.clientX);
    }
  };

  return (
    <div className="w-full space-y-3">
      {/* Mode toggle bar */}
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span className="font-medium text-slate-300 flex items-center gap-1.5">
          <Eye className="w-4 h-4 text-emerald-400" /> Quality Comparison
        </span>
        <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => setMode('slider')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition ${
              mode === 'slider'
                ? 'bg-slate-700 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <SplitSquareVertical className="w-3.5 h-3.5" /> Split Slider
          </button>
          <button
            type="button"
            onClick={() => setMode('side-by-side')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition ${
              mode === 'side-by-side'
                ? 'bg-slate-700 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Columns className="w-3.5 h-3.5" /> Side by Side
          </button>
        </div>
      </div>

      {mode === 'slider' ? (
        <div
          ref={containerRef}
          onMouseDown={() => setIsDragging(true)}
          onMouseUp={() => setIsDragging(false)}
          onMouseLeave={() => setIsDragging(false)}
          onMouseMove={handleMouseMove}
          onTouchStart={() => setIsDragging(true)}
          onTouchEnd={() => setIsDragging(false)}
          onTouchMove={handleTouchMove}
          className="relative w-full h-80 sm:h-96 rounded-xl overflow-hidden select-none cursor-ew-resize bg-slate-950 border border-slate-800 shadow-inner group"
        >
          {/* Compressed Image (Background) */}
          <img
            src={compressedUrl}
            alt="Compressed version"
            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          />

          {/* Original Image (Clipped Overlay) */}
          <div
            className="absolute inset-0 overflow-hidden pointer-events-none"
            style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
          >
            <img
              src={originalUrl}
              alt="Original version"
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            />
          </div>

          {/* Divider Line */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-emerald-400 pointer-events-none shadow-[0_0_8px_rgba(52,211,153,0.8)]"
            style={{ left: `${sliderPosition}%` }}
          >
            {/* Handle Button */}
            <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-slate-900 border-2 border-emerald-400 shadow-lg flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 9l-4 3 4 3m8-6l4 3-4 3" />
              </svg>
            </div>
          </div>

          {/* Badges */}
          <div className="absolute top-3 left-3 bg-slate-950/80 backdrop-blur-md border border-slate-700/80 px-2.5 py-1 rounded-md text-[11px] font-medium text-slate-300 shadow">
            {originalLabel} ({originalSizeStr})
          </div>
          <div className="absolute top-3 right-3 bg-emerald-950/80 backdrop-blur-md border border-emerald-500/50 px-2.5 py-1 rounded-md text-[11px] font-medium text-emerald-300 shadow">
            {compressedLabel} ({compressedSizeStr})
          </div>

          {/* Helper caption */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-sm px-3 py-1 rounded-full text-[10px] text-slate-400 pointer-events-none">
            Drag divider left / right to compare visual quality
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col items-center">
            <div className="w-full flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="font-semibold text-slate-300">{originalLabel}</span>
              <span className="text-slate-400 font-mono text-[11px]">{originalSizeStr}</span>
            </div>
            <div className="w-full h-64 flex items-center justify-center overflow-hidden rounded-lg bg-black/40">
              <img
                src={originalUrl}
                alt="Original"
                className="max-h-full max-w-full object-contain"
              />
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col items-center">
            <div className="w-full flex items-center justify-between text-xs text-emerald-400 mb-2">
              <span className="font-semibold">{compressedLabel}</span>
              <span className="font-mono text-[11px] bg-emerald-950/60 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-800/40">
                {compressedSizeStr}
              </span>
            </div>
            <div className="w-full h-64 flex items-center justify-center overflow-hidden rounded-lg bg-black/40">
              <img
                src={compressedUrl}
                alt="Compressed"
                className="max-h-full max-w-full object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
