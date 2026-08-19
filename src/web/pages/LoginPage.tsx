import { Bookmark } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
        <div className="mb-6 grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground">
          <Bookmark className="size-6" />
        </div>
        <p className="font-display text-[11px] tracking-[0.28em] text-seal uppercase">
          personal index
        </p>
        <h1 className="mt-3 font-display text-4xl leading-none tracking-tight">打开你的书签柜</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          只保留真正有用的网络入口，输入密码开始整理。
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
