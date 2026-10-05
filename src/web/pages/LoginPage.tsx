import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@nav/api/client';
import { BrandIcon } from '@nav/features/layout/BrandIcon';

export function LoginPage({ onSubmit }: { onSubmit: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background px-6 py-16 text-foreground">
      <form
        className="w-full max-w-[22rem]"
        onSubmit={async (event) => {
          event.preventDefault();
          setLoading(true);
          setError(null);
          try {
            await onSubmit(password);
          } catch (caught) {
            setError(caught instanceof ApiError ? caught.message : '连接失败，请检查网络后重试');
          } finally {
            setLoading(false);
          }
        }}
      >
        <BrandIcon className="mb-6 size-12" />
        <h1 className="mt-3 font-display text-3xl leading-tight">登录书签柜</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          输入管理员密码，查看私有书签并整理内容。
        </p>

        <div className="mt-8 flex flex-col gap-2">
          <Label htmlFor="cabinet-password">密码</Label>
          <Input
            id="cabinet-password"
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="管理员密码"
          />
        </div>

        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

        <Button className="mt-6 w-full" disabled={loading || !password.trim()} type="submit">
          {loading ? '登录中…' : '登录'}
        </Button>
      </form>
    </main>
  );
}
