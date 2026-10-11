// ตัวช่วยฝึกพูดตาม (speak_along) — ฟังผู้เรียนด้วย Web Speech API ของเบราว์เซอร์ แล้วเทียบกับคำเป้าแบบ rule-based (ไม่ใช้ LLM)
// สเปค: docs/08_สเปค-พัฒนา/ทักษะพูด-วิเคราะห์ทางเลือก.md §3
// ⚠️ เป็นแค่ "ตัวช่วยเช็กเบื้องต้น" ไม่ใช่คะแนนออกเสียง — ASR มี language model มักแก้เสียงที่เพี้ยนนิดหน่อยให้เป็นคำที่ถูกเอง
//    → ห้ามใช้ confidence ตัดสิน · ผล "ไม่ชัด" ห้ามบอกว่าผิด (ASR อาจพลาดเอง) · log เป็น asr_hint (BKT ไม่อ่าน)
// ความเป็นส่วนตัว: ไม่อัด/ไม่เก็บไฟล์เสียง เก็บแค่ข้อความที่ระบบได้ยิน (ตัวเบราว์เซอร์ส่งเสียงไปถอดที่บริการของมันเอง)

import { classifyPair, markTone, toNumbered, type PairClass, type Syllable, type Tone } from "@/lib/thai-l1-rules";
import type { KcCode } from "@/data/thaiL1"; // type อย่างเดียว — คลัง Thai-L1 (JSON ~140 KB) โหลดทีหลังเฉพาะตอนต้องใช้ป้าย KC
import { kcTip } from "@/data/kc-tips"; // คำอธิบายสำหรับผู้เรียน (ไฟล์เล็ก ไม่มี JSON)

// ---------- ① Web Speech API — ประกาศ type เองแบบน้อยที่สุด (lib.dom ของ TS ไม่มี SpeechRecognition ครบทุกเวอร์ชัน) ----------

