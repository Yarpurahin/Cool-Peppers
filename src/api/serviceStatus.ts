export type ServiceProblem = { id: number; kind: 'connection' | 'server' };
let problem: ServiceProblem | null = null;
let sequence = 0;
const listeners = new Set<() => void>();
export const getServiceProblem = () => problem;
export const subscribeServiceProblem = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function reportServiceProblem(kind: ServiceProblem['kind']) {
  problem = { id: ++sequence, kind };
  listeners.forEach((listener) => listener());
}
export function dismissServiceProblem(id: number) {
  if (problem?.id !== id) return;
  problem = null;
  listeners.forEach((listener) => listener());
}
