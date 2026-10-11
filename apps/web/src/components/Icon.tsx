// ชุดไอคอนเส้น (line icons) สไตล์เดียวกันทั้งแอป — แทนอีโมจิระบบที่ดูไม่โปร
// viewBox 24 · stroke currentColor · เปลี่ยนสีด้วย text-* / ขนาดด้วย h-* w-*
// zero dependency

import type { SVGProps } from "react";

export type IconName =
  | "home"
  | "cards"
  | "book"
  | "headphone"
  | "puzzle"
  | "pencil"
  | "chart"
  | "user"
  | "refresh"
  | "speaker"
  | "flask"
  | "check"
  | "x"
  | "sparkles"
  | "target"
  | "bulb"
  | "arrowRight"
  | "arrowLeft"
  | "play"
  | "flame"
  | "chat"
  | "clock"
  | "bowl"
  | "briefcase"
  | "compass"
  | "star"
  | "ship"
  | "lock"
  | "ear"
  | "mic"
  | "image"
  | "text"
  | "question";

const PATHS: Record<IconName, React.ReactNode> = {
  // ⭐ ดาวนำทาง — สัญลักษณ์หลักของ 星航 (ส่ง fill="currentColor" เข้ามาได้ถ้าอยากได้แบบทึบ)
  star: <path d="M12 3.2 14.4 9.6 20.8 12 14.4 14.4 12 20.8 9.6 14.4 3.2 12 9.6 9.6Z" />,
  // ⛵ เรือ — ใช้แทน "ระดับถัดไป / การเดินทาง"
  ship: (
    <>
      <path d="M12 4.5 6.5 13h11L12 4.5Z" />
      <path d="M12 13v4" />
      <path d="M4 17h16l-1.6 2.6a2 2 0 0 1-1.7 1H7.3a2 2 0 0 1-1.7-1L4 17Z" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2.5" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  // 👂 หู — เกมแยกเสียง
  ear: (
    <>
      <path d="M7 9a5.5 5.5 0 0 1 11 0c0 4.5-5 5.2-5 9a3 3 0 0 1-6 0" />
      <path d="M15 9a2.5 2.5 0 0 0-5 0c0 1.2 1.6 1.6 1.6 3s-1 2-2.1 2" />
    </>
  ),
  // 🎤 ไมค์ — พูดตาม
  mic: (
    <>
      <rect x="9" y="3.5" width="6" height="10.5" rx="3" />
      <path d="M6 11.5a6 6 0 0 0 12 0" />
      <path d="M12 17.5v3M9 20.5h6" />
    </>
  ),
  // 🖼 รูป — ฟัง/อ่านแล้วเลือกรูป
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <circle cx="9" cy="9.5" r="1.5" />
      <path d="m20.5 15.5-4.3-4.3a1.2 1.2 0 0 0-1.7 0L5.5 19.5" />
    </>
  ),
  // ข้อความหลายบรรทัด — อ่านประโยค
  text: <path d="M4 6h16M4 10h12M4 14h16M4 18h9" />,
  // บับเบิลคำถาม — จับคู่ถาม-ตอบ
  question: (
    <>
      <path d="M21 11.5a8.38 8.38 0 0 1-9 8.35 8.5 8.5 0 0 1-3.4-.7L3 21l1.85-5.6A8.38 8.38 0 0 1 12 3.15a8.38 8.38 0 0 1 9 8.35Z" />
      <path d="M9.9 9.4a2.2 2.2 0 0 1 4.2.8c0 1.4-2.1 1.8-2.1 3" />
      <path d="M12 15.8h.01" />
    </>
  ),
  chat: (
    <>
      <path d="M21 11.5a8.38 8.38 0 0 1-9 8.35 8.5 8.5 0 0 1-3.4-.7L3 21l1.85-5.6A8.38 8.38 0 0 1 12 3.15a8.38 8.38 0 0 1 9 8.35Z" />
      <path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  bowl: (
    <>
      <path d="M4 12h16a8 8 0 0 1-5 7.4V21H9v-1.6A8 8 0 0 1 4 12Z" />
      <path d="M9 8.5c0-1.5 1-1.5 1-3M13.5 8.5c0-1.5 1-1.5 1-3" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3" y="7.5" width="18" height="12.5" rx="2" />
      <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3 13h18" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
    </>
  ),
  home: (
    <>
      <path d="M4 11.4 12 4l8 7.4" />
      <path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" />
    </>
  ),
  cards: (
    <>
      <rect x="3" y="7" width="13" height="13" rx="2.5" />
      <path d="M7 4.5h11a1.5 1.5 0 0 1 1.5 1.5v11" />
    </>
  ),
  book: (
    <>
      <path d="M12 6c-1.5-1.2-3.6-2-6-2H4v14h2c2.4 0 4.5.8 6 2 1.5-1.2 3.6-2 6-2h2V4h-2c-2.4 0-4.5.8-6 2Z" />
      <path d="M12 6v14" />
    </>
  ),
  headphone: (
    <>
      <path d="M5 13a7 7 0 0 1 14 0" />
      <path d="M5 13v3a2 2 0 0 0 2 2h.5v-7H7a2 2 0 0 0-2 2Z" />
      <path d="M19 13v3a2 2 0 0 1-2 2h-.5v-7h.5a2 2 0 0 1 2 2Z" />
    </>
  ),
  puzzle: (
    <path d="M10.5 4a1.8 1.8 0 0 1 3.6 0c0 .5-.2 1 0 1.2.2.2.6.2 1.1.2H17a1 1 0 0 1 1 1v1.8c0 .5 0 .9.2 1.1.2.2.7 0 1.2 0a1.8 1.8 0 0 1 0 3.6c-.5 0-1-.2-1.2 0-.2.2-.2.6-.2 1.1V17a1 1 0 0 1-1 1h-1.8c-.5 0-.9 0-1.1.2-.2.2 0 .7 0 1.2a1.8 1.8 0 0 1-3.6 0c0-.5.2-1 0-1.2-.2-.2-.6-.2-1.1-.2H7a1 1 0 0 1-1-1v-1.8c0-.5 0-.9-.2-1.1-.2-.2-.7 0-1.2 0a1.8 1.8 0 0 1 0-3.6c.5 0 1 .2 1.2 0C6 9.9 6 9.5 6 9V7a1 1 0 0 1 1-1h1.8c.5 0 .9 0 1.1-.2.2-.2 0-.7 0-1.2Z" />
  ),
  pencil: (
    <>
      <path d="M4 20h4L18.6 9.4a2 2 0 0 0-2.8-2.8L5 17.2 4 20Z" />
      <path d="M14.5 8.5l1.8 1.8" />
    </>
  ),
  chart: (
    <>
      <path d="M4 4v16h16" />
      <path d="M8 16v-4" />
      <path d="M12.5 16v-7" />
      <path d="M17 16v-3" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 19.5a7 7 0 0 1 14 0" />
    </>
  ),
  refresh: (
    <>
      <path d="M19.5 9A7.5 7.5 0 0 0 6 6.3L4 8.2" />
      <path d="M4 4v4.2h4.2" />
      <path d="M4.5 15a7.5 7.5 0 0 0 13.5 2.7l2-1.9" />
      <path d="M20 20v-4.2h-4.2" />
    </>
  ),
  speaker: (
    <>
      <path d="M4 9.5v5h3.2L12 18.5v-13L7.2 9.5H4Z" />
      <path d="M15.5 9.5a4 4 0 0 1 0 5" />
      <path d="M18 7a7 7 0 0 1 0 10" />
    </>
  ),
  flask: (
    <>
      <path d="M9 3h6" />
      <path d="M10 3v6.2L4.8 17a2 2 0 0 0 1.7 3h11a2 2 0 0 0 1.7-3L14 9.2V3" />
      <path d="M7.4 14.5h9.2" />
    </>
  ),
  check: <path d="M5 12.5l4.2 4.2L19 7" />,
  x: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  sparkles: (
    <>
      <path d="M12 3.5l1.7 4 4 1.7-4 1.7L12 15l-1.7-4-4-1.7 4-1.7L12 3.5Z" />
      <path d="M18.5 14l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8.8-1.9Z" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  bulb: (
    <>
      <path d="M12 3a6 6 0 0 0-3.8 10.6c.6.5.8 1 .8 1.9h6c0-.9.2-1.4.8-1.9A6 6 0 0 0 12 3Z" />
      <path d="M9.5 18.5h5" />
      <path d="M10.5 21h3" />
    </>
  ),
  arrowRight: (
    <>
      <path d="M4.5 12h15" />
      <path d="M13 5.5l6.5 6.5-6.5 6.5" />
    </>
  ),
  arrowLeft: (
    <>
      <path d="M19.5 12h-15" />
      <path d="M11 5.5 4.5 12 11 18.5" />
    </>
  ),
  play: <path d="M7 5.5v13l11-6.5-11-6.5Z" fill="currentColor" stroke="none" />,
  flame: (
    <path d="M12 3c1.2 3.2-2.2 4.4-2.2 7.4a2.2 2.2 0 0 0 4.4 0c0-.4-.1-.8-.3-1.1 1.7 1 2.6 2.7 2.6 4.4a4.5 4.5 0 0 1-9 0C7.5 9.8 10.8 8 12 3Z" />
  ),
};

export function Icon({
  name,
  className,
  strokeWidth = 1.75,
  ...rest
}: { name: IconName; className?: string; strokeWidth?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
