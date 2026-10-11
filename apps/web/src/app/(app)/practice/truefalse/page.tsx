"use client";

// จริง/เท็จ คำ ↔ ความหมาย (ทักษะอ่าน) — เห็นตัวจีน + พินอิน กับคำแปลไทย 1 อัน → ตัดสินว่าตรงกันไหม
// PR-06: ข้ออ่านไม่มีเสียง · PA-14: เรียนแล้ว ≥4 คำ สุ่มเฉพาะคำที่เรียนแล้ว ไม่ถึงใช้ทั้งคลัง (เหมือน MCQ ใน /practice)
// จริงครึ่งรอบ เท็จครึ่งรอบ — ข้อเท็จใช้คำแปลของคำอื่นที่ "ไม่ใกล้เคียง" (กันข้อกำกวม เช่น 爱 "รัก / ชอบ" กับ 喜欢 "ชอบ")
// ทุกคำตอบ log ลง outbox (true_false · SKILL-READ) + saveRound("truefalse") ตอนจบรอบ

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase, type Word } from "@/lib/supabase";
import { Center, ErrorState } from "@/components/Feedback";
import { shuffle } from "@/lib/random";
import { saveRound } from "@/lib/progress";
import { loadCards } from "@/lib/fsrs";
import { logAttempt } from "@/lib/attempts-outbox";
import { Icon } from "@/components/Icon";
import { Pinyin, PinyinToggle } from "@/components/Pinyin";
import { Mascot } from "@/components/Mascot";
import { ProgressBar } from "@/components/ProgressBar";
import { FeedbackCard } from "@/components/FeedbackCard";

const N_QUESTIONS = 10;

type Question = { word: Word; shown: Word }; // shown = เจ้าของคำแปลที่โชว์ · shown === word คือข้อจริง

