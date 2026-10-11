"use client";

// อ่านประโยค → เลือกความหมาย (ทักษะอ่านระดับประโยค) — ใช้ชุด SENTENCES (ร่าง AI · รอหฤทัยตรวจ)
// PR-06: ข้ออ่านไม่มีเสียง · โชว์ตัวจีน + พินอิน — ซ่อนพินอินได้ด้วยสวิตช์ (กฎ m1-6 หย่าพินอิน)
// ตัวเลือก = ความหมายของประโยคนี้ + ของประโยคอื่น 3 ประโยค (เลือกประโยคที่ใช้คำซ้ำกันก่อน → ต้องอ่านทั้งประโยค เดาจากคำเดียวไม่ได้)
// ทุกคำตอบ log ลง outbox (read_sentence · SKILL-READ · sentence_id) + saveRound("read_sentence") ตอนจบรอบ
// ประโยคร่าง (SENTENCES_REVIEWED = false) → ป้ายฉบับร่างบนหน้า + คำตอบติด mock_ref (sync ข้าม)

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { SENTENCES, SENTENCES_REVIEWED, draftSentenceRef, type SentenceItem } from "@/data/sentences";
import { Center } from "@/components/Feedback";
import { DraftSentenceBadge } from "@/components/MockBadge";
import { shuffle } from "@/lib/random";
import { saveRound } from "@/lib/progress";
import { logAttempt } from "@/lib/attempts-outbox";
import { Icon } from "@/components/Icon";
import { Pinyin, PinyinToggle } from "@/components/Pinyin";
import { Mascot } from "@/components/Mascot";
import { ProgressBar } from "@/components/ProgressBar";
import { FeedbackCard } from "@/components/FeedbackCard";

const N_QUESTIONS = 10; // SENTENCES มี 10 ประโยค → สุ่มลำดับทั้งหมด

type Choice = { id: number; label: string }; // id = SentenceItem.id เจ้าของความหมายนี้
type Question = { s: SentenceItem; choices: Choice[] };

const noopSubscribe = () => () => {};

export default function ReadSentencePractice() {
  // สุ่มข้อเฉพาะฝั่ง client — ถ้าสุ่มตอน SSR ลำดับจะไม่ตรงกับฝั่ง client (hydration mismatch)
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [round, setRound] = useState(0); // +1 = เริ่มรอบใหม่ (remount → สุ่มชุดใหม่)
  if (!isClient) return <Center>กำลังเตรียมประโยค...</Center>;
  return <Round key={round} onRestart={() => setRound((r) => r + 1)} />;
}

