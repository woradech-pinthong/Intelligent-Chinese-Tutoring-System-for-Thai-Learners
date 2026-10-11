"use client";

// ฟังแล้วเลือกรูป / อ่านแล้วเลือกรูป (รูปแบบข้อสอบ HSK 1 ที่จับคู่คำกับรูป) — เดโม
// ⚠️ "รูป" = อีโมจิแทนชั่วคราว (PICTURE_WORDS ใน src/data/mock-activities.ts) · คำ/ไฟล์เสียง = ของจริงจากตาราง words (จับคู่ด้วย hanzi)
// PR-02: โหมดฟังไม่โชว์ตัวจีน/พินอิน/คำแปลก่อนตอบ · PR-06: โหมดอ่านไม่มีเสียง
// ?mode=listen|read (ค่าเริ่ม listen) · ปุ่มสลับโหมดด้านบน = เริ่มรอบใหม่
// บันทึกรอบแยกโหมด: ฟัง = "picture" · อ่าน = "picture_read" (สถิติฟังกับอ่านไม่ปนกัน)

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase, audioUrl, type Word } from "@/lib/supabase";
import { PICTURE_WORDS } from "@/data/mock-activities";
import { Center, ErrorState } from "@/components/Feedback";
import { shuffle } from "@/lib/random";
import { saveRound } from "@/lib/progress";
import { logAttempt } from "@/lib/attempts-outbox";
import { audioRate, toggleAudioRate, playAtUserRate } from "@/lib/daily";
import { Icon, type IconName } from "@/components/Icon";
import { Pinyin } from "@/components/Pinyin";
import { Mascot, MascotSays } from "@/components/Mascot";
import { ProgressBar } from "@/components/ProgressBar";
import { FeedbackCard } from "@/components/FeedbackCard";
import { MockBadge } from "@/components/MockBadge";

const N_QUESTIONS = 10;

type PicMode = "listen" | "read";
type DbWord = Pick<Word, "id" | "hanzi" | "pinyin" | "meaning_th" | "audio_path" | "category">;
type PicWord = DbWord & { emoji: string; label_th: string };
type Question = { target: PicWord; choices: PicWord[] };

// คู่ที่ห้ามอยู่ข้อเดียวกัน — รูปหนึ่งเป็น "ชนิดหนึ่งของ" อีกคำ ข้อจะกำกวม (เช่น ได้ยิน 车 แต่ 🚕 ก็เป็นรถ)
const CLASH: [string, string][] = [
  ["车", "出租车"],
  ["车", "火车"],
  ["水果", "苹果"],
  ["电话", "手机"],
];
const clash = (a: string, b: string) => CLASH.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

// จับเวลาตอบ — อยู่นอกคอมโพเนนต์ เรียกเฉพาะใน effect / event handler
const nowMs = () => performance.now();
const msSince = (t0: number) => Math.round(performance.now() - t0);

/** ตัวลวง = คำมีรูปคำอื่น · หมวด (words.category) เดียวกันมี ≥3 คำ → ใช้หมวดเดียวกันล้วน ไม่งั้นเติมจากหมวดอื่น */
function buildQuestions(words: PicWord[], mode: PicMode): Question[] {
  if (words.length < 4) return [];
  const targets = shuffle(mode === "listen" ? words.filter((w) => w.audio_path) : words).slice(0, N_QUESTIONS);
  return targets.map((target) => {
    const ok = (w: PicWord) => w.id !== target.id && !clash(w.hanzi, target.hanzi);
    const same = shuffle(words.filter((w) => ok(w) && w.category != null && w.category === target.category));
    const rest = shuffle(words.filter((w) => ok(w) && !same.includes(w)));
    const distractors = (same.length >= 3 ? same : [...same, ...rest]).slice(0, 3);
    return { target, choices: shuffle([target, ...distractors]) };
  });
}

export default function PicturePractice() {
  return (
    <Suspense fallback={<Center>กำลังโหลด...</Center>}>
      <PictureFromQuery />
    </Suspense>
  );
}

function PictureFromQuery() {
  const mode: PicMode = useSearchParams().get("mode") === "read" ? "read" : "listen";
  return <PictureLoader mode={mode} />;
}

