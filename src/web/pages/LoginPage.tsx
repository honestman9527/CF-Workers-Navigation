import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/primitives';
import { ApiError } from '@nav/api/client';

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
            setError(caught instanceof ApiError ? caught.message : '密码不对');
          } finally {
            setLoading(false);
          }
        }}
      >
        <p className="font-display text-[11px] tracking-[0.28em] text-seal uppercase">私人书签柜</p>
        <h1 className="mt-3 font-display text-4xl leading-none tracking-tight">进来找书签</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          整柜只属于你。输入密码后打开文件夹。
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
            placeholder="主人密码"
          />
        </div>

        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

        <Button className="mt-6 w-full" disabled={loading || !password.trim()} type="submit">
          {loading ? '开门中…' : '进入'}
        </Button>
      </form>
    </main>
  );
}
