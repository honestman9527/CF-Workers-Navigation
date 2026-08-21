/** 认证上下文契约：通过 TanStack Router context 注入各路由与页面。 */
export type AuthContext = {
  authed: boolean;
  login: (password: string) => Promise<void>;
  logout: () => Promise<void>;
};
