/** 启动台（/launch）URL 搜索状态：解析与序列化。纯函数，便于单元测试。 */

export type LauncherSearch = {
  /** 搜索关键词（省略 = 未搜索，展示常用网站）。 */
  q?: string;
  /** 手动选择的搜索引擎 id（省略 = 跟随服务端默认）。 */
  engine?: string;
};

/** 把 URL search 对象（qss decode 后的原始值）解析为 LauncherSearch。非法值忽略。 */
export function parseLauncherSearch(search: Record<string, unknown>): LauncherSearch {
  const result: LauncherSearch = {};
  const q = typeof search.q === 'string' ? search.q.trim() : undefined;
  if (q) result.q = q;
  const engine = typeof search.engine === 'string' ? search.engine.trim() : undefined;
  if (engine) result.engine = engine;
  return result;
}
