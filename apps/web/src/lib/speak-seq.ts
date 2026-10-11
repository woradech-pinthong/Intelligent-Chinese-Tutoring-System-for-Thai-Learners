"use client";

// พูดหลายบรรทัดต่อกันด้วยเสียงสังเคราะห์ของเบราว์เซอร์ (Web Speech API · จีนกลาง)
// ใช้ชั่วคราวในหน้า "ฟังบทสนทนา" (เดโม) จนกว่าจะมีไฟล์เสียงจริง (แผน C7: หฤทัยเขียนบท + edge-tts)
//
// - เลือกเสียงจีนกลาง: zh-CN ก่อน → zh-TW → zh อื่น · ไม่ใช้กวางตุ้ง (zh-HK / yue) เพราะอ่าน HSK ผิดเสียง
//   (ลำดับเสียงอยู่ที่ speak.ts ตัวเดียว — speakZh ใช้ชุดเดียวกัน)
// - สลับเสียงผู้พูด A/B เฉพาะในกลุ่มเสียง "อันดับดีสุด" (bestMandarinVoices): Android มักมี zh-CN กับ zh-TW อย่างละเสียง
//   → ถ้าวนทั้งหมด B จะได้เสียงไต้หวัน (อ่าน 休息 เป็น xiū xí ไม่ตรงพินอินที่เฉลย) · มี zh-CN เสียงเดียว = แยก A/B ด้วย pitch อย่างเดียว
// - เรียกรอบใหม่ = ตัดรอบเดิมทิ้ง · cancelSpeech() หยุดได้ทุกเมื่อ (เช่น ออกจากหน้า)
// - ไม่มี speechSynthesis / ไม่มีเสียงจีน → resolve ทันที ไม่ throw (หน้าจอเช็ก hasMandarinVoice() แล้วบอกผู้ใช้เอง)
// - ควรเรียกครั้งแรกจาก event แตะ/คลิก — iOS และ Chrome ไม่ยอมให้พูดก่อนผู้ใช้แตะหน้า

import { bestMandarinVoices, mandarinVoices, onVoicesReady } from "@/lib/speak";

export { mandarinVoices }; // คงชื่อเดิมไว้ให้คนที่ import จากไฟล์นี้

export type SpeakSeqOptions = {
  /** ความเร็ว (1 = ปกติของเสียงนั้น) */
  rate?: number;
  /** เว้นช่วงระหว่างบรรทัด (ms) */
  gapMs?: number;
  /** เรียกตอนเริ่มพูดบรรทัด i — ใช้ไฮไลต์ว่าใครกำลังพูด */
  onLine?: (i: number) => void;
  /** pitch รายบรรทัด 0–2 (ค่าเริ่ม 1) — ให้ผู้พูด A/B เสียงต่างกัน */
  pitches?: number[];
  /** ใช้เสียงจีน "คนที่เท่าไร" ต่อบรรทัด ถ้าเครื่องมีหลายเสียงอันดับดีสุด (วนตามจำนวนที่มี · มีเสียงเดียว = ใช้เสียงนั้นทุกบรรทัด) */
  voiceSlots?: number[];
};

let generation = 0; // เริ่มรอบใหม่/ยกเลิกทุกครั้ง +1 → callback ของรอบเก่าเงียบไป
let settle: (() => void) | null = null; // resolve ของรอบที่กำลังเล่น
let gapTimer: ReturnType<typeof setTimeout> | undefined;
const alive = new Set<SpeechSynthesisUtterance>(); // Chrome เก็บขยะ utterance ที่ไม่มีใครอ้าง แล้ว onend ไม่ยิง → ถือไว้จนพูดจบ

function synth(): SpeechSynthesis | null {
  return typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
}

export function hasMandarinVoice(): boolean {
  return mandarinVoices().length > 0;
}

/**
 * แจ้งว่าเครื่องมีเสียงจีนกลางไหม (ห่อ onVoicesReady ของ speak.ts)
 * เจอ = แจ้ง true ทันที · ไม่เจอ = รอ waitMs ก่อนค่อยแจ้ง false (Chrome โหลดรายชื่อเสียงทีหลัง/ทยอยมา)
 * คืนฟังก์ชันเลิกฟัง — ใช้เป็น cleanup ของ useEffect ได้ตรง ๆ
 */
export function onMandarinReady(cb: (ok: boolean) => void, waitMs = 2500): () => void {
  if (!synth()) {
    queueMicrotask(() => cb(false));
    return () => {};
  }
  const off = onVoicesReady(() => {
    if (hasMandarinVoice()) cb(true);
  });
  const t = setTimeout(() => cb(hasMandarinVoice()), waitMs);
  return () => {
    off();
    clearTimeout(t);
  };
}

/** พูดทีละบรรทัดต่อกัน · resolve เมื่อบรรทัดสุดท้ายพูดจบ (หรือถูกยกเลิก / เครื่องพูดไม่ได้) */
export function speakSequence(texts: string[], opts: SpeakSeqOptions = {}): Promise<void> {
  const s = synth();
  const busy = !!s && (s.speaking || s.pending);
  cancelSpeech(); // ตัดรอบเดิม (resolve promise ของรอบเดิมให้ด้วย)
  const voices = bestMandarinVoices();
  if (!s || voices.length === 0 || texts.length === 0) return Promise.resolve();

  const my = generation;
  const { rate = 1, gapMs = 450, onLine, pitches = [], voiceSlots = [] } = opts;

  return new Promise<void>((resolve) => {
    settle = resolve;

    const say = (i: number) => {
      if (my !== generation) return;
      const text = texts[i];
      const u = new SpeechSynthesisUtterance(text);
      const voice = voices[(voiceSlots[i] ?? 0) % voices.length];
      u.voice = voice;
      u.lang = voice.lang;
      u.rate = rate;
      u.pitch = pitches[i] ?? 1;

      let over = false;
      const end = () => {
        if (over) return;
        over = true;
        clearTimeout(watchdog);
        alive.delete(u);
        if (my !== generation) return;
        if (i + 1 < texts.length) {
          gapTimer = setTimeout(() => say(i + 1), gapMs);
        } else {
          settle = null;
          resolve();
        }
      };
      u.onend = end;
      u.onerror = end;
      // กันค้าง: บางเครื่องไม่ยิง onend เลย → ถือว่าจบเมื่อเกินเวลาที่ควรพูดเสร็จ (เผื่อไว้เยอะ)
      const watchdog = setTimeout(end, 2500 + (text.length * 700) / Math.max(rate, 0.1));
      alive.add(u);
      onLine?.(i);
      s.speak(u);
    };

    // มีเสียงค้างอยู่ (เพิ่ง cancel): Chrome บางเครื่องกลืน speak() ที่ตามหลัง cancel() ทันที → เว้นนิดนึง
    // ไม่มีเสียงค้าง: พูดทันที ให้ยังอยู่ใน event แตะของผู้ใช้ (iOS ต้องการแบบนี้)
    if (busy) gapTimer = setTimeout(() => say(0), 120);
    else say(0);
  });
}

/** หยุดเสียงทันที · promise ของรอบที่ค้างอยู่จะ resolve */
export function cancelSpeech(): void {
  generation++;
  clearTimeout(gapTimer);
  const s = synth();
  if (s && (s.speaking || s.pending)) s.cancel();
  alive.clear();
  const done = settle;
  settle = null;
  done?.();
}
