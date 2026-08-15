import { useState, useEffect } from "react";
import type { ClockDensity } from "@ext/shared/config";

type ClockProps = {
  density?: ClockDensity;
};

export default function Clock({ density = "full" }: ClockProps) {
  const [time, setTime] = useState(new Date());
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (density === "hidden") return;
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, [density]);

  if (density === "hidden") return null;

  const hours = time.getHours();
  const minutes = time.getMinutes().toString().padStart(2, "0");
  const seconds = time.getSeconds().toString().padStart(2, "0");
  const formattedHours = hours.toString().padStart(2, "0");

  const weekDays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  const weekDayStr = weekDays[time.getDay()];

  const year = time.getFullYear();
  const month = (time.getMonth() + 1).toString().padStart(2, "0");
  const date = time.getDate().toString().padStart(2, "0");
  const dateStr = `${year}年${month}月${date}日`;

  const getGreeting = (h: number) => {
    if (h >= 5 && h < 9) return "早上好，新的一天开始啦 🌅";
    if (h >= 9 && h < 11.5) return "上午好，保持专注，高效工作 ☀️";
    if (h >= 11.5 && h < 13) return "中午好，记得按时吃午饭 🍱";
    if (h >= 13 && h < 18) return "下午好，喝杯咖啡提提神吧 ☕";
    if (h >= 18 && h < 23) return "晚上好，忙碌了一天，好好放松一下吧 🌙";
    return "夜深了，注意休息，晚安 💤";
  };

  const compact = density === "compact";

  return (
    <div
      className="animate-newtab-enter relative flex flex-col items-center select-none"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {!compact && (
        <div
          className={`absolute -inset-x-8 -inset-y-4 rounded-3xl bg-[rgba(13,148,136,0.06)] opacity-0 blur-2xl transition-all duration-700 pointer-events-none ${
            isHovered ? "opacity-100 scale-105" : ""
          }`}
        />
      )}

      {!compact && (
        <span className="mb-2 text-xs font-medium tracking-widest text-[var(--text-secondary)] uppercase opacity-75">
          {getGreeting(hours)}
        </span>
      )}

      <div className="relative flex items-baseline font-semibold tracking-tight text-[var(--text-primary)] drop-shadow-[0_4px_16px_rgba(0,0,0,0.4)]">
        <span
          className={`${
            compact ? "text-4xl md:text-5xl" : "text-6xl md:text-7xl"
          } font-bold bg-gradient-to-br from-white via-white to-neutral-300 bg-clip-text text-transparent tabular-nums`}
        >
          {formattedHours}
        </span>

        <span
          className={`${
            compact ? "text-3xl md:text-4xl px-1" : "text-5xl md:text-6xl px-1.5"
          } text-[var(--cobalt)] animate-pulse font-light select-none`}
        >
          :
        </span>

        <span
          className={`${
            compact ? "text-4xl md:text-5xl" : "text-6xl md:text-7xl"
          } font-bold bg-gradient-to-br from-white via-white to-neutral-300 bg-clip-text text-transparent tabular-nums`}
        >
          {minutes}
        </span>

        {!compact && (
          <div
            className={`flex items-center overflow-hidden transition-all duration-300 ease-out select-none ${
              isHovered ? "w-10 md:w-12 ml-2 opacity-80" : "w-0 opacity-0"
            }`}
          >
            <span className="text-3xl md:text-4xl text-[var(--cobalt)] font-medium tabular-nums self-end pb-1 md:pb-1.5">
              {seconds}
            </span>
          </div>
        )}
      </div>

      <span
        className={`${
          compact ? "mt-1.5 text-xs opacity-75" : "mt-3 text-sm opacity-90"
        } font-medium tracking-wider text-[var(--text-secondary)]`}
      >
        {compact ? (
          <>
            {month}/{date}
            <span className="mx-1.5 opacity-40">·</span>
            <span className="text-[var(--cobalt)] font-normal">{weekDayStr}</span>
          </>
        ) : (
          <>
            {dateStr}
            <span className="mx-2 opacity-40">|</span>
            <span className="text-[var(--cobalt)] font-normal">{weekDayStr}</span>
          </>
        )}
      </span>
    </div>
  );
}
