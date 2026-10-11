"use client";

// เติมคำในช่องว่าง (选词填空) — เลือกคำจากคลังคำมาเติมประโยค HSK 1 · 10 ข้อ/รอบ
// โหมดฝึกใจดี: ตอบแล้วเฉลยทันที + เหตุผลภาษาไทยสั้น ๆ · เป็นข้ออ่าน = ไม่มีเสียง (PR-06)
// ช่องที่เจาะ: คำไวยากรณ์ตาม kc/focus ของประโยคก่อน (的 个 也 都 吗 ...) ไม่มีค่อยสุ่มคำที่ไม่ใช่คำแรก
// พินอินของประโยคซ่อนจนกว่าจะตอบ (ไม่งั้นเดาจากเสียงได้) · โจทย์โชว์คำแปลไทย ให้มีคำตอบที่ถูกข้อเดียว
//   (ไม่มีคำแปล "我___喜欢你" เติม 也/很/不 ก็ถูกไวยากรณ์หมด)
// skill_code (Q-matrix): kc ของประโยค → ช่องเป็นคำไวยากรณ์ = SKILL-ORDER → ช่องเป็นคำเนื้อหา (คำศัพท์) = SKILL-READ
// ประโยคร่าง (SENTENCES_REVIEWED = false) → ป้ายฉบับร่างบนหน้า + คำตอบติด mock_ref (sync ข้าม)

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { SENTENCES, SENTENCES_REVIEWED, draftSentenceRef, type SentenceItem } from "@/data/sentences";
import type { KcCode } from "@/data/thaiL1"; // type อย่างเดียว — ไม่ลาก catalog JSON เข้า bundle หน้านี้
import { saveRound } from "@/lib/progress";
import { logAttempt } from "@/lib/attempts-outbox";
import { shuffle } from "@/lib/random";
import { Center } from "@/components/Feedback";
import { FeedbackCard } from "@/components/FeedbackCard";
import { Icon } from "@/components/Icon";
import { Pinyin } from "@/components/Pinyin";
import { Mascot } from "@/components/Mascot";
import { ProgressBar } from "@/components/ProgressBar";
import { DraftSentenceBadge } from "@/components/MockBadge";

const N_QUESTIONS = 10;

// ประโยคที่ผูก kc → เจาะคำไวยากรณ์ของ kc นั้นก่อน (ตรงจุดที่คนไทยพลาด)
const KC_WORDS: Partial<Record<KcCode, string[]>> = {
  "TL-GRAM-DE-ORDER": ["的"],
  "TL-GRAM-MW": ["个", "本", "块", "口", "岁", "些"],
  "TL-GRAM-ADV": ["也", "都", "很", "不", "没", "太", "还"],
  "TL-GRAM-LE": ["了"],
  "TL-GRAM-COMPL": ["得"],
};

// คำไวยากรณ์ตัวเล็ก — focus_th เอ่ยถึงคำไหนในประโยคก็เจาะคำนั้น · ใช้เลือกตัวลวง "ประเภทเดียวกับคำตอบ" ด้วย
const GRAMMAR_WORDS = new Set([
  ...["的", "个", "也", "都", "吗", "呢", "吧", "很", "了", "是", "想", "不", "没", "在", "和", "要", "会", "能", "太"],
  ...Object.values(KC_WORDS).flatMap((w) => w ?? []),
]);

type Question = { s: SentenceItem; blank: number; choices: string[] };

/** ช่องที่จะเจาะ: คำของ kc → คำไวยากรณ์ที่ focus_th เอ่ยถึง → สุ่มคำที่ไม่ใช่คำแรก (คำแรกมักเป็นประธาน ง่ายเกิน) */
function pickBlank(s: SentenceItem): number {
  const kcWords = s.kc ? KC_WORDS[s.kc as KcCode] : undefined;
  const byKc = kcWords ? s.tokens.findIndex((t) => kcWords.includes(t)) : -1;
  if (byKc >= 0) return byKc;
  const byFocus = s.tokens.findIndex((t) => GRAMMAR_WORDS.has(t) && s.focus_th.includes(t));
  if (byFocus >= 0) return byFocus;
  const rest = s.tokens.map((_, i) => i).slice(1);
  return rest.length > 0 ? shuffle(rest)[0] : 0;
}

