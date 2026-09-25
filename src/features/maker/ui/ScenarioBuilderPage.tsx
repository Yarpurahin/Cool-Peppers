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
  removeReaction,
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
import { ResizableInspector, useInspectorWidth } from './ResizableInspector.tsx';
import {
  fingerprint,
  contentFingerprint,
  recoverDraft,
  serializeRecovery,
} from '../model/draftRecovery.ts';
import { DraftHistory } from '../model/history.ts';
import { statusLabel, statusOf } from '../model/publication.ts';
import '@xyflow/react/dist/style.css';
import './maker.css';

function sameSelection(a: Selection, b: Selection) {
  if (a.type !== b.type) return false;
  if (a.type === 'blocks' && b.type === 'blocks') {
    if (a.ids.length !== b.ids.length) return false;
    const selected = new Set(a.ids);
    return b.ids.every((id) => selected.has(id));
  }
  if (a.type === 'reaction' && b.type === 'reaction')
    return a.id === b.id && a.nodeId === b.nodeId;
  if ((a.type === 'node' || a.type === 'ending') && (b.type === 'node' || b.type === 'ending'))
    return a.id === b.id;
  return true;
}

function isEditableTarget(target: EventTarget | null) {
  const element = target instanceof HTMLElement ? target : null;
  if (!element) return false;
  return (
    element.isContentEditable ||
    !!element.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')
  );
}

