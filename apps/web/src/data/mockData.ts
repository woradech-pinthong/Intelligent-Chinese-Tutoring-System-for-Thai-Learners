// ข้อมูลจำลองสำหรับหน้าจอที่ยังไม่มีระบบจริงรองรับ (pre-test / ประเมินรายทักษะ / mock test / readiness)
//
// ⚠️ อ่านก่อนใช้: ตัวเลขในไฟล์นี้ "สมมติทั้งหมด" ใช้เพื่อให้เห็นหน้าตาระบบเท่านั้น
//    ห้ามเอาไปอ้างในเล่มหรือกับอาจารย์ว่าเป็นผลการทดลอง — ของจริงรอโมดูล 5 (pre-test/mock) กับโมดูล 8 (BKT)
//    หน้าที่ต่อข้อมูลจริงอยู่แล้ว (บัตรคำ / ฝึก / ทวน / ควิซท้ายหมวด) ไม่ได้ใช้ไฟล์นี้ ยังดึง Supabase + FSRS เหมือนเดิม
//
// ⚠️ ภาษาจีนในไฟล์นี้เป็นชุดตัวอย่าง — ต้องให้ทีมตรวจก่อนเอาไปใช้จริง (กฎทีม: เรื่องภาษาจีนเธอตัดสิน)

import type { IconName } from "@/components/Icon";

// ---------- 4 ทักษะ (skill) — คนละแกนกับ "หมวด" (content) ----------
// กรอบที่อาจารย์ย้ำ: Content = เรื่องที่เรียน · Skill = วิธีฝึก · Assessment = ตัววัด · Level = HSK 1/2
export type SkillId = "vocab" | "listening" | "reading" | "sentence";

export const SKILLS: { id: SkillId; label: string; icon: IconName }[] = [
  { id: "vocab", label: "คำศัพท์", icon: "cards" },
  { id: "listening", label: "การฟัง", icon: "headphone" },
  { id: "reading", label: "การอ่าน", icon: "book" },
  { id: "sentence", label: "ประโยค", icon: "puzzle" },
];

export type SkillScores = Record<SkillId, number>;

export function overall(s: SkillScores): number {
  return Math.round((s.vocab + s.listening + s.reading + s.sentence) / 4);
}

export function strongest(s: SkillScores): SkillId {
  return (Object.keys(s) as SkillId[]).reduce((a, b) => (s[b] > s[a] ? b : a));
}

export function weakest(s: SkillScores): SkillId {
  return (Object.keys(s) as SkillId[]).reduce((a, b) => (s[b] < s[a] ? b : a));
}

export function skillLabel(id: SkillId): string {
  return SKILLS.find((s) => s.id === id)!.label;
}

// ---------- ผู้เรียนสมมติ ----------
export const MOCK_USER = {
  name: "มีนา",
  daysToExam: 46,
  wordsPerDay: 10, // fix 10 คำ/วันทุกคน (มติ ON-06 v2 · 14 ส.ค.)
};

// ---------- ความแม่นรายทักษะ "ตอนนี้" (หลังเรียนไปบ้างแล้ว) ----------
export const CURRENT_SKILLS: SkillScores = { vocab: 82, listening: 65, reading: 80, sentence: 70 };

// ---------- ความคืบหน้ารายหมวด + คะแนนรายทักษะของแต่ละหมวด ----------
// key = id หมวดใน categories.ts (1-5)
export const CONTENT_MOCK: Record<
  number,
  { words: number; learned: number; done: boolean; skills: SkillScores | null }
> = {
  1: { words: 70, learned: 70, done: true, skills: { vocab: 85, listening: 72, reading: 80, sentence: 68 } },
  2: { words: 51, learned: 51, done: true, skills: { vocab: 88, listening: 70, reading: 84, sentence: 74 } },
  3: { words: 63, learned: 38, done: false, skills: { vocab: 74, listening: 58, reading: 76, sentence: 62 } },
  4: { words: 50, learned: 0, done: false, skills: null },
  5: { words: 66, learned: 0, done: false, skills: null },
};

export const TOTAL_WORDS = Object.values(CONTENT_MOCK).reduce((s, c) => s + c.words, 0);
export const LEARNED_WORDS = Object.values(CONTENT_MOCK).reduce((s, c) => s + c.learned, 0);
export const LEVEL_PCT = Math.round((LEARNED_WORDS / TOTAL_WORDS) * 100);