function Round({ onRestart }: { onRestart: () => void }) {
  const [questions] = useState(() => buildQuiz(SENTENCES, N_QUESTIONS));
  const [qi, setQi] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [done, setDone] = useState(false);
  const savedRef = useRef(false);
  const shownAtRef = useRef(0);
  const nextRef = useRef<HTMLButtonElement>(null);

  // จับเวลาตั้งแต่ข้อขึ้นจอ (time_spent_ms ใน outbox)
  useEffect(() => {
    shownAtRef.current = performance.now();
  }, [qi]);

  // ตอบแล้วปุ่มตัวเลือกถูกปิด → ย้ายโฟกัสไปปุ่ม "ข้อถัดไป" (คีย์บอร์ด/สวิตช์) ไม่เลื่อนจอ
  useEffect(() => {
    if (picked !== null) nextRef.current?.focus({ preventScroll: true });
  }, [picked]);

  const q = questions[qi];

  function choose(c: Choice, at: number) {
    if (picked !== null) return; // ตอบแล้วล็อก
    const ok = c.id === q.s.id;
    setPicked(c.id);
    if (ok) setCorrectCount((n) => n + 1);
    logAttempt({
      generator: "read_sentence",
      variant: "meaning",
      event_type: "graded",
      sentence_id: q.s.id,
      mock_ref: draftSentenceRef(q.s.id), // ประโยคร่าง → sync ข้าม (ไม่เข้าข้อมูลเทรน BKT)
      skill_code: "SKILL-READ",
      answer: { picked_id: c.id },
      is_correct: ok,
      time_spent_ms: elapsedMs(shownAtRef.current, at),
      context: "practice",
    });
  }

  function next() {
    if (qi + 1 >= questions.length) {
      setDone(true);
      if (!savedRef.current) {
        saveRound({ ts: Date.now(), mode: "read_sentence", total: questions.length, correct: correctCount });
        savedRef.current = true;
      }
    } else {
      setQi((i) => i + 1);
      setPicked(null);
    }
  }

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
          {pass ? "อ่านประโยคเก่งมาก!" : "สู้ ๆ อ่านอีกนิด!"}
        </h1>
        <div className="w-full rounded-3xl bg-gradient-to-br from-ocean-900 via-ocean-800 to-ocean-600 p-6 text-center text-white shadow-lg shadow-ocean-900/20">
          <div className="font-[family-name:var(--font-display)] text-5xl font-extrabold">
            {correctCount}
            <span className="text-2xl font-normal text-ocean-100"> / {questions.length}</span>
          </div>
          <div className="mt-1 text-ocean-100">อ่านถูก {pct}%</div>
        </div>
        <div className="flex w-full gap-3">
          <button
            onClick={onRestart}
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
  const isRight = picked === q.s.id;
  const pickedChoice = q.choices.find((c) => c.id === picked);
  const pickedSentence = !isRight ? SENTENCES.find((x) => x.id === picked) : undefined; // ความหมายที่เลือกเป็นของประโยคไหน

  return (
    <div className="flex flex-col gap-5 p-5">
      {!SENTENCES_REVIEWED && <DraftSentenceBadge />}
      <div>
        <div className="flex items-center justify-between text-sm text-slate-500">
          <Link href="/practice" className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-600">
            <Icon name="arrowLeft" className="h-3.5 w-3.5" /> ออก
          </Link>
          <span>
            ข้อ {qi + 1}/{questions.length} · ถูก {correctCount}
          </span>
        </div>
        <ProgressBar className="mt-2" size="lg" value={qi} max={questions.length} label="ความคืบหน้าในรอบอ่านประโยค" />
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-xs text-slate-400">อ่านประโยค · เลือกคำแปล</span>
          <PinyinToggle />
        </div>
      </div>

      {/* โจทย์ — ไม่มีเสียง (PR-06) · พินอินซ่อนได้จนกว่าจะตอบ */}
      <div className="flex min-h-[28vh] flex-col items-center justify-center rounded-3xl border border-slate-100 bg-white p-6 text-center shadow-sm">
        <div className="text-xs text-slate-400">ประโยคนี้แปลว่าอะไร</div>
        <div className="mt-3 font-[family-name:var(--font-sc)] text-4xl font-bold leading-snug text-slate-900">{q.s.tokens.join("")}</div>
        <Pinyin text={q.s.pinyin} hideable={!answered} className="mt-3 text-lg font-medium" />
      </div>

      {/* ตัวเลือก (ความหมายไทย) */}
      <div className="grid grid-cols-1 gap-3">
        {q.choices.map((c) => {
          const isCorrect = c.id === q.s.id;
          const isPicked = c.id === picked;
          let cls = "border-slate-200 bg-white text-slate-700 hover:border-ocean-300";
          if (answered) {
            if (isCorrect) cls = "border-correct bg-emerald-50 text-emerald-800";
            else if (isPicked) cls = "border-coral/50 bg-coral-soft text-ocean-900";
            else cls = "border-slate-100 bg-slate-50 text-slate-400";
          }
          return (
            <button
              key={c.id}
              onClick={(e) => choose(c, e.timeStamp)}
              disabled={answered}
              className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-4 text-left text-base transition ${cls}`}
            >
              <span>{c.label}</span>
              {answered && isCorrect && <Icon name="check" className="h-5 w-5 shrink-0 text-correct" strokeWidth={2.4} />}
              {answered && isPicked && !isCorrect && <Icon name="x" className="h-5 w-5 shrink-0 text-coral" strokeWidth={2.4} />}
            </button>
          );
        })}
      </div>

      {/* เฉลย + จุดไวยากรณ์ของประโยค (focus_th) */}
      {answered && (
        <FeedbackCard
          correct={isRight}
          yourAnswer={!isRight && pickedChoice ? { main: pickedChoice.label } : undefined}
          rightAnswer={{ main: q.s.meaning_th }}
          hint={
            pickedChoice && pickedSentence
              ? `ส่วน “${pickedChoice.label}” คือประโยค ${pickedSentence.tokens.join("")} · จุดที่ฝึก: ${q.s.focus_th}`
              : `จุดที่ฝึก: ${q.s.focus_th}`
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
    </div>
  );
}

// เวลาที่ใช้ตอบ = timeStamp ของคลิก (นาฬิกาเดียวกับ performance.now()) − ตอนข้อขึ้นจอ · ค่าแปลก (เบราว์เซอร์เก่า) = ไม่ส่ง
function elapsedMs(shownAt: number, at: number): number | undefined {
  const ms = at - shownAt;
  return ms >= 0 && ms < 3_600_000 ? Math.round(ms) : undefined;
}

// ---------- สร้างชุดข้อ ----------
function buildQuiz(items: SentenceItem[], n: number): Question[] {
  return shuffle(items)
    .slice(0, Math.min(n, items.length))
    .map((s) => {
      const shared = (o: SentenceItem) => o.tokens.filter((t) => s.tokens.includes(t)).length;
      // สับก่อนแล้วค่อยเรียงตามจำนวนคำที่ใช้ร่วม (sort คงลำดับเดิมเมื่อเท่ากัน → ตัวที่เสมอกันยังสุ่ม)
      const others = shuffle(items.filter((o) => o.id !== s.id)).sort((a, b) => shared(b) - shared(a));
      const used = new Set([s.meaning_th]);
      const distractors: Choice[] = [];
      for (const o of others) {
        if (distractors.length >= 3) break;
        if (used.has(o.meaning_th)) continue; // กันตัวเลือกความหมายซ้ำ
        used.add(o.meaning_th);
        distractors.push({ id: o.id, label: o.meaning_th });
      }
      return { s, choices: shuffle([{ id: s.id, label: s.meaning_th }, ...distractors]) };
    });
}
