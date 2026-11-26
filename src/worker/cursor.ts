import { ServiceError } from './services/errors';

type ListCursor = { createdAt: string; id: number };
type ManualListCursor = { sortOrder: number; id: number };
type SearchCursor = { rank: number; id: number };

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });

function encode(value: object): string {
  const bytes = textEncoder.encode(JSON.stringify(value));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function decode(raw: string): Record<string, unknown> {
  try {
    const padded =
      raw.replaceAll('-', '+').replaceAll('_', '/') + '==='.slice((raw.length + 3) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    const value: unknown = JSON.parse(textDecoder.decode(bytes));
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new ServiceError(400, 'validation_error', 'Invalid cursor');
  }
}

export function encodeListCursor(value: ListCursor): string {
  return encode(value);
}

export function decodeListCursor(raw: string | undefined): ListCursor | null {
  if (!raw) return null;
  const value = decode(raw);
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

export function encodeManualListCursor(value: ManualListCursor): string {
  return encode(value);
}

export function decodeManualListCursor(raw: string | undefined): ManualListCursor | null {
  if (!raw) return null;
  const value = decode(raw);
  const sortOrder = value.sortOrder;
  const id = value.id;
  if (
    typeof sortOrder !== 'number' ||
    !Number.isInteger(sortOrder) ||
    sortOrder < 0 ||
    typeof id !== 'number' ||
    !Number.isInteger(id) ||
    id <= 0
  ) {
    throw new ServiceError(400, 'validation_error', 'Invalid cursor');
  }
  return { sortOrder, id };
}

export function encodeSearchCursor(value: SearchCursor): string {
  return encode(value);
}

export function decodeSearchCursor(raw: string | undefined): SearchCursor | null {
  if (!raw) return null;
  const value = decode(raw);
  const id = value.id;
  if (
    typeof value.rank !== 'number' ||
    !Number.isFinite(value.rank) ||
    typeof id !== 'number' ||
    !Number.isInteger(id) ||
    id <= 0
  ) {
    throw new ServiceError(400, 'validation_error', 'Invalid cursor');
  }
  return { rank: value.rank, id };
}
