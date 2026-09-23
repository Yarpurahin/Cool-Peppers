import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

const WIDTH_KEY = 'arena:maker:inspector-width';
const limits = (width: number) => ({
  min: Math.min(260, width - 38),
  max:
    width <= 640
      ? width - 38
      : Math.min(640, width - (width > 1250 ? 224 : width > 1000 ? 194 : 0) - 240),
});

export function useInspectorWidth() {
  const [preferred, setPreferred] = useState(() => {
    try {
      const value = Number(localStorage.getItem(WIDTH_KEY));
      if (Number.isFinite(value) && value >= 260 && value <= 640) return value;
    } catch {
      /* Default width also works without browser storage. */
    }
    return 326;
  });
  const [screen, setScreen] = useState(window.innerWidth);
  useEffect(() => {
    const resize = () => setScreen(window.innerWidth);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const { min, max } = limits(screen);
  const width = Math.max(min, Math.min(max, preferred));
  const setWidth = (value: number) => {
    const next = Math.round(Math.max(min, Math.min(max, value)));
    setPreferred(next);
    try {
      localStorage.setItem(WIDTH_KEY, String(next));
    } catch {
      /* Optional preference. */
    }
  };
  return {
    width,
    min,
    max,
    setWidth,
    style: { '--inspector-width': `${width}px` } as CSSProperties,
  };
}

export function ResizableInspector({
  children,
  width,
  min,
  max,
  setWidth,
}: {
  children: ReactNode;
  width: number;
  min: number;
  max: number;
  setWidth: (width: number) => void;
}) {
  const drag = useRef<{ x: number; width: number } | null>(null);
  return (
    <div className="maker-inspector-panel">
      <div
        className="maker-inspector-resize"
        role="separator"
        tabIndex={0}
        aria-label="Ширина панели свойств"
        aria-orientation="vertical"
        aria-controls="maker-inspector"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={width}
        aria-valuetext={`${width} пикселей`}
        title="Потяните границу или используйте стрелки влево и вправо"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.focus();
          drag.current = { x: event.clientX, width };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (drag.current) setWidth(drag.current.width + drag.current.x - event.clientX);
        }}
        onPointerUp={(event) => {
          drag.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
        onKeyDown={(event) => {
          const next = { ArrowLeft: width + 16, ArrowRight: width - 16, Home: min, End: max }[
            event.key
          ];
          if (next === undefined) return;
          event.preventDefault();
          setWidth(next);
        }}
      />
      {children}
    </div>
  );
}
