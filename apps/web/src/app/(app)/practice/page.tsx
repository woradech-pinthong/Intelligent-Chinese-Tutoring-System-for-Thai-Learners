"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase, audioUrl, type Word } from "@/lib/supabase";
import { catName } from "@/data/categories";
import { Center, ErrorState } from "@/components/Feedback";
import { shuffle } from "@/lib/random";
import { saveRound, type QuizMode } from "@/lib/progress";
import { loadCards } from "@/lib/fsrs";
import { logAttempt } from "@/lib/attempts-outbox";
import SentenceOrder from "./SentenceOrder";
import PracticeHub, { HUB_GROUPS, type HubGroup } from "./PracticeHub";
import { Icon } from "@/components/Icon";
import { Pinyin } from "@/components/Pinyin";
import { Mascot, MascotSays } from "@/components/Mascot";
import { audioRate, toggleAudioRate, playAtUserRate } from "@/lib/daily";
import { ProgressBar } from "@/components/ProgressBar";
import { FeedbackCard, type AnswerFace } from "@/components/FeedbackCard";

const N_QUESTIONS = 10;
// เวลาที่ใช้ตอบ (ms) — อยู่นอก component เพราะ lint react-hooks/purity เข้าใจผิดว่า Date.now() ใน handler ถูกเรียกตอน render
const msSince = (t: number) => Date.now() - t;

// ตัวเลือกเก็บเป็นคำ (Word) แล้วค่อยเลือกป้ายตอนแสดง — โหมดฟังสลับ "คำแปล ↔ ตัวจีน" กลางข้อได้
type Question = { word: Word; choices: Word[] };

// โหมดฟัง: ตัวเลือกเป็น "คำแปล" (ค่าเริ่มต้น — ฟังแล้วเข้าใจความหมาย) หรือ "ตัวจีน" (แบบเดิม) · จำค่าในเครื่อง
type ListenChoice = "meaning" | "hanzi";
const LISTEN_CHOICE_KEY = "xh_listen_choice";

function loadListenChoice(): ListenChoice {
  if (typeof window === "undefined") return "meaning";
  try {
    return window.localStorage.getItem(LISTEN_CHOICE_KEY) === "hanzi" ? "hanzi" : "meaning";
  } catch {
    return "meaning";
  }
}

function saveListenChoice(c: ListenChoice): void {
  try {
    window.localStorage.setItem(LISTEN_CHOICE_KEY, c);
  } catch {
    /* เต็ม/ปิด storage ก็ข้ามไป */
  }
}