export function ScenarioBuilderPage() {
  const { scenarioId } = useParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { refreshCatalog, user } = useCatalog();
  const storageKey = `arena:maker:${user!.id}:${scenarioId}`;
  const inspectorWidth = useInspectorWidth();
  const listPath = pathname.startsWith('/admin') ? '/admin/scenarios' : '/editor';
  const path = `/editor/${encodeURIComponent(scenarioId ?? '')}`;
  const [draft, setDraft] = useState<MakerDraft | null>(null);
  const current = useRef<MakerDraft | null>(null);
  const [saved, setSaved] = useState('');
  const savedRef = useRef('');
  const savedContent = useRef('');
  const serverDraft = useRef<MakerDraft | null>(null);
  const [storageError, setStorageError] = useState('');
  const [conflict, setConflict] = useState(false);
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
  const history = useRef(new DraftHistory<MakerDocument>());
  const flow = useRef<ReactFlowInstance<CardNode> | null>(null);
  const issues = useMemo(() => (draft ? validateMaker(draft.definition) : []), [draft?.definition]);
  const displayedIssues = useMemo(() => (checked ? issues : []), [checked, issues]);
  const dirty = !!draft && fingerprint(draft) !== saved;
  const errorCount = issues.filter((i) => i.severity === 'error').length;

  const replace = useCallback((value: MakerDraft) => {
    current.current = value;
    setDraft(value);
  }, []);
  // Synchronous storage: even an immediate reload after a keystroke keeps that change.
  // sessionStorage isolates drafts in different tabs while surviving reloads/navigation.
  const persist = useCallback(
    (value: MakerDraft) => {
      try {
        sessionStorage.setItem(storageKey, serializeRecovery(value, savedRef.current));
        setStorageError('');
      } catch {
        setStorageError(
          'Не удалось сохранить изменения в браузере. Сохраните черновик на сервер перед обновлением страницы.',
        );
      }
    },
    [storageKey],
  );
  const markSaved = (value: MakerDraft) => {
    savedRef.current = fingerprint(value);
    savedContent.current = contentFingerprint(value);
    serverDraft.current = value;
    setSaved(savedRef.current);
    setConflict(false);
    try {
      sessionStorage.removeItem(storageKey);
      setStorageError('');
    } catch {
      setStorageError('Черновик сохранён на сервере, но хранилище браузера недоступно.');
    }
  };
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
        savedRef.current = fingerprint(next);
        savedContent.current = contentFingerprint(next);
        serverDraft.current = next;
        setSaved(savedRef.current);
        history.current.clear();
        let restored = next;
        setConflict(false);
        setStorageError('');
        try {
          const recovery = recoverDraft(sessionStorage.getItem(storageKey), next);
          restored = recovery.draft;
          setConflict(recovery.conflict);
          if (recovery.restored) setMessage('Изменения восстановлены после обновления страницы.');
          else sessionStorage.removeItem(storageKey);
        } catch {
          setStorageError('Не удалось восстановить локальную копию. Открыт черновик с сервера.');
        }
        replace(restored);
        setSelection(
          restored.definition.nodes.length
            ? {
                type: 'node',
                id: restored.definition.startNodeId || restored.definition.nodes[0].id,
              }
            : { type: 'main' },
        );
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      });
    return () => controller.abort();
  }, [path, replace, storageKey]);
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
    (mutator: (doc: MakerDocument) => void, trackHistory = true) => {
      if (!current.current || busyRef.current) return;
      const previous = current.current;
      const next = structuredClone(previous);
      mutator(next);
      if (fingerprint(next) === fingerprint(previous)) return;
      const active = document.activeElement;
      const textField =
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLInputElement &&
          ['text', 'search', 'email', 'number', 'url'].includes(active.type));
      if (trackHistory) history.current.record(previous, textField ? active : null);
      replace(next);
      persist(next);
      setMessage('');
    },
    [replace, persist],
  );
  const select = useCallback((value: Selection) => {
    history.current.breakGroup();
    setSelection((currentSelection) =>
      sameSelection(currentSelection, value) ? currentSelection : value,
    );
    setInspectorOpen(true);
    setSidebarOpen(false);
    setBranch(null);
  }, []);
  const selectBlocks = useCallback(
    (ids: string[]) => {
      const unique = [...new Set(ids)];
      if (!unique.length) {
        select({ type: 'main' });
        return;
      }
      if (unique.length === 1) {
        const id = unique[0];
        const ending = current.current?.definition.endings.some((item) => item.id === id);
        select({ type: ending ? 'ending' : 'node', id });
        return;
      }
      select({ type: 'blocks', ids: unique });
    },
    [select],
  );
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
  const travel = useCallback(
    (direction: 'undo' | 'redo') => {
      if (!current.current || busyRef.current) return;
      const value = history.current.travel(direction, current.current);
      if (!value) return;
      const next = {
        ...current.current,
        preview: value.preview,
        definition: value.definition,
        editor: { ...value.editor, viewport: current.current.editor.viewport },
      };
      replace(next);
      persist(next);
      // A removed selection must not leave an empty inspector after undo/redo.
      if (selection.type === 'blocks') {
        const available = new Set([
          ...next.definition.nodes.map((node) => node.id),
          ...next.definition.endings.map((ending) => ending.id),
        ]);
        const ids = selection.ids.filter((id) => available.has(id));
        if (ids.length !== selection.ids.length) selectBlocks(ids);
      } else if ('id' in selection) {
        const id = selection.type === 'reaction' ? selection.nodeId : selection.id;
        const node = next.definition.nodes.find((n) => n.id === id);
        if (!node && !next.definition.endings.some((e) => e.id === id))
          select({ type: 'main' });
        else if (
          selection.type === 'reaction' &&
          !node?.reactions.some((r) => r.id === selection.id)
        )
          select({ type: 'node', id });
      }
      setMessage('');
      setBranch(null);
    },
    [persist, replace, select, selectBlocks, selection],
  );
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
    if (selection.type === 'blocks' && selection.ids.some((id) => ids.includes(id)))
      select({ type: 'main' });
    else if (
      'id' in selection &&
      ids.includes(selection.type === 'reaction' ? selection.nodeId : selection.id)
    )
      select({ type: 'main' });
  }
  function removeSelectedReaction(nodeId: string, reactionId: string) {
    change((doc) => {
      removeReaction(doc.definition, nodeId, reactionId);
    });
    select({ type: 'node', id: nodeId });
  }

  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      if (testDefinition || branch || busy || isEditableTarget(event.target)) return;

      if (
        (event.key === 'Delete' || event.key === 'Backspace') &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey
      ) {
        if (selection.type === 'reaction') {
          event.preventDefault();
          removeSelectedReaction(selection.nodeId, selection.id);
          return;
        }
        if (selection.type === 'blocks') {
          event.preventDefault();
          remove(selection.ids);
          return;
        }
        if (selection.type === 'node' || selection.type === 'ending') {
          event.preventDefault();
          remove([selection.id]);
          return;
        }
      }

      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      // Use physical key codes as the primary signal so shortcuts also work
      // with Cyrillic and other keyboard layouts (KeyZ may otherwise report "я").
      const key = event.key.toLowerCase();
      const undoKey = event.code === 'KeyZ' || key === 'z';
      const redoKey = event.code === 'KeyY' || key === 'y';
      if (undoKey) {
        event.preventDefault();
        travel(event.shiftKey ? 'redo' : 'undo');
      } else if (redoKey && !event.shiftKey) {
        event.preventDefault();
        travel('redo');
      }
    };

    window.addEventListener('keydown', handleKeyboard, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyboard, { capture: true });
  }, [branch, busy, selection, testDefinition, travel]);

  function arrange() {
    change((d) => {
      d.editor.positions = layoutGraph(d.definition);
    });
    requestAnimationFrame(() => {
      void flow.current?.fitView({ padding: 0.16, maxZoom: 0.95, duration: 280 });
    });
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
    if (!value || busyRef.current || conflict) return;
    history.current.breakGroup();
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
      const result = await api<{ revision: number; hasUnpublishedChanges: boolean }>(path, {
        method: 'PUT',
        body: { ...document, revision: value.revision },
      });
      const next = { ...value, ...result };
      replace(next);
      markSaved(next);
      if (publish) {
        const published = await api<{ version: number }>(`${path}/publish`, {
          method: 'POST',
          body: { revision: result.revision },
        });
        const latest = toMakerDraft(await api<AuthoringDraft>(path));
        replace(latest);
        markSaved(latest);
        history.current.clear();
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
      <main id="main-content" className="container page">
        <h1>Конструктор сценария</h1>
        <p role={error ? 'alert' : 'status'}>{error || 'Загружаем сценарий…'}</p>
        <button className="button button--outline" onClick={() => navigate(listPath)}>
          К сценариям
        </button>
      </main>
    );
  const publication = {
    ...draft,
    hasUnpublishedChanges:
      draft.hasUnpublishedChanges || contentFingerprint(draft) !== savedContent.current,
  };
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
      style={inspectorWidth.style}
      onBlurCapture={() => history.current.breakGroup()}
      className={`maker-page ${inspectorOpen ? '' : 'is-inspector-closed'} ${sidebarOpen ? 'is-sidebar-open' : ''}`}
    >
      {inspectorOpen && (
        <a href="#maker-inspector" className="skip-link">
          Перейти к свойствам сценария
        </a>
      )}
      <header className="maker-header">
        <button
          type="button"
          className="maker-back"
          aria-label="К списку сценариев"
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
            <span className={`maker-status maker-status--${statusOf(publication)}`}>
              {statusLabel(publication)}
            </span>
            <span className="maker-save-status" role="status">
              {busy
                ? 'Сохраняем…'
                : dirty
                  ? storageError
                    ? 'Есть несохранённые изменения'
                    : 'Сохранено в этой вкладке'
                  : 'Сохранено на сервере'}
            </span>
          </div>
        </div>
        <div className="maker-history-buttons">
          <button
            type="button"
            className="maker-icon-button"
            disabled={busy || !history.current.past.length}
            onClick={() => travel('undo')}
            aria-label="Отменить"
            aria-keyshortcuts="Control+Z Meta+Z"
            title="Отменить (Ctrl+Z)"
          >
            <Icon name="reset" size={18} />
          </button>
          <button
            type="button"
            className="maker-icon-button"
            disabled={busy || !history.current.future.length}
            onClick={() => travel('redo')}
            aria-label="Повторить"
            aria-keyshortcuts="Control+Y Control+Shift+Z Meta+Shift+Z"
            title="Повторить (Ctrl+Y / Ctrl+Shift+Z)"
          >
            <Icon name="reset" size={18} style={{ transform: 'scaleX(-1)' }} />
          </button>
        </div>
        <div className="maker-header-actions">
          <button
            type="button"
            className="maker-secondary"
            onClick={() => void save(false)}
            disabled={busy || conflict}
          >
            <Icon name="save" size={16} />
            Сохранить черновик
          </button>
          <button type="button" className="maker-secondary" onClick={test} disabled={busy}>
            <Icon name="message" size={16} />
            Тестировать
          </button>
          <button type="button" className="maker-secondary" onClick={check} disabled={busy}>
            <Icon name="check" size={16} />
            Проверить
          </button>
          <button
            type="button"
            className="maker-primary"
            onClick={() => void save(true)}
            disabled={busy || conflict}
          >
            <Icon name="upRight" size={16} />
            Опубликовать
          </button>
        </div>
      </header>
      {storageError && (
        <p role="alert" className="maker-notice is-error">
          {storageError}
        </p>
      )}
      {conflict && (
        <div className="maker-notice is-error" role="alert">
          <span>
            На сервере есть более новая редакция. Ваши изменения восстановлены отдельно. Скачайте их
            перед загрузкой серверной версии.
          </span>
          <button type="button" className="maker-secondary" onClick={exportDocument}>
            Скачать мои изменения
          </button>
          <button
            type="button"
            className="maker-secondary"
            onClick={() => {
              if (
                !serverDraft.current ||
                !window.confirm('Загрузить серверную версию вместо локальных изменений?')
              )
                return;
              replace(serverDraft.current);
              markSaved(serverDraft.current);
              history.current.clear();
              select({ type: 'main' });
              setMessage('Загружена серверная версия.');
            }}
          >
            Загрузить серверную версию
          </button>
        </div>
      )}
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
        <button
          type="button"
          aria-expanded={sidebarOpen}
          aria-controls="maker-structure"
          onClick={() => setSidebarOpen((v) => !v)}
        >
          <Icon name="menu" size={15} />
          Структура
        </button>
        <button
          type="button"
          aria-expanded={inspectorOpen}
          aria-controls="maker-inspector"
          onClick={() => setInspectorOpen((v) => !v)}
        >
          <Icon name="edit" size={15} />
          Свойства
        </button>
      </div>
      <div className="maker-workspace">
        <aside id="maker-structure" className="maker-sidebar" aria-label="Структура сценария">
          <p className="eyebrow">
            <span className="accent-dot" />
            Структура
          </p>
          <nav aria-label="Разделы сценария">
            {nav.map((item) => (
              <button
                type="button"
                key={item.type}
                onClick={() => select({ type: item.type })}
                aria-pressed={selection.type === item.type}
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
                aria-pressed={selectedId === n.id}
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
                aria-pressed={selectedId === e.id}
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
          onBlockSelection={selectBlocks}
          onPositions={(positions) =>
            change((d) => {
              Object.assign(d.editor.positions, positions);
            })
          }
          onViewport={(viewport) =>
            change((d) => {
              d.editor.viewport = viewport;
            }, false)
          }
          onConnect={connect}
          onDisconnect={disconnect}
          onRemove={remove}
          onBranch={setBranch}
          onArrange={arrange}
          onReady={(instance) => {
            flow.current = instance;
          }}
        />
        {inspectorOpen && (
          <ResizableInspector {...inspectorWidth}>
            <Inspector
              doc={draft}
              selection={selection}
              change={change}
              onSelect={select}
              onDelete={(id) => remove([id])}
              onDeleteMany={remove}
              onDeleteReaction={removeSelectedReaction}
              onDuplicate={duplicate}
              onClose={() => setInspectorOpen(false)}
              onExport={exportDocument}
              focusToken={focusToken}
              disabled={busy}
            />
          </ResizableInspector>
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
