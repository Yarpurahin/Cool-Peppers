import { useEffect, useMemo, useRef, useState } from 'react';
import type { MakerDefinition, Penalty } from '../model/types.ts';
import { compileMaker, startMaker, submitIntent } from '../model/engine.ts';
import { getReview, questionText } from '../../negotiation/model/engine.ts';
import { penaltyTitle } from '../../negotiation/presentation.ts';
import { Icon } from '../../../components/ui/Icon.tsx';

function penaltyClass(penalty: Penalty) {
  return `maker-test-evaluation--penalty-${penalty}`;
}

export function TestScenarioDrawer({ definition, onClose }: { definition: MakerDefinition; onClose: () => void }) {
  const engine = useMemo(() => compileMaker(definition), [definition]);
  const [attempt, setAttempt] = useState(() => startMaker(engine, crypto.randomUUID(), new Date().toISOString()));
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
  useEffect(() => bottom.current?.scrollIntoView({ block: 'nearest' }), [attempt]);
  const node = attempt.status === 'in-progress' ? engine.definition.nodes.find((n) => n.id === attempt.currentNodeId) : undefined;
  const character = node ? engine.definition.characters.find((c) => c.id === node.characterId) : undefined;
  const ending = attempt.status === 'completed' ? engine.definition.endings.find((e) => e.id === attempt.endingId) : undefined;

  return (
    <dialog
      ref={dialog}
      className="maker-test-drawer"
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      aria-modal="true"
      onPointerDown={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        backdropPress.current = event.target === event.currentTarget &&
          (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom);
      }}
      onClick={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        if (backdropPress.current && event.target === event.currentTarget &&
          (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) onClose();
        backdropPress.current = false;
      }}
      aria-labelledby="maker-test-title"
    >
      <header>
        <div><p className="eyebrow">Тестовый режим</p><h2 id="maker-test-title">{definition.metadata.title}</h2></div>
        <button className="maker-icon-button" onClick={onClose} type="button" aria-label="Закрыть тест"><Icon name="close" /></button>
      </header>
      <p className="maker-test-note">Проверка текущего черновика. Результат не попадёт в историю тренировок.</p>
      <div className="maker-test-conversation" aria-live="polite">
        {getReview(engine.runtime, attempt).map((entry, i) => {
          const showEvaluation = definition.settings.feedbackMode === 'immediate' && (entry.reaction.feedback || entry.reaction.penalty > 0);
          return (
            <div className="maker-test-turn" key={i}>
              <div className="maker-test-speech">
                <small>{engine.runtime.definition.characters.find((c) => c.id === entry.node.characterId)?.name}</small>
                <p>{entry.question}</p>
              </div>
              <p className="maker-test-answer">{entry.reaction.label}</p>
              {showEvaluation && (
                <div className={`maker-test-evaluation ${penaltyClass(entry.reaction.penalty)}`}>
                  <strong>{penaltyTitle(entry.reaction.penalty)}</strong>
                  {entry.reaction.feedback && <p>{entry.reaction.feedback}</p>}
                  {entry.reaction.penalty > 0 && <small>Штраф: +{entry.reaction.penalty}</small>}
                </div>
              )}
            </div>
          );
        })}
        {node && <div className="maker-test-speech"><small>{character?.name} · {character?.role}</small><p>{questionText(node, attempt)}</p></div>}
        {ending && (
          <section className={`maker-test-ending maker-ending--${ending.type}`}>
            <Icon name={ending.type === 'failure' ? 'flag' : 'check'} size={24} />
            <p className="eyebrow">Разговор завершён</p><h3>{ending.title}</h3><p>{ending.description}</p>
            {ending.nextStep && <p>{ending.nextStep}</p>}
            {definition.settings.feedbackMode === 'summary' && (
              <div className="maker-test-summary">
                {getReview(engine.runtime, attempt).map((entry, index) => {
                  if (!entry.reaction.feedback && entry.reaction.penalty === 0) return null;
                  return <div key={`${entry.node.id}-${index}`}><strong>{penaltyTitle(entry.reaction.penalty)}</strong>{entry.reaction.feedback && <p>{entry.reaction.feedback}</p>}</div>;
                })}
              </div>
            )}
            <small>Выбрано реакций: {attempt.history.length}{attempt.penalties > 0 ? ` · Штрафы: ${attempt.penalties}` : ''}</small>
          </section>
        )}
        <div ref={bottom} />
      </div>
      <footer>
        {error && <p role="alert" className="field-error">{error}</p>}
        {node && (
          <div className="maker-test-choices">
            {node.reactions.map((reaction) => (
              <button type="button" key={reaction.id} onClick={() => {
                try {
                  setAttempt(submitIntent(engine, attempt, node.id, reaction.intent, new Date().toISOString()));
                  setError('');
                } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось выбрать реакцию'); }
              }}>{reaction.label}<Icon name="arrow" size={16} /></button>
            ))}
          </div>
        )}
        <button className="maker-text-button" type="button" onClick={() => { setAttempt(startMaker(engine, crypto.randomUUID(), new Date().toISOString())); setError(''); }}>
          <Icon name="reset" size={15} />Начать заново
        </button>
      </footer>
    </dialog>
  );
}
