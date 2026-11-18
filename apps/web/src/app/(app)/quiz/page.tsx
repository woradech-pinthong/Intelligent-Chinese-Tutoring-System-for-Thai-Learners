"use client";

// ควิซท้ายหมวด (โมดูล 3) — "โหมดสอบ" ต่างจากหน้าฝึกตรงที่ไม่เฉลยรายข้อระหว่างทำ
// กฎที่หน้านี้ยึด (กฎการทำงานระบบ-BUSINESS-RULES.md):
//   QZ-01 10 ข้อ: ฟัง 4 + อ่าน 4 + เขียน(เรียงประโยค) 2 · QZ-02 ผ่าน ≥7/10
//   QZ-03 เสียงเล่นได้ 2 รอบ ห้ามโชว์ข้อความของสิ่งที่ให้ฟัง · QZ-04 เฉลยรวมท้ายควิซ + บอกจุดที่พลาด
//   QZ-05 ตก → ฝึกข้อที่พลาด + สอบใหม่ได้ทันที (สุ่มข้อชุดใหม่) · QZ-07 ตรวจ rule-based 100%
//   QZ-09 ทำซ้ำไม่จำกัด โชว์ครั้งดีสุด แต่ log ทุกครั้ง
// หมายเหตุ: ข้อเขียนใช้ชุดประโยครวม (ยังไม่แยกหมวด) — รอทีมทำประโยครายหมวด แล้วค่อยกรองตาม cat

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase, audioUrl, type Word } from "@/lib/supabase";
import { SENTENCES, type SentenceItem } from "@/data/sentences";
import { CATEGORIES } from "@/data/categories";
import { Icon } from "@/components/Icon";
import { Pinyin } from "@/components/Pinyin";
import { Center, ErrorState } from "@/components/Feedback";
import { Mascot } from "@/components/Mascot";
import { ProgressBar } from "@/components/ProgressBar";
import { shuffle } from "@/lib/random";
import { bestScore, quizUnlocked, saveAttempt, QUIZ_PASS, QUIZ_TOTAL, type QuizItemLog } from "@/lib/quiz";

type Choice = { id: number; label: string };
type ListenQ = { kind: "listen"; word: Word; choices: Choice[] };
type ReadQ = { kind: "read"; word: Word; choices: Choice[] };
type WriteQ = { kind: "write"; s: SentenceItem };
type Q = ListenQ | ReadQ | WriteQ;

// คำตอบที่ผู้เรียนให้: MCQ = id คำที่เลือก · เรียงประโยค = ลำดับคำที่วาง
type Answer = { pickedId?: number; tokens?: string[] };

const MAX_PLAYS = 2; // QZ-03

