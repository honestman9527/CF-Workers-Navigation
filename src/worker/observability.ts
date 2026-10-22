/** Error metadata excludes SQL text, parameters and user-controlled messages. */
export function safeFailure(
  error: unknown,
  depth = 0,
): { type: string; code?: string; cause?: unknown } {
  if (!(error instanceof Error)) return { type: 'UnknownError' };
  const allowed = [
    'Error',
    'TypeError',
    'RangeError',
    'SyntaxError',
    'AbortError',
    'ServiceError',
    'DrizzleQueryError',
    'AggregateError',
  ];
  const code = [
    'D1_ERROR',
    'SQLITE_CONSTRAINT',
    'SQLITE_BUSY',
    'SQLITE_ERROR',
    'SQLITE_TOOBIG',
  ].find((value) => error.message.startsWith(`${value}:`));
  return {
    type: allowed.includes(error.name) ? error.name : 'Error',
    ...(code ? { code } : {}),
    ...(depth < 4 && error.cause ? { cause: safeFailure(error.cause, depth + 1) } : {}),
  };
}

type TransferPhase =
  | 'read'
  | 'parse'
  | 'match'
  | 'categories'
  | 'insert-bookmarks'
  | 'update-bookmarks'
  | 'tags'
  | 'stream';
type Counter =
  | 'matchedRecords'
  | 'categoriesCreated'
  | 'categoriesRead'
  | 'bookmarksCreated'
  | 'bookmarksUpdated'
  | 'bookmarksSkipped'
  | 'bookmarksRead';

export function createTransferLog(
  operation: 'import' | 'export' | 'export-prepare',
  requestId: string = crypto.randomUUID(),
) {
  const started = performance.now();
  const counts: Partial<Record<Counter, number>> = {};
  let phase: TransferPhase = 'read';
  let format: 'json' | 'html' | undefined;
  let finished = false;
  const failurePhases = new Map<unknown, TransferPhase>();
  function emit(
    outcome: 'running' | 'success' | 'cancelled' | 'failed' | 'rejected',
    error?: unknown,
  ) {
    const failures =
      error === undefined
        ? undefined
        : (error instanceof AggregateError ? error.errors : [error]).map((cause, index) => ({
            role: index === 0 ? 'operation' : 'cleanup',
            phase: failurePhases.get(cause) ?? phase,
            ...safeFailure(cause),
          }));
    const entry = {
      event: 'transfer',
      requestId,
      operation,
      format,
      phase,
      outcome,
      durationMs: Math.max(0, performance.now() - started),
      counts: { ...counts },
      ...(failures ? { failures } : {}),
    };
    if (outcome === 'failed') console.error(entry);
    else console.info(entry);
  }
  return {
    failure(error: unknown) {
      failurePhases.set(error, phase);
    },
    format(value: 'json' | 'html') {
      format = value;
    },
    phase(value: TransferPhase) {
      if (finished || phase === value) return;
      phase = value;
      emit('running');
    },
    count(name: Counter, value: number) {
      if (!finished) counts[name] = (counts[name] ?? 0) + value;
    },
    finish(outcome: 'success' | 'cancelled' | 'failed' | 'rejected', error?: unknown) {
      if (finished) return;
      finished = true;
      phase = failurePhases.get(error) ?? phase;
      emit(outcome, error);
      failurePhases.clear();
    },
  };
}

export type TransferLog = ReturnType<typeof createTransferLog>;