// โหลดคำครั้งเดียว · สลับโหมด/ฝึกอีกรอบ = เปลี่ยน key ของรอบ → เริ่มรอบใหม่โดยไม่โหลดซ้ำ
function PictureLoader({ mode }: { mode: PicMode }) {
  const router = useRouter();
  const [words, setWords] = useState<PicWord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roundNo, setRoundNo] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from("words")
        .select("id, hanzi, pinyin, meaning_th, audio_path, category")
        .eq("hsk_level", 1);
      if (!alive) return;
      if (error) {
        setError(error.message);
        return;
      }
      const byHanzi = new Map((data as DbWord[]).map((w) => [w.hanzi, w]));
      setWords(
        PICTURE_WORDS.flatMap((p) => {
          const w = byHanzi.get(p.hanzi);
          return w ? [{ ...w, emoji: p.emoji, label_th: p.label_th }] : [];
        })
      );
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="flex flex-col gap-5 p-5">
      <MockBadge title="รูปชั่วคราว (อีโมจิ)" real="ของจริง: คลังรูปประกอบคำ 150–200 รูป" />
      <ModeSwitch mode={mode} onChange={(m) => m !== mode && router.replace(`/practice/picture?mode=${m}`, { scroll: false })} />
      {error ? (
        <ErrorState detail={error} />
      ) : !words ? (
        <Center>กำลังโหลดคลังคำ...</Center>
      ) : (
        <PictureRound key={`${mode}-${roundNo}`} mode={mode} words={words} onAgain={() => setRoundNo((n) => n + 1)} />
      )}
    </div>
  );
}

