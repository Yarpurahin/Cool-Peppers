export type RoutePoint = { x: number; y: number };
export type RouteRect = { id: string; x: number; y: number; width: number; height: number };

const EPSILON = 0.5;

function between(value: number, a: number, b: number) {
  return value >= Math.min(a, b) - EPSILON && value <= Math.max(a, b) + EPSILON;
}

function segmentHitsRect(a: RoutePoint, b: RoutePoint, rect: RouteRect) {
  const left = rect.x;
  const right = rect.x + rect.width;
  const top = rect.y;
  const bottom = rect.y + rect.height;

  if (Math.abs(a.y - b.y) < EPSILON) {
    if (!between(a.y, top, bottom)) return false;
    return Math.max(Math.min(a.x, b.x), left) <= Math.min(Math.max(a.x, b.x), right) + EPSILON;
  }
  if (Math.abs(a.x - b.x) < EPSILON) {
    if (!between(a.x, left, right)) return false;
    return Math.max(Math.min(a.y, b.y), top) <= Math.min(Math.max(a.y, b.y), bottom) + EPSILON;
  }
  return false;
}

export function routeIntersectsRects(points: RoutePoint[], rects: RouteRect[]) {
  for (let index = 0; index < points.length - 1; index++)
    if (rects.some((rect) => segmentHitsRect(points[index], points[index + 1], rect))) return true;
  return false;
}

function compact(points: RoutePoint[]) {
  const result: RoutePoint[] = [];
  for (const point of points) {
    const previous = result[result.length - 1];
    if (previous && Math.abs(previous.x - point.x) < EPSILON && Math.abs(previous.y - point.y) < EPSILON)
      continue;
    result.push(point);
  }
  return result.filter((point, index, values) => {
    if (index === 0 || index === values.length - 1) return true;
    const previous = values[index - 1];
    const next = values[index + 1];
    const vertical = Math.abs(previous.x - point.x) < EPSILON && Math.abs(point.x - next.x) < EPSILON;
    const horizontal = Math.abs(previous.y - point.y) < EPSILON && Math.abs(point.y - next.y) < EPSILON;
    return !vertical && !horizontal;
  });
}

export function roundedOrthogonalPath(points: RoutePoint[], radius = 10) {
  const clean = compact(points);
  if (clean.length < 2) return '';
  let path = `M ${clean[0].x} ${clean[0].y}`;
  for (let index = 1; index < clean.length - 1; index++) {
    const previous = clean[index - 1];
    const current = clean[index];
    const next = clean[index + 1];
    const incoming = Math.hypot(current.x - previous.x, current.y - previous.y);
    const outgoing = Math.hypot(next.x - current.x, next.y - current.y);
    const corner = Math.min(radius, incoming / 2, outgoing / 2);
    const before = {
      x: current.x + ((previous.x - current.x) / (incoming || 1)) * corner,
      y: current.y + ((previous.y - current.y) / (incoming || 1)) * corner,
    };
    const after = {
      x: current.x + ((next.x - current.x) / (outgoing || 1)) * corner,
      y: current.y + ((next.y - current.y) / (outgoing || 1)) * corner,
    };
    path += ` L ${before.x} ${before.y} Q ${current.x} ${current.y} ${after.x} ${after.y}`;
  }
  const last = clean[clean.length - 1];
  path += ` L ${last.x} ${last.y}`;
  return path;
}

export function routeOrthogonalEdge({
  source,
  target,
  obstacles,
  lane = 0,
}: {
  source: RoutePoint;
  target: RoutePoint;
  obstacles: RouteRect[];
  lane?: number;
}) {
  const direction = target.x >= source.x ? 1 : -1;
  const laneShift = lane * 11;
  const horizontalGap = Math.abs(target.x - source.x);
  const stub = 30 + Math.min(Math.abs(lane), 4) * 6;

  if (direction > 0 && horizontalGap > 76) {
    const minimumCorridor = source.x + stub;
    const maximumCorridor = target.x - stub;
    const centered = (source.x + target.x) / 2 + laneShift;
    const corridor = Math.max(minimumCorridor, Math.min(maximumCorridor, centered));
    const direct = compact([
      source,
      { x: corridor, y: source.y },
      { x: corridor, y: target.y },
      target,
    ]);
    if (!routeIntersectsRects(direct, obstacles)) return direct;
  }

  const allTops = obstacles.map((rect) => rect.y);
  const allBottoms = obstacles.map((rect) => rect.y + rect.height);
  const laneBand = Math.abs(lane) * 16 + (lane > 0 ? 8 : 0);
  const top = (allTops.length ? Math.min(...allTops) : Math.min(source.y, target.y)) - 46 - laneBand;
  const bottom = (allBottoms.length ? Math.max(...allBottoms) : Math.max(source.y, target.y)) + 46 + laneBand;
  const topCost = Math.abs(source.y - top) + Math.abs(target.y - top);
  const bottomCost = Math.abs(source.y - bottom) + Math.abs(target.y - bottom);
  const detourY = topCost <= bottomCost ? top : bottom;
  const sourceStubX = source.x + direction * stub;
  const targetStubX = target.x - direction * stub;

  const detour = compact([
    source,
    { x: sourceStubX, y: source.y },
    { x: sourceStubX, y: detourY },
    { x: targetStubX, y: detourY },
    { x: targetStubX, y: target.y },
    target,
  ]);

  if (!routeIntersectsRects(detour, obstacles)) return detour;

  // Manual placement can put cards into the normal source/target stubs. In that
  // rare case route around the entire graph horizontally before using the outer lane.
  const allLefts = obstacles.map((rect) => rect.x);
  const allRights = obstacles.map((rect) => rect.x + rect.width);
  const outerX = direction > 0
    ? (allRights.length ? Math.max(...allRights, source.x, target.x) : Math.max(source.x, target.x)) + 52 + Math.abs(lane) * 12
    : (allLefts.length ? Math.min(...allLefts, source.x, target.x) : Math.min(source.x, target.x)) - 52 - Math.abs(lane) * 12;
  return compact([
    source,
    { x: sourceStubX, y: source.y },
    { x: sourceStubX, y: detourY },
    { x: outerX, y: detourY },
    { x: outerX, y: target.y },
    target,
  ]);
}
