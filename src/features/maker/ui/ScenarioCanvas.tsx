import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useNodesInitialized,
  useReactFlow,
  useStore,
  useUpdateNodeInternals,
} from '@xyflow/react';
import type {
  Connection,
  Edge,
  Node,
  NodeProps,
  ReactFlowInstance,
  ReactFlowProps,
} from '@xyflow/react';
import type { GraphIssue, MakerDocument } from '../model/types.ts';
import { layoutGraph } from '../model/commands.ts';
import { Icon } from '../../../components/ui/Icon.tsx';
import { CanvasHelp } from './CanvasHelp.tsx';

export type Selection =
  | { type: 'node' | 'ending'; id: string }
  | { type: 'blocks'; ids: string[] }
  | { type: 'reaction'; id: string; nodeId: string }
  | { type: 'main' | 'characters' | 'settings' };

export interface BranchRequest {
  nodeId: string;
  reactionId: string;
  position: { x: number; y: number };
  screen: { x: number; y: number };
}

type CardData = {
  title: string;
  text: string;
  initials?: string;
  character?: string;
  start?: boolean;
  endingType?: string;
  error?: boolean;
  warning?: boolean;
  incomingIds: string[];
  reactions?: {
    id: string;
    label: string;
    linked: boolean;
    side: Position;
    selected: boolean;
  }[];
  selectReaction?: (id: string, focus?: boolean) => void;
};
export type CardNode = Node<CardData>;

function IncomingHandles({
  id,
  incomingIds,
  hidden = false,
}: {
  id: string;
  incomingIds: string[];
  hidden?: boolean;
}) {
  const update = useUpdateNodeInternals();
  const signature = incomingIds.join(',');
  useEffect(() => {
    update(id);
  }, [id, signature, update]);

  const handles = incomingIds.length ? incomingIds : hidden ? [] : ['available-target'];
  return handles.map((incomingId, index) => (
    <Handle
      key={incomingId}
      id={`in-${incomingId}`}
      type="target"
      isConnectable={!hidden}
      position={Position.Left}
      style={{
        top: `${((index + 1) / (handles.length + 1)) * 100}%`,
        ...(hidden ? { opacity: 0, pointerEvents: 'none' as const } : {}),
      }}
      aria-label={incomingId === 'available-target' ? 'Вход блока' : 'Вход перехода'}
      className={incomingId === 'available-target' ? 'maker-empty-target-handle' : ''}
    />
  ));
}

function DialogueCard({ id, data }: NodeProps<CardNode>) {
  const update = useUpdateNodeInternals();
  const reactionSignature = data.reactions?.map((r) => `${r.id}:${r.side}`).join(',');
  useEffect(() => {
    update(id);
  }, [id, reactionSignature, data.start, update]);

  return (
    <article className={`maker-card ${data.error ? 'has-error' : ''}`} data-testid={`block-${id}`}>
      <IncomingHandles id={id} incomingIds={data.incomingIds} hidden={data.start} />
      <div className="maker-card-heading">
        <span className="maker-avatar">{data.initials || '—'}</span>
        <div>
          <strong>{data.character || 'Выберите персонажа'}</strong>
        </div>
        {data.warning && <span className="maker-warning-dot" title="Блок недостижим" />}
      </div>
      <p className="maker-card-text">{data.text || 'Напишите реплику персонажа…'}</p>
      <div className="maker-card-caption">
        <span>{data.title || 'Без названия'}</span>
        {data.start && <b>Старт</b>}
      </div>
      <div className="maker-card-reactions">
        {data.reactions?.map((r) => (
          <div
            className={`maker-card-reaction ${r.side === Position.Left ? 'has-left-handle' : ''} ${r.selected ? 'is-selected' : ''}`}
            key={r.id}
          >
            <button
              type="button"
              className="nodrag nopan"
              onClick={(event) => {
                event.stopPropagation();
                data.selectReaction?.(r.id);
              }}
              onDoubleClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                data.selectReaction?.(r.id, true);
              }}
              title={r.label}
            >
              {r.label || 'Без названия'}
            </button>
            <Handle
              id={r.id}
              type="source"
              position={r.side}
              className={r.linked ? '' : 'is-unlinked'}
              aria-label={`Переход: ${r.label}`}
              data-testid={`handle-${r.id}`}
            />
          </div>
        ))}
        {!data.reactions?.length && <p className="maker-card-empty">Добавьте реакции справа</p>}
      </div>
    </article>
  );
}