// ---------- คำที่ควรทบทวน (หน้าแรก) ----------
export const REVIEW_WORDS = [
  { hanzi: "学校", pinyin: "xuéxiào", th: "โรงเรียน" },
  { hanzi: "学生", pinyin: "xuéshēng", th: "นักเรียน" },
  { hanzi: "老师", pinyin: "lǎoshī", th: "ครู" },
  { hanzi: "朋友", pinyin: "péngyou", th: "เพื่อน" },
  { hanzi: "医生", pinyin: "yīshēng", th: "หมอ" },
  { hanzi: "时候", pinyin: "shíhou", th: "ตอน · เวลา" },
  { hanzi: "商店", pinyin: "shāngdiàn", th: "ร้านค้า" },
  { hanzi: "米饭", pinyin: "mǐfàn", th: "ข้าวสวย" },
];

// ---------- โครงข้อสอบแบบเลือกตอบที่ใช้ร่วมกัน (pre-test + mock test) ----------
export type MockQuestion = {
  id: number;
  skill: SkillId;
  /** หมวดที่ข้อนี้มาจาก (null = ข้อพื้นฐานเสียง ไม่ผูกหมวด) */
  content: number | null;
  /** โจทย์ที่โชว์บนจอ — ข้อฟังจะไม่โชว์ตัวหนังสือของสิ่งที่ให้ฟัง */
  prompt: string;
  /** ตัวจีนที่เป็นโจทย์ (ถ้ามี) */
  hanzi?: string;
  pinyin?: string;
  choices: string[];
  answer: number; // index ใน choices
  /** ตัวเลือกเป็นตัวอักษรจีนไหม (ใช้เลือกฟอนต์) */
  choicesAreChinese?: boolean;
};

// แบบทดสอบก่อนเรียน — 8 ข้อ ครอบ 4 ทักษะ ทักษะละ 2 ข้อ (มติ PL-08: ทุกคนทำตอนเข้าครั้งแรก)
export const PRETEST_QUESTIONS: MockQuestion[] = [
  {
    id: 1, skill: "vocab", content: 1,
    prompt: "คำนี้แปลว่าอะไร", hanzi: "你好", pinyin: "nǐ hǎo",
    choices: ["สวัสดี", "ขอบคุณ", "ลาก่อน", "ขอโทษ"], answer: 0,
  },
  {
    id: 2, skill: "vocab", content: 2,
    prompt: "คำนี้แปลว่าอะไร", hanzi: "今天", pinyin: "jīntiān",
    choices: ["เมื่อวาน", "วันนี้", "พรุ่งนี้", "ตอนเช้า"], answer: 1,
  },
  {
    id: 3, skill: "listening", content: 1,
    prompt: "คุณได้ยินคำว่าอะไร",
    choices: ["老师", "学生", "医生", "朋友"], answer: 1, choicesAreChinese: true,
  },
  {
    id: 4, skill: "listening", content: 3,
    prompt: "คุณได้ยินคำว่าอะไร",
    choices: ["水", "菜", "茶", "饭"], answer: 2, choicesAreChinese: true,
  },
  {
    id: 5, skill: "reading", content: 1,
    prompt: "ประโยคนี้แปลว่าอะไร", hanzi: "我是学生。", pinyin: "Wǒ shì xuéshēng.",
    choices: ["ฉันเป็นครู", "ฉันเป็นนักเรียน", "เขาเป็นนักเรียน", "ฉันไปโรงเรียน"], answer: 1,
  },
  {
    id: 6, skill: "reading", content: 2,
    prompt: "ประโยคนี้แปลว่าอะไร", hanzi: "现在几点？", pinyin: "Xiànzài jǐ diǎn?",
    choices: ["วันนี้วันอะไร", "ตอนนี้กี่โมง", "คุณอายุเท่าไหร่", "ราคาเท่าไหร่"], answer: 1,
  },
  {
    id: 7, skill: "sentence", content: 1,
    prompt: "เรียงคำให้เป็นประโยคที่แปลว่า “ฉันเป็นนักเรียน”",
    choices: ["我 是 学生", "学生 我 是", "是 我 学生", "我 学生 是"], answer: 0, choicesAreChinese: true,
  },
  {
    id: 8, skill: "sentence", content: 3,
    prompt: "เรียงคำให้เป็นประโยคที่แปลว่า “ฉันอยากดื่มน้ำ”",
    choices: ["我 水 喝", "喝 我 水", "我 想 喝水", "水 想 我 喝"], answer: 2, choicesAreChinese: true,
  },
];

