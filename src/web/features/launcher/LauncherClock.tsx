import { useEffect, useState } from 'react';

function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 6) return '夜深了，注意休息';
  if (hour < 12) return '早上好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

/** 使用设备本地时间；恢复可见时重新对齐分钟边界。 */
export function LauncherClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      clearTimeout(timer);
      const current = new Date();
      setNow(current);
      if (document.visibilityState !== 'hidden') {
        timer = setTimeout(update, 60_000 - (current.getTime() % 60_000));
      }
    };
    update();
    document.addEventListener('visibilitychange', update);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);

  const time = now.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const date = now.toLocaleDateString('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  return (
    <section
      className="animate-launcher-enter flex flex-col items-center gap-3 text-center"
      aria-label="本地时间"
    >
      <h1 className="sr-only">启动台</h1>
      <time
        dateTime={now.toISOString()}
        className="font-mono text-6xl leading-none font-medium tracking-tight tabular-nums sm:text-7xl"
      >
        {time}
      </time>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span>{date}</span>
        <span>{greeting(now)}</span>
      </div>
    </section>
  );
}
