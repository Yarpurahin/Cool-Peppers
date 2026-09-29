import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
  dismissServiceProblem,
  getServiceProblem,
  subscribeServiceProblem,
} from '../../api/serviceStatus.ts';
import { Icon } from './Icon.tsx';

export function ServiceNotice() {
  const problem = useSyncExternalStore(subscribeServiceProblem, getServiceProblem, () => null);
  const [closing, setClosing] = useState(false);
  const [host, setHost] = useState<Element | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    clearTimeout(timer.current);
    setClosing(false);
    return () => clearTimeout(timer.current);
  }, [problem]);
  useEffect(() => {
    if (!problem) return;
    // Native modal dialogs live above every z-index and make the rest of the
    // document inert. Keep our single notification visible and dismissible there.
    const syncHost = () => {
      const dialogs = document.querySelectorAll('dialog[open]');
      setHost(dialogs.item(dialogs.length - 1) ?? document.body);
    };
    syncHost();
    const observer = new MutationObserver(syncHost);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['open'],
    });
    return () => observer.disconnect();
  }, [problem]);
  if (!problem) return null;
  const connection = problem.kind === 'connection';
  const notice = (
    <aside
      className={`service-notice ${closing ? 'is-closing' : ''}`}
      role="alert"
      aria-label="Уведомление сервиса"
    >
      <span className="service-notice-icon">
        <Icon name="message" size={23} />
      </span>
      <div>
        <strong>{connection ? 'Нет связи с сервером' : 'На сервере произошла ошибка'}</strong>
        <p>
          {connection
            ? 'Проверьте подключение и повторите действие, когда связь восстановится.'
            : 'Не удалось выполнить действие. Попробуйте ещё раз немного позже.'}
        </p>
      </div>
      <button
        type="button"
        className="icon-button"
        aria-label="Закрыть уведомление"
        onClick={() => {
          if (closing) return;
          setClosing(true);
          timer.current = setTimeout(() => dismissServiceProblem(problem.id), 220);
        }}
      >
        <Icon name="close" size={18} />
      </button>
    </aside>
  );
  return host ? createPortal(notice, host) : notice;
}
