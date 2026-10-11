"use client";

// ฟังประโยค จริง/เท็จ (listen_sentence · เดโม) — ฟังประโยคจีน แล้วตัดสินว่าข้อความภาษาไทย "ตรงกับที่ได้ยิน" ไหม
// รูปแบบใกล้ HSK 1 ส่วนฟัง (判断对错) · PR-02 ก่อนตอบห้ามโชว์ตัวจีน/พินอินของประโยค
// โหมดฝึก "ใจดี" — ฟังซ้ำไม่จำกัด · ฟังช้า · เฉลยทันทีพร้อมเหตุผลภาษาไทย
// ⚠️ เสียง = เสียงสังเคราะห์ของเบราว์เซอร์ (speakZh) ชั่วคราว — รอไฟล์เสียงจริงของประโยค
// ⚠️ ประโยค = ชุดร่างเดียวกับโหมดเรียงประโยค (src/data/sentences.ts — รอหฤทัยตรวจ) → คำตอบติด mock_ref (sync ข้าม)
// ไม่มีเสียงจีนกลางรอบ → ปิดปุ่มจริง/เท็จ (เดาโดยไม่ได้ฟังห้ามบันทึกเป็นข้อฟัง)

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SENTENCES, SENTENCES_REVIEWED, draftSentenceRef, type SentenceItem } from "@/data/sentences";
import { FeedbackCard } from "@/components/FeedbackCard";
import { Icon } from "@/components/Icon";
import { Mascot, MascotSays } from "@/components/Mascot";
import { Pinyin } from "@/components/Pinyin";
import { ProgressBar } from "@/components/ProgressBar";
import { shuffle } from "@/lib/random";
import { saveRound } from "@/lib/progress";
import { audioRate, toggleAudioRate } from "@/lib/daily";
import { hasChineseVoice, onVoicesReady, speakZh } from "@/lib/speak";
import { logAttempt } from "@/lib/attempts-outbox";

const N_QUESTIONS = 10;
// เวลาที่ใช้ตอบ (ms) — อยู่นอก component เพราะ lint react-hooks/purity เข้าใจผิดว่า Date.now() ใน handler ถูกเรียกตอน render
const msSince = (t: number) => Date.now() - t;

type TfQ = {
  s: SentenceItem; // ประโยคที่เปิดเสียง
  statement: string; // ข้อความไทยที่ให้ตัดสิน
  statementId: number; // ข้อความมาจากประโยคไหน (= s.id ถ้าเป็นข้อจริง)
  truth: boolean; // ข้อความตรงกับที่ได้ยินไหม
};

