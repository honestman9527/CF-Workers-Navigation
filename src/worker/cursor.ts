import { ServiceError } from './services/errors';

type ListCursor = { createdAt: string; id: number };
type SearchCursor = { rank: number; id: number };

function encode(value: object): string {
  return btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function decode<T>(raw: string): T {
  try {
    const padded =
      raw.replaceAll('-', '+').replaceAll('_', '/') + '==='.slice((raw.length + 3) % 4);
    return JSON.parse(atob(padded)) as T;
  } catch {
    throw new ServiceError(400, 'validation_error', 'Invalid cursor');
  }
}

export function encodeListCursor(value: ListCursor): string {
  return encode(value);
}

export function decodeListCursor(raw: string | undefined): ListCursor | null {
  if (!raw) return null;
  const value = decode<Partial<ListCursor>>(raw);
  const id = value.id;
  if (
    typeof value.createdAt !== 'string' ||
    typeof id !== 'number' ||
    !Number.isInteger(id) ||
    id <= 0
  ) {
    throw new ServiceError(400, 'validation_error', 'Invalid cursor');
  }
  return { createdAt: value.createdAt, id };
}

export function encodeSearchCursor(value: SearchCursor): string {
  return encode(value);
}

export function decodeSearchCursor(raw: string | undefined): SearchCursor | null {
  if (!raw) return null;
  const value = decode<Partial<SearchCursor>>(raw);
  const id = value.id;
  if (
    typeof value.rank !== 'number' ||
    !Number.isFinite(value.rank) ||
    typeof id !== 'number' ||
    !Number.isInteger(id)
  ) {
    throw new ServiceError(400, 'validation_error', 'Invalid cursor');
  }
  return { rank: value.rank, id };
}
