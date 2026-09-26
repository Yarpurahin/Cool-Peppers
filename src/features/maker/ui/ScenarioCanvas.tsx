import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BaseEdge,
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
  EdgeProps,
  Node,
  NodeProps,
  ReactFlowInstance,
  ReactFlowProps,
} from '@xyflow/react';
import type { GraphIssue, MakerDocument } from '../model/types.ts';
import { layoutGraph } from '../model/commands.ts';
import { routeOrthogonalEdge, roundedOrthogonalPath } from '../model/edgeRouting.ts';
import type { RouteRect } from '../model/edgeRouting.ts';
import { Icon } from '../../../components/ui/Icon.tsx';

export type Selection =
  | { type: 'node' | 'ending'; id: string }
  | { type: 'blocks'; ids: string[] }
  | { type: 'reaction'; id: string; nodeId: string }
  | { type: 'main' | 'characters' | 'stages' | 'settings' };

export interface BranchRequest {
  nodeId: string;
  reactionId: string;
  position: { x: number; y: number };
  screen: { x: number; y: number };
}

type RouteEmphasis = 'normal' | 'active' | 'focus' | 'dimmed';

type CardData = {
  title: string;
  text: string;
  initials?: string;
  character?: string;
  stage?: string;
  start?: boolean;
  endingType?: string;
  error?: boolean;
  warning?: boolean;
  incomingIds: string[];
  routeEmphasis?: RouteEmphasis;
  routeTarget?: boolean;
  reactions?: {
    id: string;
    label: string;
    linked: boolean;
    selected: boolean;
    hovered?: boolean;
    emphasis?: RouteEmphasis;
    targetTitle?: string;
  }[];
  selectReaction?: (id: string) => void;
  hoverReaction?: (id: string | null) => void;
  focusReaction?: (id: string) => void;
};
export type CardNode = Node<CardData>;

type MakerRouteData = {
  obstacles: RouteRect[];
  lane: number;
  emphasis: RouteEmphasis;
};
type MakerEdge = Edge<MakerRouteData>;

function MakerRouteEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
  style,
  data,
}: EdgeProps<MakerEdge>) {
  const points = routeOrthogonalEdge({
    source: { x: sourceX, y: sourceY },
    target: { x: targetX, y: targetY },
    obstacles: data?.obstacles ?? [],
    lane: data?.lane ?? 0,
  });
  const path = roundedOrthogonalPath(points, 10);
  const emphasis = data?.emphasis ?? 'normal';
  return (
    <BaseEdge
      id={id}
      path={path}
      markerEnd={markerEnd}
      style={style}
      interactionWidth={20}
      className={`maker-route-edge maker-route-edge--${emphasis}`}
    />
  );
}

function IncomingHandles({ id, incomingIds }: { id: string; incomingIds: string[] }) {
  const update = useUpdateNodeInternals();
  const signature = incomingIds.join(',');
  useEffect(() => {
    update(id);
  }, [id, signature, update]);

  const handles = incomingIds.length ? incomingIds : ['available-target'];
  return handles.map((incomingId, index) => (
    <Handle
      key={incomingId}
      id={`in-${incomingId}`}
      type="target"
      position={Position.Left}
      style={{ top: `${((index + 1) / (handles.length + 1)) * 100}%` }}
      aria-label={incomingId === 'available-target' ? 'Вход блока' : 'Вход перехода'}
      className={incomingId === 'available-target' ? 'maker-empty-target-handle' : ''}
    />
  ));
}