/** คำตอบ + ตัวลวง 3 คำจากประโยคอื่น (ไม่ซ้ำ · ไม่ใช่คำที่อยู่ในประโยคนี้แล้ว) — หยิบคำประเภทเดียวกับคำตอบก่อน */
function buildChoices(s: SentenceItem, answer: string): string[] {
  const own = new Set(s.tokens);
  const pool = Array.from(new Set(SENTENCES.filter((o) => o.id !== s.id).flatMap((o) => o.tokens))).filter(
    (t) => !own.has(t)
  );
  const grammar = GRAMMAR_WORDS.has(answer);
  const sameKind = pool.filter((t) => GRAMMAR_WORDS.has(t) === grammar);
  const otherKind = pool.filter((t) => GRAMMAR_WORDS.has(t) !== grammar);
  return shuffle([answer, ...[...shuffle(sameKind), ...shuffle(otherKind)].slice(0, 3)]);
}

function buildQuestions(): Question[] {
  return shuffle(SENTENCES)
    .slice(0, Math.min(N_QUESTIONS, SENTENCES.length))
    .map((s) => {
      const blank = pickBlank(s);
      return { s, blank, choices: buildChoices(s, s.tokens[blank]) };
    });
}

/** ms ตั้งแต่ข้อโผล่ถึงตอนกดตอบ — at = event.timeStamp (นาฬิกาเดียวกับ performance.now) · ค่าเพี้ยน = ไม่ส่ง */
function spentMs(from: number, at: number): number | undefined {
  const ms = Math.round(at - from);
  return ms >= 0 && ms < 60 * 60 * 1000 ? ms : undefined;
}

// สุ่มโจทย์ฝั่ง client เท่านั้น — ถ้าสุ่มตอน SSR ชุดจะไม่ตรงกับตอน hydrate (hydration mismatch)
const subscribeNoop = () => () => {};
function useIsClient(): boolean {
  return useSyncExternalStore(subscribeNoop, () => true, () => false);
}

export default function FillPractice() {
  const isClient = useIsClient();
  const [roundNo, setRoundNo] = useState(0); // เปลี่ยน key = เริ่มรอบใหม่ สุ่มโจทย์ใหม่
  if (!isClient) return <Center>กำลังเตรียมโจทย์...</Center>;
  return <FillRound key={roundNo} onRestart={() => setRoundNo((n) => n + 1)} />;
}

