/**
 * 扩展配置类型与默认值。
 * 类型放在这里、默认值也放在这里，storage.ts / api client / UI 共用。
 *
 * 仅保留 popup / options / background 需要的字段：
 * API 连接信息与界面主题。新标签页相关字段（搜索、背景、行为）已随其移除。
 */

import { faviconFor, domainOf } from "@shared/search";

export { faviconFor, domainOf };

/** 扩展持久化配置（写入 chrome.storage.sync）。 */
export type ExtConfig = {
  /** 后端 API 基地址，如 https://nav.example.com。 */
  apiBaseUrl: string;
  /** 管理员密码（Bearer token）。 */
  adminToken: string;
  /** 界面主题。 */
  theme: "light" | "dark";
};

export const DEFAULT_CONFIG: ExtConfig = {
  apiBaseUrl: "",
  adminToken: "",
  theme: "dark",
};