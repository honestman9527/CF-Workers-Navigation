/**
 * API 错误契约 —— 与 worker `src/worker/errors.ts` 的 ErrorCode 对齐。
 *
 * 三端共享同一错误码集合，任意一端新增错误码时其余两端可感知。
 */

export type ErrorCode =
  | 'validation_error'
  | 'unauthorized'
  | 'not_found'
  | 'conflict'
  | 'bad_gateway'
  | 'too_large'
  | 'internal_error';

/** worker 返回的错误响应体结构。 */
export type ApiErrorShape = {
  error?: {
    code?: string;
    message?: string;
  };
};