function PictureRound({ mode, words, onAgain }: { mode: PicMode; words: PicWord[]; onAgain: () => void }) {
  const [questions] = useState(() => buildQuestions(words, mode));
  const [qi, setQi] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correct, setCorrect] = useState(0);
  const [done, setDone] = useState(false);
  const [slow, setSlow] = useState(() => audioRate() === 0.75); // รอบนี้ mount ฝั่ง client เท่านั้น (หลังโหลดคำ)
  const shownAt = useRef(0);
  const playedFor = useRef(-1); // กันเล่นซ้ำซ้อนตอน effect รันสองรอบ (StrictMode ตอน dev)
  const savedRef = useRef(false);
  const nextRef = useRef<HTMLButtonElement>(null);

  // ตอบแล้วปุ่มรูปถูกปิด → ย้ายโฟกัสไปปุ่ม "ข้อถัดไป" (คีย์บอร์ด/สวิตช์) ไม่เลื่อนจอ
  useEffect(() => {
    if (picked !== null) nextRef.current?.focus({ preventScroll: true });
  }, [picked]);

  const q = questions[qi];
  const audioPath = mode === "listen" ? q?.target.audio_path : null; // PR-06: โหมดอ่านไม่มีเสียง

  // เข้าข้อใหม่: เริ่มจับเวลา + โหมดฟังเล่นเสียงให้เลย
  useEffect(() => {
    shownAt.current = nowMs();
    if (done || !audioPath || playedFor.current === qi) return;
    playedFor.current = qi;
    playAtUserRate(audioUrl(audioPath));
  }, [qi, done, audioPath]);

  function replay() {
    if (audioPath) playAtUserRate(audioUrl(audioPath));
  }

  function choose(id: number) {
    if (picked !== null) return;
    const ok = id === q.target.id;
    setPicked(id);
    if (ok) setCorrect((c) => c + 1);
    logAttempt({
      generator: "pick_image",
      variant: mode,
      event_type: "graded",
      word_id: q.target.id,
      skill_code: mode === "listen" ? "SKILL-LISTEN" : "SKILL-READ",
      answer: { picked_word_id: id },
      is_correct: ok,
      time_spent_ms: msSince(shownAt.current),
      context: "practice",
    });
  }

  function next() {
    if (qi + 1 >= questions.length) {
      setDone(true);
      if (!savedRef.current) {
        saveRound({ ts: Date.now(), mode: mode === "listen" ? "picture" : "picture_read", total: questions.length, correct });
        savedRef.current = true;
      }
    } else {
      setQi((i) => i + 1);
      setPicked(null);
    }
  }

  if (questions.length === 0) {
    return (
      <p className="rounded-2xl bg-amber-50 p-4 text-sm leading-relaxed text-amber-800">
        {mode === "listen"
          ? "คำที่มีทั้งรูปและไฟล์เสียงยังไม่พอทำข้อฟัง — ลองโหมดอ่านก่อนนะ"
          : "คำที่มีรูปในคลังยังไม่พอทำข้อ — รอเพิ่มรูปก่อนนะ"}
      </p>
    );
  }

  if (done) return <Summary correct={correct} total={questions.length} onAgain={onAgain} />;

  const answered = picked !== null;
  const isRight = picked === q.target.id;
  const pickedWord = answered ? q.choices.find((c) => c.id === picked) : undefined;
  const t = q.target;
  return (
    <>
      <div>
        <div className="flex items-center justify-between text-sm text-slate-500">
          <Link href="/practice" className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-600">
            <Icon name="arrowLeft" className="h-3.5 w-3.5" /> ออก
          </Link>
          <span>
            ข้อ {qi + 1}/{questions.length} · ถูก {correct}
          </span>
        </div>
        <ProgressBar className="mt-2" size="lg" value={qi} max={questions.length} label="ความคืบหน้าในรอบเลือกรูป" />
      </div>

      {mode === "listen" && !answered && qi === 0 && (
        <MascotSays mascotClassName="h-10 w-10">ฟังคำแล้วแตะรูปที่ตรงกันนะ ⭐</MascotSays>
      )}

      {/* โจทย์ */}
      <div className="flex flex-col items-center justify-center rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        {mode === "read" ? (
          <>
            <div className="font-[family-name:var(--font-sc)] text-6xl font-bold text-slate-900">{t.hanzi}</div>
            <Pinyin text={t.pinyin} className="mt-2 text-xl font-medium" />
            <div className="mt-3 text-xs text-slate-400">คำนี้ตรงกับรูปไหน</div>
          </>
        ) : (
          <>
            <button
              onClick={replay}
              aria-label="ฟังเสียง"
              className="grid h-20 w-20 place-items-center rounded-full bg-ocean-800 text-white shadow-lg shadow-ocean-900/30 transition hover:bg-ocean-900 active:scale-95"
            >
              <Icon name="speaker" className="h-9 w-9" />
            </button>
            <div className="mt-3 text-sm text-slate-400">
              {answered ? (
                <>
                  <span className="font-[family-name:var(--font-sc)] text-base font-semibold text-slate-700">{t.hanzi}</span>{" "}
                  <Pinyin text={t.pinyin} />
                </>
              ) : (
                "แตะเพื่อฟังอีกครั้ง"
              )}
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
            {!answered && <div className="mt-1 text-xs text-slate-400">ได้ยินคำว่าอะไร — แตะรูปที่ตรงกัน</div>}
          </>
        )}
      </div>

      {/* รูป 4 ช่อง — ก่อนตอบไม่มีตัวหนังสือเลย (PR-02) · ตอบแล้วเฉลยใต้ทุกรูป */}
      <div className="grid grid-cols-2 gap-3">
        {q.choices.map((c) => {
          const isAns = c.id === t.id;
          const isPicked = c.id === picked;
          let cls = "border-slate-200 bg-white hover:border-ocean-300";
          if (answered) {
            if (isAns) cls = "border-correct bg-emerald-50";
            else if (isPicked) cls = "border-coral/50 bg-coral-soft";
            else cls = "border-slate-100 bg-slate-50";
          }
          return (
            <button
              key={c.id}
              onClick={() => choose(c.id)}
              disabled={answered}
              aria-label={answered ? undefined : `รูป${c.label_th}`}
              className={`relative flex min-h-[7.5rem] flex-col items-center justify-center rounded-3xl border-2 p-3 transition active:scale-95 ${cls}`}
            >
              <span aria-hidden="true" className={`leading-none ${answered ? "text-4xl" : "text-6xl"}`}>
                {c.emoji}
              </span>
              {answered && (
                <span className="mt-2 flex flex-col items-center text-center leading-tight">
                  <span className="font-[family-name:var(--font-sc)] text-lg font-semibold text-slate-800">{c.hanzi}</span>
                  <Pinyin text={c.pinyin} className="text-xs" />
                  <span className="mt-0.5 text-[11px] text-slate-500">{c.meaning_th}</span>
                </span>
              )}
              {answered && isAns && <Icon name="check" className="absolute right-2.5 top-2.5 h-5 w-5 text-correct" strokeWidth={2.4} />}
              {answered && isPicked && !isAns && (
                <Icon name="x" className="absolute right-2.5 top-2.5 h-5 w-5 text-coral" strokeWidth={2.4} />
              )}
            </button>
          );
        })}
      </div>

      {answered && (
        <FeedbackCard
          correct={isRight}
          yourAnswer={
            pickedWord && !isRight
              ? { main: `${pickedWord.emoji} ${pickedWord.hanzi}`, sub: `${pickedWord.pinyin} · ${pickedWord.meaning_th}`, chinese: true }
              : undefined
          }
          rightAnswer={{ main: `${t.emoji} ${t.hanzi}`, sub: `${t.pinyin} · ${t.meaning_th}`, chinese: true }}
          hint={
            isRight
              ? `${t.hanzi} (${t.pinyin}) = ${t.label_th} ${t.emoji}`
              : pickedWord
                ? `${t.hanzi} (${t.pinyin}) = ${t.label_th} ${t.emoji} · ส่วน ${pickedWord.emoji} คือ ${pickedWord.hanzi} (${pickedWord.pinyin}) = ${pickedWord.label_th}`
                : undefined
          }
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
    </>
  );
}

