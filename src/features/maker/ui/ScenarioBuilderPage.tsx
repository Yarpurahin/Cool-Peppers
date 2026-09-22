import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type { Connection, Edge, ReactFlowInstance } from '@xyflow/react';
import { api, errorMessage } from '../../../api/client.ts';
import { useCatalog } from '../../../app/DataProvider.tsx';
import { documentSchema } from '../../../types/validation.ts';
import { Icon } from '../../../components/ui/Icon.tsx';
import type { IconName } from '../../../components/ui/Icon.tsx';
import { toMakerDraft } from '../model/adapter.ts';
import {
  addBlock,
  connectReaction,
  duplicateBlock,
  layoutGraph,
  newId,
  removeBlocks,
} from '../model/commands.ts';
import type {
  AuthoringDraft,
  GraphIssue,
  MakerDefinition,
  MakerDocument,
  MakerDraft,
} from '../model/types.ts';
import { validateMaker } from '../model/validation.ts';
import { ScenarioCanvas } from './ScenarioCanvas.tsx';
import type { BranchRequest, CardNode, Selection } from './ScenarioCanvas.tsx';
import { Inspector } from './Inspector.tsx';
import { TestScenarioDrawer } from './TestScenarioDrawer.tsx';
import '@xyflow/react/dist/style.css';
import './maker.css';

const fingerprint = (doc: MakerDocument) =>
  JSON.stringify({ preview: doc.preview, definition: doc.definition, editor: doc.editor });