// ข้อสอบเสมือนจริง — โครงตามที่อาจารย์ให้: 20 ข้อ 25 นาที ครอบทั้ง 5 หมวด
// ในเดโมโชว์จริง 8 ข้อ (ใช้ชุดเดียวกับ pre-test) ที่เหลือเป็นตัวเลขบนหน้าจอ
export const MOCK_TEST_META = { totalQuestions: 20, minutes: 25 };

// ---------- ผลหลังทำ mock test (สมมติ) ----------
export const READINESS: SkillScores = { vocab: 78, listening: 61, reading: 82, sentence: 70 };

// ---------- เก็บผล pre-test ไว้ในเครื่อง (ไม่มี backend) ----------
const PRETEST_KEY = "xh_pretest_v1";

export type PretestResult = { ts: number; skills: SkillScores; correct: number; total: number };

export function loadPretest(): PretestResult | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PRETEST_KEY);
    return raw ? (JSON.parse(raw) as PretestResult) : null;
  } catch {
    return null;
  }
}

export function savePretest(r: PretestResult): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PRETEST_KEY, JSON.stringify(r));
  } catch {
    /* storage เต็ม/ปิด — ข้าม */
  }
}

export function clearPretest(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PRETEST_KEY);
  } catch {
    /* ไม่เป็นไร */
  }
}

// ---------- เก็บผลข้อสอบเสมือนจริงไว้ในเครื่องเหมือนกัน ----------
const MOCKTEST_KEY = "xh_mocktest_v1";

export function loadMockTest(): PretestResult | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(MOCKTEST_KEY);
    return raw ? (JSON.parse(raw) as PretestResult) : null;
  } catch {
    return null;
  }
}

export function saveMockTest(r: PretestResult): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MOCKTEST_KEY, JSON.stringify(r));
  } catch {
    /* storage เต็ม/ปิด — ข้าม */
  }
}

/** ตรวจ pre-test จากคำตอบจริงที่กด — เฉลยตายตัว ไม่มีอัลกอริทึม (ตรงกับที่ HSK ตรวจ) */
export function gradePretest(picked: (number | null)[]): PretestResult {
  const per: Record<SkillId, { got: number; total: number }> = {
    vocab: { got: 0, total: 0 },
    listening: { got: 0, total: 0 },
    reading: { got: 0, total: 0 },
    sentence: { got: 0, total: 0 },
  };
  let correct = 0;
  PRETEST_QUESTIONS.forEach((q, i) => {
    per[q.skill].total += 1;
    if (picked[i] === q.answer) {
      per[q.skill].got += 1;
      correct += 1;
    }
  });
  const skills = Object.fromEntries(
    (Object.keys(per) as SkillId[]).map((k) => [k, per[k].total ? Math.round((per[k].got / per[k].total) * 100) : 0])
  ) as SkillScores;
  return { ts: Date.now(), skills, correct, total: PRETEST_QUESTIONS.length };
}

// ---------- เนื้อหาโมดูลพื้นฐานเสียง (Foundation) ----------
// อาจารย์ย้ำ: Foundation เป็น "หนึ่งใน content" ไม่ใช่ระดับแยก — ใครพื้นดีข้ามได้
export const FOUNDATION_STEPS: { icon: IconName; title: string; desc: string; sample?: string }[] = [
  { icon: "chat", title: "กติกาภาษาจีนใน 1 หน้า", desc: "จีนไม่มีการผันคำ ไม่มีเพศ/พจน์ — เรียงคำถูกก็สื่อสารได้", sample: "我 + 是 + 学生" },
  { icon: "speaker", title: "พินอินเทียบเสียงไทย", desc: "พยัญชนะ + สระ ทีละกลุ่ม เทียบกับเสียงที่คนไทยมีอยู่แล้ว", sample: "b p m f · a o e i u ü" },
  { icon: "chart", title: "วรรณยุกต์ 4 เสียง", desc: "เสียง 2 (ขึ้น) กับ 3 (ลง-ขึ้น) คือจุดที่คนไทยพลาดบ่อยที่สุด", sample: "mā má mǎ mà" },
  { icon: "headphone", title: "ฝึกหูแยกเสียงคู่ที่สับสน", desc: "zh/ch/sh กับ z/c/s และคู่วรรณยุกต์ 2–3 จนแยกได้ราว 80%", sample: "zhī / zī · chī / cī" },
];
