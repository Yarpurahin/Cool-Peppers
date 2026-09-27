import { useId, useState, type ReactNode } from 'react';
import { Icon } from './Icon.tsx';

export function AccordionItem({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={`accordion-item ${open ? 'is-open' : ''}`}>
      <h3>
        <button
          type="button"
          id={`${id}-trigger`}
          aria-expanded={open}
          aria-controls={`${id}-content`}
          onClick={() => setOpen((value) => !value)}
        >
          {title}
          <Icon name="plus" size={18} />
        </button>
      </h3>
      <div
        id={`${id}-content`}
        className="accordion-content"
        role="region"
        aria-labelledby={`${id}-trigger`}
        aria-hidden={!open}
        inert={!open}
      >
        <div className="accordion-content-inner">{children}</div>
      </div>
    </div>
  );
}