export default function TrueFalsePractice() {
  const [pool, setPool] = useState<Word[]>([]);
  const [withMeaning, setWithMeaning] = useState<Word[]>([]); // ทั้งคลังที่มีคำแปล — สำรองหาคำแปลหลอก
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [qi, setQi] = useState(0);
  const [picked, setPicked] = useState<boolean | null>(null); // true = ตอบ "จริง"
  const [correctCount, setCorrectCount] = useState(0);
  const [done, setDone] = useState(false);
  const savedRef = useRef(false);
  const shownAtRef = useRef(0);
  const nextRef = useRef<HTMLButtonElement>(null);

  // ตอบแล้วปุ่มจริง/เท็จถูกปิด → โฟกัสหลุดไป <body> · ย้ายไปปุ่ม "ข้อถัดไป" (คีย์บอร์ด/สวิตช์) ไม่เลื่อนจอ
  useEffect(() => {
    if (picked !== null) nextRef.current?.focus({ preventScroll: true });
  }, [picked]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("words")
        .select("id, hanzi, pinyin, meaning_th, meaning_en, th_reviewed, audio_path, hsk_level, category")
        .eq("hsk_level", 1)
        .order("id");
      if (cancelled) return;
      if (error) {
        setError(error.message);
      } else {
        const all = (data as Word[]).filter((w) => w.meaning_th && w.meaning_th.trim());
        const learnedIds = new Set(Object.keys(loadCards()).map(Number));
        const learned = all.filter((w) => learnedIds.has(w.id));
        const p = learned.length >= 4 ? learned : all;
        setWithMeaning(all);
        setPool(p);
        setQuestions(buildQuiz(p, all, N_QUESTIONS));
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // จับเวลาตั้งแต่ข้อขึ้นจอ (time_spent_ms ใน outbox)
  useEffect(() => {
    shownAtRef.current = performance.now();
  }, [qi, questions]);

  const q = questions[qi];

  function answer(saysTrue: boolean, at: number) {
    if (picked !== null || !q) return; // ตอบแล้วล็อก
    const isTrue = q.shown.id === q.word.id;
    const ok = saysTrue === isTrue;
    setPicked(saysTrue);
    if (ok) setCorrectCount((c) => c + 1);
    logAttempt({
      generator: "true_false",
      variant: "meaning",
      event_type: "graded",
      word_id: q.word.id,
      skill_code: "SKILL-READ",
      answer: { shown_meaning_of: q.shown.id, picked: saysTrue },
      is_correct: ok,
      time_spent_ms: elapsedMs(shownAtRef.current, at),
      context: "practice",
    });
  }

  function next() {
    if (qi + 1 >= questions.length) {
      setDone(true);
      if (!savedRef.current) {
        saveRound({ ts: Date.now(), mode: "truefalse", total: questions.length, correct: correctCount });
        savedRef.current = true;
      }
    } else {
      setQi((i) => i + 1);
      setPicked(null);
    }
  }

  function restart() {
    setQuestions(buildQuiz(pool, withMeaning, N_QUESTIONS));
    setQi(0);
    setPicked(null);
    setCorrectCount(0);
    setDone(false);
    savedRef.current = false;
  }

  if (loading) return <Center>กำลังโหลดคลังคำ...</Center>;
  if (error) return <ErrorState detail={error} />;
  if (!q)
    return (
      <Center>
        <div className="flex flex-col items-center gap-3 px-6 text-center">
          <p>คลังคำยังไม่พอทำข้อจริง/เท็จ</p>
          <Link href="/practice" className="text-sm text-ocean-500 underline">
            กลับเมนูฝึก
          </Link>
        </div>
      </Center>
    );

  // ---------- สรุปผล ----------
  if (done) {
    const pct = Math.round((correctCount / questions.length) * 100);
    const pass = pct >= 60;
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
          {pass ? "อ่านแม่นมาก!" : "สู้ ๆ ทวนอีกนิด!"}
        </h1>
        <div className="w-full rounded-3xl bg-gradient-to-br from-ocean-900 via-ocean-800 to-ocean-600 p-6 text-center text-white shadow-lg shadow-ocean-900/20">
          <div className="font-[family-name:var(--font-display)] text-5xl font-extrabold">
            {correctCount}
            <span className="text-2xl font-normal text-ocean-100"> / {questions.length}</span>
          </div>
          <div className="mt-1 text-ocean-100">ตอบถูก {pct}%</div>
        </div>
        <div className="flex w-full gap-3">
          <button
            onClick={restart}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-ocean-700 px-4 py-3 font-semibold text-white shadow transition hover:bg-ocean-900 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-300 focus-visible:ring-offset-2"
          >
            <Icon name="refresh" className="h-5 w-5" /> ฝึกอีกรอบ
          </button>
          <Link
            href="/practice"
            className="flex-1 rounded-xl bg-slate-100 px-4 py-3 text-center font-medium text-slate-600 transition hover:bg-slate-200 active:scale-95"
          >
            กลับเมนูฝึก
          </Link>
        </div>
        <Link href="/progress" className="text-sm text-ocean-500 underline">
          ดูสรุปผลการฝึกทั้งหมด
        </Link>
      </div>
    );
  }

  // ---------- ทำข้อ ----------
  const answered = picked !== null;
  const isTrue = q.shown.id === q.word.id;
  const isRight = answered && picked === isTrue;

  return (
    <div className="flex flex-col gap-5 p-5">
      <div>
        <div className="flex items-center justify-between text-sm text-slate-500">
          <Link href="/practice" className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-600">
            <Icon name="arrowLeft" className="h-3.5 w-3.5" /> ออก
          </Link>
          <span>
            ข้อ {qi + 1}/{questions.length} · ถูก {correctCount}
          </span>
        </div>
        <ProgressBar className="mt-2" size="lg" value={qi} max={questions.length} label="ความคืบหน้าในรอบจริง/เท็จ" />
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-xs text-slate-400">จริง/เท็จ · ตัวจีน ↔ คำแปล</span>
          <PinyinToggle />
        </div>
      </div>

      {/* โจทย์ — ไม่มีเสียง (PR-06) · พินอินซ่อนได้จนกว่าจะตอบ */}
      <div className="flex min-h-[34vh] flex-col items-center justify-center rounded-3xl border border-slate-100 bg-white p-6 text-center shadow-sm">
        <div className="font-[family-name:var(--font-sc)] text-7xl font-bold text-slate-900">{q.word.hanzi}</div>
        <Pinyin text={q.word.pinyin} hideable={!answered} className="mt-3 text-2xl font-medium" />
        <div className="mt-5 text-xs text-slate-400">แปลว่า</div>
        <div className="mt-1 rounded-2xl bg-ocean-50 px-4 py-2 text-xl font-semibold text-ocean-900">“{q.shown.meaning_th}”</div>
        {!answered && <div className="mt-4 text-sm text-slate-500">ถูกต้องไหม?</div>}
      </div>

      {/* ปุ่มตอบ */}
      <div className="grid grid-cols-2 gap-3">
        {([true, false] as const).map((v) => {
          let cls = "border-slate-200 bg-white text-slate-700 hover:border-ocean-300";
          if (answered) {
            if (v === isTrue) cls = "border-correct bg-emerald-50 text-emerald-800";
            else if (v === picked) cls = "border-coral/50 bg-coral-soft text-ocean-900";
            else cls = "border-slate-100 bg-slate-50 text-slate-400";
          }
          return (
            <button
              key={String(v)}
              onClick={(e) => answer(v, e.timeStamp)}
              disabled={answered}
              className={`flex items-center justify-center gap-2 rounded-2xl border px-4 py-4 text-lg font-semibold transition active:scale-[0.98] ${cls}`}
            >
              <Icon name={v ? "check" : "x"} className="h-5 w-5" strokeWidth={2.4} />
              {v ? "จริง" : "เท็จ"}
            </button>
          );
        })}
      </div>

      {/* เฉลย: ที่ถูกคือจริง/เท็จ + คำแปลจริงของคำนี้ (+ คำแปลที่โชว์เป็นของคำไหน) */}
      {answered && (
        <FeedbackCard
          correct={isRight}
          yourAnswer={isRight ? undefined : { main: picked ? "จริง" : "เท็จ" }}
          rightAnswer={{ main: isTrue ? "จริง" : "เท็จ", sub: `${q.word.hanzi} แปลว่า “${q.word.meaning_th}”` }}
          hint={explain(q)}
        />
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

// เวลาที่ใช้ตอบ = timeStamp ของคลิก (นาฬิกาเดียวกับ performance.now()) − ตอนข้อขึ้นจอ · ค่าแปลก (เบราว์เซอร์เก่า) = ไม่ส่ง
function elapsedMs(shownAt: number, at: number): number | undefined {
  const ms = at - shownAt;
  return ms >= 0 && ms < 3_600_000 ? Math.round(ms) : undefined;
}

// คำอธิบายสั้นใต้เฉลย — ข้อเท็จบอกด้วยว่าคำแปลที่โชว์เป็นของคำไหน (ได้ทวนอีกคำไปในตัว)
function explain({ word, shown }: Question): string {
  if (shown.id === word.id) return `${word.hanzi} (${word.pinyin}) แปลว่า “${word.meaning_th}” ตรงตามที่เห็นเลย`;
  return `${word.hanzi} (${word.pinyin}) แปลว่า “${word.meaning_th}” · ส่วน “${shown.meaning_th}” คือ ${shown.hanzi} (${shown.pinyin})`;
}

// ---------- สร้างชุดข้อ ----------
function buildQuiz(pool: Word[], all: Word[], n: number): Question[] {
  if (pool.length < 2) return [];
  const targets = shuffle(pool).slice(0, Math.min(n, pool.length));
  // จริงครึ่ง เท็จครึ่ง แล้วสลับตำแหน่ง — ไม่ปล่อยสุ่มล้วนจนออกจริงติดกัน 8 ข้อ
  const truths = shuffle(targets.map((_, i) => i < Math.ceil(targets.length / 2)));
  return targets.map((word, i) => {
    if (truths[i]) return { word, shown: word };
    // คำแปลหลอก: เอาจากชุดเดียวกับโจทย์ก่อน (คำที่เรียนแล้ว → ต้องแยกให้ออกจริง ๆ) ไม่มีค่อยหาจากทั้งคลัง
    // หาไม่ได้เลย (คลังเล็กผิดปกติ) = กลายเป็นข้อจริงแทน
    const shown = pickFalseMeaning(word, pool) ?? pickFalseMeaning(word, all) ?? word;
    return { word, shown };
  });
}

function pickFalseMeaning(word: Word, from: Word[]): Word | undefined {
  return shuffle(from).find((w) => w.id !== word.id && !tooClose(w.meaning_th, word.meaning_th));
}

// คำแปลที่ "ใกล้กันเกิน" ห้ามใช้เป็นข้อเท็จ (ผู้เรียนเถียงได้ว่าจริง) — เช่น 不 "ไม่" กับ 没有 "ไม่มี / ไม่ได้"
// ตัดเป็นส่วน ๆ ตาม / , ; ( ) แล้วดูว่ามีส่วนไหนซ้ำหรือซ้อนกัน (ตัดเกินบ้างไม่เป็นไร คลังมี ~300 คำ)
function meaningParts(m: string): string[] {
  return m
    .split(/[\/,;()（）·]+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function tooClose(a: string, b: string): boolean {
  const pb = meaningParts(b);
  return meaningParts(a).some((x) => pb.some((y) => x.includes(y) || y.includes(x)));
}
