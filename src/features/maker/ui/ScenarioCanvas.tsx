import { useEffect, useMemo, useRef } from 'react';
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
import type { Connection, Edge, Node, NodeProps, ReactFlowInstance } from '@xyflow/react';
import type { GraphIssue, MakerDocument } from '../model/types.ts';
import { layoutGraph } from '../model/commands.ts';
import { Icon } from '../../../components/ui/Icon.tsx';

export type Selection =
  | { type: 'node' | 'ending'; id: string }
  | { type: 'reaction'; id: string; nodeId: string }
  | { type: 'main' | 'characters' | 'stages' | 'settings' };
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
  stage?: string;
  start?: boolean;
  endingType?: string;
  error?: boolean;
  warning?: boolean;
  reactions?: { id: string; label: string; linked: boolean; selected: boolean }[];
  selectReaction?: (id: string) => void;
};
export type CardNode = Node<CardData>;

function DialogueCard({ id, data }: NodeProps<CardNode>) {
  const update = useUpdateNodeInternals();
  const signature = data.reactions?.map((r) => r.id).join(',');
  useEffect(() => {
    update(id);
  }, [id, signature, update]);
  return (
    <article className={`maker-card ${data.error ? 'has-error' : ''}`} data-testid={`block-${id}`}>
      <Handle type="target" position={Position.Top} aria-label="Вход реплики" />
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
          <div className={`maker-card-reaction ${r.selected ? 'is-selected' : ''}`} key={r.id}>
            <button
              type="button"
              className="nodrag nopan"
              onClick={(e) => {
                e.stopPropagation();
                data.selectReaction?.(r.id);
              }}
              title={r.label}
            >
              {r.label || 'Без названия'}
            </button>
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
function EndingCard({ data }: NodeProps<CardNode>) {
  return (
    <article
      className={`maker-card maker-ending maker-ending--${data.endingType} ${data.error ? 'has-error' : ''}`}
    >
      <Handle type="target" position={Position.Top} aria-label="Вход финала" />
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
function InitialViewport({ hasSavedViewport }: { hasSavedViewport: boolean }) {
  const initialized = useNodesInitialized();
  const flow = useReactFlow();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const applied = useRef(false);
  const size = useRef({ width: 0, height: 0 });
  useEffect(() => {
    if (!initialized || !width || !height) return;
    if (!applied.current) {
      applied.current = true;
      size.current = { width, height };
      if (!hasSavedViewport || window.innerWidth < 640)
        void flow.fitView({ padding: 0.15, maxZoom: 0.9 });
    } else if (size.current.width !== width || size.current.height !== height) {
      size.current = { width, height };
      void flow.fitView({ padding: 0.15, maxZoom: 0.9 });
    }
  }, [initialized, hasSavedViewport, flow, width, height]);
  return null;
}

export function ScenarioCanvas({
  doc,
  selection,
  issues,
  onSelect,
  onPositions,
  onViewport,
  onConnect,
  onDisconnect,
  onRemove,
  onBranch,
  onReady,
  onLayout,
  onAdd,
  disabled,
}: {
  doc: MakerDocument;
  selection: Selection;
  issues: GraphIssue[];
  disabled: boolean;
  onSelect: (selection: Selection) => void;
  onPositions: (positions: Record<string, { x: number; y: number }>) => void;
  onViewport: (viewport: { x: number; y: number; zoom: number }) => void;
  onConnect: (connection: Connection) => void;
  onDisconnect: (edges: Edge[]) => void;
  onRemove: (ids: string[]) => void;
  onBranch: (request: BranchRequest) => void;
  onReady: (flow: ReactFlowInstance<CardNode>) => void;
  onLayout: () => void;
  onAdd: (type: 'node' | 'ending') => void;
}) {
  const flowRef = useRef<ReactFlowInstance<CardNode> | null>(null);
  const source = useRef<{ nodeId: string; reactionId: string } | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<CardNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const defaults = useMemo(() => layoutGraph(doc.definition), [doc.definition]);
  useEffect(() => {
    const def = doc.definition;
    const flags = (id: string) => ({
      error: issues.some((i) => i.nodeId === id && i.severity === 'error'),
      warning: issues.some((i) => i.nodeId === id && i.severity === 'warning'),
    });
    // Selecting a reaction selects its edge, not the source node: Delete disconnects only that edge.
    const current = selection.type === 'node' || selection.type === 'ending' ? selection.id : '';
    const cards: CardNode[] = [
      ...def.nodes.map((node) => {
        const character = def.characters.find((c) => c.id === node.characterId);
        return {
          id: node.id,
          type: 'dialogue',
          position: doc.editor.positions[node.id] ?? defaults[node.id],
          selected: current === node.id,
          data: {
            title: node.title,
            text: node.text,
            character: character ? `${character.name} · ${character.role}` : '',
            initials: character?.initials,
            stage: def.stages.find((s) => s.id === node.stageId)?.title,
            start: def.startNodeId === node.id,
            ...flags(node.id),
            reactions: node.reactions.map((r) => ({
              id: r.id,
              label: r.label,
              linked: !!(r.nextNodeId || r.endingId),
              selected: selection.type === 'reaction' && selection.id === r.id,
            })),
            selectReaction: (id: string) => onSelect({ type: 'reaction', id, nodeId: node.id }),
          },
        };
      }),
      ...def.endings.map((e) => ({
        id: e.id,
        type: 'ending',
        position: doc.editor.positions[e.id] ?? defaults[e.id],
        selected: current === e.id,
        data: { title: e.title, text: e.description, endingType: e.type, ...flags(e.id) },
      })),
    ];
    setNodes(cards);
    setEdges(
      def.nodes.flatMap((node) =>
        node.reactions.flatMap((r): Edge[] => {
          const target = r.nextNodeId || r.endingId;
          if (!target || !cards.some((c) => c.id === target)) return [];
          return [
            {
              id: r.id,
              source: node.id,
              sourceHandle: r.id,
              target,
              type: 'bezier',
              markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
              selected: selection.type === 'reaction' && selection.id === r.id,
              label: selection.type === 'reaction' && selection.id === r.id ? r.label : undefined,
            },
          ];
        }),
      ),
    );
  }, [
    doc.definition,
    doc.editor.positions,
    defaults,
    selection,
    issues,
    onSelect,
    setNodes,
    setEdges,
  ]);

  return (
    <div className="maker-canvas" aria-label="Полотно сценария" data-testid="maker-canvas">
      <ReactFlow<CardNode>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onInit={(flow) => {
          flowRef.current = flow;
          onReady(flow);
        }}
        defaultViewport={doc.editor.viewport}
        minZoom={0.08}
        maxZoom={1.5}
        onMoveEnd={(event, viewport) => {
          if (event && !disabled) onViewport(viewport);
        }}
        onNodeClick={(_, n) =>
          onSelect({ type: n.type === 'ending' ? 'ending' : 'node', id: n.id })
        }
        onEdgeClick={(_, edge) => onSelect({ type: 'reaction', nodeId: edge.source, id: edge.id })}
        onNodeDragStop={(_, node, moved) =>
          onPositions(
            Object.fromEntries((moved.length ? moved : [node]).map((n) => [n.id, n.position])),
          )
        }
        onNodesDelete={(deleted) => onRemove(deleted.map((n) => n.id))}
        onEdgesDelete={onDisconnect}
        onConnect={onConnect}
        onConnectStart={(_, params) => {
          source.current =
            params.handleType === 'source' && params.nodeId && params.handleId
              ? { nodeId: params.nodeId, reactionId: params.handleId }
              : null;
        }}
        onConnectEnd={(event, state) => {
          const from = source.current;
          source.current = null;
          if (
            disabled ||
            state.isValid ||
            !from ||
            !(event.target instanceof Element) ||
            !event.target.closest('.react-flow__pane')
          )
            return;
          const point = 'changedTouches' in event ? event.changedTouches[0] : event;
          const screen = { x: point.clientX, y: point.clientY };
          onBranch({ ...from, position: flowRef.current!.screenToFlowPosition(screen), screen });
        }}
        nodesDraggable={!disabled}
        nodesConnectable={!disabled}
        edgesReconnectable={false}
        deleteKeyCode={disabled ? null : ['Backspace', 'Delete']}
        connectOnClick
        defaultEdgeOptions={{ style: { stroke: '#799383', strokeWidth: 2 } }}
        ariaLabelConfig={{
          'controls.zoomIn.ariaLabel': 'Приблизить',
          'controls.zoomOut.ariaLabel': 'Отдалить',
          'controls.fitView.ariaLabel': 'Показать весь граф',
          'minimap.ariaLabel': 'Мини-карта',
        }}
      >
        <InitialViewport hasSavedViewport={!!doc.editor.viewport} />
        <Background color="#d8e0d6" gap={22} size={1.2} />
        <Panel position="top-left" className="maker-canvas-tools">
          <button type="button" onClick={onLayout} disabled={disabled}>
            <Icon name="branch" size={15} />
            Автораскладка
          </button>
          <button type="button" onClick={() => onAdd('node')} disabled={disabled}>
            <Icon name="plus" size={15} />
            Реплика
          </button>
          <button type="button" onClick={() => onAdd('ending')} disabled={disabled}>
            <Icon name="flag" size={15} />
            Финал
          </button>
        </Panel>
        <Controls showInteractive={false} />
        <MiniMap
          style={{ width: 145, height: 90 }}
          pannable
          zoomable
          nodeColor={(n) => (n.type === 'ending' ? '#eed4c5' : '#d7e4d7')}
          maskColor="rgba(247,247,242,.6)"
        />
        <Panel position="top-right" className="maker-canvas-count">
          {doc.definition.nodes.length} реплик · {doc.definition.endings.length} финалов
        </Panel>
      </ReactFlow>
    </div>
  );
}
