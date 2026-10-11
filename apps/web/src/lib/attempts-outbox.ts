// Outbox คำตอบรายข้อ (ฝั่ง client) — พักใน localStorage ก่อน รอ sync ขึ้นตาราง attempts
// OF-01: Supabase = ตัวจริง · sync ต้อง idempotent → client_attempt_id สร้างที่นี่ server INSERT ... ON CONFLICT DO NOTHING
// รูปแถว = public.attempts ใน supabase/migrations/20261007000005_schema_v1.sql
//   ตัดช่องที่ server เติมเอง: id, user_id, session_id, item_id, skill_id (client ส่ง skill_code → server map เป็น skill_id)
// ทุกกิจกรรมเรียก logAttempt() ทุกครั้งที่ผู้เรียนตอบ 1 ข้อ — นอกเหนือจาก saveRound() สรุปท้ายรอบที่ UI เดิมยังใช้
// ยังไม่มี sync จริง (รอ m7-1 ล็อกอิน + POST /attempts/batch) — ระหว่างนี้ outboxStats() ใช้โชว์สถิติในเครื่องได้
// ⚠️ แถวที่มี mock_ref = ตอบเนื้อหาที่ยังไม่ผ่านการตรวจ/ยังไม่อยู่ใน DB → ตอน sync ต้องข้าม ห้ามส่งขึ้น server (CG-02)
//    · เนื้อหาสมมุติ (dialogue-3 / qa-7) · ประโยคร่างของ sentences.ts (draft-sentence-4 — จนกว่า SENTENCES_REVIEWED)

/**
 * ตัวสร้างข้อ — ตรงกับ CHECK ของ attempts.generator ใน 0005 ยกเว้น 7 ค่าท้าย
 * ⚠️ fill_blank / true_false / listen_sentence / read_sentence / listen_dialogue / pick_image / qa_match เป็นค่า **ใหม่** ยังไม่อยู่ใน CHECK ของ DB
 *    → migration 0007 ต้องขยาย CHECK (attempts.generator) ให้รับค่าเหล่านี้ก่อนเริ่ม sync ไม่งั้นทั้ง batch ล้ม
 * variant = string อิสระบอกรูปแบบย่อยของ generator เช่น listen_mc4 → 'meaning' (ตัวเลือกเป็นคำแปล) | 'hanzi' (ตัวเลือกเป็นตัวจีน)
 */
export type Generator =
  | "flashcard"
  | "listen_mc4"
  | "read_mc4"
  | "match"
  | "order"
  | "ear_game"
  | "speak_along"
  | "fill_blank" // ใหม่ — รอ 0007
  | "true_false" // ใหม่ — รอ 0007
  | "listen_sentence" // ใหม่ — รอ 0007
  | "read_sentence" // ใหม่ — รอ 0007
  | "listen_dialogue" // ใหม่ — รอ 0007 · ฟังบทสนทนา (เดโมเนื้อหาสมมุติ)
  | "pick_image" // ใหม่ — รอ 0007 · ฟัง/อ่านแล้วเลือกรูป
  | "qa_match"; // ใหม่ — รอ 0007 · จับคู่คำถาม↔คำตอบ (เดโมเนื้อหาสมมุติ)

/** ชื่อไทยของตัวสร้างข้อ — โชว์สถิติในหน้า "ผล" (Record ครบทุกค่า · เพิ่ม generator ใหม่แล้ว tsc เตือนให้ตั้งชื่อ) */
export const GENERATOR_LABEL_TH: Record<Generator, string> = {
  flashcard: "บัตรคำ",
  listen_mc4: "ฝึกฟัง",
  read_mc4: "ฝึกอ่าน",
  match: "เกมจับคู่",
  order: "เรียงประโยค",
  ear_game: "แยกเสียง",
  speak_along: "พูดตาม",
  fill_blank: "เติมคำ",
  true_false: "จริง/เท็จ",
  listen_sentence: "ฟังประโยค จริง/เท็จ",
  read_sentence: "อ่านประโยค",
  listen_dialogue: "ฟังบทสนทนา",
  pick_image: "เลือกรูป",
  qa_match: "จับคู่ถาม-ตอบ",
};

/** graded = ตรวจถูก/ผิดได้ · exposure = แค่เห็น/เปิดบัตร (is_correct null) · asr_hint = ผล ASR เบื้องต้นของ speak_along (ห้ามตัดสินถูก/ผิด · BKT ไม่อ่าน) */
export type EventType = "graded" | "exposure" | "asr_hint";

/** บริบทที่ตอบ — DB รองรับ pretest/posttest/mock ด้วย แต่ฝั่งเว็บวันนี้ใช้ 3 ค่านี้ */
export type AttemptContext = "practice" | "review" | "quiz";

