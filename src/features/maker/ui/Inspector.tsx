import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { MakerDefinition, MakerDocument } from '../model/types.ts';
import type { Selection } from './ScenarioCanvas.tsx';
import { addReaction, connectReaction, newId } from '../model/commands.ts';
import { Icon } from '../../../components/ui/Icon.tsx';
import { ScenarioCoverField } from './ScenarioCoverField.tsx';

function Field({
  label,
  value,
  onChange,
  multiline = false,
  maxLength = 10000,
  hint,
  focusRef,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  maxLength?: number;
  hint?: string;
  focusRef?: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const hintId = useId();
  return (
    <label className="field">
      {label}
      {multiline ? (
        <textarea
          aria-label={label}
          aria-describedby={hint ? hintId : undefined}
          ref={focusRef}
          rows={4}
          value={value}
          maxLength={maxLength}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          aria-label={label}
          aria-describedby={hint ? hintId : undefined}
          value={value}
          maxLength={maxLength}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {hint && <small id={hintId}>{hint}</small>}
    </label>
  );
}
function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="field">
      {label}
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </label>
  );
}

const DURATION_OPTIONS = ['3–5 минут', '5–10 минут', '10–15 минут', '15–20 минут', '20+ минут'];

function ScenarioJsonTools({
  onExport,
  onImport,
}: {
  onExport: () => void;
  onImport: (file: File) => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');

  async function importFile(file: File) {
    setError('');
    setImporting(true);
    try {
      await onImport(file);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось импортировать JSON.');
    } finally {
      setImporting(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <section className="maker-json-tools" aria-labelledby="maker-json-tools-title">
      <div className="maker-json-tools-heading">
        <span className="maker-json-tools-icon">
          <Icon name="upload" size={17} />
        </span>
        <div>
          <strong id="maker-json-tools-title">JSON сценария</strong>
          <p>Загрузите готовую структуру или сохраните текущую для переноса и редактирования.</p>
        </div>
      </div>
      <div className="maker-json-tools-actions">
        <button
          type="button"
          className="maker-secondary"
          disabled={importing}
          onClick={() => input.current?.click()}
        >
          <Icon name="upload" size={15} />
          {importing ? 'Импортируем…' : 'Импортировать JSON'}
        </button>
        <button type="button" className="maker-text-button" onClick={onExport}>
          <Icon name="save" size={14} />
          Скачать JSON
        </button>
      </div>
      <input
        ref={input}
        className="maker-json-file-input"
        type="file"
        accept=".json,application/json"
        aria-label="Выбрать JSON-файл сценария"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importFile(file);
        }}
      />
      <small>
        Поддерживаются Arena JSON v1, JSON из предыдущего экспорта и чистая definition со
        schemaVersion 2. ID текущего сценария при импорте не меняется.
      </small>
      {error && (
        <p className="maker-json-import-error" role="alert">
          {error.split('\n').map((line, index) => (
            <span key={`${line}-${index}`}>{line}</span>
          ))}
        </p>
      )}
    </section>
  );
}

export function Inspector({
  doc,
  selection,
  change,
  onSelect,
  onDelete,
  onDeleteMany,
  onDeleteReaction,
  onDuplicate,
  onClose,
  onExport,
  onImport,
  focusToken,
  disabled,
}: {
  doc: MakerDocument;
  selection: Selection;
  change: (mutator: (doc: MakerDocument) => void) => void;
  onSelect: (selection: Selection) => void;
  onDelete: (id: string) => void;
  onDeleteMany: (ids: string[]) => void;
  onDeleteReaction: (nodeId: string, reactionId: string) => void;
  onDuplicate: (id: string) => void;
  onClose: () => void;
  focusToken: number;
  disabled: boolean;
  onExport: () => void;
  onImport: (file: File) => Promise<void>;
}) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (focusToken) textRef.current?.focus();
  }, [focusToken]);
  const def = doc.definition;
  const update = (mutator: (d: MakerDefinition) => void) => change((d) => mutator(d.definition));
  const nodeId =
    selection.type === 'reaction'
      ? selection.nodeId
      : selection.type === 'node'
        ? selection.id
        : undefined;
  const node = def.nodes.find((n) => n.id === nodeId);
  const reaction =
    selection.type === 'reaction' ? node?.reactions.find((r) => r.id === selection.id) : undefined;
  const ending =
    selection.type === 'ending' ? def.endings.find((e) => e.id === selection.id) : undefined;
  const title =
    selection.type === 'node'
      ? 'Реплика'
      : selection.type === 'reaction'
        ? 'Реакция'
        : selection.type === 'blocks'
          ? `Выбрано блоков: ${selection.ids.length}`
          : selection.type === 'ending'
            ? 'Финал'
            : selection.type === 'main'
              ? 'Основное'
              : selection.type === 'characters'
                ? 'Персонажи'
                : 'Настройки';
  const blockId = 'id' in selection ? selection.id : '';
  const mutateNode = (mutator: (n: NonNullable<typeof node>) => void) =>
    update((d) => {
      const n = d.nodes.find((n) => n.id === nodeId);
      if (n) mutator(n);
    });
  const mutateReaction = (mutator: (r: NonNullable<typeof reaction>) => void) =>
    mutateNode((n) => {
      const r = n.reactions.find((r) => r.id === blockId);
      if (r) mutator(r);
    });
  return (
    <aside
      id="maker-inspector"
      tabIndex={-1}
      className="maker-inspector"
      aria-label="Свойства выбранного элемента"
    >
      <div className="maker-inspector-heading">
        <div>
          <p className="eyebrow">{title}</p>
          <h2>{reaction?.label || node?.title || ending?.title || title}</h2>
        </div>
        <button
          className="maker-icon-button"
          type="button"
          onClick={onClose}
          aria-label="Закрыть свойства"
        >
          <Icon name="close" size={18} />
        </button>
      </div>
      <fieldset disabled={disabled} className="maker-inspector-fields">
        <legend className="sr-only">{title}: свойства</legend>
        {selection.type === 'blocks' && (
          <section className="maker-bulk-selection">
            <div className="maker-bulk-selection-icon">
              <Icon name="branch" size={20} />
            </div>
            <div>
              <strong>Выбрано блоков: {selection.ids.length}</strong>
              <p>
                Перетаскивайте любой выбранный блок — группа переместится вместе. Shift или Ctrl
                добавляет блок в выделение и убирает его повторным нажатием.
              </p>
            </div>
            <button
              type="button"
              className="maker-danger-button"
              onClick={() => onDeleteMany(selection.ids)}
            >
              <Icon name="trash" size={16} />
              Удалить выбранные блоки
            </button>
          </section>
        )}
        {selection.type === 'node' && node && (
          <>
            <Field
              label="Название блока"
              value={node.title}
              maxLength={200}
              onChange={(v) =>
                mutateNode((n) => {
                  n.title = v;
                })
              }
            />
            <Select
              label="Персонаж"
              value={node.characterId}
              onChange={(v) =>
                mutateNode((n) => {
                  n.characterId = v;
                })
              }
            >
              <option value="">Выберите персонажа</option>
              {def.characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.role}
                </option>
              ))}
            </Select>
            <Field
              label="Реплика персонажа"
              multiline
              focusRef={textRef}
              value={node.text}
              onChange={(v) =>
                mutateNode((n) => {
                  n.text = v;
                })
              }
            />
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={def.startNodeId === node.id}
                onChange={(e) =>
                  update((d) => {
                    d.startNodeId = e.target.checked ? node.id : '';
                  })
                }
              />
              Начинать разговор с этой реплики
            </label>
            <div className="maker-section-heading">
              <h3>Реакции пользователя</h3>
              <span>{node.reactions.length} / 30</span>
            </div>
            <div className="maker-reaction-list">
              {node.reactions.map((r, i) => (
                <button
                  type="button"
                  key={r.id}
                  onClick={() => onSelect({ type: 'reaction', nodeId: node.id, id: r.id })}
                >
                  <span>{String(i + 1).padStart(2, '0')}</span>
                  <div>
                    <strong>{r.label || 'Без названия'}</strong>
                    <small>
                      {r.nextNodeId
                        ? def.nodes.find((n) => n.id === r.nextNodeId)?.title || 'Реплика удалена'
                        : r.endingId
                          ? def.endings.find((e) => e.id === r.endingId)?.title || 'Финал удалён'
                          : 'Переход не задан'}
                    </small>
                  </div>
                  <Icon name="chevron" size={15} />
                </button>
              ))}
            </div>
            <button
              type="button"
              className="maker-dashed-button"
              disabled={node.reactions.length >= 30}
              onClick={() => {
                let id = '';
                update((d) => {
                  id = addReaction(d, node.id)?.id ?? '';
                });
                if (id) onSelect({ type: 'reaction', nodeId: node.id, id });
              }}
            >
              <Icon name="plus" size={16} />
              Добавить реакцию
            </button>
            {!!node.textVariants?.length && (
              <details className="maker-legacy">
                <summary>Унаследованные варианты реплики · {node.textVariants.length}</summary>
                <p>Применяются после конкретного ответа. Сохранены из исходного сценария.</p>
                {node.textVariants.map((v, i) => (
                  <Field
                    key={v.afterReactionId}
                    label={`После ${v.afterReactionId}`}
                    multiline
                    value={v.text}
                    onChange={(text) =>
                      mutateNode((n) => {
                        n.textVariants![i].text = text;
                      })
                    }
                  />
                ))}
              </details>
            )}
          </>
        )}
        {selection.type === 'reaction' && node && reaction && (
          <>
            <button
              type="button"
              className="maker-secondary maker-return-to-node"
              onClick={() => onSelect({ type: 'node', id: node.id })}
            >
              <Icon name="back" size={15} />
              <span>К реплике</span>
            </button>
            <Field
              label="Название реакции"
              multiline
              focusRef={textRef}
              value={reaction.label}
              onChange={(v) =>
                mutateReaction((r) => {
                  r.label = v;
                })
              }
              hint="Этот текст участник увидит на кнопке."
            />
            <div className="maker-section-heading">
              <h3>Примеры фраз</h3>
              <span>{reaction.examples.length}</span>
            </div>
            <p className="maker-hint">
              Для будущего распознавания свободного текста. Участник их не видит.
            </p>
            {reaction.examples.map((example, i) => (
              <div className="maker-example" key={i}>
                <input
                  aria-label={`Пример фразы ${i + 1}`}
                  value={example}
                  maxLength={10000}
                  onChange={(e) =>
                    mutateReaction((r) => {
                      r.examples[i] = e.target.value;
                    })
                  }
                />
                <button
                  type="button"
                  className="maker-icon-button"
                  aria-label={`Удалить пример ${i + 1}`}
                  onClick={() =>
                    mutateReaction((r) => {
                      r.examples.splice(i, 1);
                    })
                  }
                >
                  <Icon name="close" size={15} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="maker-dashed-button"
              disabled={reaction.examples.length >= 100}
              onClick={() =>
                mutateReaction((r) => {
                  r.examples.push('');
                })
              }
            >
              <Icon name="plus" size={16} />
              Добавить пример
            </button>
            <Select
              label="Переход"
              value={
                reaction.nextNodeId
                  ? `node:${reaction.nextNodeId}`
                  : reaction.endingId
                    ? `ending:${reaction.endingId}`
                    : ''
              }
              onChange={(v) =>
                update((d) => {
                  const [type, id] = v.split(':');
                  connectReaction(
                    d,
                    node.id,
                    reaction.id,
                    id ? { type: type as 'node' | 'ending', id } : undefined,
                  );
                })
              }
            >
              <option value="">Не задан</option>
              <optgroup label="Реплики">
                {def.nodes.map((n) => (
                  <option key={n.id} value={`node:${n.id}`}>
                    {n.title || n.id}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Финалы">
                {def.endings.map((e) => (
                  <option key={e.id} value={`ending:${e.id}`}>
                    {e.title || e.id}
                  </option>
                ))}
              </optgroup>
            </Select>
            <p className="maker-hint">
              Можно также перетащить точку у реакции к другой карточке или в пустое место.
            </p>
            {reaction.legacy && (
              <div className="maker-legacy">
                <strong>Оценка из исходного сценария</strong>
                <p>
                  Штраф: {reaction.legacy.penalty}. {reaction.legacy.feedback}
                </p>
              </div>
            )}
            <button
              type="button"
              className="maker-primary maker-return-to-node"
              onClick={() => onSelect({ type: 'node', id: node.id })}
            >
              <Icon name="check" size={16} />
              <span>Готово</span>
            </button>
            <button
              type="button"
              className="maker-danger-button"
              onClick={() => onDeleteReaction(node.id, reaction.id)}
            >
              <Icon name="trash" size={16} />
              Удалить реакцию
            </button>
          </>
        )}
        {selection.type === 'ending' && ending && (
          <>
            <Field
              label="Название финала"
              maxLength={200}
              value={ending.title}
              onChange={(v) =>
                update((d) => {
                  d.endings.find((e) => e.id === ending.id)!.title = v;
                })
              }
            />
            <Select
              label="Тип финала"
              value={ending.type}
              onChange={(v) =>
                update((d) => {
                  d.endings.find((e) => e.id === ending.id)!.type = v as typeof ending.type;
                })
              }
            >
              <option value="success">Успех</option>
              <option value="neutral">Нейтральный исход</option>
              <option value="failure">Неудача</option>
            </Select>
            <Field
              label="Описание финала"
              multiline
              focusRef={textRef}
              value={ending.description}
              onChange={(v) =>
                update((d) => {
                  d.endings.find((e) => e.id === ending.id)!.description = v;
                })
              }
            />
            <Field
              label="Следующий шаг (необязательно)"
              multiline
              value={ending.nextStep ?? ''}
              onChange={(v) =>
                update((d) => {
                  d.endings.find((e) => e.id === ending.id)!.nextStep = v;
                })
              }
            />
          </>
        )}
        {((selection.type === 'node' && node) || (selection.type === 'ending' && ending)) && (
          <div className="maker-block-actions">
            <button type="button" onClick={() => onDuplicate(blockId)}>
              <Icon name="plus" size={15} />
              Дублировать блок
            </button>
            <button type="button" className="maker-danger-button" onClick={() => onDelete(blockId)}>
              <Icon name="trash" size={15} />
              Удалить блок
            </button>
          </div>
        )}
        {selection.type === 'main' && (
          <>
            <ScenarioCoverField
              value={doc.preview.coverImage}
              onChange={(image) =>
                change((d) => {
                  if (image) d.preview.coverImage = image;
                  else delete d.preview.coverImage;
                })
              }
            />
            <Field
              label="Название сценария"
              maxLength={200}
              value={def.metadata.title}
              onChange={(v) =>
                update((d) => {
                  d.metadata.title = v;
                })
              }
            />
            <Field
              label="Короткое описание"
              multiline
              value={def.metadata.description}
              onChange={(v) =>
                update((d) => {
                  d.metadata.description = v;
                })
              }
            />
            <Field
              label="Категория"
              maxLength={100}
              value={def.metadata.category}
              onChange={(v) =>
                update((d) => {
                  d.metadata.category = v;
                })
              }
            />
            <Select
              label="Сложность"
              value={def.metadata.difficulty}
              onChange={(v) =>
                update((d) => {
                  d.metadata.difficulty = v as typeof d.metadata.difficulty;
                })
              }
            >
              <option value="easy">Начальный</option>
              <option value="medium">Средний</option>
              <option value="hard">Продвинутый</option>
            </Select>
            <Field
              label="Контекст"
              multiline
              value={def.metadata.context}
              onChange={(v) =>
                update((d) => {
                  d.metadata.context = v;
                })
              }
            />
            <Field
              label="Цель участника"
              multiline
              value={def.metadata.goal}
              onChange={(v) =>
                update((d) => {
                  d.metadata.goal = v;
                })
              }
            />
            <Field
              label="Роль участника"
              maxLength={200}
              value={def.metadata.playerRole}
              onChange={(v) =>
                update((d) => {
                  d.metadata.playerRole = v;
                })
              }
            />
            <Field
              label="Навык"
              maxLength={200}
              value={def.metadata.skill}
              onChange={(v) =>
                update((d) => {
                  d.metadata.skill = v;
                })
              }
            />
            <Select
              label="Длительность"
              value={def.metadata.duration}
              onChange={(v) =>
                update((d) => {
                  d.metadata.duration = v;
                })
              }
            >
              {!DURATION_OPTIONS.includes(def.metadata.duration) && (
                <option value={def.metadata.duration}>{def.metadata.duration}</option>
              )}
              {DURATION_OPTIONS.map((duration) => (
                <option key={duration} value={duration}>
                  {duration}
                </option>
              ))}
            </Select>
            <Field
              label="Совет участнику"
              multiline
              value={def.metadata.tip}
              onChange={(v) =>
                update((d) => {
                  d.metadata.tip = v;
                })
              }
            />
          </>
        )}
        {selection.type === 'characters' && (
          <>
            <p className="maker-hint">
              У каждой реплики свой персонаж. В диалоге отображаются его имя, роль и инициалы.
            </p>
            {def.characters.map((c) => (
              <section key={c.id} className="maker-entity-fields">
                <Field
                  label="Имя персонажа"
                  value={c.name}
                  maxLength={100}
                  onChange={(v) =>
                    update((d) => {
                      const char = d.characters.find((x) => x.id === c.id)!;
                      char.name = v;
                      char.initials = v
                        .trim()
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((s) => s[0])
                        .join('')
                        .toUpperCase();
                    })
                  }
                />
                <Field
                  label="Роль персонажа"
                  value={c.role}
                  maxLength={200}
                  onChange={(v) =>
                    update((d) => {
                      d.characters.find((x) => x.id === c.id)!.role = v;
                    })
                  }
                />
                <Field
                  label="Описание персонажа"
                  multiline
                  value={c.description}
                  onChange={(v) =>
                    update((d) => {
                      d.characters.find((x) => x.id === c.id)!.description = v;
                    })
                  }
                />
                <button
                  type="button"
                  className="maker-danger-button"
                  disabled={def.nodes.some((n) => n.characterId === c.id)}
                  onClick={() =>
                    update((d) => {
                      d.characters = d.characters.filter((x) => x.id !== c.id);
                    })
                  }
                >
                  <Icon name="trash" size={16} />
                  Удалить персонажа
                </button>
                {def.nodes.some((n) => n.characterId === c.id) && (
                  <small>Чтобы удалить, назначьте репликам другого персонажа.</small>
                )}
              </section>
            ))}
            <button
              type="button"
              className="maker-dashed-button"
              disabled={def.characters.length >= 100}
              onClick={() =>
                update((d) => {
                  d.characters.push({
                    id: newId('character'),
                    name: 'Новый персонаж',
                    initials: 'НП',
                    role: 'Собеседник',
                    description: '',
                  });
                })
              }
            >
              + Добавить персонажа
            </button>
          </>
        )}
        {selection.type === 'settings' && (
          <>
            <ScenarioJsonTools onExport={onExport} onImport={onImport} />
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={def.settings.allowRestart}
                onChange={(e) =>
                  update((d) => {
                    d.settings.allowRestart = e.target.checked;
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
                  update((d) => {
                    d.settings.collectFeedback = e.target.checked;
                  })
                }
              />
              Собирать отзывы
            </label>
            <Select
              label="Стартовая реплика"
              value={def.startNodeId}
              onChange={(v) =>
                update((d) => {
                  d.startNodeId = v;
                })
              }
            >
              <option value="">Не выбрана</option>
              {def.nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.title || n.id}
                </option>
              ))}
            </Select>
            {def.settings.legacyFailure ? (
              <section className="maker-legacy">
                <strong>Сохранены правила старого сценария</strong>
                <p>
                  Его штрафы и порог провала продолжают действовать, в том числе при тестировании.
                </p>
                <Select
                  label="Финал при превышении порога"
                  value={def.settings.legacyFailure.endingId}
                  onChange={(v) =>
                    update((d) => {
                      if (d.settings.legacyFailure) d.settings.legacyFailure.endingId = v;
                    })
                  }
                >
                  {def.endings
                    .filter((e) => e.type === 'failure')
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.title}
                      </option>
                    ))}
                </Select>
                <button
                  type="button"
                  className="maker-text-button"
                  onClick={() =>
                    update((d) => {
                      delete d.settings.legacyFailure;
                      delete d.settings.assessmentNote;
                      for (const n of d.nodes) for (const r of n.reactions) delete r.legacy;
                    })
                  }
                >
                  Перейти на прохождение без штрафов
                </button>
              </section>
            ) : (
              <p className="maker-hint">
                Результат определяется финалом выбранной ветки. AI и начисление штрафов для новых
                сценариев в MVP не используются.
              </p>
            )}
          </>
        )}
      </fieldset>
    </aside>
  );
}
