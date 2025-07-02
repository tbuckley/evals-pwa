import type { AnnotationLogEntry, Clock } from '$lib/types';
import { writable, type Writable } from 'svelte/store';

export interface Clocked<T> {
  clock: Clock;
  value: T;
}
export interface CellAnnotation {
  notes?: Clocked<string>;
}

function clockLatest<T>(
  a: Clocked<T> | undefined,
  b: Clocked<T> | undefined,
): Clocked<T> | undefined {
  if (a === undefined) {
    return b;
  }
  if (b === undefined) {
    return a;
  }
  if (a.clock > b.clock) {
    return a;
  }
  return b;
}

export class AnnotationManager {
  private cellAnnotations = new Map<string, Writable<CellAnnotation>>();
  hasNotes = false;

  constructor(
    annotations: AnnotationLogEntry[],
    private log: (message: AnnotationLogEntry) => Promise<void>,
  ) {
    for (const annotation of annotations) {
      this.#applyAnnotation(annotation);
    }
  }

  #applyAnnotation(annotation: AnnotationLogEntry) {
    if (annotation.type === 'set-cell-notes') {
      const cellAnnotation = this.getCellAnnotation(annotation.index);
      cellAnnotation.update((ca) => ({
        ...ca,
        notes: clockLatest(ca.notes, {
          clock: annotation.clock,
          value: annotation.notes,
        }),
      }));
      this.hasNotes = true;
    } else if ((annotation as { type: string }).type === 'unknown') {
      // Ignore unknown annotations
    } else {
      throw new Error(`Unknown annotation type: ${(annotation as { type: string }).type}`);
    }
  }

  async #addAnnotation(annotation: AnnotationLogEntry) {
    this.#applyAnnotation(annotation);
    await this.log(annotation);
  }

  getCellAnnotation(index: [number, number]) {
    const key = keyForCell(index);
    let annotation = this.cellAnnotations.get(key);
    if (!annotation) {
      annotation = writable({
        notes: undefined,
      });
      this.cellAnnotations.set(key, annotation);
    }
    return annotation;
  }

  async setCellNotes(index: [number, number], notes: string) {
    await this.#addAnnotation({
      type: 'set-cell-notes',
      clock: Date.now(),
      index,
      notes,
    });
  }
}

function keyForCell(index: [number, number]) {
  return `${index[0]}-${index[1]}`;
}
