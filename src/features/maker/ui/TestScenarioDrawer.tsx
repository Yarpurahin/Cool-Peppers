import { useEffect, useMemo, useRef, useState } from 'react';
import type { MakerDefinition } from '../model/types.ts';
import { compileMaker, startMaker, submitIntent } from '../model/engine.ts';
import { getReview, questionText } from '../../negotiation/model/engine.ts';
import { Icon } from '../../../components/ui/Icon.tsx';


function evaluationLabel(grade: 'strong' | 'acceptable' | 'weak' | 'critical') {
  if (grade === 'strong') return 'Сильный ответ';
  if (grade === 'weak') return 'Слабый ответ';
  if (grade === 'critical') return 'Критическая ошибка';
  return 'Допустимый ответ';
}

export function TestScenarioDrawer({
  definition,
  onClose,
}: {
  definition: MakerDefinition;
  onClose: () => void;
}) {
  const engine = useMemo(() => compileMaker(definition), [definition]);
  const [attempt, setAttempt] = useState(() =>
    startMaker(engine, crypto.randomUUID(), new Date().toISOString()),
  );
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const backdropPress = useRef(false);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    return () => {
      element?.close();
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'nearest' });
  }, [attempt]);
  const node =
    attempt.status === 'in-progress'
      ? engine.definition.nodes.find((n) => n.id === attempt.currentNodeId)
      : undefined;
  const character = node
    ? engine.definition.characters.find((c) => c.id === node.characterId)
    : undefined;
  const ending =
    attempt.status === 'completed'
      ? engine.definition.endings.find((e) => e.id === attempt.endingId)
      : undefined;
  return (
    <dialog
      ref={dialog}
      className="maker-test-drawer"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-modal="true"
      onPointerDown={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        backdropPress.current =
          event.target === event.currentTarget &&
          (event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom);
      }}
      onClick={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          backdropPress.current &&
          event.target === event.currentTarget &&
          (event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom)
        )
          onClose();
        backdropPress.current = false;
      }}
      aria-labelledby="maker-test-title"
    >
      <header>
        <div>
          <p className="eyebrow">Тестовый режим</p>
          <h2 id="maker-test-title">{definition.metadata.title}</h2>
        </div>
        <button
          className="maker-icon-button"
          onClick={onClose}
          type="button"
          aria-label="Закрыть тест"
        >
          <Icon name="close" />
        </button>
      </header>
      <p className="maker-test-note">
        Проверка текущего черновика. Результат не попадёт в историю тренировок.
      </p>
      <div className="maker-test-conversation" aria-live="polite">
        {getReview(engine.runtime, attempt).map((entry, i) => {
          const grade = entry.reaction.evaluation.grade;
          const showEvaluation =
            definition.settings.feedbackMode === 'immediate' &&
            (entry.reaction.evaluation.feedback ||
              entry.reaction.evaluation.penalty > 0 ||
              grade !== 'acceptable');
          return (
            <div className="maker-test-turn" key={i}>
              <div className="maker-test-speech">
                <small>
                  {
                    engine.runtime.definition.characters.find((c) => c.id === entry.node.characterId)
                      ?.name
                  }
                </small>
                <p>{entry.question}</p>
              </div>
              <p className="maker-test-answer">{entry.reaction.label}</p>
              {showEvaluation && (
                <div className={`maker-test-evaluation maker-test-evaluation--${grade}`}>
                  <strong>{evaluationLabel(grade)}</strong>
                  {entry.reaction.evaluation.feedback && <p>{entry.reaction.evaluation.feedback}</p>}
                  {entry.reaction.evaluation.penalty > 0 && (
                    <small>Штраф: {entry.reaction.evaluation.penalty}</small>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {node && (
          <div className="maker-test-speech">
            <small>
              {character?.name} · {character?.role}
            </small>
            <p>{questionText(node, attempt)}</p>
          </div>
        )}
        {ending && (
          <section className={`maker-test-ending maker-ending--${ending.type}`}>
            <Icon name={ending.type === 'failure' ? 'flag' : 'check'} size={24} />
            <p className="eyebrow">Разговор завершён</p>
            <h3>{ending.title}</h3>
            <p>{ending.description}</p>
            {ending.nextStep && <p>{ending.nextStep}</p>}
            {definition.settings.feedbackMode === 'summary' && (
              <div className="maker-test-summary">
                {getReview(engine.runtime, attempt).map((entry, index) => {
                  const evaluation = entry.reaction.evaluation;
                  if (
                    !evaluation.feedback &&
                    evaluation.penalty === 0 &&
                    evaluation.grade === 'acceptable'
                  )
                    return null;
                  return (
                    <div key={`${entry.node.id}-${index}`}>
                      <strong>{evaluationLabel(evaluation.grade)}</strong>
                      {evaluation.feedback && <p>{evaluation.feedback}</p>}
                    </div>
                  );
                })}
              </div>
            )}
            <small>
              Выбрано реакций: {attempt.history.length}
              {attempt.penalties > 0 ? ` · Штрафы: ${attempt.penalties}` : ''}
            </small>
          </section>
        )}
        <div ref={bottom} />
      </div>
      <footer>
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
        {node && (
          <div className="maker-test-choices">
            {node.reactions.map((r) => (
              <button
                type="button"
                key={r.id}
                onClick={() => {
                  try {
                    const next = submitIntent(
                      engine,
                      attempt,
                      node.id,
                      r.intent,
                      new Date().toISOString(),
                    );
                    setAttempt(next);
                    setError('');
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'Не удалось выбрать реакцию');
                  }
                }}
              >
                {r.label}
                <Icon name="arrow" size={16} />
              </button>
            ))}
          </div>
        )}
        <button
          className="maker-text-button"
          type="button"
          onClick={() => {
            setAttempt(startMaker(engine, crypto.randomUUID(), new Date().toISOString()));
            setError('');
          }}
        >
          <Icon name="reset" size={15} />
          Начать заново
        </button>
      </footer>
    </dialog>
  );
}