function QuizInner({ cat }: { cat: number | null }) {
  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [stage, setStage] = useState<"intro" | "run" | "done">("intro");
  const [questions, setQuestions] = useState<Q[]>([]);
  const [qi, setQi] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [playsLeft, setPlaysLeft] = useState(MAX_PLAYS);
  const [best, setBest] = useState<number | null>(null);
  const [locked, setLocked] = useState(false); // QZ-12: ควิซหมวดนี้ยังไม่ปลดล็อก (ต้องผ่านควิซหมวดก่อนหน้า)
  const [buildFail, setBuildFail] = useState(false);
  const advancingRef = useRef(false);
  const savedRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const meta = CATEGORIES.find((c) => c.id === cat);

  useEffect(() => {
    if (!cat) {
      setLoading(false);
      return;
    }
    setBest(bestScore(cat));
    setLocked(!quizUnlocked(cat));
    (async () => {
      const { data, error } = await supabase
        .from("words")
        .select("id, hanzi, pinyin, meaning_th, meaning_en, th_reviewed, audio_path, hsk_level, category")
        .eq("hsk_level", 1)
        .eq("category", cat)
        .order("id");
      if (error) setError(error.message);
      else setWords(data as Word[]);
      setLoading(false);
    })();
  }, [cat]);

  // เล่นเสียงผ่านตัวเดียว — หยุดตัวเก่าก่อนเสมอ (กันหางเสียงข้อก่อนทับข้อใหม่ในโหมดสอบ)
  const playAudio = useCallback((path: string, onPlayed?: () => void) => {
    audioRef.current?.pause();
    const a = new Audio(audioUrl(path));
    audioRef.current = a;
    a.play().then(() => onPlayed?.()).catch(() => {});
  }, []);
  useEffect(() => () => audioRef.current?.pause(), []); // ออกจากหน้า = เสียงหยุดด้วย

  const start = useCallback(() => {
    const set = buildQuizSet(words);
    if (!set) {
      setBuildFail(true);
      return;
    }
    setQuestions(set);
    setQi(0);
    setAnswers([]);
    setPlaysLeft(MAX_PLAYS);
    savedRef.current = false;
    advancingRef.current = false;
    setStage("run");
  }, [words]);

  const q = questions[qi];

  // โหมดฟัง: เล่นอัตโนมัติตอนเข้าข้อ — หักสิทธิ์เมื่อเสียง "ออกจริง" เท่านั้น
  // (iOS/Safari อาจบล็อก autoplay ที่ไม่ได้มาจากนิ้วผู้ใช้ — ห้ามหักฟรีตาม QZ-03 ให้ฟังครบ 2)
  useEffect(() => {
    if (stage !== "run" || !q || q.kind !== "listen") {
      audioRef.current?.pause();
      return;
    }
    setPlaysLeft(MAX_PLAYS);
    if (q.word.audio_path) playAudio(q.word.audio_path, () => setPlaysLeft((n) => n - 1));
  }, [stage, qi]); // eslint-disable-line react-hooks/exhaustive-deps

  function replay() {
    if (!q || q.kind !== "listen" || playsLeft <= 0 || !q.word.audio_path) return;
    setPlaysLeft((n) => n - 1);
    playAudio(q.word.audio_path);
  }

  const record = useCallback(
    (a: Answer) => {
      if (advancingRef.current) return;
      advancingRef.current = true;
      const nextAnswers = [...answers, a];
      setAnswers(nextAnswers);
      // โหมดสอบ: บันทึกแล้วไปข้อถัดไปเลย ไม่เฉลย (QZ-03/04) — หน่วงนิดให้เห็นว่าแตะติด
      window.setTimeout(() => {
        advancingRef.current = false;
        if (qi + 1 >= questions.length) {
          finish(nextAnswers);
        } else {
          setQi((i) => i + 1);
        }
      }, 250);
    },
    [answers, qi, questions] // eslint-disable-line react-hooks/exhaustive-deps
  );

  function gradeOf(question: Q, a: Answer | undefined): boolean {
    if (!a) return false;
    if (question.kind === "write") return (a.tokens ?? []).join("") === question.s.tokens.join("");
    return a.pickedId === question.word.id;
  }

  function finish(finalAnswers: Answer[]) {
    if (!savedRef.current && cat) {
      const items: QuizItemLog[] = questions.map((question, i) => ({
        skill: question.kind === "write" ? "write" : question.kind,
        ref: question.kind === "write" ? question.s.id : question.word.id,
        correct: gradeOf(question, finalAnswers[i]),
      }));
      const score = items.filter((it) => it.correct).length;
      saveAttempt({ ts: Date.now(), cat, total: questions.length, score, items });
      setBest((b) => (b === null ? score : Math.max(b, score)));
      savedRef.current = true;
    }
    setStage("done");
  }

  // ---------- สถานะพื้นฐาน ----------
  if (loading) return <Center>กำลังโหลด...</Center>;
  if (error) return <ErrorState detail={error} />;
  if (!cat || !meta)
    return (
      <Center>
        ไม่พบหมวดนี้ —{" "}
        <Link href="/" className="ml-1 text-ocean-500 underline">
          กลับไปเลือกหมวด
        </Link>
      </Center>
    );

  const ready = canBuild(words);

  // ---------- ควิซยังล็อก (QZ-12) — เรียน/ฝึกหมวดนี้ได้ปกติ แค่ยังสอบไม่ได้ ----------
  if (locked) {
    const prev = CATEGORIES.find((c) => c.id === (cat ?? 1) - 1);
    return (
      <div className="flex flex-col gap-5 p-5">
        <div>
          <Link
            href={`/learn/category?cat=${cat}`}
            className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
          >
            <Icon name="arrowLeft" className="h-3.5 w-3.5" /> กลับเมนูหมวด
          </Link>
          <h1 className="mt-2 text-xl font-semibold text-slate-700">ควิซท้ายหมวด · {meta.name}</h1>
        </div>
        <div className="rounded-3xl border border-slate-100 bg-white p-6 text-center shadow-sm">
          <Mascot className="mx-auto h-16 w-16" />
          <div className="mt-3 font-semibold text-ocean-900">ควิซหมวดนี้ยังไม่เปิด</div>
          <p className="mx-auto mt-1.5 max-w-xs text-sm leading-relaxed text-slate-500">
            ผ่านควิซหมวด {prev ? `${prev.id} ${prev.name}` : "ก่อนหน้า"} ให้ได้ {QUIZ_PASS}/{QUIZ_TOTAL} ก่อน
            แล้วควิซหมวดนี้จะเปิดให้เอง — ส่วน<span className="font-medium text-slate-600">การเรียนและฝึกหมวดนี้ทำได้ตามปกติเลย</span>
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {prev && (
            <Link
              href={`/quiz?cat=${prev.id}`}
              className="rounded-xl bg-ocean-700 px-4 py-3.5 text-center font-semibold text-white shadow transition hover:bg-ocean-900 active:scale-[0.98]"
            >
              ไปสอบควิซหมวด {prev.id} · {prev.name}
            </Link>
          )}
          <Link
            href={`/learn/category?cat=${cat}`}
            className="rounded-xl bg-slate-100 px-4 py-3 text-center font-medium text-slate-600 transition hover:bg-slate-200"
          >
            เรียน/ฝึกหมวดนี้ต่อ
          </Link>
        </div>
      </div>
    );
  }

  // ---------- หน้าเริ่ม ----------
  if (stage === "intro") {
    return (
      <div className="flex flex-col gap-5 p-5">
        <div>
          <Link
            href={`/learn/category?cat=${cat}`}
            className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
          >
            <Icon name="arrowLeft" className="h-3.5 w-3.5" /> กลับเมนูหมวด
          </Link>
          <h1 className="mt-2 text-xl font-semibold text-slate-700">
            ควิซท้ายหมวด · {meta.name}
          </h1>
          <p className="mt-1 text-sm text-slate-400">สอบย่อยวัดว่าหมวดนี้แน่นหรือยัง — ทำได้ไม่จำกัดครั้ง</p>
        </div>

        {best !== null && (
          <div className="flex items-center justify-between rounded-2xl bg-ocean-50 px-4 py-3 text-sm">
            <span className="text-ocean-700">คะแนนเก็บของหมวดนี้ (ครั้งที่ดีที่สุด)</span>
            <span className={`font-bold ${best >= QUIZ_PASS ? "text-correct" : "text-ocean-700"}`}>
              {best}/{QUIZ_TOTAL}
            </span>
          </div>
        )}

        <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="text-sm font-semibold text-slate-600">กติกา</div>
          <ul className="mt-3 flex flex-col gap-2.5 text-sm text-slate-500">
            <Rule icon="target" text={`10 ข้อ: ฟัง 4 · อ่าน 4 · เรียงประโยค 2 — ผ่านที่ ${QUIZ_PASS}/${QUIZ_TOTAL} ขึ้นไป`} />
            <Rule icon="headphone" text={`ข้อฟังเปิดเสียงได้ ${MAX_PLAYS} ครั้งเหมือนสอบจริง ฟังให้จบก่อนค่อยตอบ`} />
            <Rule icon="pencil" text="ตอบแล้วไปข้อถัดไปเลย — เฉลยทั้งหมดรอดูตอนจบ" />
            <Rule icon="refresh" text="สอบใหม่ได้ทันทีไม่จำกัดครั้ง ระบบจำครั้งที่ดีที่สุดให้" />
          </ul>
        </div>

        {(!ready || buildFail) && (
          <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-700">
            {buildFail
              ? "จัดชุดข้อสอบของหมวดนี้ไม่สำเร็จ — ระหว่างนี้ไปฝึกฟัง/อ่านในเมนูหมวดก่อนได้เลยนะ"
              : "หมวดนี้ยังมีคำ/เสียงไม่พอสำหรับจัดควิซ — ลองหมวดอื่นก่อนนะ"}
          </div>
        )}

        <button
          onClick={start}
          disabled={!ready}
          className="flex items-center justify-center gap-2 rounded-xl bg-ocean-700 px-5 py-3.5 font-semibold text-white shadow transition hover:bg-ocean-900 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40"
        >
          <Icon name="play" className="h-5 w-5" /> เริ่มควิซ
        </button>
      </div>
    );
  }

  // ---------- หน้าเฉลยท้ายควิซ (QZ-04) ----------
  if (stage === "done") {
    const results = questions.map((question, i) => ({ question, a: answers[i], ok: gradeOf(question, answers[i]) }));
    const score = results.filter((r) => r.ok).length;
    const pass = score >= QUIZ_PASS;
    const missed = results.filter((r) => !r.ok);
    // ทักษะที่เสียคะแนนมากสุด → ใช้ชี้ปุ่ม "ฝึกข้อที่พลาด" (QZ-05)
    const lost = { listen: 0, read: 0, write: 0 };
    for (const m of missed) lost[m.question.kind === "write" ? "write" : m.question.kind]++;
    const drill =
      lost.write >= lost.listen && lost.write >= lost.read
        ? { href: "/practice?mode=order", label: "ฝึกเรียงประโยค" }
        : lost.listen >= lost.read
          ? { href: `/practice?cat=${cat}&mode=listen`, label: "ฝึกฟัง" }
          : { href: `/practice?cat=${cat}&mode=read`, label: "ฝึกอ่าน" };

    return (
      <div className="flex flex-col gap-5 p-5">
        <div className="flex flex-col items-center gap-3">
          {pass ? (
            <Mascot className="mt-4 h-20 w-20" />
          ) : (
            <div className="mt-4 grid h-20 w-20 place-items-center rounded-full bg-ocean-50 text-ocean-500">
              <Icon name="target" className="h-10 w-10" />
            </div>
          )}
          <h1 className="font-[family-name:var(--font-display)] text-xl font-bold text-ocean-900">
            {pass ? `ผ่านหมวด ${meta.name} แล้ว!` : "ยังไม่ผ่าน — อีกนิดเดียว!"}
          </h1>
          <div className="w-full rounded-3xl bg-gradient-to-br from-ocean-900 via-ocean-700 to-ocean-500 p-6 text-center text-white shadow-lg">
            <div className="font-[family-name:var(--font-display)] text-5xl font-extrabold">
              {score}
              <span className="text-2xl font-normal text-ocean-100"> / {questions.length}</span>
            </div>
            <div className="mt-1 text-sm text-ocean-100">
              เกณฑ์ผ่าน {QUIZ_PASS}/{QUIZ_TOTAL}
              {best !== null ? ` · ครั้งที่ดีที่สุดของหมวดนี้ ${Math.max(best, score)}/${QUIZ_TOTAL}` : ""}
            </div>
          </div>
        </div>

        {/* ปุ่มตามผล (QZ-05: ตกแล้วไม่ใช่ทางตัน) */}
        <div className="flex flex-col gap-2">
          {!pass && (
            <Link
              href={drill.href}
              className="flex items-center justify-center gap-2 rounded-xl bg-ocean-700 px-4 py-3.5 font-semibold text-white shadow transition hover:bg-ocean-900 active:scale-[0.98]"
            >
              <Icon name="play" className="h-5 w-5" /> {drill.label}ข้อที่พลาด แล้วค่อยกลับมาสอบใหม่
            </Link>
          )}
          <button
            onClick={start}
            className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold transition active:scale-[0.98] ${
              pass
                ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Icon name="refresh" className="h-5 w-5" /> สอบใหม่ (สุ่มข้อชุดใหม่)
          </button>
          <Link
            href={`/learn/category?cat=${cat}`}
            className="rounded-xl px-4 py-2.5 text-center text-sm text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline"
          >
            กลับเมนูหมวด
          </Link>
        </div>

        {/* เฉลยรายข้อ */}
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-500">เฉลยรายข้อ</h2>
          <div className="flex flex-col gap-2">
            {results.map((r, i) => (
              <ResultRow key={i} n={i + 1} {...r} />
            ))}
          </div>
        </section>
      </div>
    );
  }

  // ---------- หน้าทำข้อสอบ ----------
  if (!q) return <Center>กำลังโหลด...</Center>;
  const part = q.kind === "listen" ? "พาร์ตฟัง" : q.kind === "read" ? "พาร์ตอ่าน" : "พาร์ตเรียงประโยค";

  return (
    <div className="flex flex-col gap-5 p-5">
      <div>
        <div className="flex items-center justify-between text-sm text-slate-500">
          <Link
            href={`/learn/category?cat=${cat}`}
            className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-600"
          >
            <Icon name="arrowLeft" className="h-3.5 w-3.5" /> ออก
          </Link>
          <span>
            {part} · ข้อ {qi + 1}/{questions.length}
          </span>
        </div>
        <ProgressBar className="mt-2" size="lg" value={qi} max={questions.length} label="ความคืบหน้าในควิซ" />
      </div>

      {q.kind === "write" ? (
        <WriteQuestion key={qi} s={q.s} onSubmit={(tokens) => record({ tokens })} />
      ) : (
        <>
          {/* โจทย์ */}
          <div className="flex min-h-[34vh] flex-col items-center justify-center rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
            {q.kind === "read" ? (
              <>
                <div className="font-[family-name:var(--font-sc)] text-7xl font-bold text-slate-900">{q.word.hanzi}</div>
                <Pinyin text={q.word.pinyin} className="mt-3 text-2xl font-medium" />
                <div className="mt-4 text-xs text-slate-400">คำนี้แปลว่าอะไร</div>
              </>
            ) : (
              <>
                {/* QZ-03: ไม่โชว์ตัวหนังสือของสิ่งที่ให้ฟัง */}
                <button
                  onClick={replay}
                  disabled={playsLeft <= 0}
                  aria-label="ฟังอีกครั้ง"
                  className="grid h-24 w-24 place-items-center rounded-full bg-ocean-700 text-white shadow-lg shadow-ocean-900/30 transition hover:bg-ocean-900 active:scale-95 disabled:pointer-events-none disabled:opacity-40"
                >
                  <Icon name="speaker" className="h-10 w-10" />
                </button>
                <div className="mt-3 text-sm text-slate-400">
                  {playsLeft > 0 ? `ฟังซ้ำได้อีก ${playsLeft} ครั้ง` : "ครบ 2 ครั้งแล้ว — เลือกคำที่ได้ยิน"}
                </div>
              </>
            )}
          </div>

          {/* ตัวเลือก — โหมดสอบ: แตะแล้วไปต่อเลย ไม่เฉลย */}
          <div className="grid grid-cols-1 gap-3">
            {q.choices.map((c) => (
              <button
                key={c.id}
                onClick={() => record({ pickedId: c.id })}
                className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left text-slate-700 transition hover:border-ocean-300 active:scale-[0.99] active:border-ocean-500 active:bg-ocean-50"
              >
                <span className={q.kind === "listen" ? "font-[family-name:var(--font-sc)] text-2xl font-semibold" : "text-base"}>
                  {c.label}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------- ข้อเรียงประโยค (แตะเรียง — โหมดสอบ ไม่เฉลยจนจบ) ----------
function WriteQuestion({ s, onSubmit }: { s: SentenceItem; onSubmit: (tokens: string[]) => void }) {
  const tiles = useMemo(() => {
    const t = s.tokens.map((text, key) => ({ key, text }));
    let p = shuffle(t);
    // ไทล์ห้ามเรียงตรงเฉลยพอดี (โหมดสอบ = แจกเฉลยฟรี) — สับซ้ำจนกว่าจะไม่ตรง
    for (let i = 0; i < 20 && t.length > 1 && p.map((x) => x.text).join("") === s.tokens.join(""); i++) {
      p = shuffle(t);
    }
    return p;
  }, [s]);
  const [answer, setAnswer] = useState<{ key: number; text: string }[]>([]);
  const inAnswer = new Set(answer.map((t) => t.key));
  const allPlaced = answer.length === s.tokens.length;

  return (
    <>
      <div className="rounded-2xl border border-slate-100 bg-white p-4 text-center shadow-sm">
        <div className="text-xs text-slate-400">เรียงคำให้เป็นประโยคที่แปลว่า</div>
        <div className="mt-1 text-lg font-semibold text-slate-700">“{s.meaning_th}”</div>
      </div>

      <div className="flex min-h-[64px] flex-wrap items-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-3">
        {answer.length === 0 && <span className="text-sm text-slate-300">แตะคำด้านล่างมาเรียงตรงนี้</span>}
        {answer.map((tile) => (
          <button
            key={tile.key}
            onClick={() => setAnswer((a) => a.filter((t) => t.key !== tile.key))}
            className="rounded-xl border border-ocean-100 bg-white px-3 py-2 font-[family-name:var(--font-sc)] text-xl text-slate-800 shadow-sm transition active:scale-95"
          >
            {tile.text}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl bg-white p-3">
        {tiles.map((tile) =>
          inAnswer.has(tile.key) ? null : (
            <button
              key={tile.key}
              onClick={() => setAnswer((a) => [...a, tile])}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 font-[family-name:var(--font-sc)] text-xl text-slate-800 shadow-sm transition hover:border-ocean-300 active:scale-95"
            >
              {tile.text}
            </button>
          )
        )}
        {allPlaced && <span className="py-2 text-sm text-slate-300">วางครบแล้ว กดยืนยันได้เลย</span>}
      </div>

      <button
        onClick={() => onSubmit(answer.map((t) => t.text))}
        disabled={!allPlaced}
        className="rounded-xl bg-ocean-700 px-4 py-3 font-semibold text-white shadow transition hover:bg-ocean-900 active:scale-95 disabled:pointer-events-none disabled:opacity-40"
      >
        ยืนยันคำตอบ
      </button>
    </>
  );
}

// ---------- แถวเฉลยรายข้อ ----------
function ResultRow({ n, question, a, ok }: { n: number; question: Q; a: Answer | undefined; ok: boolean }) {
  return (
    <div className={`rounded-2xl border p-3.5 ${ok ? "border-slate-100 bg-white" : "border-coral/25 bg-coral-soft/60"}`}>
      <div className="flex items-start gap-2.5">
        <div
          className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${
            ok ? "bg-emerald-50 text-correct" : "bg-white text-coral"
          }`}
        >
          <Icon name={ok ? "check" : "x"} className="h-3.5 w-3.5" strokeWidth={2.6} />
        </div>
        <div className="min-w-0 flex-1 text-sm">
          {question.kind === "write" ? (
            <>
              <div className="text-slate-700">
                ข้อ {n} · เรียงประโยค “{question.s.meaning_th}”
              </div>
              <div className="mt-1 font-[family-name:var(--font-sc)] text-xl text-slate-800">
                {question.s.tokens.join(" ")}
              </div>
              <Pinyin text={question.s.pinyin} className="text-xs" />
              {!ok && (
                <>
                  {a?.tokens && a.tokens.length > 0 && (
                    <div className="mt-1 text-xs text-coral">
                      คุณเลือก: <span className="font-[family-name:var(--font-sc)] text-sm">{a.tokens.join(" ")}</span>
                    </div>
                  )}
                  <div className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-white/80 p-2 text-xs text-slate-500">
                    <Icon name="bulb" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-xp" /> {question.s.focus_th}
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-baseline gap-x-2 text-slate-700">
                <span>
                  ข้อ {n} · {question.kind === "listen" ? "ฟัง:" : "อ่าน:"}
                </span>
                <span className="font-[family-name:var(--font-sc)] text-xl text-slate-800">{question.word.hanzi}</span>
                <Pinyin text={question.word.pinyin} className="text-sm" />
                <span className="text-slate-500">= {question.word.meaning_th}</span>
              </div>
              {!ok && <WrongPick question={question} a={a} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// บอก "พลาดเพราะอะไร" เท่าที่รู้จากตัวเลือกที่กด (การวินิจฉัยลึกระดับ KC มาพร้อมโมดูล 8)
function WrongPick({ question, a }: { question: ListenQ | ReadQ; a: Answer | undefined }) {
  const picked = question.choices.find((c) => c.id === a?.pickedId);
  if (!picked) return null;
  return (
    <div className="mt-1 text-xs text-coral">
      คุณเลือก “{picked.label}” —{" "}
      {question.kind === "listen"
        ? "กลับไปเปิดบัตรคำ ฟังเสียงคำนี้อีกสัก 2-3 รอบนะ"
        : "ทวนสองคำนี้คู่กันในบัตรคำอีกรอบนะ"}
    </div>
  );
}

function Rule({ icon, text }: { icon: Parameters<typeof Icon>[0]["name"]; text: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <Icon name={icon} className="mt-0.5 h-4 w-4 shrink-0 text-ocean-500" />
      <span className="leading-relaxed">{text}</span>
    </li>
  );
}

// ---------- จัดชุดข้อสอบ (QZ-01: ฟัง 4 + อ่าน 4 + เขียน 2 · เรียงพาร์ตแบบข้อสอบจริง) ----------
function canBuild(words: Word[]): boolean {
  const withMeaning = words.filter((w) => w.meaning_th && w.meaning_th.trim());
  return withMeaning.length >= 8 && withMeaning.filter((w) => w.audio_path).length >= 4 && SENTENCES.length >= 2;
}

function buildQuizSet(words: Word[]): Q[] | null {
  if (!canBuild(words)) return null;
  const withMeaning = words.filter((w) => w.meaning_th && w.meaning_th.trim());
  const withAudio = withMeaning.filter((w) => w.audio_path);

  const listenTargets = shuffle(withAudio).slice(0, 4);
  const used = new Set(listenTargets.map((w) => w.id));
  let readPool = withMeaning.filter((w) => !used.has(w.id));
  if (readPool.length < 4) readPool = withMeaning; // หมวดเล็กมาก — ยอมให้คำซ้ำพาร์ตได้
  const readTargets = shuffle(readPool).slice(0, 4);

  const mcq = (word: Word, label: (w: Word) => string): Choice[] => {
    const usedLabels = new Set([label(word)]);
    const distractors: Word[] = [];
    for (const w of shuffle(withMeaning)) {
      if (distractors.length >= 3) break;
      if (w.id === word.id) continue;
      const lb = label(w);
      if (usedLabels.has(lb)) continue; // กันตัวเลือกซ้ำความหมาย
      usedLabels.add(lb);
      distractors.push(w);
    }
    if (distractors.length < 3) return []; // กันเคสสุดขั้ว — คำในหมวดซ้ำความหมายกันเกือบหมด
    return shuffle([
      { id: word.id, label: label(word) },
      ...distractors.map((w) => ({ id: w.id, label: label(w) })),
    ]);
  };

  const listenQs: Q[] = [];
  for (const w of listenTargets) {
    const choices = mcq(w, (x) => x.hanzi);
    if (choices.length) listenQs.push({ kind: "listen", word: w, choices });
  }
  const readQs: Q[] = [];
  for (const w of readTargets) {
    const choices = mcq(w, (x) => x.meaning_th ?? "");
    if (choices.length) readQs.push({ kind: "read", word: w, choices });
  }
  if (listenQs.length < 4 || readQs.length < 4) return null;

  const writeQs: Q[] = shuffle(SENTENCES)
    .slice(0, 2)
    .map((s) => ({ kind: "write", s }));

  return [...listenQs, ...readQs, ...writeQs];
}

// ---------- อ่าน ?cat= ผ่าน useSearchParams — key ตาม query ให้รีเซ็ตเสมอ ----------
export default function Quiz() {
  return (
    <Suspense fallback={<Center>กำลังโหลด...</Center>}>
      <QuizFromQuery />
    </Suspense>
  );
}

function QuizFromQuery() {
  const sp = useSearchParams();
  const cat = Number(sp.get("cat")) || null;
  return <QuizInner key={sp.toString()} cat={cat} />;
}