function EndingCard({ id, data }: NodeProps<CardNode>) {
  return (
    <article
      className={`maker-card maker-ending maker-ending--${data.endingType} ${data.error ? 'has-error' : ''}`}
    >
      <IncomingHandles id={id} incomingIds={data.incomingIds} />
      <div className="maker-ending-title">
        <Icon name={data.endingType === 'success' ? 'check' : 'flag'} size={18} />
        <strong>{data.title || 'Новый финал'}</strong>
        {data.warning && <span className="maker-warning-dot" title="Блок недостижим" />}
      </div>
      <p>{data.text || 'Добавьте описание результата…'}</p>
      <small>
        {data.endingType === 'success'
          ? 'Успешный исход'
          : data.endingType === 'failure'
            ? 'Неудачный исход'
            : 'Нейтральный исход'}
      </small>
    </article>
  );
}

const nodeTypes = { dialogue: DialogueCard, ending: EndingCard };
const PAN_ON_DRAG = [1, 2];
const MULTI_SELECTION_KEYS = ['Shift', 'Control', 'Meta'];
const DEFAULT_EDGE_OPTIONS: NonNullable<ReactFlowProps<CardNode, Edge>['defaultEdgeOptions']> = {
  type: 'smoothstep',
  style: { stroke: '#799383', strokeWidth: 2 },
};
const ARIA_LABEL_CONFIG: NonNullable<ReactFlowProps<CardNode, Edge>['ariaLabelConfig']> = {
  'node.a11yDescription.default':
    'Enter — выбрать реплику. Shift или Ctrl — добавить или убрать блок из выделения. Delete — удалить выбранный блок или реакцию.',
  'edge.a11yDescription.default': 'Enter — выбрать реакцию. Delete — удалить реакцию.',
  'controls.zoomIn.ariaLabel': 'Приблизить',
  'controls.zoomOut.ariaLabel': 'Отдалить',
  'controls.fitView.ariaLabel': 'Показать весь граф',
  'minimap.ariaLabel': 'Мини-карта',
};
const MINIMAP_STYLE = { width: 145, height: 90 };
const minimapNodeColor = (node: Node) => (node.type === 'ending' ? '#eed4c5' : '#d7e4d7');

function InitialViewport({ hasSavedViewport }: { hasSavedViewport: boolean }) {
  const initialized = useNodesInitialized();
  const flow = useReactFlow();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const applied = useRef(false);
  useEffect(() => {
    if (!initialized || !width || !height) return;
    if (!applied.current) {
      applied.current = true;
      if (!hasSavedViewport || window.innerWidth < 640)
        void flow.fitView({ padding: 0.15, maxZoom: 0.9 });
    }
  }, [initialized, hasSavedViewport, flow, width, height]);
  return null;
}

function NodeInitializationReporter({ onChange }: { onChange: (ready: boolean) => void }) {
  const initialized = useNodesInitialized();
  useEffect(() => onChange(initialized), [initialized, onChange]);
  return null;
}

