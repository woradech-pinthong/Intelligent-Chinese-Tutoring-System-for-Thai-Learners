"use client";

// เกมแยกเสียง (ear_game) — ฟังคำจีน 1 คำ แล้วเลือก "พินอินที่ได้ยิน" จากคู่เสียงใกล้ (minimal pair) ในคลังคำ HSK 1
// เป้า: ฝึกหูจุดที่คนไทยพลาด (Thai-L1) — วรรณยุกต์ 2/3 · ม้วนลิ้น zh/ch/sh กับ z/c/s (+ คู่วรรณยุกต์อื่นที่ไม่ผูก KC)
// KC ของข้อ: ตอบถูก = จุดของทิศที่เปิด · ตอบผิด = จุดของ "ตัวที่เลือก" (BK-03/PR-04) · ไม่มี KC = SKILL-LISTEN
// ⚠️ คู่เสียงปั้นอัตโนมัติจากคลังคำ (ยังไม่ผ่าน PR-05: หฤทัยคัด + ฟังยืนยัน) → เมนูติดป้าย "ร่าง"
// กติกา: PR-02 ก่อนตอบห้ามโชว์ตัวจีน/พินอินของคำที่เปิดเป็นคำใบ้ (ตัวเลือก = พินอินของทั้งคู่ + ตัวลวงมิติเดียวกัน)
//        โหมดฝึก "ใจดี" — ฟังซ้ำไม่จำกัด · ฟังช้า · เฉลยทันทีพร้อมเหตุผลภาษาไทย
// ไม่ใช้กฎ PA-14 (สุ่มเฉพาะคำที่เรียนแล้ว) เพราะคู่เสียงใกล้มีน้อย (HSK1 ≈ 22 คู่) และเกมนี้วัดหู ไม่ได้วัดความจำศัพท์

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { MenuLink } from "@/components/MenuLink";
import { supabase, audioUrl, type Word } from "@/lib/supabase";
import { Center, ErrorState } from "@/components/Feedback";
import { FeedbackCard } from "@/components/FeedbackCard";
import { Icon } from "@/components/Icon";
import { Mascot, MascotSays } from "@/components/Mascot";
import { Pinyin } from "@/components/Pinyin";
import { ProgressBar } from "@/components/ProgressBar";
import { shuffle } from "@/lib/random";
import { saveRound } from "@/lib/progress";
import { audioRate, toggleAudioRate, playAtUserRate } from "@/lib/daily";
import { logAttempt } from "@/lib/attempts-outbox";
import { classifyPair, findMinimalPairs, markTone, toNumbered, variant, type MinimalPair } from "@/lib/thai-l1-rules";
import { SKILL_LABEL_TH, type KcCode } from "@/data/thaiL1";
import { DRAFT_NOTE_TH, kcTip } from "@/data/kc-tips";

const N_QUESTIONS = 10;
const FEW_PAIRS = 6; // ต่ำกว่านี้ = บอกผู้เรียนว่าคู่เสียงยังน้อย (บางคู่วนซ้ำในรอบ)

type Pair = MinimalPair<Word>;
type Kind = Pair["kind"]; // "tone" | "retro"
// คู่/ข้อที่ไม่ผูก KC (ไม่ใช่จุดผิดที่คลังบรรยายไว้ เช่น เสียง 1 กับ 4) — ป้ายแยกตามมิติที่ฟัง
const NO_KC_LABEL: Record<Kind, string> = { tone: "วรรณยุกต์อื่น ๆ", retro: "เสียงม้วนลิ้นอื่น ๆ" };
const NO_KC_FOCUS: Record<Kind, string> = { tone: "แยกวรรณยุกต์", retro: "แยกเสียงม้วนลิ้น" };
// ป้ายกลาง (SKILL_LABEL_TH) ของ R-L เขียนแบบ "ออกเสียง" — เกมนี้วัดการฟัง จึงใช้คำของการฟังแทน
const EAR_LABEL: Partial<Record<KcCode, string>> = { "TL-RETRO-R-L": "ฟัง r เป็น l" };
const earLabel = (kc: KcCode) => EAR_LABEL[kc] ?? SKILL_LABEL_TH[kc];
const labelOf = (kc: KcCode | undefined, kind: Kind) => (kc ? earLabel(kc) : NO_KC_LABEL[kind]);
type EarQ = {
  pair: Pair;
  target: Word; // คำที่เปิดเสียง
  other: Word; // อีกคำในคู่
  answer: string; // พินอินของ target (รูปมาตรฐาน ตัวเล็ก)
  choices: string[]; // พินอิน 2–4 ตัว สับแล้ว
  kc?: KcCode; // จุดผิดของทิศนี้: เปิด a → pair.kc · เปิด b → pair.kcReverse (ใช้ตอนตอบถูก)
};
type Result = { kc?: KcCode; ok: boolean; kind: Kind };

