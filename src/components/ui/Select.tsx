import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon.tsx';
import './select.css';

type Choice = { value: string; label: string; disabled: boolean; group?: string };
type OptionProps = { value?: string; label?: string; disabled?: boolean; children?: ReactNode };
function readChoices(children: ReactNode, group?: string, disabled = false): Choice[] {
  const choices: Choice[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement<OptionProps>(child)) return;
    if (child.type === Fragment || child.type === 'optgroup') {
      choices.push(
        ...readChoices(
          child.props.children,
          child.props.label ?? group,
          disabled || !!child.props.disabled,
        ),
      );
    } else if (child.type === 'option') {
      const label =
        child.props.label ??
        Children.toArray(child.props.children)
          .filter((value) => typeof value === 'string' || typeof value === 'number')
          .join('');
      choices.push({
        value: child.props.value ?? label,
        label,
        disabled: disabled || !!child.props.disabled,
        group,
      });
    }
  });
  return choices;
}

type Props = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'value' | 'onChange' | 'children' | 'type'
> & {
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
  required?: boolean;
};

/** Select-only combobox. Options stay declarative; no native browser popup is used. */
export function Select({
  value,
  onValueChange,
  children,
  required,
  name,
  className = '',
  disabled,
  id,
  ...props
}: Props) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const listId = `${controlId}-options`;
  const choices = useMemo(() => readChoices(children), [children]);
  const selected = choices.findIndex((choice) => choice.value === value);
  const enabled = choices
    .map((choice, index) => (choice.disabled ? -1 : index))
    .filter((index) => index >= 0);
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const [active, setActive] = useState(-1);
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const [host, setHost] = useState<Element | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const typeahead = useRef({ text: '', at: 0 });
  const unavailable = () => disabled || trigger.current?.matches(':disabled');
  const close = () => {
    openRef.current = false;
    setOpen(false);
  };
  const choose = (index: number, focus = true) => {
    if (!openRef.current) return;
    close();
    if (
      !unavailable() &&
      choices[index] &&
      !choices[index].disabled &&
      choices[index].value !== value
    )
      onValueChange(choices[index].value);
    if (focus) trigger.current?.focus({ preventScroll: true });
  };
  const show = (
    index = selected >= 0 && !choices[selected].disabled ? selected : (enabled[0] ?? -1),
  ) => {
    if (unavailable() || !enabled.length) return;
    setActive(index);
    openRef.current = true;
    setOpen(true);
  };

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    setHost(trigger.current?.closest('dialog[open]') ?? document.body);
    const positionPopup = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const viewport = window.visualViewport;
      const leftEdge = viewport?.offsetLeft ?? 0;
      const topEdge = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const below = topEdge + height - rect.bottom - 16;
      const above = rect.top - topEdge - 16;
      const upwards = below < 180 && above > below;
      const popupWidth = Math.min(Math.max(rect.width, 220), width - 16);
      setPosition({
        width: popupWidth,
        left: Math.max(leftEdge + 8, Math.min(rect.left, leftEdge + width - popupWidth - 8)),
        top: upwards ? undefined : rect.bottom + 6,
        bottom: upwards ? window.innerHeight - rect.top + 6 : undefined,
        maxHeight: Math.min(320, Math.max(64, upwards ? above : below)),
      });
    };
    positionPopup();
    window.addEventListener('resize', positionPopup);
    window.addEventListener('scroll', positionPopup, true);
    window.visualViewport?.addEventListener('resize', positionPopup);
    const observer = new ResizeObserver(positionPopup);
    if (trigger.current) observer.observe(trigger.current);
    return () => {
      window.removeEventListener('resize', positionPopup);
      window.removeEventListener('scroll', positionPopup, true);
      window.visualViewport?.removeEventListener('resize', positionPopup);
      observer.disconnect();
    };
  }, [open]);
  useEffect(() => {
    if (disabled) close();
  }, [disabled]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (
        !trigger.current?.contains(event.target as Node) &&
        !popup.current?.contains(event.target as Node)
      )
        choose(active, false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  });
  useEffect(() => {
    if (open) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active, position !== null, listId]);

  const groups: { label?: string; start: number; items: Choice[] }[] = [];
  choices.forEach((choice, index) => {
    if (!groups.length || groups.at(-1)!.label !== choice.group)
      groups.push({ label: choice.group, start: index, items: [] });
    groups.at(-1)!.items.push(choice);
  });
  const accessibleLabel = props['aria-label'] ?? trigger.current?.labels?.[0]?.textContent?.trim();
  return (
    <span className={`select-control ${className}`}>
      <button
        {...props}
        id={controlId}
        ref={trigger}
        type="button"
        name={name}
        value={value}
        disabled={disabled}
        className="select-trigger"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-required={required || undefined}
        aria-activedescendant={open && active >= 0 && position ? `${listId}-${active}` : undefined}
        onClick={() => (open ? close() : show())}
        onBlur={(event) => {
          props.onBlur?.(event);
          if (open && !popup.current?.contains(event.relatedTarget as Node | null))
            choose(active, false);
        }}
        onKeyDown={(event) => {
          props.onKeyDown?.(event);
          if (event.defaultPrevented || unavailable()) return;
          const { key } = event;
          if (key === 'Escape' && open) {
            event.preventDefault();
            event.stopPropagation();
            close();
            return;
          }
          if (key === 'Tab') {
            if (open) choose(active, false);
            return;
          }
          if (key === 'Enter' || key === ' ' || (open && key === 'ArrowUp' && event.altKey)) {
            event.preventDefault();
            event.stopPropagation();
            if (open) choose(active);
            else show();
            return;
          }
          if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp'].includes(key)) {
            event.preventDefault();
            event.stopPropagation();
            const direction = key === 'ArrowUp' || key === 'PageUp' ? -1 : 1;
            const step = key.startsWith('Page') ? 10 : 1;
            const index =
              key === 'Home'
                ? 0
                : key === 'End'
                  ? enabled.length - 1
                  : !open
                    ? key === 'ArrowUp'
                      ? 0
                      : Math.max(0, enabled.indexOf(selected))
                    : Math.max(
                        0,
                        Math.min(enabled.length - 1, enabled.indexOf(active) + direction * step),
                      );
            show(enabled[index]);
            return;
          }
          if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault();
            event.stopPropagation();
            const now = Date.now();
            const letter = key.toLocaleLowerCase('ru-RU');
            const text =
              now - typeahead.current.at < 700 ? typeahead.current.text + letter : letter;
            typeahead.current = { text, at: now };
            const repeated = [...text].every((char) => char === letter);
            const query = repeated ? letter : text;
            const start = repeated ? (open ? active : selected) + 1 : Math.max(0, active);
            const indexes = [...choices.keys()].map((_, index) => (start + index) % choices.length);
            const match = indexes.find(
              (index) =>
                !choices[index].disabled &&
                choices[index].label.toLocaleLowerCase('ru-RU').startsWith(query),
            );
            if (match !== undefined) show(match);
          }
        }}
      >
        <span className="select-value">{choices[selected]?.label ?? 'Выберите значение'}</span>
        <Icon name="chevron" size={16} />
      </button>
      {name && <input type="hidden" name={name} value={value} disabled={disabled} />}
      {open &&
        host &&
        position &&
        createPortal(
          <div
            ref={popup}
            id={listId}
            className="select-popup"
            style={position}
            role="listbox"
            aria-label={accessibleLabel}
            aria-labelledby={props['aria-labelledby']}
            onMouseDown={(event) => event.preventDefault()}
          >
            {groups.map((group) => (
              <div
                key={group.start}
                role={group.label ? 'group' : 'presentation'}
                aria-label={group.label}
              >
                {group.label && (
                  <div className="select-group-label" aria-hidden="true">
                    {group.label}
                  </div>
                )}
                {group.items.map((choice, offset) => {
                  const index = group.start + offset;
                  return (
                    <div
                      key={choice.value}
                      id={`${listId}-${index}`}
                      role="option"
                      aria-selected={active === index}
                      aria-disabled={choice.disabled || undefined}
                      className={`select-option ${active === index ? 'is-active' : ''} ${value === choice.value ? 'is-selected' : ''}`}
                      onPointerMove={(event) => {
                        if (event.pointerType === 'mouse' && !choice.disabled) setActive(index);
                      }}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (!choice.disabled) choose(index);
                      }}
                    >
                      <span>{choice.label}</span>
                      {value === choice.value && <Icon name="check" size={16} />}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>,
          host,
        )}
    </span>
  );
}