export function ScenarioCanvas({
  doc,
  selection,
  issues,
  onSelect,
  onBlockSelection,
  onPositions,
  onViewport,
  onConnect,
  onDisconnect,
  onRemove,
  onBranch,
  onArrange,
  onReady,
  disabled,
}: {
  doc: MakerDocument;
  selection: Selection;
  issues: GraphIssue[];
  disabled: boolean;
  onSelect: (selection: Selection, focus?: boolean) => void;
  onBlockSelection: (ids: string[]) => void;
  onPositions: (positions: Record<string, { x: number; y: number }>) => void;
  onViewport: (viewport: { x: number; y: number; zoom: number }) => void;
  onConnect: (connection: Connection) => void;
  onDisconnect: (edges: Edge[]) => void;
  onRemove: (ids: string[]) => void;
  onBranch: (request: BranchRequest) => void;
  onArrange: () => void;
  onReady: (flow: ReactFlowInstance<CardNode>) => void;
}) {
  const flowRef = useRef<ReactFlowInstance<CardNode> | null>(null);
  const source = useRef<{ nodeId: string; reactionId: string } | null>(null);
  const container = useRef<HTMLDivElement | null>(null);
  const [containerReady, setContainerReady] = useState(false);
  const [nodesReady, setNodesReady] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const help = useRef<HTMLDivElement | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<CardNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const defaults = useMemo(() => layoutGraph(doc.definition), [doc.definition]);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const initialViewport = useRef(doc.editor.viewport).current;

  useEffect(() => {
    const element = container.current;
    if (!element || containerReady) return;
    const checkSize = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) setContainerReady(true);
    };
    checkSize();
    if (typeof ResizeObserver === 'undefined') {
      const frame = requestAnimationFrame(checkSize);
      return () => cancelAnimationFrame(frame);
    }
    const observer = new ResizeObserver(checkSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [containerReady]);

  useEffect(() => {
    if (!helpOpen) return;
    const closeHelp = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !help.current?.contains(event.target))
        setHelpOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHelpOpen(false);
    };
    document.addEventListener('pointerdown', closeHelp);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeHelp);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [helpOpen]);

  // React Flow stores event handlers/options in its internal Zustand store.
  // Keep every handler passed to <ReactFlow> referentially stable: recreating them
  // on each render can make StoreUpdater continuously write back into the store.
  const runtime = useRef({
    disabled,
    onSelect,
    onBlockSelection,
    onPositions,
    onViewport,
    onConnect,
    onDisconnect,
    onRemove,
    onBranch,
    onReady,
  });
  runtime.current = {
    disabled,
    onSelect,
    onBlockSelection,
    onPositions,
    onViewport,
    onConnect,
    onDisconnect,
    onRemove,
    onBranch,
    onReady,
  };
  const rendered = useRef({ nodes, edges, onNodesChange, onEdgesChange });
  rendered.current = { nodes, edges, onNodesChange, onEdgesChange };

  type FlowProps = ReactFlowProps<CardNode, Edge>;

  const handleNodesChange = useCallback<NonNullable<FlowProps['onNodesChange']>>((changes) => {
    rendered.current.onNodesChange(changes);
    const moved = changes.flatMap((change) =>
      change.type === 'position' && change.position && change.dragging === false
        ? [[change.id, change.position] as const]
        : [],
    );
    if (moved.length && !runtime.current.disabled)
      runtime.current.onPositions(Object.fromEntries(moved));
  }, []);

  const handleEdgesChange = useCallback<NonNullable<FlowProps['onEdgesChange']>>((changes) => {
    rendered.current.onEdgesChange(changes);
  }, []);

  const handleInit = useCallback<NonNullable<FlowProps['onInit']>>((flow) => {
    flowRef.current = flow;
    runtime.current.onReady(flow);
  }, []);

  const handleMoveEnd = useCallback<NonNullable<FlowProps['onMoveEnd']>>((event, viewport) => {
    if (event && !runtime.current.disabled) runtime.current.onViewport(viewport);
  }, []);

  const handleKeyDown = useCallback<NonNullable<FlowProps['onKeyDown']>>((event) => {
    const element = event.target as HTMLElement;
    if (!['Enter', ' '].includes(event.key)) return;
    if (element.matches('.react-flow__node')) {
      const node = rendered.current.nodes.find((item) => item.id === element.dataset.id);
      if (node) {
        event.preventDefault();
        runtime.current.onSelect({ type: node.type === 'ending' ? 'ending' : 'node', id: node.id });
      }
    } else if (element.matches('.react-flow__edge')) {
      const edge = rendered.current.edges.find((item) => item.id === element.dataset.id);
      if (edge) runtime.current.onSelect({ type: 'reaction', nodeId: edge.source, id: edge.id });
    }
  }, []);

  const handleSelectionChange = useCallback<NonNullable<FlowProps['onSelectionChange']>>(
    ({ nodes: selectedNodes, edges: selectedEdges }) => {
      if (selectedEdges.length === 1 && selectedNodes.length === 0) {
        const edge = selectedEdges[0];
        runtime.current.onSelect({ type: 'reaction', nodeId: edge.source, id: edge.id });
        return;
      }
      if (selectedNodes.length) {
        runtime.current.onBlockSelection(selectedNodes.map((node) => node.id));
        return;
      }
      // React Flow emits an empty selection not only after a pane click, but also when
      // controlled `selected` flags are cleared from outside the canvas (for example
      // when opening "Основное" or "Настройки"). Do not translate that store update
      // into another inspector selection. A real canvas deselection is handled by
      // handlePaneClick below.
    },
    [],
  );

  const handlePaneClick = useCallback<NonNullable<FlowProps['onPaneClick']>>(() => {
    runtime.current.onBlockSelection([]);
  }, []);

  const handleEdgeClick = useCallback<NonNullable<FlowProps['onEdgeClick']>>((_, edge) => {
    runtime.current.onSelect({ type: 'reaction', nodeId: edge.source, id: edge.id });
  }, []);

  const handleNodesDelete = useCallback<NonNullable<FlowProps['onNodesDelete']>>((deleted) => {
    runtime.current.onRemove(deleted.map((node) => node.id));
  }, []);

  const handleEdgesDelete = useCallback<NonNullable<FlowProps['onEdgesDelete']>>((deleted) => {
    runtime.current.onDisconnect(deleted);
  }, []);

  const handleConnect = useCallback<NonNullable<FlowProps['onConnect']>>((connection) => {
    runtime.current.onConnect(connection);
  }, []);

  const handleConnectStart = useCallback<NonNullable<FlowProps['onConnectStart']>>((_, params) => {
    source.current =
      params.handleType === 'source' && params.nodeId && params.handleId
        ? { nodeId: params.nodeId, reactionId: params.handleId }
        : null;
  }, []);

  const handleConnectEnd = useCallback<NonNullable<FlowProps['onConnectEnd']>>((event, state) => {
    const from = source.current;
    source.current = null;
    if (
      runtime.current.disabled ||
      state.isValid ||
      !from ||
      !(event.target instanceof Element) ||
      !event.target.closest('.react-flow__pane') ||
      !flowRef.current
    )
      return;
    const point = 'changedTouches' in event ? event.changedTouches[0] : event;
    const screen = { x: point.clientX, y: point.clientY };
    runtime.current.onBranch({
      ...from,
      position: flowRef.current.screenToFlowPosition(screen),
      screen,
    });
  }, []);

  const handleNodesInitialized = useCallback((ready: boolean) => {
    setNodesReady((currentReady) => (currentReady === ready ? currentReady : ready));
  }, []);

  useEffect(() => {
    const def = doc.definition;
    const activeSelection = selectionRef.current;
    const flags = (id: string) => ({
      error: issues.some((i) => i.nodeId === id && i.severity === 'error'),
      warning: issues.some((i) => i.nodeId === id && i.severity === 'warning'),
    });
    const selectedIds = new Set(
      activeSelection.type === 'blocks'
        ? activeSelection.ids
        : activeSelection.type === 'node' || activeSelection.type === 'ending'
          ? [activeSelection.id]
          : [],
    );
    const incomingByTarget = new Map<string, string[]>();
    for (const node of def.nodes)
      for (const reaction of node.reactions) {
        const target = reaction.nextNodeId || reaction.endingId;
        if (!target) continue;
        incomingByTarget.set(target, [...(incomingByTarget.get(target) ?? []), reaction.id]);
      }

    const sourceSide = (sourceId: string, targetId?: string) => {
      const source = doc.editor.positions[sourceId] ?? defaults[sourceId];
      const target = targetId ? (doc.editor.positions[targetId] ?? defaults[targetId]) : undefined;
      return source && target && target.x < source.x ? Position.Left : Position.Right;
    };
    const cards: CardNode[] = [
      ...def.nodes.map((node) => {
        const character = def.characters.find((c) => c.id === node.characterId);
        return {
          id: node.id,
          type: 'dialogue',
          ariaLabel: `Реплика: ${node.title || 'Без названия'}`,
          position: doc.editor.positions[node.id] ?? defaults[node.id],
          selected: selectedIds.has(node.id),
          data: {
            title: node.title,
            text: node.text,
            character: character ? `${character.name} · ${character.role}` : '',
            initials: character?.initials,
            start: def.startNodeId === node.id,
            incomingIds: incomingByTarget.get(node.id) ?? [],
            ...flags(node.id),
            reactions: node.reactions.map((reaction) => ({
              id: reaction.id,
              label: reaction.label,
              linked: !!(reaction.nextNodeId || reaction.endingId),
              side: sourceSide(node.id, reaction.nextNodeId || reaction.endingId),
              selected: activeSelection.type === 'reaction' && activeSelection.id === reaction.id,
            })),
            selectReaction: (id: string, focus = false) =>
              runtime.current.onSelect({ type: 'reaction', id, nodeId: node.id }, focus),
          },
        } satisfies CardNode;
      }),
      ...def.endings.map(
        (ending) =>
          ({
            id: ending.id,
            type: 'ending',
            ariaLabel: `Финал: ${ending.title || 'Без названия'}`,
            position: doc.editor.positions[ending.id] ?? defaults[ending.id],
            selected: selectedIds.has(ending.id),
            data: {
              title: ending.title,
              text: ending.description,
              endingType: ending.type,
              incomingIds: incomingByTarget.get(ending.id) ?? [],
              ...flags(ending.id),
            },
          }) satisfies CardNode,
      ),
    ];

    setNodes(cards);
    setEdges(
      def.nodes.flatMap((node) =>
        node.reactions.flatMap((reaction): Edge[] => {
          const target = reaction.nextNodeId || reaction.endingId;
          if (!target || !cards.some((card) => card.id === target)) return [];
          const selected =
            activeSelection.type === 'reaction' && activeSelection.id === reaction.id;
          return [
            {
              id: reaction.id,
              source: node.id,
              sourceHandle: reaction.id,
              target,
              targetHandle: `in-${reaction.id}`,
              type: 'smoothstep',
              ariaLabel: `Переход: ${reaction.label || 'Без названия'}`,
              markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
              selected,
              zIndex: selected ? 4 : 1,
              label: selected ? reaction.label : undefined,
            },
          ];
        }),
      ),
    );
  }, [doc.definition, doc.editor.positions, defaults, issues, setNodes, setEdges]);

  useEffect(() => {
    const selectedIds = new Set(
      selection.type === 'blocks'
        ? selection.ids
        : selection.type === 'node' || selection.type === 'ending'
          ? [selection.id]
          : [],
    );
    const selectedReaction = selection.type === 'reaction' ? selection.id : '';
    const reactionLabels = new Map(
      doc.definition.nodes.flatMap((node) =>
        node.reactions.map((reaction) => [reaction.id, reaction.label] as const),
      ),
    );

    setNodes((currentNodes) => {
      let changed = false;
      const nextNodes = currentNodes.map((node) => {
        const selected = selectedIds.has(node.id);
        let data = node.data;
        if (data.reactions) {
          let reactionsChanged = false;
          const reactions = data.reactions.map((reaction) => {
            const reactionSelected = reaction.id === selectedReaction;
            if (reaction.selected === reactionSelected) return reaction;
            reactionsChanged = true;
            return { ...reaction, selected: reactionSelected };
          });
          if (reactionsChanged) data = { ...data, reactions };
        }
        if (node.selected === selected && data === node.data) return node;
        changed = true;
        return { ...node, selected, data };
      });
      return changed ? nextNodes : currentNodes;
    });

    setEdges((currentEdges) => {
      let changed = false;
      const nextEdges = currentEdges.map((edge) => {
        const selected = edge.id === selectedReaction;
        const label = selected ? reactionLabels.get(edge.id) : undefined;
        const zIndex = selected ? 4 : 1;
        if (edge.selected === selected && edge.label === label && edge.zIndex === zIndex)
          return edge;
        changed = true;
        return { ...edge, selected, label, zIndex };
      });
      return changed ? nextEdges : currentEdges;
    });
  }, [doc.definition, selection, setEdges, setNodes]);

  return (
    <div
      ref={container}
      className="maker-canvas"
      aria-label="Полотно сценария"
      data-testid="maker-canvas"
    >
      {containerReady ? (
        <ReactFlow<CardNode>
          aria-label="Полотно сценария"
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onInit={handleInit}
          defaultViewport={initialViewport}
          minZoom={0.08}
          maxZoom={1.5}
          onMoveEnd={handleMoveEnd}
          onKeyDown={handleKeyDown}
          onSelectionChange={handleSelectionChange}
          onPaneClick={handlePaneClick}
          onEdgeClick={handleEdgeClick}
          onNodesDelete={handleNodesDelete}
          onEdgesDelete={handleEdgesDelete}
          onConnect={handleConnect}
          onConnectStart={handleConnectStart}
          onConnectEnd={handleConnectEnd}
          nodesDraggable={nodesReady && !disabled}
          nodesConnectable={nodesReady && !disabled}
          edgesReconnectable={false}
          selectionOnDrag={nodesReady && !disabled}
          panOnDrag={PAN_ON_DRAG}
          multiSelectionKeyCode={MULTI_SELECTION_KEYS}
          deleteKeyCode={null}
          connectOnClick
          elevateEdgesOnSelect
          defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
          ariaLabelConfig={ARIA_LABEL_CONFIG}
        >
          <NodeInitializationReporter onChange={handleNodesInitialized} />
          <InitialViewport hasSavedViewport={!!doc.editor.viewport} />
          <Background color="var(--tone-border, #d8e0d6)" gap={22} size={1.2} />
          <Controls showInteractive={false} />
          <MiniMap
            style={MINIMAP_STYLE}
            pannable
            zoomable
            nodeColor={minimapNodeColor}
            maskColor="var(--minimap-mask, rgba(247,247,242,.6))"
          />
          <Panel position="bottom-center" className="maker-canvas-tools-panel">
            <div className="maker-canvas-tools" ref={help}>
              {helpOpen && <CanvasHelp onClose={() => setHelpOpen(false)} />}
              <div className="maker-canvas-dock">
                <button type="button" onClick={onArrange} disabled={disabled}>
                  <Icon name="branch" size={15} />
                  Упорядочить
                </button>
                <span className="maker-canvas-dock-separator" aria-hidden="true" />
                <button
                  type="button"
                  className="maker-canvas-help-trigger"
                  aria-expanded={helpOpen}
                  aria-label="Подсказки по работе с полотном"
                  onClick={() => setHelpOpen((value) => !value)}
                >
                  <Icon name="info" size={16} />
                  Подсказки
                </button>
              </div>
            </div>
          </Panel>
          <Panel position="top-right" className="maker-canvas-count">
            {doc.definition.nodes.length} реплик · {doc.definition.endings.length} финалов
          </Panel>
        </ReactFlow>
      ) : (
        <div className="maker-canvas-loading" role="status">
          Подготавливаем полотно…
        </div>
      )}
    </div>
  );
}
