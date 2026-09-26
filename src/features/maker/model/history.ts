/** One focused text edit is a step. Commands (no group) always start a new step. */
export class DraftHistory<T> {
  past: T[] = [];
  future: T[] = [];
  private group: object | null = null;

  breakGroup() {
    this.group = null;
  }
  clear() {
    this.past = [];
    this.future = [];
    this.breakGroup();
  }
  record(previous: T, group: object | null = null) {
    if (!group || group !== this.group) this.past = [...this.past.slice(-49), previous];
    this.future = [];
    this.group = group;
  }
  travel(direction: 'undo' | 'redo', current: T): T | undefined {
    this.breakGroup();
    const from = direction === 'undo' ? this.past : this.future;
    const to = direction === 'undo' ? this.future : this.past;
    const value = from.pop();
    if (value !== undefined) to.push(current);
    return value;
  }
}