function ModeSwitch({ mode, onChange }: { mode: PicMode; onChange: (m: PicMode) => void }) {
  const opts: { m: PicMode; label: string; icon: IconName }[] = [
    { m: "listen", label: "ฟังแล้วเลือกรูป", icon: "headphone" },
    { m: "read", label: "อ่านแล้วเลือกรูป", icon: "book" },
  ];
  return (
    <div role="group" aria-label="เลือกโหมด" className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1">
      {opts.map((o) => (
        <button
          key={o.m}
          onClick={() => onChange(o.m)}
          aria-pressed={mode === o.m}
          className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-sm font-medium transition ${
            mode === o.m ? "bg-white text-ocean-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <Icon name={o.icon} className="h-4 w-4 shrink-0" /> {o.label}
        </button>
      ))}
    </div>
  );
}


function Summary({ correct, total, onAgain }: { correct: number; total: number; onAgain: () => void }) {
  const pct = Math.round((correct / total) * 100);
  const pass = pct >= 60;
  return (
    <div className="flex flex-col items-center gap-6">
      {pass ? (
        <Mascot className="mt-2 h-20 w-20" />
      ) : (
        <div className="mt-2 grid h-20 w-20 place-items-center rounded-full bg-ocean-50 text-ocean-500">
          <Icon name="target" className="h-10 w-10" />
        </div>
      )}
      <h1 className="font-[family-name:var(--font-display)] text-xl font-bold text-ocean-900">{pass ? "เยี่ยมมาก!" : "สู้ ๆ ทวนอีกนิด!"}</h1>
      <div className="relative w-full overflow-hidden rounded-3xl bg-gradient-to-br from-ocean-900 via-ocean-800 to-ocean-600 p-6 text-center text-white shadow-lg shadow-ocean-900/20">
        <span aria-hidden="true" className="absolute left-7 top-5 h-1 w-1 rounded-full bg-white/50" />
        <span aria-hidden="true" className="absolute right-10 top-7 h-1.5 w-1.5 rounded-full bg-white/40" />
        <div className="relative font-[family-name:var(--font-display)] text-5xl font-extrabold">
          {correct}
          <span className="text-2xl font-normal text-ocean-100"> / {total}</span>
        </div>
        <div className="relative mt-1 text-ocean-100">ความแม่นยำ {pct}%</div>
      </div>
      <div className="flex w-full gap-3">
        <button
          onClick={onAgain}
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