function FillRound({ onRestart }: { onRestart: () => void }) {
  const [questions] = useState(buildQuestions);
  const [qi, setQi] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [done, setDone] = useState(false);
  const savedRef = useRef(false);
  const shownAtRef = useRef(0); // เวลาที่ข้อนี้โผล่ — ใช้คิด time_spent_ms
  const nextRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    shownAtRef.current = performance.now();
  }, [qi]);

  // ตอบแล้วปุ่มตัวเลือกถูกปิด → ย้ายโฟกัสไปปุ่ม "ข้อถัดไป" (คีย์บอร์ด/สวิตช์) ไม่เลื่อนจอ
  useEffect(() => {
    if (picked !== null) nextRef.current?.focus({ preventScroll: true });
  }, [picked]);

  const q = questions[qi];
  const target = q.s.tokens[q.blank];
  const answered = picked !== null;
  const isRight = picked === target;

  function choose(token: string, at: number) {
    if (answered) return; // ตอบแล้วล็อกไว้
    const ok = token === target;
    setPicked(token);
    if (ok) setCorrectCount((c) => c + 1);
    logAttempt({
      generator: "fill_blank",
      event_type: "graded",
      sentence_id: q.s.id,
      mock_ref: draftSentenceRef(q.s.id), // ประโยคร่าง → sync ข้าม (ไม่เข้าข้อมูลเทรน BKT)
      // ช่องคำไวยากรณ์ = โครงสร้างประโยค · ช่องคำเนื้อหา (你 爱 喜欢 猫 …) = ศัพท์/การอ่าน — ไม่ปนเข้า SKILL-ORDER
      skill_code: q.s.kc ?? (GRAMMAR_WORDS.has(target) ? "SKILL-ORDER" : "SKILL-READ"),
      answer: { picked: token, target }, // target = คำที่เจาะ (ประโยคไม่มีจุดไวยากรณ์ สุ่มช่องได้หลายแบบ)
      is_correct: ok,
      time_spent_ms: spentMs(shownAtRef.current, at),
      context: "practice",
    });
  }

  function next() {
    if (qi + 1 >= questions.length) {
      setDone(true);
      if (!savedRef.current) {
        saveRound({ ts: Date.now(), mode: "fill", total: questions.length, correct: correctCount });
        savedRef.current = true;
      }
      return;
    }
    setQi((i) => i + 1);
    setPicked(null);
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
          {pass ? "เยี่ยมมาก!" : "สู้ ๆ ทวนอีกนิด!"}
        </h1>
        <div className="w-full rounded-3xl bg-gradient-to-br from-ocean-900 via-ocean-800 to-ocean-600 p-6 text-center text-white shadow-lg shadow-ocean-900/20">
          <div className="font-[family-name:var(--font-display)] text-5xl font-extrabold">
            {correctCount}
            <span className="text-2xl font-normal text-ocean-100"> / {questions.length}</span>
          </div>
          <div className="mt-1 text-ocean-100">เติมถูก {pct}%</div>
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
            className="flex flex-1 items-center justify-center rounded-xl bg-slate-100 px-4 py-3 font-medium text-slate-600 transition hover:bg-slate-200 active:scale-95"
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
  return (
    <div className="flex flex-col gap-5 p-5">
      {!SENTENCES_REVIEWED && <DraftSentenceBadge />}
      {/* หัว + ความคืบหน้า */}
      <div>
        <div className="flex items-center justify-between text-sm text-slate-500">
          <Link href="/practice" className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-600">
            <Icon name="arrowLeft" className="h-3.5 w-3.5" /> ออก
          </Link>
          <span>
            ข้อ {qi + 1}/{questions.length} · ถูก {correctCount}
          </span>
        </div>
        <ProgressBar className="mt-2" size="lg" value={qi} max={questions.length} label="ความคืบหน้าในรอบเติมคำ" />
      </div>

      {/* โจทย์: คำแปลไทย + ประโยคจีนเว้นช่อง (ตัวจีนล้วน · พินอินขึ้นหลังตอบ) */}
      <div className="flex flex-col items-center gap-4 rounded-3xl border border-slate-100 bg-white px-4 py-6 text-center shadow-sm">
        <div>
          <div className="text-xs text-slate-400">เลือกคำมาเติมช่องว่าง ให้ได้ประโยคที่แปลว่า</div>
          <div className="mt-1 text-lg font-semibold text-slate-700">“{q.s.meaning_th}”</div>
        </div>
        <div className="flex flex-wrap items-baseline justify-center gap-x-1.5 gap-y-3 font-[family-name:var(--font-sc)] text-3xl text-slate-900">
          {q.s.tokens.map((t, i) =>
            i !== q.blank ? (
              <span key={i}>{t}</span>
            ) : answered ? (
              <span key={i} className="rounded-lg bg-emerald-50 px-1.5 font-bold text-correct">
                {t}
              </span>
            ) : (
              <span
                key={i}
                className="inline-block h-[1.15em] w-[2.2em] rounded-t-md border-b-4 border-dashed border-ocean-300 bg-ocean-50"
              >
                <span className="sr-only">ช่องว่าง</span>
              </span>
            )
          )}
        </div>
        {answered ? (
          <Pinyin text={q.s.pinyin} className="text-base" />
        ) : (
          <div className="text-xs text-slate-400">พินอินจะขึ้นให้ดูหลังตอบ</div>
        )}
      </div>

      {/* ตัวเลือกจากคลังคำ */}
      <div className="grid grid-cols-2 gap-3">
        {q.choices.map((c) => {
          const isAnswer = c === target;
          const isPicked = c === picked;
          let cls = "border-slate-200 bg-white text-slate-800 hover:border-ocean-300";
          if (answered) {
            if (isAnswer) cls = "border-correct bg-emerald-50 text-emerald-800";
            else if (isPicked) cls = "border-coral/50 bg-coral-soft text-ocean-900";
            else cls = "border-slate-100 bg-slate-50 text-slate-400";
          }
          return (
            <button
              key={c}
              onClick={(e) => choose(c, e.timeStamp)}
              disabled={answered}
              className={`relative rounded-2xl border px-3 py-4 font-[family-name:var(--font-sc)] text-2xl font-semibold shadow-sm transition active:scale-95 ${cls}`}
            >
              {c}
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

      {/* เฉลย + เหตุผล — ประโยคเต็ม/พินอิน/คำแปลโชว์ในการ์ดโจทย์ด้านบนแล้ว · จุดไวยากรณ์ของข้ออยู่ใน hint */}
      {answered && (
        <FeedbackCard
          correct={isRight}
          yourAnswer={isRight ? undefined : { main: picked, chinese: true }}
          rightAnswer={{ main: target, chinese: true }}
          hint={q.s.focus_th}
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