export default function ListenSentence() {
  const [voice, setVoice] = useState<boolean | null>(null); // null = กำลังเช็กเสียงจีนในเครื่อง
  const [stage, setStage] = useState<"intro" | "quiz" | "done">("intro");
  const [questions, setQuestions] = useState<TfQ[]>([]);
  const [qi, setQi] = useState(0);
  const [said, setSaid] = useState<boolean | null>(null); // คำตอบ: true = กด "จริง"
  const [correctCount, setCorrectCount] = useState(0);
  const [slow, setSlow] = useState(false);
  const qStartRef = useRef(0);
  const savedRef = useRef(false);
  const nextRef = useRef<HTMLButtonElement>(null);

  // ตอบแล้วปุ่มจริง/เท็จถูกปิด → ย้ายโฟกัสไปปุ่ม "ข้อถัดไป" (คีย์บอร์ด/สวิตช์) ไม่เลื่อนจอ
  useEffect(() => {
    if (said !== null) nextRef.current?.focus({ preventScroll: true });
  }, [said]);

  // Chrome โหลดรายชื่อเสียงทีหลัง → ฟังผ่าน onVoicesReady · บางเบราว์เซอร์ไม่ยิง event เลย → 2 วิแล้วตัดสินจากที่มี
  useEffect(() => {
    const off = onVoicesReady(setVoice);
    const t = window.setTimeout(() => setVoice((v) => v ?? hasChineseVoice()), 2000);
    return () => {
      off();
      window.clearTimeout(t);
      window.speechSynthesis?.cancel(); // ออกจากหน้ากลางประโยค = หยุดอ่าน
    };
  }, []);

  const q = questions[qi];

  // เรียกจากการแตะเสมอ (เริ่ม / ข้อถัดไป / ฟังซ้ำ) — มือถือบางรุ่นไม่ยอมให้อ่านออกเสียงถ้าไม่ได้มาจากการแตะ
  function play(s: SentenceItem | undefined) {
    if (s && !speakSentence(s)) setVoice(false);
  }

  function retryVoice() {
    const ok = hasChineseVoice();
    setVoice(ok);
    if (ok && stage === "quiz") play(q?.s);
  }

  function startRound() {
    const qs = buildRound(N_QUESTIONS);
    if (!qs.length) return;
    setQuestions(qs);
    setQi(0);
    setSaid(null);
    setCorrectCount(0);
    setSlow(audioRate() === 0.75);
    setStage("quiz");
    savedRef.current = false;
    qStartRef.current = Date.now();
    play(qs[0].s);
  }

  function answer(v: boolean) {
    if (said !== null || !q || voice === false) return; // ตอบแล้ว ล็อกไว้ · ไม่มีเสียงให้ฟัง = ยังตอบไม่ได้
    const ok = v === q.truth;
    setSaid(v);
    if (ok) setCorrectCount((c) => c + 1);
    logAttempt({
      generator: "listen_sentence",
      variant: "tf",
      event_type: "graded",
      sentence_id: q.s.id,
      mock_ref: draftSentenceRef(q.s.id), // ประโยคร่าง → sync ข้าม (ไม่เข้าข้อมูลเทรน BKT)
      skill_code: "SKILL-LISTEN",
      answer: { said: v ? "true" : "false", statement_id: q.statementId },
      is_correct: ok,
      time_spent_ms: msSince(qStartRef.current),
      context: "practice",
    });
  }

  function next() {
    if (qi + 1 >= questions.length) {
      window.speechSynthesis?.cancel();
      setStage("done");
      if (!savedRef.current) {
        saveRound({ ts: Date.now(), mode: "listen_sentence", total: questions.length, correct: correctCount });
        savedRef.current = true;
      }
      return;
    }
    setQi(qi + 1);
    setSaid(null);
    qStartRef.current = Date.now();
    play(questions[qi + 1].s);
  }

  // ---------- หน้าเริ่ม ----------
  if (stage === "intro" || !q) {
    return (
      <div className="flex flex-col gap-5 p-5">
        <header>
          <Link href="/practice" className="mb-1 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600">
            <Icon name="arrowLeft" className="h-3.5 w-3.5" /> กลับเมนูฝึก
          </Link>
          <h1 className="text-xl font-semibold text-slate-700">ฟังประโยค จริง/เท็จ</h1>
          <p className="mt-1 text-sm text-slate-400">
            ฟังประโยคจีน → ตัดสินว่าข้อความภาษาไทยตรงกับที่ได้ยินไหม · {N_QUESTIONS} ข้อ/รอบ · ฟังซ้ำได้ไม่จำกัด
          </p>
          <TempVoiceBadge className="mt-2" />
        </header>

        <MascotSays>ไม่ต้องแปลทุกคำ — จับคำสำคัญให้ได้ก็พอ เหมือนข้อสอบฟัง HSK 1 ⭐</MascotSays>

        {voice === false && <NoVoice onRetry={retryVoice} />}
        {voice === null && <p className="text-center text-xs text-slate-400">กำลังเช็กเสียงภาษาจีนในเครื่อง…</p>}

        <button
          onClick={startRound}
          disabled={voice === false || SENTENCES.length === 0}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-ocean-700 px-4 py-3 font-semibold text-white shadow transition hover:bg-ocean-900 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-300 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40"
        >
          <Icon name="play" className="h-4 w-4" /> เริ่มฟัง
        </button>

        <div className="flex gap-2 rounded-2xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-500">
          <Icon name="bulb" className="mt-0.5 h-4 w-4 shrink-0 text-xp" />
          <p>
            {SENTENCES_REVIEWED
              ? `เดโม: ใช้เสียงอ่านอัตโนมัติจากเครื่อง (${SENTENCES.length} ประโยค) — ของจริง: ไฟล์เสียงที่อัดเตรียมไว้`
              : `เดโม: ประโยคยังเป็นฉบับร่าง (ชุดเดียวกับโหมดเรียงประโยค ${SENTENCES.length} ประโยค · รอหฤทัยตรวจ) และใช้เสียงอ่านอัตโนมัติจากเครื่อง — ของจริง: ประโยคที่ตรวจแล้ว + ไฟล์เสียงที่อัดเตรียมไว้`}{" "}
            · ตอบแล้วจะเห็นตัวจีน พินอิน และคำแปล · ผลการฝึกไปแสดงในหน้า{" "}
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
          {pass ? "เยี่ยมมาก!" : "สู้ ๆ ฟังอีกนิด!"}
        </h1>
        <div className="relative w-full overflow-hidden rounded-3xl bg-gradient-to-br from-ocean-900 via-ocean-800 to-ocean-600 p-6 text-center text-white shadow-lg shadow-ocean-900/20">
          <span aria-hidden="true" className="absolute left-7 top-5 h-1 w-1 rounded-full bg-white/50" />
          <span aria-hidden="true" className="absolute right-10 top-7 h-1.5 w-1.5 rounded-full bg-white/40" />
          <div className="relative font-[family-name:var(--font-display)] text-5xl font-extrabold">
            {correctCount}
            <span className="text-2xl font-normal text-ocean-100"> / {questions.length}</span>
          </div>
          <div className="relative mt-1 text-ocean-100">ตอบถูก {pct}%</div>
        </div>
        <div className="flex w-full gap-3">
          <button
            onClick={startRound}
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

  // ---------- หน้าทำข้อ ----------
  const answered = said !== null;
  const isRight = answered && said === q.truth;
  return (
    <div className="flex flex-col gap-5 p-5">
      {/* แถบความคืบหน้า */}
      <div>
        <div className="flex items-center justify-between text-sm text-slate-500">
          <Link href="/practice" className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-600">
            <Icon name="arrowLeft" className="h-3.5 w-3.5" /> ออก
          </Link>
          <span>
            ข้อ {qi + 1}/{questions.length} · ถูก {correctCount}
          </span>
        </div>
        <ProgressBar className="mt-2" size="lg" value={qi} max={questions.length} label="ความคืบหน้าในรอบฟังประโยค" />
      </div>

      {!answered && (
        <MascotSays mascotClassName="h-10 w-10">ฟังประโยค แล้วดูว่าข้อความด้านล่างตรงกับที่ได้ยินไหม ⭐</MascotSays>
      )}

      {/* โจทย์: เสียงอย่างเดียว (PR-02) — ตอบแล้วค่อยเผยประโยค */}
      <div className="flex flex-col items-center rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <TempVoiceBadge />
        <button
          onClick={() => play(q.s)}
          aria-label="ฟังประโยคอีกครั้ง"
          className="mt-4 grid h-24 w-24 place-items-center rounded-full bg-ocean-800 text-white shadow-lg shadow-ocean-900/30 transition hover:bg-ocean-900 active:scale-95"
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
        {voice === false && (
          <div className="mt-4 w-full">
            <NoVoice onRetry={retryVoice} />
            {!answered && (
              <p className="mt-2 text-center text-xs text-amber-700">
                ยังไม่มีเสียงให้ฟัง เลยยังตอบไม่ได้ — กดลองใหม่ หรือกลับเมนูฝึกไปลองกิจกรรมอื่นก่อน
              </p>
            )}
          </div>
        )}
        {answered && (
          <div className="mt-4 w-full border-t border-slate-100 pt-4 text-center">
            <div className="font-[family-name:var(--font-sc)] text-3xl font-semibold text-slate-900">{q.s.tokens.join("")}</div>
            <Pinyin text={q.s.pinyin} className="mt-1 block text-base" />
            <div className="mt-1 text-sm text-slate-600">“{q.s.meaning_th}”</div>
          </div>
        )}
      </div>

      {/* ข้อความไทย 1 ข้อความให้ตัดสิน */}
      <div className="rounded-2xl border border-slate-100 bg-white p-4 text-center shadow-sm">
        <div className="text-xs text-slate-400">ประโยคที่ได้ยินแปลว่า…</div>
        <div className="mt-1 text-lg font-semibold text-slate-700">“{q.statement}”</div>
        {!answered && <div className="mt-1 text-xs text-slate-400">ตรงกับที่ได้ยินไหม</div>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {([true, false] as const).map((v) => {
          const isAnswer = v === q.truth;
          const isPicked = v === said;
          let cls = "border-slate-200 bg-white text-slate-700 hover:border-ocean-300";
          if (answered) {
            if (isAnswer) cls = "border-correct bg-emerald-50 text-emerald-800";
            else if (isPicked) cls = "border-coral/50 bg-coral-soft text-ocean-900";
            else cls = "border-slate-100 bg-slate-50 text-slate-400";
          }
          return (
            <button
              key={String(v)}
              onClick={() => answer(v)}
              disabled={answered || voice === false}
              className={`flex items-center justify-center gap-2 rounded-2xl border px-4 py-4 text-lg font-semibold transition active:scale-[0.98] ${cls} ${
                voice === false && !answered ? "opacity-50" : ""
              }`}
            >
              <Icon name={v ? "check" : "x"} className="h-5 w-5" strokeWidth={2.4} />
              {v ? "จริง" : "เท็จ"}
            </button>
          );
        })}
      </div>

      {answered && (
        <FeedbackCard
          correct={isRight}
          yourAnswer={isRight ? undefined : { main: said ? "จริง" : "เท็จ" }}
          rightAnswer={{ main: q.truth ? "จริง" : "เท็จ", sub: q.truth ? "ข้อความตรงกับที่ได้ยิน" : "ข้อความไม่ตรงกับที่ได้ยิน" }}
          hint={
            q.truth
              ? `ประโยคนี้แปลว่า “${q.s.meaning_th}” ตรงกับข้อความเลย`
              : `ประโยคนี้แปลว่า “${q.s.meaning_th}” — ไม่ใช่ “${q.statement}”`
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

// ---------- ชิ้นส่วนเล็ก ----------

function TempVoiceBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-star-soft px-2.5 py-1 text-[11px] font-medium text-star-ink ring-1 ring-star/40 ${className}`}
    >
      <Icon name="speaker" className="h-3.5 w-3.5" /> เสียงชั่วคราวจากเครื่อง — รอเสียงจริง
    </span>
  );
}

function NoVoice({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-2xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
      <p>
        เครื่องนี้ยังไม่มีเสียงภาษาจีนให้ใช้ เลยยังอ่านประโยคให้ฟังไม่ได้ — ลองเปิดด้วย Chrome หรือ Edge (Android/คอมพิวเตอร์)
        หรือ Safari (iPhone) หรือเพิ่มเสียงภาษาจีนในการตั้งค่าเครื่อง แล้วกดลองใหม่
      </p>
      <button
        onClick={onRetry}
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 font-semibold text-ocean-700 shadow-sm transition hover:bg-ocean-50 active:scale-95"
      >
        <Icon name="refresh" className="h-3.5 w-3.5" /> ลองใหม่
      </button>
    </div>
  );
}

// ---------- เสียง ----------

/** อ่านประโยคตามค่า "ฟังช้า" ที่ผู้เรียนตั้ง (ค่าเดียวกับไฟล์เสียงทั้งแอป) — false = เครื่องไม่มีเสียงจีน */
function speakSentence(s: SentenceItem): boolean {
  return speakZh(s.tokens.join(""), audioRate() === 0.75 ? 0.6 : 0.85); // ช้า 0.6 · ปกติ 0.85 (ค่าเริ่มของ speakZh)
}

// ---------- สร้างรอบ ----------

// จริงครึ่ง เท็จครึ่ง (สับ) · ข้อความเท็จ = ความหมายของอีกประโยค โดยเลือกประโยคที่มีคำซ้ำกันมากสุดก่อน
// (เช่น 我喜欢猫 ↔ "ฉันก็ชอบเธอ") จะได้ต้องฟังจริง ไม่ใช่เดาจากคำเดียว
// ประโยคน้อยกว่า n → วนซ้ำ แต่ให้ข้อความต่างจากครั้งก่อนของประโยคนั้น
function buildRound(n: number): TfQ[] {
  if (SENTENCES.length === 0) return [];
  const order = shuffle(SENTENCES);
  const wantTrue = shuffle(Array.from({ length: n }, (_, k) => k % 2 === 0));
  const shown = new Map<number, Set<number>>(); // ประโยค → ข้อความ (id) ที่เคยใช้แล้ว
  return wantTrue.map((t, k) => {
    const s = order[k % order.length];
    const used = shown.get(s.id) ?? new Set<number>();
    const others = SENTENCES.filter((o) => o.id !== s.id && o.meaning_th !== s.meaning_th && !used.has(o.id));
    let stmt = s;
    if ((!t || used.has(s.id)) && others.length > 0) {
      const overlap = (o: SentenceItem) => o.tokens.filter((tok) => s.tokens.includes(tok)).length;
      const best = Math.max(...others.map(overlap));
      stmt = shuffle(others.filter((o) => overlap(o) === best))[0];
    }
    used.add(stmt.id);
    shown.set(s.id, used);
    return { s, statement: stmt.meaning_th, statementId: stmt.id, truth: stmt.id === s.id };
  });
}