export type AttemptEvent = {
  client_attempt_id: string; // UUID สร้างฝั่ง client — กันส่งซ้ำ
  generator: Generator;
  variant?: string;
  event_type: EventType;
  word_id?: number; // อ้างคำ (words.id) — ต้องมีอย่างน้อย word_id หรือ sentence_id
  sentence_id?: number; // อ้างประโยค (SENTENCES[].id ระหว่างยังไม่ขึ้น DB)
  mock_ref?: string; // id เนื้อหาที่ยังไม่ผ่านตรวจ เช่น 'dialogue-3' / 'qa-7' / 'draft-sentence-4' — มีช่องนี้ = sync ต้องข้ามแถวนี้
  skill_code?: string; // KC ณ เวลาตอบ — รหัสจาก src/data/thaiL1.ts (TL-… / VOCAB-C… / SKILL-…)
  answer?: unknown; // สิ่งที่ผู้เรียนตอบ (เก็บเป็น jsonb) เช่น { picked_id: 12 } หรือ { order: ["我", "爱", "你"] }
  is_correct: boolean | null; // graded = true/false · exposure/asr_hint = null
  answered_at: string; // ISO 8601
  time_spent_ms?: number;
  context: AttemptContext;
  app_version: string;
};

/** สิ่งที่หน้ากิจกรรมต้องส่ง — ที่เหลือ logAttempt เติมเอง */
export type AttemptInput = Omit<AttemptEvent, "client_attempt_id" | "answered_at" | "app_version">;

const KEY = "xh_attempts_outbox_v1";
const DROPPED_KEY = "xh_attempts_outbox_dropped"; // จำนวนแถวที่ต้องทิ้งไปก่อนได้ sync (ให้หน้าผลเตือนได้ — ข้อมูลหายต้องมองเห็น)
// เต็มแล้วทิ้งตัวเก่าสุด · ทุกคำตอบ parse + stringify ทั้งก้อน → ~3,000 แถว (≈1 MB) ยังลื่นบนมือถือรุ่นเล็ก
// และห่างโควตา localStorage ~5 MB ของ Safari พอสมควร (รวม FSRS ด้วย) — ถ้าต้องเก็บมากกว่านี้ ย้ายไป IndexedDB (Dexie)
const MAX = 3000;

const APP_BUILD = "0.1.0"; // bump เมื่อปล่อยเวอร์ชันใหม่ (ให้ตรง package.json)
export const APP_VERSION = `web-${APP_BUILD}`;

/** บันทึก 1 คำตอบลง outbox แล้วคืน event ที่เติมครบ · ฝั่ง server (SSR) = คืน event แต่ไม่เก็บ */
export function logAttempt(e: AttemptInput): AttemptEvent {
  const ev: AttemptEvent = {
    ...e,
    client_attempt_id: newId(),
    answered_at: new Date().toISOString(),
    app_version: APP_VERSION,
  };
  if (process.env.NODE_ENV !== "production") warnIfInconsistent(ev);
  if (typeof window === "undefined") return ev;
  const box = loadOutbox();
  box.push(ev);
  if (box.length > MAX) {
    noteDropped(box.length - MAX);
    write(box.slice(box.length - MAX));
  } else write(box);
  return ev;
}

// แถวที่รูปร่างไม่ใช่ AttemptEvent (ข้อมูลเสีย / ถูกแก้มือ / รูปแบบในอนาคต) → ทิ้ง ไม่ให้สถิติหรือ dropFromOutbox ล้ม
const isEvent = (x: unknown): x is AttemptEvent => {
  const e = x as AttemptEvent | null;
  return !!e && typeof e === "object" && typeof e.generator === "string" && typeof e.client_attempt_id === "string";
};

export function loadOutbox(): AttemptEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isEvent) : [];
  } catch {
    return [];
  }
}

export function clearOutbox(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
    window.localStorage.removeItem(DROPPED_KEY);
  } catch {
    /* ไม่เป็นไร */
  }
}

/** จำนวนคำตอบที่ถูกทิ้งไปก่อนได้ sync (outbox เต็ม / พื้นที่เครื่องเต็ม) — 0 = ไม่มีข้อมูลหาย */
export function outboxDropped(): number {
  if (typeof window === "undefined") return 0;
  try {
    return Number(window.localStorage.getItem(DROPPED_KEY)) || 0;
  } catch {
    return 0;
  }
}

/** ลบแถวที่ server รับแล้ว (ใช้ตอน flush → POST /attempts/batch สำเร็จ) */
export function dropFromOutbox(ids: string[]): void {
  if (typeof window === "undefined" || ids.length === 0) return;
  const gone = new Set(ids);
  write(loadOutbox().filter((e) => !gone.has(e.client_attempt_id)));
}

