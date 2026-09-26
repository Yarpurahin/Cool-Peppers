import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  dismissServiceProblem,
  getServiceProblem,
  subscribeServiceProblem,
} from '../../api/serviceStatus.ts';
import { Icon } from './Icon.tsx';

export function ServiceNotice() {
  const problem = useSyncExternalStore(subscribeServiceProblem, getServiceProblem);
  const [closing, setClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    clearTimeout(timer.current);
    setClosing(false);
    return () => clearTimeout(timer.current);
  }, [problem]);
  if (!problem) return null;
  const connection = problem.kind === 'connection';
  return (
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
}
