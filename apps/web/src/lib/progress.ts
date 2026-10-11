// เก็บ "ผลการฝึก" ไว้ในเครื่อง (localStorage) — ยังไม่ต้องมีบัญชีผู้ใช้/ตาราง DB
// พอเราทำ Auth + Knowledge Tracing (M4+) ค่อยย้ายไปเก็บบน Supabase per-user
// รูปแบบข้อมูลตั้งใจให้ตรงกับสิ่งที่ BKT/FSRS ต้องใช้ (ข้อ → ถูก/ผิด → เวลา) ไว้ต่อยอดได้

import type { IconName } from "@/components/Icon";
import { SENTENCES_REVIEWED } from "@/data/sentences";

// 4 โหมดเดิม + 6 กิจกรรมใหม่ (แยกเสียง / พูดตาม / เติมคำ / จริง-เท็จ / ฟังประโยค / อ่านประโยค)
// + เดโมเนื้อหาสมมุติ (ฟังบทสนทนา / ฟังแล้วเลือกรูป / อ่านแล้วเลือกรูป / จับคู่ถาม-ตอบ)
// เลือกรูปแยก 2 โหมด (picture = ฟัง · picture_read = อ่าน) — ไม่งั้นสถิติฟังกับอ่านปนกัน
export type QuizMode =
  | "read"
  | "listen"
  | "order"
  | "match"
  | "ear"
  | "speak"
  | "fill"
  | "truefalse"
  | "listen_sentence"
  | "read_sentence"
  | "dialogue"
  | "picture"
  | "picture_read"
  | "qa";

export type Round = {
  ts: number; // เวลาที่จบรอบ (epoch ms)
  mode: QuizMode;
  total: number;
  correct: number;
};

const KEY = "jrj_practice_rounds";
const MAX = 60; // เก็บย้อนหลังพอประมาณ

// แถวที่รูปร่างไม่ใช่ Round (ข้อมูลเสีย / รูปแบบเก่า / ถูกแก้มือ) → ทิ้ง ไม่ให้หน้าผลหรือ saveRound ล้ม
const isRound = (x: unknown): x is Round => {
  const r = x as Round | null;
  return (
    !!r &&
    typeof r === "object" &&
    typeof r.mode === "string" &&
    typeof r.ts === "number" &&
    typeof r.total === "number" &&
    typeof r.correct === "number" &&
    r.total > 0
  );
};

export function loadRounds(): Round[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isRound) : [];
  } catch {
    return [];
  }
}

export function saveRound(r: Round): void {
  if (typeof window === "undefined") return;
  const rounds = [...loadRounds(), r].slice(-MAX);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(rounds));
  } catch {
    /* เต็ม/ปิด storage ก็ข้ามไป */
  }
}

export function clearRounds(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ไม่เป็นไร */
  }
}

export type ProgressSummary = {
  totalRounds: number;
  totalQuestions: number;
  totalCorrect: number;
  accuracy: number; // 0..1
  bestAccuracy: number; // ความแม่นรอบที่ดีที่สุด (0..1)
  streakDays: number; // จำนวนวันติดต่อกันที่ฝึก (นับถึงวันนี้)
};

