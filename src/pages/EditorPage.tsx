import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client.ts';
import { useCatalog } from '../app/DataProvider.tsx';
import { documentSchema } from '../types/validation.ts';
import type { ScenarioDraft } from '../types/api.ts';
import type { DialogueNode, ScenarioDefinition } from '../features/negotiation/model/types.ts';
import { Button, ButtonLink } from '../components/ui/Button.tsx';
import { Icon } from '../components/ui/Icon.tsx';

export function EditorPage() {
  const { scenarioId } = useParams();
  const { refreshCatalog } = useCatalog();
  const [draft, setDraft] = useState<ScenarioDraft | null>(null);
  const [raw, setRaw] = useState('');
  const [tab, setTab] = useState<'description' | 'dialogue' | 'json'>('description');
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const path = `/editor/${encodeURIComponent(scenarioId ?? '')}`;
  function replace(value: ScenarioDraft) {
    setDraft(value);
    setRaw(JSON.stringify({ preview: value.preview, definition: value.definition }, null, 2));
  }
  useEffect(() => {
    const controller = new AbortController();
    setDraft(null);
    setError('');
    api<ScenarioDraft>(path, { signal: controller.signal })
      .then(replace)
      .catch((cause) => {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      });
    return () => controller.abort();
  }, [path]);
  async function save(): Promise<number> {
    const document = documentSchema.parse(
      tab === 'json' ? JSON.parse(raw) : { preview: draft!.preview, definition: draft!.definition },
    );
    const result = await api<{ revision: number }>(path, {
      method: 'PUT',
      body: { ...document, revision: draft!.revision },
    });
    replace({ ...document, revision: result.revision, publishedVersion: draft!.publishedVersion });
    return result.revision;
  }
  async function action(publish: boolean) {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const revision = await save();
      if (publish) {
        const result = await api<{ version: number }>(`${path}/publish`, {
          method: 'POST',
          body: { revision },
        });
        replace(await api<ScenarioDraft>(path));
        await refreshCatalog();
        setMessage(`Опубликована версия ${result.version}.`);
      } else setMessage('Черновик сохранён.');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  if (!draft)
    return (
      <div className="container page">
        <h1>Редактор</h1>
        <p role="status">{error || 'Загружаем сценарий…'}</p>
        <ButtonLink to="/editor">Мои сценарии</ButtonLink>
      </div>
    );
  function change(mutator: (value: ScenarioDraft) => void) {
    const value = structuredClone(draft!);
    mutator(value);
    replace(value);
    setMessage('');
  }
  function definition(mutator: (value: ScenarioDefinition) => void) {
    change((value) => {
      if (value.definition) mutator(value.definition);
    });
  }
  function updateNode(patch: Partial<DialogueNode>) {
    definition((value) => {
      value.nodes = value.nodes.map((node, i) => (i === selected ? { ...node, ...patch } : node));
    });
  }
  const def = draft.definition;
  const node = def?.nodes[selected];
  const meta = def?.metadata;
  const descriptionFields = [
    ['title', 'Название сценария'],
    ['description', 'Краткое описание'],
    ['context', 'Представьте ситуацию'],
    ['goal', 'Цель участника'],
    ['tip', 'Совет'],
    ['category', 'Сфера'],
    ['skill', 'Навык'],
    ['duration', 'Длительность'],
  ] as const;
  return (
    <div className="container page editor-page">
      <Link to="/editor" className="back-link">
        <Icon name="back" />
        Мои сценарии
      </Link>
      <div className="editor-toolbar">
        <div>
          <h1>{meta?.title ?? draft.preview.title}</h1>
          <div className="inline-meta">
            <span className="badge badge--orange">Черновик · редакция {draft.revision}</span>
            <span>
              {draft.publishedVersion
                ? `Опубликована v${draft.publishedVersion}`
                : 'Ещё не опубликован'}
            </span>
          </div>
        </div>
        <div className="button-row">
          {draft.publishedVersion && (
            <ButtonLink to={`/scenarios/${draft.preview.id}`} variant="outline">
              Опубликованная версия
            </ButtonLink>
          )}
          <Button disabled={busy} variant="secondary" onClick={() => void action(false)}>
            Сохранить
          </Button>
          <Button disabled={busy} onClick={() => void action(true)}>
            Опубликовать
          </Button>
        </div>
      </div>
      {message && (
        <p role="status" className="negotiation-notice">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      <div className="editor-tabs" role="tablist" aria-label="Раздел редактора">
        {(['description', 'dialogue', 'json'] as const).map((value) => (
          <button
            type="button"
            role="tab"
            aria-selected={tab === value}
            key={value}
            onClick={() => {
              if (tab === 'json' && value !== 'json') {
                try {
                  const parsed = documentSchema.parse(JSON.parse(raw));
                  replace({ ...draft, ...parsed });
                } catch (cause) {
                  setError(errorMessage(cause));
                  return;
                }
              }
              setTab(value);
              setSelected(0);
            }}
            disabled={busy}
          >
            {value === 'description' ? 'Описание' : value === 'dialogue' ? 'Диалог' : 'JSON'}
          </button>
        ))}
      </div>
      <fieldset disabled={busy} className="editor-fields">
        {tab === 'description' && (
          <section className="panel description-editor">
            <div className="form-stack">
              {descriptionFields.map(([field, label]) => (
                <label className="field" key={field}>
                  {label}
                  <textarea
                    rows={field === 'context' || field === 'goal' ? 3 : 2}
                    value={meta?.[field] ?? draft.preview[field]}
                    onChange={(event) =>
                      change((value) => {
                        if (value.definition) value.definition.metadata[field] = event.target.value;
                        else value.preview[field] = event.target.value;
                      })
                    }
                  />
                </label>
              ))}
              <div className="two-fields">
                <label className="field">
                  Роль участника
                  <input
                    value={meta?.playerRole ?? draft.preview.role}
                    onChange={(e) =>
                      change((value) => {
                        if (value.definition) value.definition.metadata.playerRole = e.target.value;
                        else value.preview.role = e.target.value;
                      })
                    }
                  />
                </label>
                <label className="field">
                  Сложность
                  <select
                    value={meta?.difficulty ?? draft.preview.level}
                    onChange={(e) =>
                      change((value) => {
                        if (value.definition)
                          value.definition.metadata.difficulty = e.target.value as
                            'easy' | 'medium' | 'hard';
                        else value.preview.level = e.target.value as typeof value.preview.level;
                      })
                    }
                  >
                    {def ? (
                      <>
                        <option value="easy">Начальный</option>
                        <option value="medium">Средний</option>
                        <option value="hard">Продвинутый</option>
                      </>
                    ) : (
                      <>
                        <option>Начальный</option>
                        <option>Средний</option>
                        <option>Продвинутый</option>
                      </>
                    )}
                  </select>
                </label>
              </div>
              {def && (
                <>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={def.settings.allowRestart}
                      onChange={(e) =>
                        definition((value) => {
                          value.settings.allowRestart = e.target.checked;
                        })
                      }
                    />
                    Разрешить повторное прохождение
                  </label>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={def.settings.collectFeedback}
                      onChange={(e) =>
                        definition((value) => {
                          value.settings.collectFeedback = e.target.checked;
                        })
                      }
                    />
                    Собирать отзывы
                  </label>
                </>
              )}
            </div>
          </section>
        )}
        {tab === 'dialogue' && !def && (
          <section className="panel description-editor">
            <p>
              Это демонстрационный макет без правил оценки. Его реплики доступны во вкладке JSON.
              Для исполняемого сценария создайте копию «Переговоры об условиях работы».
            </p>
          </section>
        )}
        {tab === 'dialogue' && def && (
          <div className="editor-layout">
            <aside className="node-sidebar">
              <h2>Вопросы сценария</h2>
              <div className="node-list">
                {def.nodes.map((item, i) => (
                  <button
                    type="button"
                    key={item.id}
                    aria-pressed={selected === i}
                    onClick={() => setSelected(i)}
                  >
                    <span>{i + 1}</span>
                    {item.title}
                  </button>
                ))}
              </div>
              <Button
                variant="secondary"
                onClick={() => {
                  definition((value) => {
                    const id = `q-${crypto.randomUUID().slice(0, 8)}`;
                    value.nodes = [
                      ...value.nodes,
                      {
                        id,
                        stageId: value.stages[0].id,
                        speakerId: value.characters[0].id,
                        title: 'Новый вопрос',
                        text: 'Реплика собеседника',
                        answers: [
                          {
                            id: `${id}-a1`,
                            text: 'Ответ участника',
                            penalty: 0,
                            feedback: 'Разбор ответа',
                            next: { type: 'ending', endingId: value.endings[0].id },
                          },
                        ],
                      },
                    ];
                  });
                  setSelected(def.nodes.length);
                }}
              >
                Добавить вопрос
              </Button>
            </aside>
            {node && (
              <section className="panel node-editor">
                <div className="panel-heading">
                  <h2>{node.id}</h2>
                  <Button
                    variant="outline"
                    disabled={def.nodes.length < 2}
                    onClick={() => {
                      definition((value) => {
                        value.nodes = value.nodes.filter((n) => n.id !== node.id);
                      });
                      setSelected(0);
                    }}
                  >
                    Удалить вопрос
                  </Button>
                </div>
                <div className="form-stack">
                  <label className="field">
                    Название вопроса
                    <input
                      value={node.title}
                      onChange={(e) => updateNode({ title: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    Реплика персонажа
                    <textarea
                      rows={4}
                      value={node.text}
                      onChange={(e) => updateNode({ text: e.target.value })}
                    />
                  </label>
                  <div className="two-fields">
                    <label className="field">
                      Персонаж
                      <select
                        value={node.speakerId}
                        onChange={(e) => updateNode({ speakerId: e.target.value })}
                      >
                        {def.characters.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      Этап
                      <select
                        value={node.stageId}
                        onChange={(e) => updateNode({ stageId: e.target.value })}
                      >
                        {def.stages.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
                <div className="answer-editors">
                  {node.answers.map((answer, i) => (
                    <section className="answer-editor" key={answer.id}>
                      <div className="panel-heading">
                        <h3>Ответ {i + 1}</h3>
                        <Button
                          variant="outline"
                          disabled={node.answers.length < 2}
                          onClick={() =>
                            updateNode({ answers: node.answers.filter((a) => a.id !== answer.id) })
                          }
                        >
                          Удалить ответ
                        </Button>
                      </div>
                      <div className="form-stack">
                        <label className="field">
                          Текст ответа
                          <textarea
                            value={answer.text}
                            onChange={(e) =>
                              updateNode({
                                answers: node.answers.map((a) =>
                                  a.id === answer.id ? { ...a, text: e.target.value } : a,
                                ),
                              })
                            }
                          />
                        </label>
                        <div className="two-fields">
                          <label className="field">
                            Штраф
                            <input
                              type="number"
                              min={0}
                              max={10000}
                              value={answer.penalty}
                              onChange={(e) =>
                                updateNode({
                                  answers: node.answers.map((a) =>
                                    a.id === answer.id
                                      ? { ...a, penalty: Number(e.target.value) }
                                      : a,
                                  ),
                                })
                              }
                            />
                          </label>
                          <label className="field">
                            Куда ведёт ответ
                            <select
                              value={
                                answer.next.type === 'node'
                                  ? `node:${answer.next.nodeId}`
                                  : `ending:${answer.next.endingId}`
                              }
                              onChange={(e) => {
                                const [type, id] = e.target.value.split(':');
                                updateNode({
                                  answers: node.answers.map((a) =>
                                    a.id === answer.id
                                      ? {
                                          ...a,
                                          next:
                                            type === 'node'
                                              ? { type: 'node', nodeId: id }
                                              : { type: 'ending', endingId: id },
                                        }
                                      : a,
                                  ),
                                });
                              }}
                            >
                              {def.nodes.map((n) => (
                                <option key={n.id} value={`node:${n.id}`}>
                                  Вопрос · {n.title}
                                </option>
                              ))}
                              {def.endings.map((end) => (
                                <option key={end.id} value={`ending:${end.id}`}>
                                  Концовка · {end.title}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <label className="field">
                          Разбор ответа
                          <textarea
                            value={answer.feedback}
                            onChange={(e) =>
                              updateNode({
                                answers: node.answers.map((a) =>
                                  a.id === answer.id ? { ...a, feedback: e.target.value } : a,
                                ),
                              })
                            }
                          />
                        </label>
                      </div>
                    </section>
                  ))}
                </div>
                <Button
                  variant="secondary"
                  onClick={() =>
                    updateNode({
                      answers: [
                        ...node.answers,
                        {
                          id: `a-${crypto.randomUUID().slice(0, 8)}`,
                          text: 'Новый ответ',
                          penalty: 0,
                          feedback: 'Разбор ответа',
                          next: { type: 'ending', endingId: def.endings[0].id },
                        },
                      ],
                    })
                  }
                >
                  Добавить ответ
                </Button>
              </section>
            )}
          </div>
        )}
        {tab === 'json' && (
          <section className="panel description-editor">
            <p>
              Полная структура: персонажи, этапы, концовки, варианты реплик и настройки. При
              публикации проверяются переходы и достижимость вопросов.
            </p>
            <label className="field">
              Данные сценария
              <textarea
                className="json-editor"
                rows={28}
                spellCheck={false}
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
              />
            </label>
          </section>
        )}
      </fieldset>
    </div>
  );
}