function DialogueCard({ id, data }: NodeProps<CardNode>) {
  const update = useUpdateNodeInternals();
  const reactionSignature = data.reactions?.map((r) => r.id).join(',');
  useEffect(() => {
    update(id);
  }, [id, reactionSignature, data.start, update]);

  return (
    <article
      className={`maker-card maker-card--route-${data.routeEmphasis ?? 'normal'} ${data.routeTarget ? 'is-route-target' : ''} ${data.error ? 'has-error' : ''}`}
      data-testid={`block-${id}`}
    >
      <IncomingHandles id={id} incomingIds={data.incomingIds} />
      <div className="maker-card-heading">
        <span className="maker-avatar">{data.initials || '—'}</span>
        <div>
          <strong>{data.character || 'Выберите персонажа'}</strong>
          <span>{data.stage || 'Без этапа'}</span>
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
            className={`maker-card-reaction ${r.selected ? 'is-selected' : ''} maker-card-reaction--${r.emphasis ?? 'normal'}`}
            key={r.id}
          >
            <button
              type="button"
              className="nodrag nopan"
              onClick={(event) => {
                event.stopPropagation();
                data.selectReaction?.(r.id);
              }}
              onMouseEnter={() => data.hoverReaction?.(r.id)}
              onMouseLeave={() => data.hoverReaction?.(null)}
              onDoubleClick={(event) => {
                event.stopPropagation();
                if (r.linked) data.focusReaction?.(r.id);
              }}
              title={r.targetTitle ? `${r.label}\nВедёт к: ${r.targetTitle}` : r.label}
            >
              {r.label || 'Без названия'}
            </button>
            {r.hovered && r.targetTitle && (
              <span className="maker-route-target-hint" role="tooltip">
                <small>Ведёт к</small>
                <strong>{r.targetTitle}</strong>
              </span>
            )}
            <Handle
              id={r.id}
              type="source"
              position={Position.Right}
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
      className={`maker-card maker-ending maker-ending--${data.endingType} maker-card--route-${data.routeEmphasis ?? 'normal'} ${data.routeTarget ? 'is-route-target' : ''} ${data.error ? 'has-error' : ''}`}
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
const edgeTypes = { makerRoute: MakerRouteEdge };
const PAN_ON_DRAG = [1, 2];
const MULTI_SELECTION_KEYS = ['Shift', 'Control', 'Meta'];
const DEFAULT_EDGE_OPTIONS: NonNullable<ReactFlowProps<CardNode, Edge>['defaultEdgeOptions']> = {
  type: 'makerRoute',
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
const minimapNodeColor = (node: Node) =>
  node.type === 'ending' ? '#eed4c5' : '#d7e4d7';

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
  onSelect: (selection: Selection) => void;
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
  const [hoveredReactionId, setHoveredReactionId] = useState<string | null>(null);
  const [focusedReactionId, setFocusedReactionId] = useState<string | null>(null);
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

  useEffect(() => {
    if (!focusedReactionId) return;
    const exists = doc.definition.nodes.some((node) =>
      node.reactions.some((reaction) => reaction.id === focusedReactionId),
    );
    if (!exists) setFocusedReactionId(null);
  }, [doc.definition, focusedReactionId]);


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


  const handleEdgeMouseEnter = useCallback<NonNullable<FlowProps['onEdgeMouseEnter']>>((_, edge) => {
    setHoveredReactionId(edge.id);
  }, []);

  const handleEdgeMouseLeave = useCallback<NonNullable<FlowProps['onEdgeMouseLeave']>>((_, edge) => {
    setHoveredReactionId((current) => (current === edge.id ? null : current));
  }, []);

  const handleEdgeDoubleClick = useCallback<NonNullable<FlowProps['onEdgeDoubleClick']>>((event, edge) => {
    event.stopPropagation();
    setFocusedReactionId((current) => (current === edge.id ? null : edge.id));
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

    const targetTitleById = new Map<string, string>([
      ...def.nodes.map((node) => [node.id, node.title || 'Без названия'] as const),
      ...def.endings.map((ending) => [ending.id, ending.title || 'Финал'] as const),
    ]);
    const positions = new Map<string, { x: number; y: number }>();
    for (const node of def.nodes)
      positions.set(node.id, doc.editor.positions[node.id] ?? defaults[node.id] ?? { x: 0, y: 0 });
    for (const ending of def.endings)
      positions.set(ending.id, doc.editor.positions[ending.id] ?? defaults[ending.id] ?? { x: 0, y: 0 });

    const routeRects: RouteRect[] = [
      ...def.nodes.map((node) => {
        const position = positions.get(node.id)!;
        return {
          id: node.id,
          x: position.x - 18,
          y: position.y - 18,
          width: 328,
          height: 231 + node.reactions.length * 42,
        };
      }),
      ...def.endings.map((ending) => {
        const position = positions.get(ending.id)!;
        return { id: ending.id, x: position.x - 18, y: position.y - 18, width: 328, height: 171 };
      }),
    ];

    const cards: CardNode[] = [
      ...def.nodes.map((node) => {
        const character = def.characters.find((c) => c.id === node.characterId);
        return {
          id: node.id,
          type: 'dialogue',
          ariaLabel: `Реплика: ${node.title || 'Без названия'}`,
          position: positions.get(node.id)!,
          selected: selectedIds.has(node.id),
          data: {
            title: node.title,
            text: node.text,
            character: character ? `${character.name} · ${character.role}` : '',
            initials: character?.initials,
            stage: def.stages.find((s) => s.id === node.stageId)?.title,
            start: def.startNodeId === node.id,
            incomingIds: incomingByTarget.get(node.id) ?? [],
            routeEmphasis: 'normal',
            ...flags(node.id),
            reactions: node.reactions.map((reaction) => ({
              id: reaction.id,
              label: reaction.label,
              linked: !!(reaction.nextNodeId || reaction.endingId),
              selected: activeSelection.type === 'reaction' && activeSelection.id === reaction.id,
              emphasis: 'normal',
              targetTitle: targetTitleById.get(reaction.nextNodeId || reaction.endingId || ''),
            })),
            selectReaction: (id: string) =>
              runtime.current.onSelect({ type: 'reaction', id, nodeId: node.id }),
            hoverReaction: setHoveredReactionId,
            focusReaction: (id: string) =>
              setFocusedReactionId((current) => (current === id ? null : id)),
          },
        } satisfies CardNode;
      }),
      ...def.endings.map(
        (ending) =>
          ({
            id: ending.id,
            type: 'ending',
            ariaLabel: `Финал: ${ending.title || 'Без названия'}`,
            position: positions.get(ending.id)!,
            selected: selectedIds.has(ending.id),
            data: {
              title: ending.title,
              text: ending.description,
              endingType: ending.type,
              incomingIds: incomingByTarget.get(ending.id) ?? [],
              routeEmphasis: 'normal',
              ...flags(ending.id),
            },
          }) satisfies CardNode,
      ),
    ];

    setNodes(cards);
    setEdges(
      def.nodes.flatMap((node) =>
        node.reactions.flatMap((reaction, reactionIndex): MakerEdge[] => {
          const target = reaction.nextNodeId || reaction.endingId;
          if (!target || !cards.some((card) => card.id === target)) return [];
          const selected = activeSelection.type === 'reaction' && activeSelection.id === reaction.id;
          const sourceLane = reactionIndex - (node.reactions.length - 1) / 2;
          const incoming = incomingByTarget.get(target) ?? [];
          const targetIndex = incoming.indexOf(reaction.id);
          const targetLane = targetIndex >= 0 ? targetIndex - (incoming.length - 1) / 2 : 0;
          const lane = sourceLane * 0.65 + targetLane * 0.35;
          return [
            {
              id: reaction.id,
              source: node.id,
              sourceHandle: reaction.id,
              target,
              targetHandle: `in-${reaction.id}`,
              type: 'makerRoute',
              ariaLabel: `Переход: ${reaction.label || 'Без названия'}`,
              markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
              selected,
              zIndex: selected ? 8 : 1,
              data: {
                lane,
                emphasis: selected ? 'active' : 'normal',
                obstacles: routeRects.filter((rect) => rect.id !== node.id && rect.id !== target),
              },
            },
          ];
        }),
      ),
    );
  }, [
    doc.definition,
    doc.editor.positions,
    defaults,
    issues,
    setNodes,
    setEdges,
  ]);

  useEffect(() => {
    const selectedIds = new Set(
      selection.type === 'blocks'
        ? selection.ids
        : selection.type === 'node' || selection.type === 'ending'
          ? [selection.id]
          : [],
    );
    const selectedReaction = selection.type === 'reaction' ? selection.id : '';
    const relations = new Map<string, { source: string; target: string }>();
    for (const node of doc.definition.nodes)
      for (const reaction of node.reactions) {
        const target = reaction.nextNodeId || reaction.endingId;
        if (target) relations.set(reaction.id, { source: node.id, target });
      }

    const focusEdgeIds = new Set<string>();
    const focusNodeIds = new Set<string>();
    if (focusedReactionId && relations.has(focusedReactionId)) {
      const first = relations.get(focusedReactionId)!;
      focusEdgeIds.add(focusedReactionId);
      focusNodeIds.add(first.source);
      const queue = [first.target];
      for (let cursor = 0; cursor < queue.length; cursor++) {
        const id = queue[cursor];
        if (focusNodeIds.has(id)) continue;
        focusNodeIds.add(id);
        const dialogue = doc.definition.nodes.find((node) => node.id === id);
        if (!dialogue) continue;
        for (const reaction of dialogue.reactions) {
          const target = reaction.nextNodeId || reaction.endingId;
          if (!target) continue;
          focusEdgeIds.add(reaction.id);
          if (!focusNodeIds.has(target)) queue.push(target);
        }
      }
    }

    const activeEdgeIds = new Set<string>();
    const primaryReaction = hoveredReactionId || selectedReaction;
    if (primaryReaction && relations.has(primaryReaction)) activeEdgeIds.add(primaryReaction);
    else if (selection.type === 'node' || selection.type === 'ending') {
      for (const [reactionId, relation] of relations)
        if (relation.source === selection.id || relation.target === selection.id)
          activeEdgeIds.add(reactionId);
    }

    const activeNodeIds = new Set<string>();
    for (const reactionId of activeEdgeIds) {
      const relation = relations.get(reactionId);
      if (!relation) continue;
      activeNodeIds.add(relation.source);
      activeNodeIds.add(relation.target);
    }
    const activeTarget = activeEdgeIds.size === 1
      ? relations.get([...activeEdgeIds][0])?.target
      : undefined;
    const focusActive = focusNodeIds.size > 0;
    const localActive = activeEdgeIds.size > 0;

    setNodes((currentNodes) => {
      let changed = false;
      const nextNodes = currentNodes.map((node) => {
        const selected = selectedIds.has(node.id);
        let routeEmphasis: RouteEmphasis = 'normal';
        if (focusActive) routeEmphasis = focusNodeIds.has(node.id) ? 'focus' : 'dimmed';
        else if (localActive) routeEmphasis = activeNodeIds.has(node.id) ? 'active' : 'dimmed';
        const routeTarget = activeTarget === node.id;
        const zIndex = routeEmphasis === 'active' ? 8 : routeEmphasis === 'focus' ? 5 : routeEmphasis === 'dimmed' ? 0 : selected ? 4 : 1;
        let data = node.data;
        let dataChanged = data.routeEmphasis !== routeEmphasis || !!data.routeTarget !== routeTarget;
        if (data.reactions) {
          let reactionsChanged = false;
          const reactions = data.reactions.map((reaction) => {
            const reactionSelected = reaction.id === selectedReaction;
            const hovered = reaction.id === hoveredReactionId;
            let emphasis: RouteEmphasis = 'normal';
            if (focusActive) {
              if (!focusEdgeIds.has(reaction.id)) emphasis = 'dimmed';
              else emphasis = activeEdgeIds.has(reaction.id) ? 'active' : 'focus';
            } else if (localActive) emphasis = activeEdgeIds.has(reaction.id) ? 'active' : 'dimmed';
            if (
              reaction.selected === reactionSelected &&
              !!reaction.hovered === hovered &&
              reaction.emphasis === emphasis
            )
              return reaction;
            reactionsChanged = true;
            return { ...reaction, selected: reactionSelected, hovered, emphasis };
          });
          if (reactionsChanged) {
            data = { ...data, reactions };
            dataChanged = true;
          }
        }
        if (dataChanged) data = { ...data, routeEmphasis, routeTarget };
        if (node.selected === selected && node.zIndex === zIndex && data === node.data) return node;
        changed = true;
        return { ...node, selected, zIndex, data };
      });
      return changed ? nextNodes : currentNodes;
    });

    setEdges((currentEdges) => {
      let changed = false;
      const nextEdges = currentEdges.map((edge) => {
        const selected = edge.id === selectedReaction;
        let emphasis: RouteEmphasis = 'normal';
        if (focusActive) {
          if (!focusEdgeIds.has(edge.id)) emphasis = 'dimmed';
          else emphasis = activeEdgeIds.has(edge.id) ? 'active' : 'focus';
        } else if (localActive) emphasis = activeEdgeIds.has(edge.id) ? 'active' : 'dimmed';
        const zIndex = emphasis === 'active' ? 10 : emphasis === 'focus' ? 5 : emphasis === 'dimmed' ? 0 : 1;
        const currentData = (edge.data ?? {}) as MakerRouteData;
        if (edge.selected === selected && edge.zIndex === zIndex && currentData.emphasis === emphasis)
          return edge;
        changed = true;
        return {
          ...edge,
          selected,
          zIndex,
          label: undefined,
          data: { ...currentData, emphasis },
        };
      });
      return changed ? nextEdges : currentEdges;
    });
  }, [
    doc.definition,
    focusedReactionId,
    hoveredReactionId,
    selection,
    setEdges,
    setNodes,
  ]);

  const canFocusSelectedReaction =
    selection.type === 'reaction' &&
    doc.definition.nodes.some((node) =>
      node.reactions.some(
        (reaction) =>
          reaction.id === selection.id && !!(reaction.nextNodeId || reaction.endingId),
      ),
    );

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
          edgeTypes={edgeTypes}
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
          onEdgeMouseEnter={handleEdgeMouseEnter}
          onEdgeMouseLeave={handleEdgeMouseLeave}
          onEdgeDoubleClick={handleEdgeDoubleClick}
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
          <Background color="#d8e0d6" gap={22} size={1.2} />
          <Controls showInteractive={false} />
          <MiniMap
            style={MINIMAP_STYLE}
            pannable
            zoomable
            nodeColor={minimapNodeColor}
            maskColor="rgba(247,247,242,.6)"
          />
          <Panel position="bottom-center" className="maker-canvas-tools-panel">
            <div className="maker-canvas-tools" ref={help}>
              {helpOpen && (
                <section className="maker-canvas-help" role="dialog" aria-label="Справка по полотну">
                  <div className="maker-canvas-help-heading">
                    <div className="maker-canvas-help-title">
                      <span className="maker-canvas-help-title-icon">
                        <Icon name="info" size={16} />
                      </span>
                      <div>
                        <strong>Справка по конструктору</strong>
                        <span>Полотно, связи, выделение и история изменений</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="maker-canvas-help-close"
                      onClick={() => setHelpOpen(false)}
                      aria-label="Закрыть справку"
                    >
                      <Icon name="close" size={15} />
                    </button>
                  </div>
                  <p className="maker-canvas-help-intro">
                    Реплики и финалы образуют граф разговора. Реакция пользователя задаёт переход
                    к следующему блоку.
                  </p>
                  <div className="maker-canvas-help-sections">
                    <section>
                      <h3>Полотно</h3>
                      <div className="maker-canvas-help-grid">
                        <kbd>Рамка</kbd>
                        <p>Потяните по пустому месту левой кнопкой, чтобы выделить несколько блоков.</p>
                        <kbd>Shift / Ctrl</kbd>
                        <p>Добавляет блок в текущее выделение или снимает его повторным кликом.</p>
                        <kbd>Колесо</kbd>
                        <p>Масштабирует схему. Средняя или правая кнопка мыши перемещает полотно.</p>
                      </div>
                    </section>
                    <section>
                      <h3>Связи и редактирование</h3>
                      <div className="maker-canvas-help-grid">
                        <kbd>Клик по реакции</kbd>
                        <p>Выбирает реакцию и открывает её параметры в панели свойств.</p>
                        <kbd>Точка реакции</kbd>
                        <p>Потяните её к карточке, чтобы связать реакцию с существующим блоком.</p>
                        <kbd>В пустое место</kbd>
                        <p>Завершите перетаскивание на свободном месте — можно создать новую реплику или финал.</p>
                        <kbd>Delete</kbd>
                        <p>Удаляет выбранный блок. Если выбрана реакция — удаляется реакция и её связь.</p>
                      </div>
                    </section>
                    <section>
                      <h3>Навигация по сложному графу</h3>
                      <div className="maker-canvas-help-grid">
                        <kbd>Навести</kbd>
                        <p>Подсвечивает только выбранную реакцию, её линию и карточку назначения.</p>
                        <kbd>Клик по реплике</kbd>
                        <p>Показывает все входящие и исходящие связи этой реплики.</p>
                        <kbd>Двойной клик</kbd>
                        <p>Фиксирует ветку от реакции до следующих реплик и финалов. Остальной граф приглушается.</p>
                        <kbd>Показать ветку</kbd>
                        <p>То же действие доступно снизу, когда выбрана связанная реакция. «Вся схема» возвращает полный граф.</p>
                      </div>
                    </section>
                    <section>
                      <h3>История изменений</h3>
                      <div className="maker-canvas-help-grid">
                        <kbd>Ctrl + Z</kbd>
                        <p>Отменить последнее изменение конструктора.</p>
                        <kbd>Ctrl + Y</kbd>
                        <p>Вернуть отменённое изменение.</p>
                        <kbd>Ctrl + Shift + Z</kbd>
                        <p>Альтернативная команда повтора. В полях ввода работает обычная история текста.</p>
                      </div>
                    </section>
                  </div>
                  <p className="maker-canvas-help-note">
                    «Упорядочить» перестраивает граф автоматически. Ручное расположение блоков можно
                    вернуть через Ctrl + Z.
                  </p>
                </section>
              )}
              <div className="maker-canvas-dock">
                <button type="button" onClick={onArrange} disabled={disabled}>
                  <Icon name="branch" size={15} />
                  Упорядочить
                </button>
                {(focusedReactionId || canFocusSelectedReaction) && (
                  <>
                    <span className="maker-canvas-dock-separator" aria-hidden="true" />
                    <button
                      type="button"
                      className={focusedReactionId ? 'is-active' : ''}
                      onClick={() =>
                        setFocusedReactionId(
                          focusedReactionId
                            ? null
                            : selection.type === 'reaction'
                              ? selection.id
                              : null,
                        )
                      }
                    >
                      <Icon name="branch" size={15} />
                      {focusedReactionId ? 'Вся схема' : 'Показать ветку'}
                    </button>
                  </>
                )}
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