// พินอินรูปมาตรฐานตัวเล็ก — ข้อมูลเรามีตัวใหญ่ปน (水 "Shuǐ") ถ้าโชว์ดิบ ตัวใหญ่จะกลายเป็นคำใบ้
const canon = (p: string) => toNumbered(p).map((s) => markTone(s.base, s.tone)).join(" ");
// เวลาที่ใช้ตอบ (ms) — อยู่นอก component เพราะ lint react-hooks/purity เข้าใจผิดว่า Date.now() ใน handler ถูกเรียกตอน render
const msSince = (t: number) => Date.now() - t;

export default function EarGame() {
  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [stage, setStage] = useState<"intro" | "quiz" | "done">("intro");
  const [questions, setQuestions] = useState<EarQ[]>([]);
  const [qi, setQi] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const [slow, setSlow] = useState(false);
  const qStartRef = useRef(0);
  const savedRef = useRef(false);
  const nextRef = useRef<HTMLButtonElement>(null);

  // ตอบแล้วปุ่มตัวเลือกถูกปิด → โฟกัสหลุดไป <body> · ย้ายไปปุ่ม "ข้อถัดไป" ให้คนใช้คีย์บอร์ด/สวิตช์ (ไม่เลื่อนจอ)
  useEffect(() => {
    if (picked !== null) nextRef.current?.focus({ preventScroll: true });
  }, [picked]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from("words")
        .select("id, hanzi, pinyin, meaning_th, meaning_en, th_reviewed, audio_path, hsk_level, category")
        .eq("hsk_level", 1)
        .order("id");
      if (!alive) return;
      if (error) setError(error.message);
      else setWords(data as Word[]);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // คู่เสียงใกล้ (ค่าเริ่มต้นเอาเฉพาะคำที่มีไฟล์เสียง) + แผนที่ พินอิน → คำ ไว้บอกว่าตัวลวงที่เลือกคือคำอะไร
  const pairs = useMemo(() => findMinimalPairs(words), [words]);
  const byPinyin = useMemo(() => {
    const m = new Map<string, Word>();
    for (const w of words) {
      const key = canon(w.pinyin);
      if (!m.has(key)) m.set(key, w);
    }
    return m;
  }, [words]);
  const coverage = useMemo(() => countBy(pairs.map((p) => labelOf(p.kc, p.kind))), [pairs]);

  function playWord(w: Word | undefined) {
    if (w?.audio_path) playAtUserRate(audioUrl(w.audio_path)); // ความเร็วตามค่า "ฟังช้า" ที่ผู้เรียนตั้ง
  }

  function startRound() {
    const qs = buildRound(pairs, N_QUESTIONS);
    if (!qs.length) return;
    setQuestions(qs);
    setQi(0);
    setPicked(null);
    setCorrectCount(0);
    setResults([]);
    setSlow(audioRate() === 0.75);
    setStage("quiz");
    savedRef.current = false;
    qStartRef.current = Date.now();
    playWord(qs[0].target); // เปิดในจังหวะแตะ — มือถือ (iOS) ยอมให้เล่นเสียง
  }

  const q = questions[qi];

  function choose(p: string) {
    if (picked !== null || !q) return; // ตอบแล้ว ล็อกไว้
    const ok = p === q.answer;
    // ตอบถูก = KC ของทิศที่เปิด · ตอบผิด = KC ของตัวที่เลือก (BK-03/PR-04 — ชิปกับ skill_code ต้องตรงกับคำใบ้)
    const kc = ok ? q.kc : classifyPair(q.answer, p, "listen").kc;
    setPicked(p);
    if (ok) setCorrectCount((c) => c + 1);
    setResults((r) => [...r, { kc, ok, kind: q.pair.kind }]);
    logAttempt({
      generator: "ear_game",
      variant: q.pair.kind, // "tone" | "retro"
      event_type: "graded",
      word_id: q.target.id,
      skill_code: kc ?? "SKILL-LISTEN",
      answer: { picked: p },
      is_correct: ok,
      time_spent_ms: msSince(qStartRef.current),
      context: "practice",
    });
  }

  function next() {
    if (qi + 1 >= questions.length) {
      setStage("done");
      if (!savedRef.current) {
        saveRound({ ts: Date.now(), mode: "ear", total: questions.length, correct: correctCount });
        savedRef.current = true;
      }
      return;
    }
    setQi(qi + 1);
    setPicked(null);
    qStartRef.current = Date.now();
    playWord(questions[qi + 1].target);
  }

  if (loading) return <Center>กำลังโหลดคลังคำ...</Center>;
  if (error) return <ErrorState detail={error} />;

  // ---------- หน้าเริ่ม ----------
  if (stage === "intro" || !q) {
    return (
      <div className="flex flex-col gap-5 p-5">
        <header>
          <MenuLink group="listen" className="mb-1 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600">
            <Icon name="arrowLeft" className="h-3.5 w-3.5" /> กลับเมนูฝึก
          </MenuLink>
          <h1 className="text-xl font-semibold text-slate-700">เกมแยกเสียง</h1>
          <p className="mt-1 text-sm text-slate-400">
            ฟังคำจีน 1 คำ → เลือกพินอินที่ได้ยิน · {N_QUESTIONS} ข้อ/รอบ · ฟังซ้ำได้ไม่จำกัด
          </p>
        </header>

        <MascotSays>
          คนไทยมักสับสนเสียง 2 กับ 3 และแยกเสียงม้วนลิ้น zh/ch/sh กับ z/c/s ไม่ออก — เกมนี้ฝึกหูเรื่องพวกนี้ (และคู่วรรณยุกต์อื่น ๆ) โดยเฉพาะ ⭐
        </MascotSays>

        <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-ocean-50">
              <Icon name="headphone" className="h-6 w-6 text-ocean-700" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-medium text-slate-700">มีคู่เสียง {pairs.length} คู่</div>
              <div className="text-xs text-slate-400">คู่คำที่ต่างกันแค่จุดเดียว เช่น shì / sì หรือ wán / wǎn</div>
            </div>
          </div>
          {coverage.length > 0 && (
            <>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {coverage.map(([label, n]) => (
                  <span key={label} className="rounded-full bg-ocean-50 px-2.5 py-1 text-[11px] text-ocean-700">
                    {label} · {n} คู่
                  </span>
                ))}
              </div>
              <p className="mt-1.5 text-[10px] text-slate-400">({DRAFT_NOTE_TH})</p>
            </>
          )}
          {pairs.length > 0 && pairs.length < FEW_PAIRS && (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-700">
              คู่เสียงในคลังยังน้อย บางคู่จะวนมาซ้ำในรอบเดียว — ไม่เป็นไร ฟังซ้ำยิ่งแม่น
            </p>
          )}
          {pairs.length === 0 && (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-700">
              ตอนนี้ยังไม่มีคู่เสียงที่มีไฟล์เสียงพร้อม — ลองฝึกโหมดอื่นไปก่อนนะ
            </p>
          )}
        </section>

        <button
          onClick={startRound}
          disabled={pairs.length === 0}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-ocean-700 px-4 py-3 font-semibold text-white shadow transition hover:bg-ocean-900 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-300 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40"
        >
          <Icon name="play" className="h-4 w-4" /> เริ่มฟัง
        </button>

        <div className="flex gap-2 rounded-2xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-500">
          <Icon name="bulb" className="mt-0.5 h-4 w-4 shrink-0 text-xp" />
          <p>
            ไม่ต้องรู้คำแปลก่อนก็เล่นได้ — ตอบแล้วจะเห็นตัวจีน คำแปล และแตะฟังเทียบทั้ง 2 คำได้ · ผลการฝึกไปแสดงในหน้า{" "}
            <Link href="/progress" className="text-ocean-500 underline">
              ผล
            </Link>
          </p>
        </div>
      </div>
    );
  }

  // ---------- หน้าสรุปผล ----------
  if (stage === "done") {
    const pct = Math.round((correctCount / questions.length) * 100);
    const pass = pct >= 60;
    const missed = countBy(results.filter((r) => !r.ok).map((r) => labelOf(r.kc, r.kind)));
    return (
      <div className="flex flex-col items-center gap-6 p-5">
        {pass ? (
          <Mascot className="mt-6 h-20 w-20" />
        ) : (
          <div className="mt-6 grid h-20 w-20 place-items-center rounded-full bg-ocean-50 text-ocean-500">
            <Icon name="target" className="h-10 w-10" />
          </div>
        )}
        <h1 className="font-[family-name:var(--font-display)] text-xl font-bold text-ocean-900">
          {pass ? "หูไวมาก!" : "สู้ ๆ ฟังอีกนิด!"}
        </h1>
        <div className="relative w-full overflow-hidden rounded-3xl bg-gradient-to-br from-ocean-900 via-ocean-800 to-ocean-600 p-6 text-center text-white shadow-lg shadow-ocean-900/20">
          <span aria-hidden="true" className="absolute left-7 top-5 h-1 w-1 rounded-full bg-white/50" />
          <span aria-hidden="true" className="absolute right-10 top-7 h-1.5 w-1.5 rounded-full bg-white/40" />
          <div className="relative font-[family-name:var(--font-display)] text-5xl font-extrabold">
            {correctCount}
            <span className="text-2xl font-normal text-ocean-100"> / {questions.length}</span>
          </div>
          <div className="relative mt-1 text-ocean-100">แยกเสียงถูก {pct}%</div>
        </div>
        {missed.length > 0 && (
          <div className="w-full rounded-2xl border border-slate-100 bg-white p-4">
            <div className="text-xs font-semibold text-slate-500">เสียงที่ยังสับสน — รอบหน้าลองตั้งใจฟังตรงนี้</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {missed.map(([label, n]) => (
                <span key={label} className="rounded-full bg-coral-soft px-2.5 py-1 text-xs text-ocean-900">
                  {label} × {n}
                </span>
              ))}
            </div>
            <p className="mt-1.5 text-[10px] text-slate-400">({DRAFT_NOTE_TH})</p>
          </div>
        )}
        <div className="flex w-full gap-3">
          <button
            onClick={startRound}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-ocean-700 px-4 py-3 font-semibold text-white shadow transition hover:bg-ocean-900 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-300 focus-visible:ring-offset-2"
          >
            <Icon name="refresh" className="h-5 w-5" /> ฝึกอีกรอบ
          </button>
          <MenuLink
            group="listen"
            className="flex flex-1 items-center justify-center rounded-xl bg-slate-100 px-4 py-3 font-medium text-slate-600 transition hover:bg-slate-200 active:scale-95"
          >
            กลับเมนูฝึก
          </MenuLink>
        </div>
        <Link href="/progress" className="text-sm text-ocean-500 underline">
          ดูสรุปผลการฝึกทั้งหมด
        </Link>
      </div>
    );
  }

  // ---------- หน้าทำข้อ ----------
  const answered = picked !== null;
  const isRight = picked === q.answer;
  const otherPinyin = canon(q.other.pinyin);
  const pickedWord = picked === otherPinyin ? q.other : picked ? byPinyin.get(picked) : undefined;
  const why = picked && !isRight ? classifyPair(q.answer, picked, "listen") : null;
  return (
    <div className="flex flex-col gap-5 p-5">
      {/* แถบความคืบหน้า */}
      <div>
        <div className="flex items-center justify-between text-sm text-slate-500">
          <MenuLink group="listen" className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-600">
            <Icon name="arrowLeft" className="h-3.5 w-3.5" /> ออก
          </MenuLink>
          <span>
            ข้อ {qi + 1}/{questions.length} · ถูก {correctCount}
          </span>
        </div>
        <ProgressBar className="mt-2" size="lg" value={qi} max={questions.length} label="ความคืบหน้าในรอบแยกเสียง" />
      </div>

      {/* บอกแค่ "มิติ" ที่ต้องฟัง (ตัวเลือกก็บอกอยู่แล้ว) — ไม่ใช่คำตอบ */}
      {!answered && (
        <MascotSays mascotClassName="h-10 w-10">
          {q.pair.kind === "tone"
            ? "ตั้งใจฟังวรรณยุกต์ — สูงเรียบ ขึ้น ลงแล้วขึ้น หรือตก ⭐"
            : "ตั้งใจฟังเสียงต้น — ม้วนลิ้นหรือไม่ม้วน ⭐"}
        </MascotSays>
      )}

      {/* โจทย์: เสียงอย่างเดียว (PR-02) */}
      <div className="flex min-h-[28vh] flex-col items-center justify-center rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <button
          onClick={() => playWord(q.target)}
          aria-label="ฟังเสียงอีกครั้ง"
          className="grid h-24 w-24 place-items-center rounded-full bg-ocean-800 text-white shadow-lg shadow-ocean-900/30 transition hover:bg-ocean-900 active:scale-95"
        >
          <Icon name="speaker" className="h-10 w-10" />
        </button>
        <div className="mt-3 text-sm text-slate-400">
          แตะเพื่อฟังอีกครั้ง
          <button
            onClick={() => setSlow(toggleAudioRate() === 0.75)}
            aria-pressed={slow}
            className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-medium transition ${
              slow ? "bg-ocean-700 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            {slow ? "ช้าอยู่" : "ฟังช้า"}
          </button>
        </div>
        {!answered && <div className="mt-1 text-xs text-slate-400">เสียงที่ได้ยินตรงกับพินอินตัวไหน</div>}

        {/* หลังตอบ: เผยทั้งคู่ + แตะฟังเทียบได้ */}
        {answered && (
          <div className="mt-4 grid w-full grid-cols-2 gap-2">
            {[q.target, q.other].map((w) => {
              const isTarget = w.id === q.target.id;
              return (
                <button
                  key={w.id}
                  onClick={() => playWord(w)}
                  className={`flex flex-col items-center rounded-2xl border p-3 transition active:scale-[0.98] ${
                    isTarget ? "border-ocean-300 bg-ocean-50" : "border-slate-100 bg-white hover:border-ocean-200"
                  }`}
                >
                  <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                    <Icon name="speaker" className="h-3.5 w-3.5" /> {isTarget ? "เสียงที่เปิด" : "อีกคำในคู่"}
                  </span>
                  <span className="mt-1 font-[family-name:var(--font-sc)] text-3xl font-bold text-slate-900">{w.hanzi}</span>
                  <Pinyin text={canon(w.pinyin)} className="text-base font-medium" />
                  <span className="mt-0.5 text-xs text-slate-500">{w.meaning_th}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ตัวเลือก = พินอิน (ระบายสีวรรณยุกต์ — ทุกตัวเลือกโชว์เท่ากัน ไม่ใช่คำใบ้) */}
      <div className="grid grid-cols-2 gap-3">
        {q.choices.map((c) => {
          const isAnswer = c === q.answer;
          const isPicked = c === picked;
          let cls = "border-slate-200 bg-white hover:border-ocean-300";
          if (answered) {
            if (isAnswer) cls = "border-correct bg-emerald-50";
            else if (isPicked) cls = "border-coral/50 bg-coral-soft";
            else cls = "border-slate-100 bg-slate-50 opacity-60";
          }
          return (
            <button
              key={c}
              onClick={() => choose(c)}
              disabled={answered}
              className={`relative flex min-h-[72px] items-center justify-center rounded-2xl border px-3 py-4 transition active:scale-[0.98] ${cls}`}
            >
              <Pinyin text={c} className="text-2xl font-semibold" />
              {answered && isAnswer && (
                <Icon name="check" className="absolute right-2.5 top-2.5 h-4 w-4 text-correct" strokeWidth={2.4} />
              )}
              {answered && isPicked && !isAnswer && (
                <Icon name="x" className="absolute right-2.5 top-2.5 h-4 w-4 text-coral" strokeWidth={2.4} />
              )}
            </button>
          );
        })}
      </div>

      {/* เฉลย + เหตุผล + จุดผิดคนไทย (KC) ของข้อนี้ */}
      {answered && (
        <FeedbackCard
          correct={isRight}
          yourAnswer={
            !isRight && picked ? { main: picked, sub: pickedWord ? `${pickedWord.hanzi} = ${pickedWord.meaning_th}` : undefined } : undefined
          }
          rightAnswer={{ main: q.answer, sub: `${q.target.hanzi} = ${q.target.meaning_th}` }}
          hint={
            why
              ? why.kind === "tone" || why.kind === "retro"
                ? why.detail_th
                : "แตะฟังเทียบ 2 คำด้านบนอีกรอบ แล้วสังเกตเสียงต้นที่ต่างกัน"
              : undefined
          }
        >
          {/* ตอบถูก = จุดของคู่ที่เปิด · ตอบผิด = จุดของตัวที่เลือก (ตรงกับคำใบ้ + skill_code ที่บันทึก) */}
          {isRight ? q.kc && <KcTip kc={q.kc} /> : <KcTip kc={why?.kc} fallback={NO_KC_FOCUS[q.pair.kind]} />}
        </FeedbackCard>
      )}

      {answered && (
        <button
          ref={nextRef}
          onClick={next}
          className="rounded-xl bg-ocean-900 px-4 py-3 font-semibold text-white shadow transition hover:bg-ocean-800 active:scale-[0.98]"
        >
          {qi + 1 >= questions.length ? "ดูผล →" : "ข้อถัดไป →"}
        </button>
      )}
    </div>
  );
}

// ---------- จุดที่ฝึกของข้อ: ป้าย KC + คำอธิบายสำหรับผู้เรียน 1 ประโยค (kc-tips · ฉบับร่าง) ----------
// ไม่ใช้ teaching_th ของคลังแล้ว — เขียนให้ครูอ่าน (ลำดับการสอน · เศษร่าง "找/...") · ไม่มี KC = ชิปบอกมิติที่ฝึกเฉย ๆ
function KcTip({ kc, fallback }: { kc?: KcCode; fallback?: string }) {
  const tip = kcTip(kc);
  const label = kc ? earLabel(kc) : fallback;
  if (!label) return null;
  return (
    <div className="rounded-xl bg-white/70 p-2.5 text-xs leading-relaxed text-slate-600">
      <span className="inline-block rounded-full bg-ocean-50 px-2 py-0.5 font-semibold text-ocean-700">จุดที่ฝึก: {label}</span>
      {tip && (
        <p className="mt-1.5 flex items-start gap-1.5">
          <Icon name="bulb" className="mt-0.5 h-4 w-4 shrink-0 text-star-dark" />
          <span>{tip}</span>
        </p>
      )}
      {kc && <p className="mt-1 text-[10px] text-slate-400">({DRAFT_NOTE_TH})</p>}
    </div>
  );
}

// ---------- สร้างรอบ ----------

// ตัวเลือกที่ 3–4: เปลี่ยน "มิติเดียวกับคู่" เท่านั้น ข้อจะได้วัด KC เดียวชัด ๆ
const SIBILANT_ALT: Record<string, [string, string]> = {
  sh: ["zh", "z"],
  s: ["zh", "z"],
  zh: ["ch", "c"],
  z: ["ch", "c"],
  ch: ["zh", "z"],
  c: ["zh", "z"],
};
// finals ที่ต่อกับ zh/ch/sh/z/c/s ได้ครบทุกตัว — กันปั้นพยางค์ที่ไม่มีจริง (เช่น shong, sua)
const SAFE_FINALS = new Set(["a", "e", "i", "u", "ai", "ao", "an", "ang", "en", "eng", "ou", "uo", "ui", "uan", "un"]);

function extraChoices(pair: Pair): string[] {
  const i = pair.syllable;
  const A = toNumbered(pair.a.pinyin);
  if (pair.kind === "tone") {
    // วรรณยุกต์ที่เหลือของพยางค์เดียวกัน · พยางค์ถัดไปเป็นเสียง 3 → ตัด 2/3 (3+3 ออกเสียงเป็น 2+3 แยกด้วยหูไม่ได้)
    const used = new Set<number>([A[i].tone, toNumbered(pair.b.pinyin)[i].tone]);
    const nextIs3 = A[i + 1]?.tone === 3;
    const tones = ([1, 2, 3, 4] as const).filter((t) => !used.has(t) && !(nextIs3 && (t === 2 || t === 3)));
    return shuffle([...tones])
      .slice(0, 2)
      .map((t) => variant(pair.a.pinyin, i, { tone: t }));
  }
  // คู่ม้วนลิ้น: เปลี่ยนแค่เสียงต้นเป็นอีกคู่ม้วน/ไม่ม้วน (วรรณยุกต์เท่าเดิม) · r/l หรือ final เสี่ยง → เหลือ 2 ตัวเลือก
  const alt = SIBILANT_ALT[A[i].initial];
  if (!alt || !SAFE_FINALS.has(A[i].final)) return [];
  return alt.map((ini) => variant(pair.a.pinyin, i, { initial: ini }));
}

function makeQuestion(pair: Pair): EarQ {
  const playA = Math.random() < 0.5;
  const target = playA ? pair.a : pair.b;
  const other = playA ? pair.b : pair.a;
  const answer = canon(target.pinyin);
  const choices = shuffle([...new Set([answer, canon(other.pinyin), ...extraChoices(pair)])]);
  return { pair, target, other, answer, choices, kc: playA ? pair.kc : pair.kcReverse };
}

function buildRound(pairs: Pair[], n: number): EarQ[] {
  if (pairs.length === 0) return [];
  // แยกกองตาม KC แล้ววนหยิบทีละกอง → 1 รอบได้ครบทุกจุดเสียง (กันกองคู่ไม่ผูก KC ที่มีเยอะสุดกินทั้งรอบ)
  const piles = new Map<string, Pair[]>();
  for (const p of shuffle(pairs)) {
    const key = p.kc ?? `-${p.kind}`; // คู่ไม่มี KC รวมกองเดียวตามมิติ (วรรณยุกต์อื่น ๆ / ม้วนลิ้นอื่น ๆ)
    const pile = piles.get(key);
    if (pile) pile.push(p);
    else piles.set(key, [p]);
  }
  const queues = shuffle([...piles.values()]);
  const ordered: Pair[] = [];
  while (ordered.length < pairs.length) {
    for (const pile of queues) {
      const p = pile.shift();
      if (p) ordered.push(p);
    }
  }
  // คู่น้อยกว่า n → วนซ้ำ (สุ่มเปิดคนละคำในคู่ได้) · สับแล้วเลี่ยงคู่เดิมติดกัน
  const round = shuffle(Array.from({ length: n }, (_, k) => ordered[k % ordered.length]));
  for (let k = 1; k < round.length; k++) {
    if (round[k] !== round[k - 1]) continue;
    const j = round.findIndex((p, x) => x > k && p !== round[k - 1]);
    if (j > 0) [round[k], round[j]] = [round[j], round[k]];
  }
  return round.map(makeQuestion);
}

/** นับซ้ำ → [ป้าย, จำนวน] เรียงมากไปน้อย */
function countBy(labels: string[]): [string, number][] {
  const m = new Map<string, number>();
  for (const l of labels) m.set(l, (m.get(l) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]);
}