export function summarize(rounds: Round[]): ProgressSummary {
  // รอบ/วันต่อเนื่อง นับทุกโหมด · ตัวเลขความแม่นยำนับเฉพาะโหมดที่ "นับคะแนน" และเนื้อหาผ่านตรวจแล้ว (ไม่นับพูดตาม + เดโม/ร่าง)
  const scored = rounds.filter((r) => countsInStats(r.mode));
  const totalRounds = rounds.length;
  const totalQuestions = scored.reduce((s, r) => s + r.total, 0);
  const totalCorrect = scored.reduce((s, r) => s + r.correct, 0);
  const accuracy = totalQuestions ? totalCorrect / totalQuestions : 0;
  const bestAccuracy = scored.reduce(
    (m, r) => (r.total ? Math.max(m, r.correct / r.total) : m),
    0
  );

  // นับ streak: วันที่ไม่ซ้ำที่ฝึก ต่อเนื่องจากวันนี้ย้อนหลัง
  const days = new Set(rounds.map((r) => dayKey(r.ts)));
  let streakDays = 0;
  const cur = new Date();
  // ยอมให้เริ่มนับจาก "วันนี้" หรือ "เมื่อวาน" (เผื่อยังไม่ได้ฝึกวันนี้)
  if (!days.has(dayKey(cur.getTime()))) cur.setDate(cur.getDate() - 1);
  while (days.has(dayKey(cur.getTime()))) {
    streakDays += 1;
    cur.setDate(cur.getDate() - 1);
  }

  return { totalRounds, totalQuestions, totalCorrect, accuracy, bestAccuracy, streakDays };
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// ---------- แยกความแม่นยำรายทักษะ (ใช้ในหน้า "จุดที่ควรฝึกเพิ่ม") ----------
// นับจากรอบฝึกจริงที่ผู้เรียนทำเท่านั้น — ทักษะที่ยังไม่เคยฝึก pct = null (ห้ามเดาเป็น 0%)
// หมายเหตุ: นี่คือ "ความแม่นจากการฝึก" ไม่ใช่ค่าความพร้อมสอบเชิงโมเดล (นั่นรอ BKT ในโมดูล 8)

export type SkillStat = {
  mode: QuizMode;
  label: string;
  correct: number;
  total: number;
  pct: number | null; // null = ยังไม่เคยฝึกทักษะนี้
};

export const SKILL_LABEL: Record<QuizMode, string> = {
  listen: "ฝึกฟัง",
  read: "ฝึกอ่าน",
  order: "เรียงประโยค",
  match: "เกมจับคู่",
  ear: "แยกเสียง",
  speak: "พูดตาม",
  fill: "เติมคำ",
  truefalse: "จริง/เท็จ",
  listen_sentence: "ฟังประโยค",
  read_sentence: "อ่านประโยค",
  dialogue: "ฟังบทสนทนา",
  picture: "ฟังแล้วเลือกรูป",
  picture_read: "อ่านแล้วเลือกรูป",
  qa: "จับคู่ถาม-ตอบ",
};

/** 4 ทักษะหลักที่หน้า progress โชว์เสมอ */
export const CORE_MODES: readonly QuizMode[] = ["listen", "read", "order", "match"];
/** ทุกโหมด (ลำดับที่ใช้แสดงผล) */
export const ALL_MODES: readonly QuizMode[] = [
  ...CORE_MODES,
  "ear",
  "speak",
  "fill",
  "truefalse",
  "listen_sentence",
  "read_sentence",
  "dialogue",
  "picture",
  "picture_read",
  "qa",
];

/**
 * โหมดที่ "ไม่นับคะแนน" — พูดตาม: ตัวฟังเสียงของเบราว์เซอร์เป็นแค่ตัวช่วยเช็กคร่าว ๆ (HSK 1–2 ก็ไม่สอบพูด)
 * ยังนับเป็นรอบฝึก/วันต่อเนื่อง แต่ไม่เข้าความแม่นยำรวม และไม่ถูกชี้เป็น "จุดอ่อน"
 */
export const UNSCORED_MODES: readonly QuizMode[] = ["speak"];
export function isScored(mode: QuizMode): boolean {
  return !UNSCORED_MODES.includes(mode);
}

/**
 * โหมด "เดโม" = เนื้อหายังไม่ผ่านการตรวจ (เนื้อหาสมมุติ ร่าง AI / รูปอีโมจิชั่วคราว / ชุดประโยคร่าง sentences.ts)
 * ยังโชว์แถบในหน้าผล (ติดป้ายเดโม) แต่ไม่เข้าความแม่นยำรวม และไม่ถูกชี้เป็น "จุดอ่อน" ในหน้าแรก/หน้าผล
 * ชุดประโยคผ่านตรวจแล้ว (SENTENCES_REVIEWED) → เรียงประโยค / เติมคำ / ฟังประโยค / อ่านประโยค กลับมานับเอง
 */
export const DEMO_MODES: readonly QuizMode[] = [
  "dialogue",
  "qa",
  "picture",
  "picture_read",
  ...(SENTENCES_REVIEWED ? [] : (["order", "fill", "listen_sentence", "read_sentence"] as const)),
];
export function isDemo(mode: QuizMode): boolean {
  return DEMO_MODES.includes(mode);
}
/** นับเข้าความแม่นยำรวม / เลือกเป็นจุดอ่อนได้ไหม = นับคะแนน และไม่ใช่เนื้อหาเดโม */
export function countsInStats(mode: QuizMode): boolean {
  return isScored(mode) && !isDemo(mode);
}

/** ไอคอนประจำโหมด — ใช้ร่วมกันทั้งเมนูฝึก / หน้าแรก / หน้าผล (Record ครบทุกโหมด เพิ่มโหมดใหม่แล้ว tsc เตือนเอง) */
export const MODE_ICON: Record<QuizMode, IconName> = {
  listen: "headphone",
  read: "book",
  order: "puzzle",
  match: "sparkles",
  ear: "ear",
  speak: "mic",
  fill: "pencil",
  truefalse: "check",
  listen_sentence: "speaker",
  read_sentence: "text",
  dialogue: "chat",
  picture: "image",
  picture_read: "image",
  qa: "question",
};

// ทางไปฝึกของแต่ละโหมด — ลิงก์ "จุดอ่อน" ในหน้าแรก/หน้าผลใช้ตัวนี้ตัวเดียว
// (?mode= ใช้ได้เฉพาะ 3 โหมดที่อยู่ในหน้า /practice เอง · กิจกรรมอื่นมีหน้าของตัวเอง)
const PRACTICE_HREF: Record<QuizMode, string> = {
  read: "/practice?mode=read",
  listen: "/practice?mode=listen",
  order: "/practice?mode=order",
  match: "/match",
  ear: "/practice/ear",
  speak: "/practice/speak",
  fill: "/practice/fill",
  truefalse: "/practice/truefalse",
  listen_sentence: "/practice/listen-sentence",
  read_sentence: "/practice/read-sentence",
  dialogue: "/practice/dialogue",
  picture: "/practice/picture?mode=listen",
  picture_read: "/practice/picture?mode=read",
  qa: "/practice/qa",
};

/** ลิงก์ไปฝึกโหมดนั้น · โหมดแปลก ๆ จากข้อมูลเก่าในเครื่อง → เมนูฝึก */
export function practiceHref(mode: QuizMode): string {
  return PRACTICE_HREF[mode] ?? "/practice";
}

/**
 * ค่าเริ่มต้น = 4 ทักษะหลักเสมอ + โหมดใหม่เฉพาะที่เคยฝึกแล้ว (หน้า progress เดิมไม่เปลี่ยนจนกว่าจะมีรอบจริง)
 * โหมดที่ไม่นับคะแนน (พูดตาม) ไม่อยู่ในรายการเริ่มต้น · ส่ง modes เองได้ถ้าอยากโชว์ชุดอื่น เช่น ALL_MODES
 */
export function bySkill(rounds: Round[], modes?: readonly QuizMode[]): SkillStat[] {
  const list =
    modes ?? ALL_MODES.filter((m) => isScored(m) && (CORE_MODES.includes(m) || rounds.some((r) => r.mode === m)));
  return list.map((mode) => {
    const of = rounds.filter((r) => r.mode === mode);
    const total = of.reduce((s, r) => s + r.total, 0);
    const correct = of.reduce((s, r) => s + r.correct, 0);
    return { mode, label: SKILL_LABEL[mode], correct, total, pct: total ? Math.round((correct / total) * 100) : null };
  });
}

/** ทักษะที่อ่อนสุด = ทักษะที่เคยฝึกแล้ว (นับคะแนน + ไม่ใช่เดโม) และเปอร์เซ็นต์ต่ำสุด · null = ยังไม่มีข้อมูลพอจะชี้ */
export function weakestSkill(rounds: Round[]): SkillStat | null {
  const tried = bySkill(rounds).filter((s) => countsInStats(s.mode) && s.pct !== null && s.total >= 5);
  if (tried.length === 0) return null;
  return tried.reduce((a, b) => (b.pct! < a.pct! ? b : a));
}