function PracticeInner({ cat, modeParam, group }: { cat: number | null; modeParam: QuizMode | null; group: HubGroup | null }) {
  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const autoStartedRef = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<QuizMode | null>(null);
  const [slow, setSlow] = useState(false);
  useEffect(() => setSlow(audioRate() === 0.75), []);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [qi, setQi] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [done, setDone] = useState(false);
  const savedRef = useRef(false);
  const [choiceType, setChoiceType] = useState<ListenChoice>(loadListenChoice); // เมนูโชว์ค่าที่จำไว้ด้วย
  const qStartRef = useRef(0); // เวลาเริ่มข้อปัจจุบัน → time_spent_ms ตอน logAttempt
  const nextRef = useRef<HTMLButtonElement>(null);

  // ตอบแล้วปุ่มตัวเลือกถูกปิด → โฟกัสหลุดไป <body> · ย้ายไปปุ่ม "ข้อถัดไป" (คีย์บอร์ด/สวิตช์) ไม่เลื่อนจอ
  useEffect(() => {
    if (picked !== null) nextRef.current?.focus({ preventScroll: true });
  }, [picked]);

  // ดึงคลังคำ HSK 1 ทั้งหมดครั้งเดียว — เมนูใช้นับคลังของทุกกิจกรรม · ?cat= ไปกรองตอนสร้าง pool ด้านล่าง (ได้คำชุดเดิม)
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("words")
        .select("id, hanzi, pinyin, meaning_th, meaning_en, th_reviewed, audio_path, hsk_level, category")
        .eq("hsk_level", 1)
        .order("id");
      if (error) setError(error.message);
      else setWords(data as Word[]);
      setLoading(false);
    })();
  }, []);

  // คำที่ใช้ได้ในแต่ละโหมด (อ่าน = ต้องมีคำแปล · ฟัง = ต้องมีเสียง)
  // PA-14: ฝึก = ดึงความจำของคำที่เรียนแล้ว — เรียนแล้ว ≥4 คำ สุ่มเฉพาะคำที่เรียนแล้ว
  // ยังไม่ถึง 4 ใช้ทั้งหมวดไปก่อนกันทางตัน (ควิซท้ายหมวดไม่ใช้กฎนี้ — มันคือตัววัดทั้งหมวด)
  const [learnedIds] = useState(() => new Set(Object.keys(loadCards()).map(Number)));
  const pools = useMemo(() => {
    const scoped = cat ? words.filter((w) => w.category === cat) : words; // มาจากเมนูหมวด → เฉพาะคำในหมวดนั้น
    const withMeaning = scoped.filter((w) => w.meaning_th && w.meaning_th.trim());
    const preferLearned = (arr: Word[]) => {
      const learned = arr.filter((w) => learnedIds.has(w.id));
      return learned.length >= 4 ? learned : arr;
    };
    return {
      read: preferLearned(withMeaning),
      listen: preferLearned(withMeaning.filter((w) => w.audio_path)),
    };
  }, [words, learnedIds, cat]);

  const start = useCallback(
    (m: "read" | "listen") => {
      const pool = pools[m];
      // การ์ดในเมนูกดได้เสมอ → คลังไม่ถึง 4 คำ (ตัวเลือกไม่ครบ) บอกด้วยข้อความแทนการเริ่มรอบที่พัง
      // ข้อความอยู่หัวเมนู แต่การ์ดที่แตะอาจอยู่ล่างจอ (มือถือ) → เลื่อนขึ้นไปให้เห็นข้อความ
      if (pool.length < 4) {
        setNotice("คลังคำตอนนี้ยังไม่พอสำหรับโหมดนี้ — ลองกิจกรรมอื่นก่อน หรือฝึกแบบรวมทุกหมวดนะ");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      setNotice(null); // เริ่มได้แล้ว → ล้างคำเตือนเก่า (กลับเมนูทีหลังจะได้ไม่ค้าง)
      setMode(m);
      setQuestions(buildQuiz(pool, m, N_QUESTIONS));
      setQi(0);
      setPicked(null);
      setCorrectCount(0);
      setDone(false);
      setChoiceType(loadListenChoice());
      savedRef.current = false;
      qStartRef.current = Date.now();
    },
    [pools]
  );

  const q = questions[qi];

  // เล่นเสียงอัตโนมัติในโหมดฟัง
  const play = useCallback(() => {
    if (mode === "listen" && q?.word.audio_path) {
      playAtUserRate(audioUrl(q.word.audio_path)); // โหมดฝึกปรับความเร็วได้ (m2-7) — ควิซ/สอบห้าม (QZ-03)
    }
  }, [mode, q]);
  useEffect(() => {
    if (!done) play();
  }, [qi, done, play]);

  function choose(id: number) {
    if (picked !== null) return; // ตอบแล้ว ล็อกไว้
    setPicked(id);
    if (id === q.word.id) setCorrectCount((c) => c + 1);
    // บันทึกรายข้อลง outbox (นอกจาก saveRound ท้ายรอบ)
    logAttempt({
      generator: mode === "listen" ? "listen_mc4" : "read_mc4",
      ...(mode === "listen" ? { variant: choiceType } : {}),
      event_type: "graded",
      word_id: q.word.id,
      skill_code: mode === "listen" ? "SKILL-LISTEN" : "SKILL-READ",
      answer: { picked_id: id },
      is_correct: id === q.word.id,
      time_spent_ms: msSince(qStartRef.current),
      context: "practice",
    });
  }

  function pickChoiceType(t: ListenChoice) {
    setChoiceType(t);
    saveListenChoice(t);
  }

  function next() {
    if (qi + 1 >= questions.length) {
      setDone(true);
      if (!savedRef.current && mode) {
        saveRound({ ts: Date.now(), mode, total: questions.length, correct: correctCount });
        savedRef.current = true;
      }
    } else {
      setQi((i) => i + 1);
      setPicked(null);
      qStartRef.current = Date.now();
    }
  }

  // มาจากเมนูหมวด (?mode=) → เข้าโหมดที่เลือกทันที · ถ้าคลังคำไม่พอ อยู่หน้าเลือกโหมดพร้อมข้อความ (กัน crash)
  useEffect(() => {
    if (loading || !modeParam || autoStartedRef.current) return;
    autoStartedRef.current = true;
    if (modeParam === "order") setMode("order");
    else if ((modeParam === "read" || modeParam === "listen") && pools[modeParam].length >= 4) start(modeParam);
    else setNotice("หมวดนี้ยังมีคำไม่พอสำหรับโหมดนี้ — ลองโหมดอื่น หรือฝึกแบบรวมทุกหมวดก่อนนะ");
  }, [loading, modeParam, pools, start]);

  if (loading) return <Center>กำลังโหลดคลังคำ...</Center>;
  if (error) return <ErrorState detail={error} />;

  // ---------- โหมดเรียงประโยค (ใช้คนละ engine กับ MCQ) ----------
  if (mode === "order") return <SentenceOrder onExit={() => setMode(null)} />;

  // ---------- หน้าเลือกโหมด (เมนูจัดกลุ่มตามทักษะ — ดู PracticeHub.tsx) ----------
  if (!mode) {
    return (
      <PracticeHub
        cat={cat}
        group={group}
        notice={notice}
        words={words}
        learnedIds={learnedIds}
        listenCount={pools.listen.length}
        readCount={pools.read.length}
        listenChoice={choiceType}
        onStart={(m) => (m === "order" ? setMode("order") : start(m))}
      />
    );
  }

  // ---------- หน้าสรุปผล ----------
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
        <div className="relative w-full overflow-hidden rounded-3xl bg-gradient-to-br from-ocean-900 via-ocean-800 to-ocean-600 p-6 text-center text-white shadow-lg shadow-ocean-900/20">
          <span aria-hidden="true" className="absolute left-7 top-5 h-1 w-1 rounded-full bg-white/50" />
          <span aria-hidden="true" className="absolute right-10 top-7 h-1.5 w-1.5 rounded-full bg-white/40" />
          <div className="relative font-[family-name:var(--font-display)] text-5xl font-extrabold">
            {correctCount}
            <span className="text-2xl font-normal text-ocean-100"> / {questions.length}</span>
          </div>
          <div className="relative mt-1 text-ocean-100">ความแม่นยำ {pct}%</div>
        </div>
        <div className="flex w-full gap-3">
          <button
            onClick={() => (mode === "read" || mode === "listen") && start(mode)}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-ocean-700 px-4 py-3 font-semibold text-white shadow transition hover:bg-ocean-900 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-300 focus-visible:ring-offset-2"
          >
            <Icon name="refresh" className="h-5 w-5" /> ฝึกอีกรอบ
          </button>
          <button
            onClick={() => setMode(null)}
            className="flex-1 rounded-xl bg-slate-100 px-4 py-3 font-medium text-slate-600 transition hover:bg-slate-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
          >
            เปลี่ยนโหมด
          </button>
        </div>
        {cat && (
          <Link
            href={`/learn/category?cat=${cat}`}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-center font-medium text-slate-600 transition hover:bg-slate-50"
          >
            กลับเมนูหมวด {catName(cat) ?? cat}
          </Link>
        )}
        <Link href="/progress" className="text-sm text-ocean-500 underline">
          ดูสรุปผลการฝึกทั้งหมด
        </Link>
      </div>
    );
  }

  // ---------- หน้าทำข้อสอบ ----------
  const answered = picked !== null;
  const isRight = picked === q.word.id;
  const pickedWord = answered ? words.find((w) => w.id === picked) : undefined;
  const listenHanzi = mode === "listen" && choiceType === "hanzi";
  const labelOf = (w: Word) => (listenHanzi ? w.hanzi : w.meaning_th);
  // หน้าตาคำตอบในการ์ดเฉลย = รูปเดียวกับตัวเลือกที่ผู้เรียนเห็น
  const faceOf = (w: Word): AnswerFace =>
    listenHanzi
      ? { main: w.hanzi, sub: w.meaning_th, chinese: true }
      : mode === "listen"
        ? { main: w.meaning_th, sub: `${w.hanzi} · ${w.pinyin}` }
        : { main: w.meaning_th, sub: w.hanzi };
  return (
    <div className="flex flex-col gap-5 p-5">
      {/* แถบความคืบหน้า */}
      <div>
        <div className="flex items-center justify-between text-sm text-slate-500">
          {cat && modeParam ? (
            <Link href={`/learn/category?cat=${cat}`} className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-600">
              <Icon name="arrowLeft" className="h-3.5 w-3.5" /> ออก
            </Link>
          ) : (
            <button onClick={() => setMode(null)} className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-600">
              <Icon name="arrowLeft" className="h-3.5 w-3.5" /> ออก
            </button>
          )}
          <span>
            ข้อ {qi + 1}/{questions.length} · ถูก {correctCount}
          </span>
        </div>
        <ProgressBar className="mt-2" size="lg" value={qi} max={questions.length} label="ความคืบหน้าในรอบฝึก" />
      </div>

      {/* 小星 ช่วยตั้งหลักก่อนฟัง (โหมดฟังเท่านั้น — โหมดอ่านโจทย์ชัดอยู่แล้ว ไม่ต้องมีเสียงรบกวน) */}
      {mode === "listen" && !answered && <MascotSays mascotClassName="h-10 w-10">ลองฟังให้ดีนะ ⭐</MascotSays>}

      {/* โจทย์ */}
      <div className="flex min-h-[34vh] flex-col items-center justify-center rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        {mode === "read" ? (
          <>
            <div className="font-[family-name:var(--font-sc)] text-7xl font-bold text-slate-900">{q.word.hanzi}</div>
            <Pinyin text={q.word.pinyin} className="mt-3 text-2xl font-medium" />
            <div className="mt-4 text-xs text-slate-400">คำนี้แปลว่าอะไร</div>
          </>
        ) : (
          <>
            <button
              onClick={play}
              aria-label="ฟังเสียง"
              className="grid h-24 w-24 place-items-center rounded-full bg-ocean-800 text-white shadow-lg shadow-ocean-900/30 transition hover:bg-ocean-900 active:scale-95"
            >
              <Icon name="speaker" className="h-10 w-10" />
            </button>
            <div className="mt-3 text-sm text-slate-400">
              {answered ? <Pinyin text={q.word.pinyin} /> : "แตะเพื่อฟังอีกครั้ง"}
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
            {!answered && (
              <div className="mt-1 text-xs text-slate-400">{listenHanzi ? "คุณได้ยินคำว่าอะไร" : "คำที่ได้ยินแปลว่าอะไร"}</div>
            )}
          </>
        )}
      </div>

      {/* สลับรูปตัวเลือก (โหมดฟัง · ก่อนตอบ): คำแปล = ฟังแล้วเข้าใจความหมาย · ตัวจีน = จับคู่เสียงกับตัวอักษร */}
      {mode === "listen" && !answered && (
        <div role="group" aria-label="รูปแบบตัวเลือก" className="flex items-center justify-end gap-1.5 text-xs text-slate-400">
          ตัวเลือก:
          {(["meaning", "hanzi"] as const).map((t) => (
            <button
              key={t}
              onClick={() => pickChoiceType(t)}
              aria-pressed={choiceType === t}
              className={`rounded-full px-3 py-1 font-medium transition ${
                choiceType === t ? "bg-ocean-700 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              {t === "meaning" ? "คำแปล" : "ตัวจีน"}
            </button>
          ))}
        </div>
      )}

      {/* ตัวเลือก */}
      <div className="grid grid-cols-1 gap-3">
        {q.choices.map((c) => {
          const isCorrect = c.id === q.word.id;
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
              onClick={() => choose(c.id)}
              disabled={answered}
              className={`flex items-center justify-between rounded-2xl border px-4 py-4 text-left transition ${cls}`}
            >
              <span className={listenHanzi ? "font-[family-name:var(--font-sc)] text-2xl font-semibold" : "text-base"}>
                {labelOf(c)}
              </span>
              {answered && isCorrect && <Icon name="check" className="h-5 w-5 text-correct" strokeWidth={2.4} />}
              {answered && isPicked && !isCorrect && <Icon name="x" className="h-5 w-5 text-coral" strokeWidth={2.4} />}
            </button>
          );
        })}
      </div>

      {/* เฉลย + เหตุผล (กติกา: ตอบผิดต้องรู้ว่าที่ถูกคืออะไร เพราะอะไร ไม่ใช่แค่ขึ้นสีแดง) */}
      {answered && (
        <FeedbackCard
          correct={isRight}
          yourAnswer={pickedWord && !isRight ? faceOf(pickedWord) : undefined}
          rightAnswer={faceOf(q.word)}
          hint={
            isRight
              ? undefined
              : pickedWord
                ? `${q.word.hanzi} = ${q.word.meaning_th} · ${pickedWord.hanzi} = ${pickedWord.meaning_th}`
                : undefined
          }
        />
      )}

      {/* ปุ่มถัดไป */}
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

// ---------- สร้างชุดข้อสอบจากคลังคำ ----------
// อ่าน: ตัวลวงห้ามซ้ำคำแปล · ฟัง: ห้ามซ้ำทั้งคำแปลและตัวจีน (สลับรูปตัวเลือกกลางข้อได้) และห้ามออกเสียงเหมือนคำที่เปิด
// (คำพ้องเสียง เช่น 他/她 tā — ฟังอย่างเดียวแยกไม่ได้ = ข้อที่ตอบไม่ได้)
function buildQuiz(pool: Word[], mode: QuizMode, n: number): Question[] {
  if (pool.length < 4) return [];
  const targets = shuffle(pool).slice(0, Math.min(n, pool.length));
  const keysOf = (w: Word) => (mode === "listen" ? [`m:${w.meaning_th}`, `h:${w.hanzi}`] : [`m:${w.meaning_th}`]);
  const sound = (w: Word) => w.pinyin.toLowerCase().replace(/\s+/g, " ").trim();

  return targets.map((word) => {
    const distractors: Word[] = [];
    const used = new Set(keysOf(word));
    for (const w of shuffle(pool)) {
      if (distractors.length >= 3) break;
      if (w.id === word.id) continue;
      const keys = keysOf(w);
      if (keys.some((k) => used.has(k))) continue; // กันตัวเลือกซ้ำความหมาย/ตัวจีน
      if (mode === "listen" && sound(w) === sound(word)) continue; // กันคำพ้องเสียง
      keys.forEach((k) => used.add(k));
      distractors.push(w);
    }
    return { word, choices: shuffle([word, ...distractors]) };
  });
}

// อ่าน ?cat=&mode= ผ่าน useSearchParams — key ตาม query ทำให้เปลี่ยน URL แล้วรีเซ็ต state เสมอ
export default function Practice() {
  return (
    <Suspense fallback={<Center>กำลังโหลด...</Center>}>
      <PracticeFromQuery />
    </Suspense>
  );
}

function PracticeFromQuery() {
  const sp = useSearchParams();
  const cat = Number(sp.get("cat")) || null;
  const mp = sp.get("mode");
  const modeParam = mp === "read" || mp === "listen" || mp === "order" ? (mp as QuizMode) : null;
  const gp = sp.get("group");
  const group = HUB_GROUPS.includes(gp as HubGroup) ? (gp as HubGroup) : null; // ?group= = เมนูเฉพาะทักษะ (จากหน้าหมวด)
  return <PracticeInner key={sp.toString()} cat={cat} modeParam={modeParam} group={group} />;
}