export type OutboxBucket = { n: number; graded: number; correct: number };
export type OutboxStats = {
  total: number;
  byGenerator: Record<string, OutboxBucket>;
  bySkill: Record<string, OutboxBucket>;
  dropped: number; // คำตอบที่ถูกทิ้งไปก่อนได้ sync (outboxDropped)
};

/**
 * สถิติในเครื่องจาก outbox — n = ทุก event · graded = เฉพาะที่ตรวจถูก/ผิด · correct = graded ที่ถูก
 * (ความแม่น = correct / graded — อย่าหารด้วย n เพราะ n รวม exposure/asr_hint)
 */
export function outboxStats(events: AttemptEvent[] = loadOutbox()): OutboxStats {
  const byGenerator: Record<string, OutboxBucket> = {};
  const bySkill: Record<string, OutboxBucket> = {};
  const bump = (rec: Record<string, OutboxBucket>, key: string, e: AttemptEvent) => {
    const b = rec[key] ?? (rec[key] = { n: 0, graded: 0, correct: 0 });
    b.n += 1;
    if (e.event_type === "graded") {
      b.graded += 1;
      if (e.is_correct === true) b.correct += 1;
    }
  };
  for (const e of events) {
    bump(byGenerator, e.generator, e);
    if (e.skill_code) bump(bySkill, e.skill_code, e);
  }
  return { total: events.length, byGenerator, bySkill, dropped: outboxDropped() };
}

// ---------- ภายใน ----------

let storageWarned = false;

function write(box: AttemptEvent[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(box));
  } catch {
    // เต็ม/ปิด storage — ลองเก็บครึ่งหลังพอ ไม่ได้ก็ปล่อย (ห้ามทำหน้ากิจกรรมล้ม) · แต่ต้องเตือนว่าข้อมูลหาย
    const keep = box.slice(Math.floor(box.length / 2));
    try {
      window.localStorage.setItem(KEY, JSON.stringify(keep));
      noteDropped(box.length - keep.length);
      console.warn(`[attempts-outbox] พื้นที่เก็บเต็ม — ทิ้งคำตอบเก่าสุด ${box.length - keep.length} แถว (ยังไม่ได้ sync)`);
    } catch {
      if (!storageWarned) console.warn("[attempts-outbox] เขียน localStorage ไม่ได้ (ปิด/เต็ม) — คำตอบไม่ได้ถูกเก็บ");
      storageWarned = true; // เตือนครั้งเดียวพอ (โหมดส่วนตัวจะพังทุกครั้งที่ตอบ)
    }
  }
}

/** บวกจำนวนแถวที่ต้องทิ้ง (เก็บแยก key เล็ก ๆ — ให้หน้าผลโชว์คำเตือนได้) */
function noteDropped(n: number): void {
  if (n <= 0) return;
  try {
    window.localStorage.setItem(DROPPED_KEY, String(outboxDropped() + n));
  } catch {
    /* เขียนไม่ได้ก็ปล่อย */
  }
}

function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  // ไม่ใช่ secure context (http ที่ไม่ใช่ localhost) ไม่มี randomUUID → สุ่มเอง
  const rand = () => Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${rand()}-${rand()}-${rand()}`;
}

/** เตือนตอน dev ถ้าแถวขัดกับ CHECK ของ DB (attempts_graded_consistency / attempts_has_target) — ไม่ throw */
function warnIfInconsistent(e: AttemptEvent): void {
  const problems: string[] = [];
  // แถวเดโม (mock_ref) ไม่มีคำ/ประโยคใน DB ให้อ้าง — ยกเว้นได้เพราะไม่ถูก sync อยู่แล้ว
  if (e.word_id == null && e.sentence_id == null && !e.mock_ref) problems.push("ต้องมี word_id หรือ sentence_id (หรือ mock_ref ถ้าเป็นเนื้อหาสมมุติ)");
  if (e.event_type === "graded" && typeof e.is_correct !== "boolean") problems.push("graded ต้องมี is_correct true/false");
  if (e.event_type !== "graded" && e.is_correct !== null) problems.push(`${e.event_type} ต้อง is_correct = null`);
  if (e.event_type === "graded" && e.generator === "speak_along") problems.push("speak_along ห้าม graded (ใช้ asr_hint)");
  if (e.event_type === "asr_hint" && e.generator !== "speak_along") problems.push("asr_hint ใช้กับ speak_along เท่านั้น");
  if (problems.length) console.warn("[attempts-outbox] แถวไม่ตรงกฎ DB:", problems.join(" · "), e);
}
