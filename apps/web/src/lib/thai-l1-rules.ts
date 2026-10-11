// กฎ Thai-L1 ระดับพินอิน — ต่อยอดจาก pinyin-tone.ts (toneOf / splitSyllables)
// ใช้ 3 ที่: ① จัดประเภท "เสียงที่เปิด vs ที่ผู้เรียนเลือก/พูด" → KC (ear_game / pick_pinyin / speak_along)
//          ② หาคู่เสียงใกล้ (minimal pair) จากคลังคำจริง  ③ เลือกคำฝึกพูดตาม + ปั้นพินอินตัวลวง
// ข้อมูลพินอินของเรา: tone mark บนสระ · เว้นวรรคต่อพยางค์ · บางคำขึ้นต้นตัวใหญ่ (Zhōng guó) → แปลงเป็นตัวเล็กก่อนเสมอ

import { toneOf, splitSyllables } from "@/lib/pinyin-tone";
import type { KcCode } from "@/data/thaiL1";

export type Tone = 1 | 2 | 3 | 4 | 5;
export type Syllable = {
  base: string; // พยางค์ไม่มีวรรณยุกต์ เช่น "shi" (ü คงเป็น ü)
  tone: Tone; // 5 = เสียงเบา
  initial: string; // พยัญชนะต้น "zh" | "sh" | "b" … | "" (ไม่มี — y/w ถือเป็นตัวสะกดของ i/u ไม่ใช่พยัญชนะต้น)
  final: string; // ส่วนที่เหลือหลังพยัญชนะต้น
};

const STRIP: Record<string, string> = {
  ā: "a", á: "a", ǎ: "a", à: "a",
  ē: "e", é: "e", ě: "e", è: "e",
  ī: "i", í: "i", ǐ: "i", ì: "i",
  ō: "o", ó: "o", ǒ: "o", ò: "o",
  ū: "u", ú: "u", ǔ: "u", ù: "u",
  ǖ: "ü", ǘ: "ü", ǚ: "ü", ǜ: "ü",
};
const MARK: Record<string, string[]> = {
  a: ["ā", "á", "ǎ", "à"],
  e: ["ē", "é", "ě", "è"],
  i: ["ī", "í", "ǐ", "ì"],
  o: ["ō", "ó", "ǒ", "ò"],
  u: ["ū", "ú", "ǔ", "ù"],
  ü: ["ǖ", "ǘ", "ǚ", "ǜ"],
};
// เรียงตัวยาวก่อน (zh/ch/sh) จะได้ไม่จับเป็น z/c/s
const INITIALS = ["zh", "ch", "sh", "b", "p", "m", "f", "d", "t", "n", "l", "g", "k", "h", "j", "q", "x", "r", "z", "c", "s"];
const RETROFLEX = new Set(["zh", "ch", "sh", "r"]);
const FLAT_OF: Record<string, string> = { zh: "z", ch: "c", sh: "s", r: "l" }; // คู่ม้วนลิ้น ↔ ไม่ม้วนที่คนไทยยุบรวม
const TONE_TH: Record<Tone, string> = {
  1: "เสียง 1 (สูงเรียบ)",
  2: "เสียง 2 (ขึ้น)",
  3: "เสียง 3 (ลงแล้วขึ้น)",
  4: "เสียง 4 (ตกคม)",
  5: "เสียงเบา",
};
// ทิศของเสียง — ใบ้ให้ฟังคู่วรรณยุกต์ที่ไม่มี KC ("ฟังทิศของเสียง")
const TONE_SHAPE: Record<Tone, string> = {
  1: "เสียง 1 สูงเรียบระดับเดียว",
  2: "เสียง 2 ไต่ขึ้น",
  3: "เสียง 3 ลงต่ำก่อนแล้วค่อยขึ้น",
  4: "เสียง 4 ตกลงแรง ๆ",
  5: "เสียงเบาสั้น ๆ ไม่มีทิศชัด",
};

/** ถอด tone mark + ตัวเล็ก: "Shī" → "shi" */
export function stripTone(syllable: string): string {
  let out = "";
  for (const ch of syllable.toLowerCase()) out += STRIP[ch] ?? ch;
  return out;
}

