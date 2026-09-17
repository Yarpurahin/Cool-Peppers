import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '../components/ui/Button.tsx';
import { Icon } from '../components/ui/Icon.tsx';

type Message = { title: string; body: string };
const DemoContext = createContext<((title: string, body?: string) => void) | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<Message | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (message && !dialogRef.current?.open) dialogRef.current?.showModal();
  }, [message]);

  function show(
    title: string,
    body = 'Сейчас доступен макет интерфейса. Эта функция пока не подключена. Данные не отправлены и не сохранены.',
  ) {
    setMessage({ title, body });
  }
  function close() {
    dialogRef.current?.close();
  }

  return (
    <DemoContext.Provider value={show}>
      {children}
      <dialog
        className="dialog"
        ref={dialogRef}
        aria-labelledby="dialog-title"
        aria-describedby="dialog-body"
        onClose={() => setMessage(null)}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            close();
        }}
      >
        <button
          type="button"
          className="icon-button dialog-close"
          aria-label="Закрыть уведомление"
          onClick={close}
        >
          <Icon name="close" />
        </button>
        <div className="dialog-icon">
          <Icon name="info" size={28} />
        </div>
        <h2 id="dialog-title">{message?.title}</h2>
        <p id="dialog-body">{message?.body}</p>
        <Button onClick={close}>
          Понятно <Icon name="check" />
        </Button>
      </dialog>
    </DemoContext.Provider>
  );
}

export function useDemoMessage() {
  const context = useContext(DemoContext);
  if (!context) throw new Error('useDemoMessage requires DemoProvider');
  return context;
}
