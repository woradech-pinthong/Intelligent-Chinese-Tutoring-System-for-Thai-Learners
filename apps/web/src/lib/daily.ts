// เป้ารายวัน (ON-06 ฉบับ 14 ส.ค.: fix 10 คำใหม่/วัน เท่ากันทุกคน) + ค่าตั้งความเร็วเสียง (m2-7)
// เก็บในเครื่องก่อนเหมือน FSRS/progress — ย้ายขึ้นบัญชีตอน m7-1

export const WORDS_PER_DAY = 10;

const KEY = "jrj_daily_learn";

type DailyRec = { date: string; ids: number[] };

function todayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function load(): DailyRec {
  const empty = { date: todayKey(), ids: [] };
  if (typeof window === "undefined") return empty;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return empty;
    const rec = JSON.parse(raw) as DailyRec;
    return rec.date === todayKey() ? rec : empty; // ข้ามวัน = เริ่มนับใหม่
  } catch {
    return empty;
  }
}

/** id คำใหม่ที่เริ่มเรียน "วันนี้" (เรียงตามลำดับที่เรียน) */
export function learnedToday(): number[] {
  return load().ids;
}

export function learnedTodayCount(): number {
  return load().ids.length;
}

/** บันทึกว่าเริ่มเรียนคำนี้วันนี้ (เรียกตอนพลิกบัตรครั้งแรกของคำ) — กันซ้ำให้เอง */
export function recordLearnedToday(id: number): void {
  if (typeof window === "undefined") return;
  const rec = load();
  if (!rec.ids.includes(id)) {
    rec.ids.push(id);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(rec));
    } catch {
      /* ข้าม */
    }
  }
}

// ---------- ความเร็วเสียง (m2-7) — เฉพาะโหมดเรียน/ฝึก · โหมดสอบห้ามปรับ (QZ-03) ----------

const RATE_KEY = "jrj_audio_rate";
let unsavedRate: number | null = null; // เขียน storage ไม่ได้ → ค่าที่กดล่าสุดยังมีผลจนปิดแท็บ

/** 1 = ปกติ · 0.75 = ช้า · อ่าน storage ไม่ได้ (ปิด site data → SecurityError) = 1 — ถูกเรียกตอน render ด้วย ห้าม throw */
export function audioRate(): number {
  if (typeof window === "undefined") return 1;
  if (unsavedRate !== null) return unsavedRate;
  try {
    return window.localStorage.getItem(RATE_KEY) === "0.75" ? 0.75 : 1;
  } catch {
    return 1;
  }
}

export function toggleAudioRate(): number {
  const next = audioRate() === 1 ? 0.75 : 1;
  try {
    window.localStorage.setItem(RATE_KEY, String(next));
    unsavedRate = null;
  } catch {
    unsavedRate = next;
  }
  return next;
}

/** เล่นเสียงด้วยความเร็วที่ผู้ใช้ตั้ง (ใช้ในหน้าเรียน/ฝึกเท่านั้น) */
export function playAtUserRate(url: string): void {
  const a = new Audio(url);
  a.playbackRate = audioRate();
  a.play().catch(() => {});
}