/** พินอิน (มี tone mark) → ข้อมูลต่อพยางค์ */
export function toNumbered(pinyin: string): Syllable[] {
  return splitSyllables(pinyin.replace(/['’]/g, " ")).map((syl) => {
    const base = stripTone(syl);
    // ข้อมูลเราเขียน 儿 (erhua) แยกเป็น "r" เฉย ๆ (哪儿 = "nǎ r") — ไม่ใช่พยัญชนะต้น r อย่าให้ไปติด KC r/l
    const initial = base === "r" ? "" : (INITIALS.find((i) => base.startsWith(i)) ?? "");
    return { base, tone: toneOf(syl.toLowerCase()) as Tone, initial, final: base.slice(initial.length) };
  });
}

/** ใส่ tone mark ให้พยางค์ไม่มีวรรณยุกต์ ตามกฎตำแหน่ง (มี a/e ใส่ที่นั่น · ou ใส่ที่ o · ไม่งั้นสระตัวสุดท้าย) */
export function markTone(base: string, tone: Tone): string {
  if (tone === 5) return base;
  let idx = base.indexOf("a");
  if (idx < 0) idx = base.indexOf("e");
  if (idx < 0 && base.includes("ou")) idx = base.indexOf("o");
  if (idx < 0) idx = Math.max(...["i", "o", "u", "ü"].map((v) => base.lastIndexOf(v)));
  if (idx < 0) return base;
  return base.slice(0, idx) + MARK[base[idx]][tone - 1] + base.slice(idx + 1);
}

/** ปั้นพินอินตัวลวง: เปลี่ยนวรรณยุกต์และ/หรือเสียงต้นของพยางค์ที่ i (0-based) — คืนพินอินตัวเล็กมี tone mark */
export function variant(pinyin: string, i: number, change: { tone?: Tone; initial?: string }): string {
  return toNumbered(pinyin)
    .map((s, k) =>
      k === i ? markTone((change.initial ?? s.initial) + s.final, change.tone ?? s.tone) : markTone(s.base, s.tone)
    )
    .join(" ");
}

// ---------- ① จัดประเภทคู่เสียง → KC ----------

export type PairKind = "match" | "tone" | "retro" | "other";
/**
 * บริบทของคู่เสียง — KC ต่างกันตามบริบท:
 * listen = ฟังแล้วเลือก (ear_game) → ปัญหาการ "รับรู้" · speak = พูดแล้วตัวฟังเสียงได้ยิน (speak_along) → ปัญหาการ "ออกเสียง"
 */
export type PairMode = "listen" | "speak";
export type PairClass = {
  kind: PairKind;
  kc?: KcCode; // KC จากคลัง Thai-L1 · ไม่มี = ไม่ใช่จุดผิดที่คลังบรรยายไว้ (log เป็น SKILL-LISTEN แทน)
  detail_th: string; // คำอธิบายเต็มสำหรับ feedback เช่น "ได้ยินเสียง 2 (ขึ้น) แต่เลือกเสียง 4 (ตกคม) — ฟังทิศของเสียง: …"
  hint_th?: string; // เฉพาะท่อนคำแนะนำหลัง "—" (ไม่มีท่อน "ได้ยิน… แต่…")
  syllable?: number; // index พยางค์ที่ต่าง (0-based)
};

/** target = พินอินที่เปิดเสียง/เฉลย · heard = พินอินที่ผู้เรียนเลือกหรือออกเสียง · mode = ฟัง (ear) หรือพูด (speak) */
export function classifyPair(target: string, heard: string, mode: PairMode): PairClass {
  const T = toNumbered(target);
  const H = toNumbered(heard);
  if (T.length !== H.length) return { kind: "other", detail_th: "จำนวนพยางค์ไม่เท่ากัน" };
  const diffs = T.map((t, i) => (t.base !== H[i].base || t.tone !== H[i].tone ? i : -1)).filter((i) => i >= 0);
  if (diffs.length === 0) return { kind: "match", detail_th: "ตรงกัน" };
  if (diffs.length > 1) return { kind: "other", detail_th: "ต่างกันมากกว่า 1 พยางค์" };
  const i = diffs[0];
  const t = T[i];
  const h = H[i];
  if (t.base === h.base) return { ...toneClass(t.tone, h.tone, T[i + 1]?.tone === 3, i === T.length - 1, mode), syllable: i };
  if (t.final === h.final && t.tone === h.tone) return { ...retroClass(t.initial, h.initial, mode), syllable: i };
  return { kind: "other", detail_th: `พยางค์ที่ ${i + 1} ต่างทั้งเสียงต้น/สระ และ/หรือวรรณยุกต์`, syllable: i };
}

function toneClass(tt: Tone, ht: Tone, nextIsT3: boolean, isLast: boolean, mode: PairMode): PairClass {
  const base = mode === "listen" ? `ได้ยิน${TONE_TH[tt]} แต่เลือก${TONE_TH[ht]}` : `เป้า${TONE_TH[tt]} แต่ได้ยิน${TONE_TH[ht]}`;
  const tone = (hint_th: string, kc?: KcCode): PairClass => ({
    kind: "tone",
    ...(kc ? { kc } : {}),
    detail_th: `${base} — ${hint_th}`,
    hint_th,
  });
  if (tt === 3 && ht === 2 && nextIsT3)
    return {
      kind: "tone",
      kc: "TL-TONE-T3SANDHI",
      detail_th: "พินอินเขียน 3+3 แต่เสียงพูดจริงพยางค์หน้ากลายเป็นเสียง 2 (กฎ tone sandhi) — จำไว้: 3+3 → 2+3",
      hint_th: "จำไว้: 3+3 → 2+3",
    };
  if (tt === 2 && ht === 3) return tone("คู่ 2/3 คือจุดที่คนไทยพลาดบ่อยสุด: เสียง 2 ขึ้นเส้นเดียวไม่มีจุดกด", "TL-TONE-T2AS3");
  // เสียง 3 กด-แล้ว-ขึ้นเต็มเฉพาะท้ายคำ · มีคำตามหลัง = ครึ่งเสียง 3 ต่ำ ๆ (คลัง T3AS2/T3HALF) — คำใบ้ต้องไม่สอนให้ "ขึ้น" ผิดที่
  if (tt === 3 && ht === 2)
    return tone(
      isLast
        ? "เสียง 3 ต้อง “กดต่ำก่อน” แล้วค่อยขึ้น ไม่ใช่ขึ้นอย่างเดียว"
        : "เสียง 3 ที่มีคำตามหลังออกต่ำ ๆ สั้น ๆ (ครึ่งเสียง 3) ไม่ไต่ขึ้นแบบเสียง 2",
      "TL-TONE-T3AS2"
    );
  // คู่อื่นทั้งหมด (รวมทุกคู่ที่มีเสียง 4) = ไม่ผูก KC — TL-TONE-T4OVER ในคลังคือ "ออกเสียง 4 ตกช้า/ลากยาว" (คุณภาพการออกเสียง)
  // ไม่ใช่การสับสนประเภทวรรณยุกต์ และตัวฟังเสียงก็จับไม่ได้ · คลังเสนอคู่ 4↔2 (四/十) ไว้ — ผูกได้เมื่อหฤทัยเคาะแล้ว
  return tone(`ฟังทิศของเสียง: ${TONE_SHAPE[tt]} ส่วน${TONE_SHAPE[ht]}`);
}

// เสียงต้นม้วนลิ้น ↔ ไม่ม้วน · คีย์ = "เป้า>ที่ได้ยิน/เลือก"
// listen: คลังนิยาม TL-RETRO-FLAT-MERGE = "แยก zh/ch/sh กับ z/c/s ไม่ออก ทั้งการฟังและการสะกด (ระดับการรับรู้)" → ใช้ตัวนี้ทั้งสองทิศ
//         (SH-S / ZH-JZ / CH-CQ บรรยายการ "ออกเสียง" — ผู้เรียนที่แค่ฟังยังไม่ได้พูด ไม่ควรถูกบันทึกว่าออกเสียงผิด)
// speak:  SH-S / ZH-JZ / CH-CQ / R-L = ออกเสียงม้วนลิ้นเป็นไม่ม้วน (ทิศที่คลังบรรยาย) · s→sh z→zh c→ch = FLAT-MERGE (คลัง: "สลับ/ยุบเป็นเสียงเดียว")
// ทิศกลับ j→zh · q→ch · l→r (ม้วนลิ้นทั้งที่เป้าไม่ม้วน) คลังยังไม่มี KC → ไม่ผูก ให้แค่คำแนะนำ (รอหฤทัยเคาะว่าจะเข้า FLAT-MERGE ไหม)
type RetroRule = { kc?: KcCode; hint: string };
const FLAT_RULE: RetroRule = { kc: "TL-RETRO-FLAT-MERGE", hint: "แยกเสียงไม่ม้วนลิ้น (z/c/s) กับม้วนลิ้น (zh/ch/sh) ให้ออก" };
const R_L_RULE: RetroRule = { kc: "TL-RETRO-R-L", hint: "r จีนม้วนลิ้นไม่รัว ต่างจาก ล/ร ไทย" };
const ZH_RULE: RetroRule = { kc: "TL-RETRO-ZH-JZ", hint: "zh ม้วนลิ้น ไม่ใช่ จ (j) หรือ z แบน" };
const CH_RULE: RetroRule = { kc: "TL-RETRO-CH-CQ", hint: "ch ม้วนลิ้น ไม่ใช่ ช (q) หรือ c แบน" };
const RETRO_RULES: Record<PairMode, Record<string, RetroRule>> = {
  listen: {
    "zh>z": FLAT_RULE,
    "z>zh": FLAT_RULE,
    "ch>c": FLAT_RULE,
    "c>ch": FLAT_RULE,
    "sh>s": FLAT_RULE,
    "s>sh": FLAT_RULE,
    "r>l": R_L_RULE,
    "l>r": { hint: "เสียงที่เปิดคือ l (ล) ธรรมดา ไม่ม้วนลิ้น" },
    "zh>j": { hint: "zh ม้วนปลายลิ้นขึ้น ส่วน j คล้าย จ ไทย ไม่ม้วน" },
    "j>zh": { hint: "เสียงที่เปิดคือ j (คล้าย จ) ไม่ม้วนลิ้น" },
    "ch>q": { hint: "ch ม้วนปลายลิ้นขึ้น ส่วน q คล้าย ช ไทย ไม่ม้วน" },
    "q>ch": { hint: "เสียงที่เปิดคือ q (คล้าย ช) ไม่ม้วนลิ้น" },
  },
  speak: {
    "sh>s": { kc: "TL-RETRO-SH-S", hint: "sh ต้องม้วนปลายลิ้นขึ้น ไม่ใช่ ส แบบไทย" },
    "zh>z": ZH_RULE,
    "zh>j": ZH_RULE,
    "ch>c": CH_RULE,
    "ch>q": CH_RULE,
    "r>l": R_L_RULE,
    "s>sh": FLAT_RULE,
    "z>zh": FLAT_RULE,
    "c>ch": FLAT_RULE,
    "j>zh": { hint: "เป้าเป็นเสียง j (คล้าย จ) ไม่ต้องม้วนลิ้น" },
    "q>ch": { hint: "เป้าเป็นเสียง q (คล้าย ช) ไม่ต้องม้วนลิ้น" },
    "l>r": { hint: "เป้าเป็นเสียง l (ล) ไม่ต้องม้วนลิ้น" },
  },
};

function retroClass(ti: string, hi: string, mode: PairMode): PairClass {
  const [t, h] = [ti || "(ไม่มี)", hi || "(ไม่มี)"];
  const base = mode === "listen" ? `เสียงต้น ${t} ถูกฟังเป็น ${h}` : `เป้าเสียงต้น ${t} แต่ได้ยิน ${h}`;
  const rule = RETRO_RULES[mode][`${ti}>${hi}`];
  if (!rule) return { kind: "other", detail_th: `${base} — ไม่ใช่คู่เสียงที่คลัง Thai-L1 ระบุ` };
  return { kind: "retro", ...(rule.kc ? { kc: rule.kc } : {}), detail_th: `${base} — ${rule.hint}`, hint_th: rule.hint };
}

// ---------- ② คู่เสียงใกล้จากคลังคำจริง ----------

export type PinyinWord = { id: number; hanzi: string; pinyin: string; audio_path?: string | null };
export type MinimalPair<W extends PinyinWord = PinyinWord> = {
  a: W; // เรียงให้ kc (เปิด a → เลือก b) มีค่าเสมอถ้าคู่นี้มี KC สักทิศ · คู่ม้วนลิ้น: a = คำม้วนลิ้น
  b: W;
  kind: "tone" | "retro";
  kc?: KcCode; // KC เมื่อเปิด a แล้วผู้เรียนเลือก b
  kcReverse?: KcCode; // KC เมื่อเปิด b แล้วผู้เรียนเลือก a
  syllable: number; // index พยางค์ที่ต่าง (0-based)
  detail_th: string;
};

/**
 * หาคู่คำที่ต่างกัน "แค่จุดเดียว": วรรณยุกต์ของพยางค์เดียว หรือเสียงต้น zh/z · ch/c · sh/s · r/l ของพยางค์เดียว
 * ค่าเริ่มต้นใช้เฉพาะคำที่มีไฟล์เสียง (เกมฟังต้องเปิดเสียงได้) · พยางค์เดี่ยวมาก่อน → คู่ที่มี KC ก่อน
 */
export function findMinimalPairs<W extends PinyinWord>(words: W[], opts: { requireAudio?: boolean } = {}): MinimalPair<W>[] {
  const requireAudio = opts.requireAudio ?? true;
  const seen = new Set<number>();
  const rows: { w: W; s: Syllable[] }[] = [];
  for (const w of words) {
    if ((requireAudio && !w.audio_path) || seen.has(w.id)) continue;
    seen.add(w.id);
    const s = toNumbered(w.pinyin);
    if (s.length) rows.push({ w, s });
  }
  type Row = (typeof rows)[number];

  const out: MinimalPair<W>[] = [];
  const emit = (x: Row, y: Row, kind: "tone" | "retro", i: number) => {
    let [a, b] = [x, y];
    const swap =
      kind === "retro"
        ? !RETROFLEX.has(x.s[i].initial)
        : !classifyPair(x.w.pinyin, y.w.pinyin, "listen").kc && !!classifyPair(y.w.pinyin, x.w.pinyin, "listen").kc;
    if (swap) [a, b] = [y, x];
    const fwd = classifyPair(a.w.pinyin, b.w.pinyin, "listen");
    const rev = classifyPair(b.w.pinyin, a.w.pinyin, "listen");
    out.push({ a: a.w, b: b.w, kind, kc: fwd.kc, kcReverse: rev.kc, syllable: i, detail_th: fwd.detail_th });
  };

  // ① คู่วรรณยุกต์: ทุกพยางค์ (ไม่นับวรรณยุกต์) เหมือนกัน ต่างวรรณยุกต์พยางค์เดียว
  for (const g of groupBy(rows, (r) => r.s.map((s) => s.base).join(" ")))
    for (let p = 0; p < g.length; p++)
      for (let q = p + 1; q < g.length; q++) {
        const [x, y] = [g[p], g[q]];
        const d = x.s.map((s, i) => (s.tone !== y.s[i].tone ? i : -1)).filter((i) => i >= 0);
        if (d.length !== 1) continue;
        const i = d[0];
        const tones = new Set([x.s[i].tone, y.s[i].tone]);
        // 3+3 → เสียงจริงเป็น 2+3 (sandhi): คู่ 2/3 ที่พยางค์ถัดไปเป็นเสียง 3 แยกจากเสียงไม่ได้ → ข้าม
        if (tones.has(2) && tones.has(3) && x.s[i + 1]?.tone === 3) continue;
        // พยางค์ที่ต่างเป็นเสียงเบา (เช่น 八 bā ~ 吧 ba): เสียงเบาพูดเดี่ยว ๆ ไม่มีระดับเสียงแน่นอน ฟังแยกจริงไม่ได้ → ข้าม (PR-05)
        if (tones.has(5)) continue;
        emit(x, y, "tone", i);
      }

  // ② คู่ม้วนลิ้น/ไม่ม้วน: เหมือนกันหมด ต่างแค่เสียงต้นในคู่ zh/z · ch/c · sh/s · r/l ที่พยางค์เดียว
  for (const g of groupBy(rows, (r) => r.s.map((s) => (FLAT_OF[s.initial] ?? s.initial) + s.final + s.tone).join(" ")))
    for (let p = 0; p < g.length; p++)
      for (let q = p + 1; q < g.length; q++) {
        const [x, y] = [g[p], g[q]];
        const d = x.s.map((s, i) => (s.initial !== y.s[i].initial ? i : -1)).filter((i) => i >= 0);
        if (d.length !== 1) continue;
        const [xi, yi] = [x.s[d[0]].initial, y.s[d[0]].initial];
        if (FLAT_OF[xi] !== yi && FLAT_OF[yi] !== xi) continue;
        emit(x, y, "retro", d[0]);
      }

  const nSyl = (m: MinimalPair<W>) => splitSyllables(m.a.pinyin).length;
  out.sort((m, n) => nSyl(m) - nSyl(n) || Number(!m.kc) - Number(!n.kc) || m.a.id - n.a.id || m.b.id - n.b.id);
  return out;
}

function groupBy<T>(arr: T[], key: (t: T) => string): T[][] {
  const m = new Map<string, T[]>();
  for (const t of arr) {
    const k = key(t);
    const g = m.get(k);
    if (g) g.push(t);
    else m.set(k, [t]);
  }
  return [...m.values()].filter((g) => g.length > 1);
}

// ---------- ③ ฝึกพูดตาม ----------

/** kc ไม่มี = คำแนะนำทั่วไปที่ไม่ใช่จุดผิดในคลัง (เช่น ครึ่งเสียง 3 หน้าเสียงอื่น ซึ่งเป็นรูปที่ถูกอยู่แล้ว) */
export type SpeakFocus = { kc?: KcCode; detail_th: string };

/**
 * จุดเสี่ยง Thai-L1 ที่ควรจับตอนพูดตามคำนี้ (จากพินอิน) — [] = ไม่มีจุดเสี่ยง · เรียงตามพยางค์
 * เสียง 3: กดแล้วขึ้นเต็ม (T3AS2 / T3HALF) เฉพาะพยางค์สุดท้าย — คลัง: "ออกเสียง 3 เต็ม เฉพาะในคำเดี่ยว/ท้ายประโยค"
 *          หน้าเสียงอื่น = ครึ่งเสียง 3 ต่ำ ๆ คือรูปที่ถูก (คลัง T3HALF) → แนะนำแบบไม่ผูก KC · หน้าเสียง 3 = sandhi
 * ⚠️ ถ้อยคำ detail_th = ร่าง AI รอหฤทัยยืนยัน
 */
export function speakFocus(pinyin: string): SpeakFocus[] {
  const s = toNumbered(pinyin);
  const out: SpeakFocus[] = [];
  const add = (detail_th: string, kc?: KcCode) => {
    if (!out.some((f) => f.detail_th === detail_th)) out.push(kc ? { kc, detail_th } : { detail_th });
  };
  s.forEach((syl, i) => {
    if (syl.tone === 3) {
      if (s[i + 1]?.tone === 3) add("3+3 → พยางค์หน้าออกเป็นเสียง 2 (เช่น 你好 → ní hǎo)", "TL-TONE-T3SANDHI");
      else if (i === s.length - 1) {
        add("เสียง 3 ต้องกดต่ำก่อนแล้วค่อยขึ้น", "TL-TONE-T3AS2");
        add("เสียง 3 ท้ายคำต้องมีหางขึ้น ไม่ใช่ครึ่งเสียงสามต่ำ ๆ", "TL-TONE-T3HALF");
      } else add("เสียง 3 ที่อยู่หน้าเสียงอื่น ออกต่ำ ๆ สั้น ๆ ไม่ต้องขึ้น (ครึ่งเสียง 3)");
    }
    if (syl.tone === 2) add("เสียง 2 ดันขึ้นชัน ๆ ให้สุด ไม่มีจุดกด", "TL-TONE-T2AS3");
    if (syl.initial === "sh") add("sh ม้วนปลายลิ้น ไม่ใช่ ส", "TL-RETRO-SH-S");
    if (syl.initial === "zh") add("zh ม้วนลิ้น ไม่ใช่ จ", "TL-RETRO-ZH-JZ");
    if (syl.initial === "ch") add("ch ม้วนลิ้น ไม่ใช่ ช", "TL-RETRO-CH-CQ");
    if (syl.initial === "r") add("r ม้วนลิ้น ไม่รัวแบบ ร ไทย และไม่ใช่ ล", "TL-RETRO-R-L");
  });
  return out;
}

/** คำสำหรับฝึกพูดตาม = มีเสียง 2/3 หรือเสียงต้น zh/ch/sh/r (จุดเสี่ยงคนไทย) */
export function pickSpeakWords<W extends { pinyin: string }>(words: W[]): W[] {
  return words.filter((w) => speakFocus(w.pinyin).length > 0);
}
