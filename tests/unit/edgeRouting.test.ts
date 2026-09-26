import assert from 'node:assert/strict';
import test from 'node:test';
import { routeIntersectsRects, routeOrthogonalEdge } from '../../src/features/maker/model/edgeRouting.ts';

test('routes a long edge around an intermediate card', () => {
  const obstacles = [{ id: 'middle', x: 400, y: 80, width: 292, height: 300 }];
  const points = routeOrthogonalEdge({
    source: { x: 300, y: 200 },
    target: { x: 900, y: 240 },
    obstacles,
  });
  assert.equal(routeIntersectsRects(points, obstacles), false);
  assert.ok(points.some((point) => point.y < 80 || point.y > 380));
});

test('keeps a short adjacent edge inside the column corridor', () => {
  const obstacles = [{ id: 'other', x: 80, y: 500, width: 292, height: 250 }];
  const points = routeOrthogonalEdge({
    source: { x: 372, y: 180 },
    target: { x: 510, y: 240 },
    obstacles,
    lane: 1,
  });
  assert.equal(routeIntersectsRects(points, obstacles), false);
  assert.ok(points.length <= 4);
});
