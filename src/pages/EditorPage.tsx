import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { findScenario } from '../data/scenarios.ts';
import type { DemoDialogueNode, ScenarioPreview } from '../types/scenario.ts';
import { Button, ButtonLink } from '../components/ui/Button.tsx';
import { DemoNotice } from '../components/ui/DemoNotice.tsx';
import { Icon } from '../components/ui/Icon.tsx';
import { useDemoMessage } from '../app/DemoProvider.tsx';
import { ErrorPage } from './ErrorPage.tsx';

export function EditorPage() {
  const { scenarioId } = useParams();
  const scenario = findScenario(scenarioId);
  return scenario ? <EditorScreen scenario={scenario} key={scenario.id} /> : <ErrorPage />;
}

function EditorScreen({ scenario }: { scenario: ScenarioPreview }) {
  const [tab, setTab] = useState<'description' | 'dialogue'>('dialogue');
  const [selected, setSelected] = useState(0);
  const [nodes, setNodes] = useState<DemoDialogueNode[]>(() => structuredClone(scenario.dialogue));
  const [description, setDescription] = useState({
    title: scenario.title,
    context: scenario.context,
    goal: scenario.goal,
    role: scenario.role,
    category: scenario.category,
    level: scenario.level as string,
    tone: 'Спокойный, деловой',
    person: scenario.person.name,
  });
  const show = useDemoMessage();
  const node = nodes[selected];
  function updateNode(patch: Partial<DemoDialogueNode>) {
    setNodes((previous) =>
      previous.map((item, index) => (index === selected ? { ...item, ...patch } : item)),
    );
  }
  function updateAnswer(index: number, patch: Partial<DemoDialogueNode['answers'][number]>) {
    updateNode({
      answers: node.answers.map((item, answerIndex) =>
        index === answerIndex ? { ...item, ...patch } : item,
      ),
    });
  }
  const notSaved = () =>
    show(
      'Сохранение пока недоступно',
      'Изменения доступны только на этом экране. После ухода со страницы они исчезнут. Сценарий не сохранён.',
    );

  return (
    <div className="container page editor-page">
      <Link to="/editor" className="back-link">
        <Icon name="back" size={16} />
        Мои сценарии
      </Link>
      <div className="editor-toolbar">
        <div>
          <h1>{scenario.title}</h1>
          <div className="inline-meta">
            <span className="badge badge--orange">Черновик</span>
            <span>Пример сценария</span>
          </div>
        </div>
        <div className="button-row">
          <ButtonLink to={`/scenarios/${scenario.id}`} variant="outline">
            <Icon name="eye" size={17} />
            Предпросмотр
          </ButtonLink>
          <Button variant="secondary" onClick={notSaved}>
            <Icon name="save" size={17} />
            Сохранить
          </Button>
          <Button
            onClick={() =>
              show(
                'Публикация пока недоступна',
                'Это макет редактора. Сценарий не опубликован, его доступность не изменилась.',
              )
            }
          >
            Опубликовать <Icon name="upRight" size={17} />
          </Button>
        </div>
      </div>
      <DemoNotice>
        Поля можно редактировать для проверки интерфейса. Изменения не сохраняются; предпросмотр
        открывает исходный пример.
      </DemoNotice>
      <div
        className="editor-tabs"
        role="tablist"
        aria-label="Раздел редактора"
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const next =
            event.key === 'Home'
              ? 'description'
              : event.key === 'End'
                ? 'dialogue'
                : tab === 'description'
                  ? 'dialogue'
                  : 'description';
          setTab(next);
          document.getElementById(`tab-${next}`)?.focus();
        }}
      >
        <button
          type="button"
          role="tab"
          id="tab-description"
          aria-controls="panel-description"
          aria-selected={tab === 'description'}
          tabIndex={tab === 'description' ? 0 : -1}
          onClick={() => setTab('description')}
        >
          Описание
        </button>
        <button
          type="button"
          role="tab"
          id="tab-dialogue"
          aria-controls="panel-dialogue"
          aria-selected={tab === 'dialogue'}
          tabIndex={tab === 'dialogue' ? 0 : -1}
          onClick={() => setTab('dialogue')}
        >
          Диалог <span>{nodes.length}</span>
        </button>
      </div>
      <div
        role="tabpanel"
        id="panel-description"
        aria-labelledby="tab-description"
        hidden={tab !== 'description'}
      >
        <section className="panel description-editor">
          <div className="panel-heading">
            <h2>Контекст сценария</h2>
            <Icon name="book" />
          </div>
          <div className="form-stack">
            <label className="field">
              Название сценария
              <input
                value={description.title}
                onChange={(event) => setDescription({ ...description, title: event.target.value })}
              />
            </label>
            <div className="two-fields">
              <label className="field">
                Сфера
                <select
                  value={description.category}
                  onChange={(event) =>
                    setDescription({ ...description, category: event.target.value })
                  }
                >
                  {['Работа с клиентом', 'Работа в команде', 'Карьера'].map((text) => (
                    <option key={text}>{text}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Сложность
                <select
                  value={description.level}
                  onChange={(event) =>
                    setDescription({ ...description, level: event.target.value })
                  }
                >
                  {['Начальный', 'Средний', 'Продвинутый'].map((text) => (
                    <option key={text}>{text}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field">
              Представьте ситуацию
              <textarea
                rows={4}
                value={description.context}
                onChange={(event) =>
                  setDescription({ ...description, context: event.target.value })
                }
              />
            </label>
            <label className="field">
              Цель участника
              <textarea
                rows={3}
                value={description.goal}
                onChange={(event) => setDescription({ ...description, goal: event.target.value })}
              />
            </label>
            <div className="two-fields">
              <label className="field">
                Роль участника
                <input
                  value={description.role}
                  onChange={(event) => setDescription({ ...description, role: event.target.value })}
                />
              </label>
              <label className="field">
                Тон собеседника
                <select
                  value={description.tone}
                  onChange={(event) => setDescription({ ...description, tone: event.target.value })}
                >
                  {['Спокойный, деловой', 'Доброжелательный', 'Строгий', 'Скептический'].map(
                    (text) => (
                      <option key={text}>{text}</option>
                    ),
                  )}
                </select>
              </label>
            </div>
          </div>
        </section>
      </div>
      <div
        role="tabpanel"
        id="panel-dialogue"
        aria-labelledby="tab-dialogue"
        hidden={tab !== 'dialogue'}
      >
        <div className="editor-layout">
          <aside className="node-sidebar">
            <h2>Вопросы сценария</h2>
            <div className="node-list">
              {nodes.map((item, index) => (
                <button
                  type="button"
                  key={index}
                  aria-pressed={index === selected}
                  onClick={() => setSelected(index)}
                >
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  {item.title || 'Без названия'}
                  <Icon name="chevron" size={15} />
                </button>
              ))}
            </div>
            <Button
              variant="secondary"
              className="button--full button--small"
              onClick={() => show('Добавление вопроса появится позже')}
            >
              <Icon name="plus" size={16} />
              Добавить вопрос
            </Button>
            <p>
              <Icon name="branch" size={16} />
              Каждая реплика — новый путь
            </p>
          </aside>
          <section className="panel node-editor">
            <div className="panel-heading">
              <h2>Вопрос {selected + 1}</h2>
              <button
                type="button"
                className="icon-button"
                aria-label="Удалить вопрос"
                onClick={() => show('Удаление вопроса пока недоступно')}
              >
                <Icon name="trash" size={18} />
              </button>
            </div>
            <div className="form-stack">
              <div className="two-fields">
                <label className="field">
                  Название вопроса
                  <input
                    value={node.title}
                    onChange={(event) => updateNode({ title: event.target.value })}
                  />
                </label>
                <label className="field">
                  Персонаж
                  <input
                    value={description.person}
                    onChange={(event) =>
                      setDescription({ ...description, person: event.target.value })
                    }
                  />
                </label>
              </div>
              <label className="field">
                Реплика персонажа
                <textarea
                  rows={3}
                  value={node.speech}
                  onChange={(event) => updateNode({ speech: event.target.value })}
                />
              </label>
            </div>
            <div className="panel-heading answers-heading">
              <h3>Варианты ответа</h3>
              <span>{node.answers.length} шт.</span>
            </div>
            <div className="answer-editors">
              {node.answers.map((answer, index) => (
                <section className="answer-editor" key={index}>
                  <div className="answer-editor-heading">
                    <h4>Ответ {index + 1}</h4>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Удалить ответ ${index + 1}`}
                      onClick={() => show('Удаление ответа пока недоступно')}
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                  <div className="form-stack">
                    <label className="field">
                      Текст ответа
                      <textarea
                        rows={2}
                        value={answer.text}
                        onChange={(event) => updateAnswer(index, { text: event.target.value })}
                      />
                    </label>
                    <label className="field">
                      Куда ведёт ответ
                      <select
                        value={answer.next}
                        onChange={(event) =>
                          updateAnswer(index, { next: Number(event.target.value) })
                        }
                      >
                        <option value={-1}>Завершение сценария</option>
                        {nodes.map((item, nodeIndex) => (
                          <option key={nodeIndex} value={nodeIndex}>
                            Вопрос {nodeIndex + 1} · {item.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </section>
              ))}
            </div>
            <Button
              variant="secondary"
              className="button--small"
              onClick={() => show('Добавление ответа появится позже')}
            >
              <Icon name="plus" size={17} />
              Добавить ответ
            </Button>
            <p className="editor-hint">
              <Icon name="flag" size={14} />
              Связи показаны для примера и не запускают прохождение.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
