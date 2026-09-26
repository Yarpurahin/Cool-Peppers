import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
const key = 'arena:maker:validation-size';
export function ResizableValidation({
  children,
  layoutKey,
}: {
  children: ReactNode;
  layoutKey: string;
}) {
  const panel = useRef<HTMLElement>(null);
  const drag = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const [bounds, setBounds] = useState({ width: 560, height: 320 });
  const [preferred, setPreferred] = useState(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (
        saved &&
        typeof saved === 'object' &&
        'width' in saved &&
        'height' in saved &&
        typeof saved.width === 'number' &&
        typeof saved.height === 'number' &&
        Number.isFinite(saved.width) &&
        Number.isFinite(saved.height)
      )
        return { width: Math.max(260, saved.width), height: Math.max(160, saved.height) };
    } catch {
      /* Optional preference. */
    }
    return { width: 560, height: 320 };
  });
  useEffect(() => {
    const element = panel.current;
    const parent = element?.parentElement;
    if (!element || !parent) return;
    const resize = () => {
      const right = parseFloat(getComputedStyle(element).right) || 16;
      setBounds({
        width: Math.max(1, parent.clientWidth - right - 16),
        height: Math.max(1, parent.clientHeight - 32),
      });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(parent);
    observer.observe(element);
    resize();
    return () => observer.disconnect();
  }, [layoutKey]);
  const width = Math.min(preferred.width, bounds.width);
  const height = Math.min(preferred.height, bounds.height);
  const setSize = (w: number, h: number) => {
    const next = {
      width: Math.round(Math.max(Math.min(260, bounds.width), Math.min(w, bounds.width))),
      height: Math.round(Math.max(Math.min(160, bounds.height), Math.min(h, bounds.height))),
    };
    setPreferred(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* Resizing still works. */
    }
  };
  return (
    <section
      ref={panel}
      className="maker-validation"
      aria-label="Проверка сценария"
      style={{ width, height }}
    >
      <div
        className="maker-validation-resize"
        role="separator"
        tabIndex={0}
        aria-label="Размер панели проверки"
        aria-orientation="vertical"
        aria-valuemin={Math.min(260, bounds.width)}
        aria-valuemax={bounds.width}
        aria-valuenow={width}
        aria-valuetext={`${width} на ${height} пикселей`}
        title="Потяните угол или используйте клавиши со стрелками"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.focus();
          drag.current = { x: event.clientX, y: event.clientY, width, height };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (drag.current)
            setSize(
              drag.current.width + drag.current.x - event.clientX,
              drag.current.height + drag.current.y - event.clientY,
            );
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
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
          event.preventDefault();
          setSize(
            width + (event.key === 'ArrowLeft' ? 16 : event.key === 'ArrowRight' ? -16 : 0),
            height + (event.key === 'ArrowUp' ? 16 : event.key === 'ArrowDown' ? -16 : 0),
          );
        }}
      />
      {children}
    </section>
  );
}