export function ScenarioBuilderPage() {
  const { scenarioId } = useParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { refreshCatalog } = useCatalog();
  const listPath = pathname.startsWith('/admin') ? '/admin/scenarios' : '/editor';
  const path = `/editor/${encodeURIComponent(scenarioId ?? '')}`;
  const [draft, setDraft] = useState<MakerDraft | null>(null);
  const current = useRef<MakerDraft | null>(null);
  const [saved, setSaved] = useState('');
  const [selection, setSelection] = useState<Selection>({ type: 'main' });
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const [validationOpen, setValidationOpen] = useState(false);
  const [testDefinition, setTestDefinition] = useState<MakerDefinition | null>(null);
  const [branch, setBranch] = useState<BranchRequest | null>(null);
  const [focusToken, setFocusToken] = useState(0);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const undo = useRef<MakerDocument[]>([]);
  const redo = useRef<MakerDocument[]>([]);
  const flow = useRef<ReactFlowInstance<CardNode> | null>(null);
  const issues = useMemo(() => (draft ? validateMaker(draft.definition) : []), [draft?.definition]);
  const displayedIssues = useMemo(() => (checked ? issues : []), [checked, issues]);
  const dirty = !!draft && fingerprint(draft) !== saved;
  const errorCount = issues.filter((i) => i.severity === 'error').length;

  const replace = useCallback((value: MakerDraft) => {
    current.current = value;
    setDraft(value);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    current.current = null;
    setDraft(null);
    setError('');
    setMessage('');
    api<AuthoringDraft>(path, { signal: controller.signal })
      .then((value) => {
        if (controller.signal.aborted) return;
        const next = toMakerDraft(value);
        next.editor.positions = { ...layoutGraph(next.definition), ...next.editor.positions };
        replace(next);
        setSaved(fingerprint(next));
        undo.current = [];
        redo.current = [];
        setSelection(
          next.definition.nodes.length
            ? { type: 'node', id: next.definition.startNodeId || next.definition.nodes[0].id }
            : { type: 'main' },
        );
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      });
    return () => controller.abort();
  }, [path, replace]);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);
  useEffect(() => {
    if (!branch) return;
    const dismiss = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBranch(null);
    };
    window.addEventListener('keydown', dismiss);
    return () => window.removeEventListener('keydown', dismiss);
  }, [branch]);

  // Apply once outside a React updater; commands may return IDs for focus/selection.
  const change = useCallback(
    (mutator: (doc: MakerDocument) => void) => {
      if (!current.current || busyRef.current) return;
      const previous = current.current;
      const next = structuredClone(previous);
      mutator(next);
      if (fingerprint(next) === fingerprint(previous)) return;
      undo.current = [...undo.current.slice(-49), previous];
      redo.current = [];
      replace(next);
      setMessage('');
    },
    [replace],
  );
  const select = useCallback((value: Selection) => {
    setSelection(value);
    setInspectorOpen(true);
    setSidebarOpen(false);
    setBranch(null);
  }, []);
  function focus(id: string) {
    requestAnimationFrame(() => {
      void flow.current?.fitView({
        nodes: [{ id }],
        padding: 0.65,
        minZoom: 0.65,
        maxZoom: 1,
        duration: 260,
      });
    });
  }
  function selectAndFocus(value: Selection) {
    select(value);
    if ('id' in value) focus(value.type === 'reaction' ? value.nodeId : value.id);
  }
  function travel(direction: 'undo' | 'redo') {
    if (!current.current || busyRef.current) return;
    const from = direction === 'undo' ? undo : redo;
    const to = direction === 'undo' ? redo : undo;
    const value = from.current.pop();
    if (!value) return;
    to.current.push(current.current);
    replace({
      ...current.current,
      preview: value.preview,
      definition: value.definition,
      editor: value.editor,
    });
    setMessage('');
    setBranch(null);
  }
  function add(type: 'node' | 'ending', request?: BranchRequest) {
    const value = current.current;
    if (
      !value ||
      (type === 'node' && value.definition.nodes.length >= 500) ||
      (type === 'ending' && value.definition.endings.length >= 100)
    )
      return;
    const id = newId(type);
    const canvas = document.querySelector('.maker-canvas')?.getBoundingClientRect();
    const position =
      request?.position ??
      (canvas && flow.current
        ? flow.current.screenToFlowPosition({
            x: canvas.x + canvas.width / 2 - 140,
            y: canvas.y + canvas.height / 2 - 80,
          })
        : { x: 100, y: 100 });
    change((doc) => {
      addBlock(doc, type, position, id);
      if (request)
        connectReaction(doc.definition, request.nodeId, request.reactionId, { type, id });
    });
    select({ type, id });
    setFocusToken((n) => n + 1);
    focus(id);
  }
  function remove(ids: string[]) {
    change((d) => removeBlocks(d, ids));
    if (
      'id' in selection &&
      ids.includes(selection.type === 'reaction' ? selection.nodeId : selection.id)
    )
      select({ type: 'main' });
  }
  function duplicate(id: string) {
    const type = current.current?.definition.nodes.some((n) => n.id === id) ? 'node' : 'ending';
    const count =
      type === 'node'
        ? current.current?.definition.nodes.length
        : current.current?.definition.endings.length;
    if ((count ?? 0) >= (type === 'node' ? 500 : 100)) return;
    const copyId = newId(type);
    change((d) => {
      duplicateBlock(d, id, copyId);
    });
    select({ type, id: copyId });
    focus(copyId);
  }
  function connect(connection: Connection) {
    if (!connection.sourceHandle || !connection.target) return;
    const type = current.current?.definition.endings.some((e) => e.id === connection.target)
      ? 'ending'
      : 'node';
    change((d) =>
      connectReaction(d.definition, connection.source, connection.sourceHandle!, {
        type,
        id: connection.target,
      }),
    );
  }
  function disconnect(edges: Edge[]) {
    change((d) => {
      for (const edge of edges) connectReaction(d.definition, edge.source, edge.id);
    });
  }
  function exportDocument() {
    const doc = current.current;
    if (!doc) return;
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            { preview: doc.preview, definition: doc.definition, editor: doc.editor },
            null,
            2,
          ),
        ],
        { type: 'application/json' },
      ),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `${doc.definition.metadata.id}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function showIssue(issue: GraphIssue) {
    if (issue.code === 'legacy-failure' || issue.code === 'start') {
      select({ type: 'settings' });
      return;
    }
    if (issue.code === 'character-name') {
      select({ type: 'characters' });
      return;
    }
    if (issue.nodeId)
      selectAndFocus(
        issue.reactionId
          ? { type: 'reaction', nodeId: issue.nodeId, id: issue.reactionId }
          : {
              type: draft!.definition.endings.some((e) => e.id === issue.nodeId)
                ? 'ending'
                : 'node',
              id: issue.nodeId,
            },
      );
    else select({ type: 'main' });
  }
  function check() {
    setChecked(true);
    setValidationOpen(true);
    setBranch(null);
  }
  function test() {
    check();
    if (!errorCount) {
      setTestDefinition(structuredClone(current.current!.definition));
      setValidationOpen(false);
    }
  }
  async function save(publish: boolean) {
    const value = current.current;
    if (!value || busyRef.current) return;
    if (publish && validateMaker(value.definition).some((i) => i.severity === 'error')) {
      check();
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const document = documentSchema.parse({
        preview: value.preview,
        definition: value.definition,
        editor: value.editor,
      });
      const result = await api<{ revision: number }>(path, {
        method: 'PUT',
        body: { ...document, revision: value.revision },
      });
      const next = { ...value, revision: result.revision };
      replace(next);
      setSaved(fingerprint(next));
      if (publish) {
        const published = await api<{ version: number }>(`${path}/publish`, {
          method: 'POST',
          body: { revision: result.revision },
        });
        const latest = toMakerDraft(await api<AuthoringDraft>(path));
        replace(latest);
        setSaved(fingerprint(latest));
        undo.current = [];
        redo.current = [];
        await refreshCatalog();
        setMessage(`Опубликована версия ${published.version}.`);
      } else setMessage('Черновик сохранён.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  if (!draft)
    return (
      <main className="container page">
        <h1>Конструктор сценария</h1>
        <p role={error ? 'alert' : 'status'}>{error || 'Загружаем сценарий…'}</p>
        <button className="button button--outline" onClick={() => navigate(listPath)}>
          К сценариям
        </button>
      </main>
    );
  const selectedId =
    selection.type === 'reaction' ? selection.nodeId : 'id' in selection ? selection.id : '';
  const filteredNodes = draft.definition.nodes.filter((n) =>
    `${n.title} ${n.text}`.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru')),
  );
  const nav: {
    type: 'main' | 'characters' | 'stages' | 'settings';
    title: string;
    icon: IconName;
    count?: number;
  }[] = [
    { type: 'main', title: 'Основное', icon: 'book' },
    {
      type: 'characters',
      title: 'Персонажи',
      icon: 'user',
      count: draft.definition.characters.length,
    },
    { type: 'stages', title: 'Этапы', icon: 'menu', count: draft.definition.stages.length },
    { type: 'settings', title: 'Настройки', icon: 'edit' },
  ];
  return (
    <main
      id="main-content"
      className={`maker-page ${inspectorOpen ? '' : 'is-inspector-closed'} ${sidebarOpen ? 'is-sidebar-open' : ''}`}
    >
      <header className="maker-header">
        <button
          type="button"
          className="maker-back"
          onClick={() => {
            if (!dirty || window.confirm('Есть несохранённые изменения. Выйти из конструктора?'))
              navigate(listPath);
          }}
        >
          <Icon name="back" size={17} />
          <span>Сценарии</span>
        </button>
        <div className="maker-heading">
          <h1>{draft.definition.metadata.title || 'Новый сценарий'}</h1>
          <div>
            <span className="maker-status">
              {draft.publishedVersion
                ? `Черновик · опубликована v${draft.publishedVersion}`
                : 'Черновик'}
            </span>
            <span className="maker-save-status" role="status">
              {busy ? 'Сохраняем…' : dirty ? 'Есть изменения' : 'Сохранено'}
            </span>
          </div>
        </div>
        <div className="maker-history-buttons">
          <button
            type="button"
            className="maker-icon-button"
            disabled={busy || !undo.current.length}
            onClick={() => travel('undo')}
            aria-label="Отменить"
          >
            <Icon name="reset" size={18} />
          </button>
          <button
            type="button"
            className="maker-icon-button"
            disabled={busy || !redo.current.length}
            onClick={() => travel('redo')}
            aria-label="Повторить"
          >
            <Icon name="reset" size={18} style={{ transform: 'scaleX(-1)' }} />
          </button>
        </div>
        <div className="maker-header-actions">
          <button
            type="button"
            className="maker-secondary"
            onClick={() => void save(false)}
            disabled={busy}
          >
            <Icon name="save" size={16} />
            Сохранить
          </button>
          <button type="button" className="maker-secondary" onClick={test} disabled={busy}>
            <Icon name="message" size={16} />
            Тестировать
          </button>
          <button type="button" className="maker-secondary" onClick={check} disabled={busy}>
            Проверить
          </button>
          <button
            type="button"
            className="maker-primary"
            onClick={() => void save(true)}
            disabled={busy}
          >
            Опубликовать
          </button>
        </div>
      </header>
      {(error || message) && (
        <div
          className={`maker-notice ${error ? 'is-error' : ''}`}
          role={error ? 'alert' : 'status'}
        >
          {error || message}
          <button
            type="button"
            onClick={() => {
              setError('');
              setMessage('');
            }}
            aria-label="Закрыть сообщение"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      <div className="maker-mobile-tools">
        <button type="button" onClick={() => setSidebarOpen((v) => !v)}>
          <Icon name="menu" size={15} />
          Структура
        </button>
        <button type="button" onClick={() => setInspectorOpen((v) => !v)}>
          <Icon name="edit" size={15} />
          Свойства
        </button>
      </div>
      <div className="maker-workspace">
        <aside className="maker-sidebar" aria-label="Структура сценария">
          <p className="eyebrow">
            <span className="accent-dot" />
            Структура
          </p>
          <nav>
            {nav.map((item) => (
              <button
                type="button"
                key={item.type}
                onClick={() => select({ type: item.type })}
                className={selection.type === item.type ? 'is-active' : ''}
              >
                <Icon name={item.icon} size={16} />
                <span>{item.title}</span>
                {item.count !== undefined && <b>{item.count}</b>}
              </button>
            ))}
          </nav>
          <div className="maker-section-heading">
            <h2>Диалог</h2>
            <span>{draft.definition.nodes.length}</span>
          </div>
          <label className="maker-search">
            <Icon name="search" size={14} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Поиск реплики"
              placeholder="Найти реплику"
            />
          </label>
          <div className="maker-node-list">
            {filteredNodes.map((n) => (
              <button
                type="button"
                key={n.id}
                className={selectedId === n.id ? 'is-active' : ''}
                onClick={() => selectAndFocus({ type: 'node', id: n.id })}
              >
                <span>{String(draft.definition.nodes.indexOf(n) + 1).padStart(2, '0')}</span>
                <strong>{n.title || 'Без названия'}</strong>
                {draft.definition.startNodeId === n.id && <i title="Старт">●</i>}
              </button>
            ))}
            {!filteredNodes.length && <p className="maker-hint">Реплики не найдены.</p>}
          </div>
          <button
            type="button"
            className="maker-dashed-button"
            disabled={busy || draft.definition.nodes.length >= 500}
            onClick={() => add('node')}
          >
            + Добавить реплику
          </button>
          <div className="maker-section-heading">
            <h2>Финалы</h2>
            <span>{draft.definition.endings.length}</span>
          </div>
          <div className="maker-node-list">
            {draft.definition.endings.map((e) => (
              <button
                type="button"
                key={e.id}
                className={selectedId === e.id ? 'is-active' : ''}
                onClick={() => selectAndFocus({ type: 'ending', id: e.id })}
              >
                <Icon name="flag" size={15} />
                <strong>{e.title || 'Без названия'}</strong>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="maker-dashed-button"
            disabled={busy || draft.definition.endings.length >= 100}
            onClick={() => add('ending')}
          >
            + Добавить финал
          </button>
          <p className="maker-sidebar-hint">
            Потяните точку реакции к карточке или в пустое место, чтобы продолжить ветку.
          </p>
        </aside>
        <ScenarioCanvas
          doc={draft}
          selection={selection}
          issues={displayedIssues}
          disabled={busy}
          onSelect={select}
          onPositions={(positions) =>
            change((d) => {
              Object.assign(d.editor.positions, positions);
            })
          }
          onViewport={(viewport) =>
            change((d) => {
              d.editor.viewport = viewport;
            })
          }
          onConnect={connect}
          onDisconnect={disconnect}
          onRemove={remove}
          onBranch={setBranch}
          onReady={(instance) => {
            flow.current = instance;
          }}
          onLayout={() => {
            change((d) => {
              d.editor.positions = layoutGraph(d.definition);
            });
            requestAnimationFrame(
              () => void flow.current?.fitView({ padding: 0.2, duration: 300 }),
            );
          }}
          onAdd={add}
        />
        {inspectorOpen && (
          <Inspector
            doc={draft}
            selection={selection}
            change={change}
            onSelect={select}
            onDelete={(id) => remove([id])}
            onDuplicate={duplicate}
            onClose={() => setInspectorOpen(false)}
            onExport={exportDocument}
            focusToken={focusToken}
            disabled={busy}
          />
        )}
        {!inspectorOpen && (
          <button
            type="button"
            className="maker-open-inspector"
            onClick={() => setInspectorOpen(true)}
          >
            <Icon name="edit" size={16} />
            Свойства
          </button>
        )}
        {validationOpen && (
          <section className="maker-validation" aria-label="Проверка сценария">
            <header>
              <div>
                <h2>{errorCount ? `Ошибок: ${errorCount}` : 'Сценарий готов к прохождению'}</h2>
                <p>
                  {issues.filter((i) => i.severity === 'warning').length} предупреждений · нажмите
                  на пункт, чтобы перейти к блоку
                </p>
              </div>
              <button
                type="button"
                className="maker-icon-button"
                onClick={() => setValidationOpen(false)}
                aria-label="Закрыть проверку"
              >
                <Icon name="close" size={17} />
              </button>
            </header>
            <div>
              {issues.length ? (
                issues.map((issue, i) => (
                  <button
                    type="button"
                    key={i}
                    className={`maker-issue maker-issue--${issue.severity}`}
                    onClick={() => showIssue(issue)}
                  >
                    <Icon name={issue.severity === 'error' ? 'close' : 'info'} size={15} />
                    <span>
                      {issue.message}
                      {issue.nodeId && (
                        <small>
                          {draft.definition.nodes.find((n) => n.id === issue.nodeId)?.title ||
                            draft.definition.endings.find((e) => e.id === issue.nodeId)?.title ||
                            issue.nodeId}
                        </small>
                      )}
                    </span>
                    <Icon name="chevron" size={14} />
                  </button>
                ))
              ) : (
                <p className="maker-validation-success">
                  <Icon name="check" />
                  Все переходы корректны, финалы достижимы.
                </p>
              )}
            </div>
          </section>
        )}
      </div>
      {branch && (
        <>
          <button
            className="maker-menu-overlay"
            aria-label="Отменить создание перехода"
            onClick={() => setBranch(null)}
          />
          <section
            className="maker-branch-menu"
            role="dialog"
            aria-label="Создать переход"
            style={{
              left: Math.max(10, Math.min(branch.screen.x, window.innerWidth - 240)),
              top: Math.max(10, Math.min(branch.screen.y, window.innerHeight - 205)),
            }}
          >
            <p>Создать переход</p>
            <button type="button" autoFocus onClick={() => add('node', branch)}>
              <Icon name="plus" size={17} />
              Новая реплика
            </button>
            <button type="button" onClick={() => add('ending', branch)}>
              <Icon name="flag" size={17} />
              Новый финал
            </button>
            <button type="button" onClick={() => setBranch(null)}>
              Отмена
            </button>
          </section>
        </>
      )}
      {testDefinition && (
        <TestScenarioDrawer definition={testDefinition} onClose={() => setTestDefinition(null)} />
      )}
    </main>
  );
}