type RecAlternative = { transcript: string };
type RecResult = { length: number; isFinal?: boolean; [i: number]: RecAlternative };
type RecEvent = { results: { length: number; [i: number]: RecResult } };
type Recognizer = {
  lang: string;
  maxAlternatives: number;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: RecEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  onaudiostart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type RecognizerCtor = new () => Recognizer;

function recognizerCtor(): RecognizerCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** ok = ใช้ได้ · no-api = เบราว์เซอร์ไม่มีตัวฟังเสียง (Firefox / in-app browser บางตัว) · insecure = ไม่ใช่ https → ใช้ไมค์ไม่ได้ */
export type AsrSupport = "ok" | "no-api" | "insecure";

export function asrSupport(): AsrSupport {
  if (!recognizerCtor()) return "no-api";
  return window.isSecureContext ? "ok" : "insecure";
}

/** เหตุที่ฟังไม่สำเร็จ — หน้าจอแปลงเป็นข้อความไทยเอง */
export type ListenFail = "no-speech" | "timeout" | "denied" | "no-mic" | "network" | "unsupported" | "aborted" | "error";
export type ListenOutcome = { ok: true; alternatives: string[] } | { ok: false; reason: ListenFail };
export type ListenSession = {
  result: Promise<ListenOutcome>;
  stop: () => void; // ผู้เรียนพูดจบ → ให้สรุปผลจากที่ได้ยิน
  abort: () => void; // ทิ้งเลย (เปลี่ยนข้อ / ออกจากหน้า)
};

const FAIL_OF: Record<string, ListenFail> = {
  "no-speech": "no-speech",
  "not-allowed": "denied",
  "service-not-allowed": "denied",
  "audio-capture": "no-mic",
  network: "network",
  "language-not-supported": "unsupported",
  aborted: "aborted",
};

/**
 * ฟัง 1 ครั้ง: zh-CN · 5 alternatives · ไม่ต่อเนื่อง · ปิดไมค์เองเมื่อได้ผล / error / ครบ timeoutMs
 * timeoutMs นับจากตอนไมค์เริ่มรับเสียงจริง (ไม่กินเวลาที่ผู้ใช้อ่านหน้าต่างขออนุญาตไมค์ครั้งแรก) · กันค้างด้วยเพดาน +20 วินาที
 * ⚠️ ต้องเรียกจาก event กดปุ่มของผู้ใช้เท่านั้น (เบราว์เซอร์บังคับ)
 */
export function listenOnce(timeoutMs = 8000): ListenSession {
  const Ctor = recognizerCtor();
  if (!Ctor) return { result: Promise.resolve({ ok: false, reason: "unsupported" }), stop: () => {}, abort: () => {} };

  const rec = new Ctor();
  rec.lang = "zh-CN";
  rec.maxAlternatives = 5;
  rec.interimResults = false;
  rec.continuous = false;

  let resolve: (o: ListenOutcome) => void = () => {};
  const result = new Promise<ListenOutcome>((r) => (resolve = r));
  let settled = false;
  let timedOut = false;
  let latest: string[] = []; // Safari บางรุ่นส่งผลกลางทางมาก่อนแม้ตั้ง interimResults = false → เก็บอันล่าสุดไว้
  const timers: ReturnType<typeof setTimeout>[] = [];

  const finish = (fail?: ListenFail) => {
    if (settled) return;
    settled = true;
    timers.forEach(clearTimeout);
    rec.onresult = null;
    rec.onerror = null;
    rec.onend = null;
    rec.onstart = null;
    rec.onaudiostart = null;
    try {
      rec.abort(); // ปิดไมค์ทันที
    } catch {
      /* จบไปแล้ว */
    }
    const useLatest = latest.length > 0 && fail !== "aborted";
    resolve(useLatest ? { ok: true, alternatives: latest } : { ok: false, reason: fail ?? "no-speech" });
  };

  rec.onresult = (e) => {
    const segs: RecResult[] = [];
    for (let i = 0; i < e.results.length; i++) segs.push(e.results[i]);
    const alts: string[] = [];
    const add = (t: string | undefined) => {
      const s = (t ?? "").trim();
      if (s && !alts.includes(s)) alts.push(s);
    };
    if (segs.length > 1) add(segs.map((r) => r[0]?.transcript ?? "").join("")); // หลายช่วง → ต่อเป็นประโยคเต็มไว้ตัวแรก
    for (const r of segs) for (let j = 0; j < r.length; j++) add(r[j]?.transcript);
    if (alts.length) latest = alts;
    if (segs[segs.length - 1]?.isFinal !== false) finish();
  };
  rec.onerror = (e) => finish(FAIL_OF[e.error] ?? "error");
  rec.onend = () => finish(timedOut ? "timeout" : "no-speech");

  let armed = false;
  const arm = () => {
    if (armed || settled) return;
    armed = true;
    timers.push(
      setTimeout(() => {
        timedOut = true;
        try {
          rec.stop(); // ครบเวลา → ให้โอกาสส่งผลที่ได้ยินมาแล้ว
        } catch {
          /* ไม่เป็นไร */
        }
        timers.push(setTimeout(() => finish("timeout"), 1500)); // เบราว์เซอร์ไม่ยิง onend → ตัดจบเอง
      }, timeoutMs)
    );
  };
  rec.onaudiostart = arm;
  rec.onstart = arm;
  timers.push(setTimeout(() => finish("timeout"), timeoutMs + 20000)); // เพดานกันค้าง (เบราว์เซอร์ไม่ยิง event ใด ๆ เลย)

  try {
    rec.start();
  } catch {
    finish("error");
  }

  return {
    result,
    stop: () => {
      try {
        rec.stop();
      } catch {
        finish("error");
      }
    },
    abort: () => finish("aborted"),
  };
}

/** โหลด pinyin-pro ล่วงหน้าตอนเริ่มฟัง (ไม่ต้องรอ) — ผลมาถึงจะได้เทียบทันที */
export function preloadPinyin(): void {
  import("pinyin-pro").catch(() => {});
}

// ---------- ② เทียบสิ่งที่ได้ยินกับคำเป้า (ลำดับกฎตามสเปค §3 ข้อ 4) ----------

export type Verdict = "match" | "tone" | "retro" | "unclear";

export type SpeakCheck = {
  verdict: Verdict;
  heard: string; // คำที่ระบบได้ยิน (ตัวจีน · ถ้าไม่มีตัวจีนเลย = ข้อความดิบ · '' = ไม่ได้อะไร)
  heardPinyin: string; // พินอินมี tone mark ของ heard ('' = ไม่มี)
  kc?: KcCode; // จุดผิดคนไทยที่เจอ (เฉพาะ tone/retro ที่อยู่ในคลัง)
  kc_label_th?: string; // ป้ายสั้นของ KC (SKILL_LABEL_TH)
  title_th: string; // ผลหลัก เช่น "วรรณยุกต์เพี้ยน: เป้าเสียง 3 แต่ได้ยินเสียง 2"
  tip_th?: string; // วิธีแก้ 1 ประโยค: มี KC = kcTip (ร่าง รอหฤทัย) · ไม่มี = กฎสั้น (TONE_HOW / คำแนะนำของ classifyPair)
  tip_draft?: boolean; // true = tip มาจากคำอธิบายฉบับร่าง (kc-tips) → หน้าจอติดป้าย "คำอธิบายฉบับร่าง"
};

type Heard = { base: string; tone: Tone };
type PinyinFn = (typeof import("pinyin-pro"))["pinyin"];

const TONE_NAME: Record<Tone, string> = { 1: "เสียง 1", 2: "เสียง 2", 3: "เสียง 3", 4: "เสียง 4", 5: "เสียงเบา" };
const TONE_HOW: Record<Tone, string> = {
  1: "เสียง 1 สูงเรียบ ลากระดับเดียว",
  2: "เสียง 2 ขึ้นจากกลางไปสูง",
  3: "เสียง 3 ลงต่ำก่อนแล้วค่อยขึ้น",
  4: "เสียง 4 ตกจากสูงลงต่ำ สั้น ๆ คม ๆ",
  5: "เสียงเบา พูดสั้น ๆ เบา ๆ",
};
const RETROFLEX = new Set(["zh", "ch", "sh", "r"]);
const DIGIT = "零一二三四五六七八九";
const NOT_HAN = /[^〇㐀-鿿豈-﫿]/g; // เก็บแค่ตัวจีน (CJK + 〇)
const UNCLEAR = "ยังฟังไม่ชัด ลองอีกครั้ง";

const byDigit = (d: string) => d.replace(/\d/g, (c) => DIGIT[Number(c)]);

/** "4" → 四 · "10" → 十 · "25" → 二十五 · "100" → 一百 (คำ HSK1 มี 零 一…十 百 千 两) · แปลกกว่านั้นอ่านทีละหลัก */
function readNumber(d: string): string {
  const n = Number(d);
  if (n < 10) return DIGIT[n];
  if (n < 100) return (n >= 20 ? DIGIT[Math.floor(n / 10)] : "") + "十" + (n % 10 ? DIGIT[n % 10] : "");
  if (n < 1000 && n % 100 === 0) return DIGIT[n / 100] + "百";
  if (n < 10000 && n % 1000 === 0) return DIGIT[n / 1000] + "千";
  return byDigit(d);
}

/** 1 alternative → ตัวจีนล้วนที่เป็นไปได้ (ASR ชอบส่งเลขอารบิก "4" แทน 四 · ตัดวรรคตอน/อักษรละติน) */
function hanForms(raw: string): string[] {
  const s = raw.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const forms = /\d/.test(s)
    ? [s.replace(/\d+/g, readNumber), s.replace(/\d+/g, byDigit), s.replace(/\d+/g, (d) => (d === "2" ? "两" : readNumber(d)))]
    : [s];
  return forms.map((f) => f.replace(NOT_HAN, "")).filter(Boolean);
}

// ข้อมูลเราเขียน 儿 ท้ายคำเป็นพยางค์ "r" แยก (哪儿 = "nǎ r") — ASR มักได้ยินแค่ 哪 → ตัดออกทั้งสองฝั่งก่อนเทียบ
const isErhua = (s: Syllable) => s.base === "r" && s.initial === "";
const dropErhua = (han: string) => han.slice(0, 1) + han.slice(1).replace(/儿/g, "");

/** 'ma3' → { ma, 3 } · เสียงเบา 'ma0' → 5 */
function parseNum(tok: string): Heard | null {
  const m = /^([a-zü]+)([0-5]?)$/.exec(tok.toLowerCase());
  return m ? { base: m[1], tone: (Number(m[2]) || 5) as Tone } : null;
}

/** การอ่านที่เป็นไปได้ของตัวจีน — ตัวเดียวเอาทุกเสียง (多音字) · ไม่แปลงเสียง 一/不 เพราะคลังคำเราเขียนวรรณยุกต์เดิม */
function readingsOf(py: PinyinFn, han: string): Heard[][] {
  const opts = { toneType: "num", toneSandhi: false, type: "array" } as const;
  const raw = [...han].length === 1 ? py(han, { ...opts, multiple: true }).map((r) => [r]) : [py(han, opts)];
  const out: Heard[][] = [];
  for (const syls of raw) {
    const parsed = syls.map(parseNum);
    if (parsed.length && parsed.every((p): p is Heard => p !== null)) out.push(parsed);
  }
  return out;
}

const marked = (h: Heard[]) => h.map((x) => markTone(x.base, x.tone)).join(" ");

/**
 * เทียบ alternatives ทั้งหมดของ ASR กับคำเป้า (rule-based):
 * (ก) มีตัวที่เป็นคำเป้าทั้งคำ / พินอิน+วรรณยุกต์ตรง (คำพ้องเสียง) → match
 * (ข) ต่างแค่วรรณยุกต์ 1 พยางค์ → tone · (ค) ต่างแค่เสียงต้นม้วนลิ้น/ไม่ม้วน → retro (ตาม classifyPair)
 * (ง) นอกนั้น → unclear "ยังฟังไม่ชัด" — ไม่ตัดสินว่าผิด
 */
export async function checkSpeech(target: { hanzi: string; pinyin: string }, alternatives: string[]): Promise<SpeakCheck> {
  const tAll = toNumbered(target.pinyin);
  const erhua = tAll.some(isErhua);
  const tSyl = tAll.filter((s) => !isErhua(s));
  const core = (han: string) => (erhua ? dropErhua(han) : han);
  const tHan = core(target.hanzi.trim());
  const heardList = [...new Set(alternatives.flatMap(hanForms))]; // เรียงตามอันดับที่ ASR ให้

  let py: PinyinFn | null = null;
  try {
    py = (await import("pinyin-pro")).pinyin;
  } catch {
    /* โหลดไม่ได้ (เน็ตหลุด) → เทียบได้แค่ตัวอักษร */
  }
  const pinyinOf = (han: string) => (py ? marked(readingsOf(py, han)[0] ?? []) : "");

  // (ก) ได้ยินเป็นคำเป้า (หรือมีคำเป้าอยู่ครบทั้งคำ เช่น 老师好 → 老师)
  const exact = heardList.find((h) => core(h).includes(tHan));
  if (exact) {
    const heardPinyin = exact === target.hanzi ? target.pinyin : pinyinOf(exact);
    return { verdict: "match", heard: exact, heardPinyin, title_th: "ระบบได้ยินเป็นคำนี้" };
  }

  const fallback = heardList[0] ?? alternatives[0]?.trim() ?? "";
  if (!py) return { verdict: "unclear", heard: fallback, heardPinyin: "", title_th: UNCLEAR };

  const n = tSyl.length;
  const tStr = marked(tSyl);
  // เสียงเบาในคำเป้า: ข้อความ→พินอินบอกไม่ได้ว่าพูดเบาไหม → ไม่เทียบวรรณยุกต์พยางค์นั้น
  const hStr = (w: Heard[]) => w.map((x, i) => markTone(x.base, tSyl[i]?.tone === 5 ? 5 : x.tone)).join(" ");
  // ASR แถมคำมา (เช่น 是吧) → ลองทุกช่วงที่ยาวเท่าคำเป้า (ไม่เกิน +3 พยางค์ กันประโยคยาวบังเอิญตรง)
  const windows = (h: Heard[]) =>
    h.length > n && h.length <= n + 3 ? Array.from({ length: h.length - n + 1 }, (_, i) => h.slice(i, i + n)) : [h];

  let near: SpeakCheck | null = null;
  let first: { heard: string; heardPinyin: string } | null = null;
  for (const h of heardList) {
    for (const r of readingsOf(py, core(h))) {
      const heardPinyin = marked(r) + (core(h) !== h ? " r" : ""); // โชว์ 儿 ที่ตัดออกตอนเทียบกลับมาเป็น "r" แบบคลังคำ
      if (!first) first = { heard: h, heardPinyin };
      for (const w of windows(r)) {
        const c = classifyPair(tStr, hStr(w), "speak");
        if (c.kind === "match") return { verdict: "match", heard: h, heardPinyin, title_th: "ระบบได้ยินเป็นเสียงเดียวกับคำนี้" };
        // เป้า 3+3 แต่ได้ยิน 2+3 = ออกเสียงตามกฎเปลี่ยนเสียงถูกแล้ว ไม่ใช่เพี้ยน
        if (c.kc === "TL-TONE-T3SANDHI") return { verdict: "match", heard: h, heardPinyin, title_th: "ออกเสียง 3+3 → 2+3 ได้ถูกต้อง" };
        if (!near && (c.kind === "tone" || c.kind === "retro")) near = nearMiss(c, tSyl, w, h, heardPinyin);
      }
    }
  }
  if (near) return withKcText(near);
  return { verdict: "unclear", heard: first?.heard ?? fallback, heardPinyin: first?.heardPinyin ?? "", title_th: UNCLEAR };
}

/**
 * เติมป้ายสั้นของ KC — import ตอนนี้ คลัง JSON จะไม่ติดไปกับ bundle แรกของหน้า
 * ไม่ใช้ teaching_th ของคลัง (เขียนให้ครูอ่าน มีเศษร่าง) — วิธีแก้มาจาก kcTip ใน nearMiss แล้ว
 */
async function withKcText(c: SpeakCheck): Promise<SpeakCheck> {
  const kc = c.kc;
  if (!kc) return c;
  try {
    const { SKILL_LABEL_TH } = await import("@/data/thaiL1");
    return { ...c, kc_label_th: SKILL_LABEL_TH[kc] };
  } catch {
    return c; // โหลดคลังไม่ได้ → ไม่มีป้าย แต่ยังมีวิธีแก้
  }
}

function nearMiss(c: PairClass, t: Syllable[], w: Heard[], heard: string, heardPinyin: string): SpeakCheck {
  const i = c.syllable ?? 0;
  const where = t.length > 1 ? ` (พยางค์ที่ ${i + 1})` : "";
  let title_th: string;
  if (c.kind === "tone") {
    title_th = `วรรณยุกต์เพี้ยน: เป้า${TONE_NAME[t[i].tone]} แต่ได้ยิน${TONE_NAME[w[i].tone]}${where}`;
  } else {
    const ti = t[i].initial;
    const hi = toNumbered(w[i].base)[0]?.initial ?? "";
    title_th = `${RETROFLEX.has(ti) ? "ไม่ม้วนลิ้น" : "ม้วนลิ้นเกิน"}: เป้า ${ti} ได้ยิน ${hi}${where}`;
  }
  // วิธีแก้: มี KC → คำอธิบายสำหรับผู้เรียน (ร่าง) · ไม่มี → วรรณยุกต์เป้าแบบสั้น / คำแนะนำม้วนลิ้นจาก classifyPair
  const draft = kcTip(c.kc);
  const fallback = c.kind === "tone" ? `ฟังต้นแบบอีกครั้ง — ${TONE_HOW[t[i].tone]}` : c.hint_th;
  return {
    verdict: c.kind === "tone" ? "tone" : "retro",
    heard,
    heardPinyin,
    kc: c.kc,
    title_th,
    tip_th: draft ?? fallback,
    tip_draft: !!draft,
  };
}
