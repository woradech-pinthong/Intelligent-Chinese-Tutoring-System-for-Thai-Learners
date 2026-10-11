"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase, audioUrl, type Word } from "@/lib/supabase";
import { catName } from "@/data/categories";
import { Center, ErrorState } from "@/components/Feedback";
import { loadCards, review, Rating } from "@/lib/fsrs";
import { Icon } from "@/components/Icon";
import { Pinyin, PinyinMasked, PinyinToggle } from "@/components/Pinyin";
import { usePinyinHidden } from "@/lib/pinyin-pref";
import { Mascot } from "@/components/Mascot";
import { ProgressBar } from "@/components/ProgressBar";
import {
  WORDS_PER_DAY,
  learnedToday,
  learnedTodayCount,
  recordLearnedToday,
  audioRate,
  toggleAudioRate,
  playAtUserRate,
} from "@/lib/daily";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function FlashcardsInner({ cat, reviewMode, all }: { cat: number | null; reviewMode: boolean; all: boolean }) {
  const [words, setWords] = useState<Word[]>([]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [extraRounds, setExtraRounds] = useState(0); // กด "เรียนเกินเป้า" กี่รอบ (รอบละ 10 คำ)
  const [todayCount, setTodayCount] = useState(0);
  const [slow, setSlow] = useState(false);
  const seenRef = useRef<Set<number>>(new Set());
  // หย่าพินอิน (m1-6): ซ่อนพินอินด้านหน้าบัตร · ปุ่ม "ดูพินอิน" อยู่นอกบัตร (บัตรเป็นปุ่มพลิก — ห้ามซ้อนปุ่มในปุ่ม)
  const [pinyinHidden] = usePinyinHidden();
  const [peekId, setPeekId] = useState<number | null>(null); // แอบดูพินอินของบัตรไหนแล้ว (เปลี่ยนบัตร = ซ่อนใหม่เอง)

  // โหมดชุดวันนี้ (ค่าเริ่มต้น — กฎ m1-8/ON-06): เสิร์ฟทีละมื้อ 10 คำ ไม่โยนทั้งหมวด
  // ?all=1 หรือโหมดตรวจของหฤทัย = เห็นทั้งชุดแบบเดิม
  const dailyMode = !all && !reviewMode;

  useEffect(() => {
    seenRef.current = new Set(Object.keys(loadCards()).map(Number));
    setTodayCount(learnedTodayCount());
    setSlow(audioRate() === 0.75);
    (async () => {
      let q = supabase
        .from("words")
        .select("id, hanzi, pinyin, meaning_th, meaning_en, th_reviewed, audio_path, hsk_level, category")
        .eq("hsk_level", 1);
      if (cat) q = q.eq("category", cat);
      const { data, error } = await q.order("id");
      if (error) setError(error.message);
      else setWords(data as Word[]);
      setLoading(false);
    })();
  }, [cat]);

  // ชุดที่จะโชว์: โหมดวันนี้ = คำที่เริ่มวันนี้ + คำใหม่เติมจนครบโควตา (+รอบเกินเป้าที่ผู้ใช้กดเอง)
  // ใช้ snapshot ตอนเข้าหน้า — สำรับต้องนิ่งตลอดมือ ไม่สลับตำแหน่งตอนพลิกการ์ดใหม่
  const [todayAtStart] = useState(() => new Set(learnedToday()));
  const deck = useMemo(() => {
    if (!dailyMode) return words;
    const todayWords = words.filter((w) => todayAtStart.has(w.id));
    const quota = Math.max(0, WORDS_PER_DAY - todayAtStart.size) + extraRounds * WORDS_PER_DAY;
    const fresh = words.filter((w) => !seenRef.current.has(w.id) && !todayAtStart.has(w.id)).slice(0, quota);
    return [...todayWords, ...fresh];
  }, [dailyMode, words, extraRounds]); // eslint-disable-line react-hooks/exhaustive-deps

  const word = deck[idx];
  const reviewedCount = words.filter((w) => w.th_reviewed).length;

  const play = useCallback(() => {
    if (word?.audio_path) playAtUserRate(audioUrl(word.audio_path));
  }, [word]);

  // พลิกดูคำแปลครั้งแรกของคำไหน = เริ่มเรียนคำนั้น (สร้างการ์ดทวน + นับเข้าเป้าวันนี้)
  useEffect(() => {
    if (flipped && word && !seenRef.current.has(word.id)) {
      review(word.id, Rating.Good);
      seenRef.current.add(word.id);
      recordLearnedToday(word.id);
      setTodayCount(learnedTodayCount());
    }
  }, [flipped, word]);

  const go = useCallback(
    (delta: number) => {
      if (delta > 0 && idx >= deck.length - 1 && deck.length > 0) {
        setFinished(true);
        return;
      }
      setFlipped(false);
      setIdx((i) => Math.min(Math.max(i + delta, 0), deck.length - 1));
    },
    [deck.length, idx]
  );

  // เล่นเสียงอัตโนมัติเมื่อเปลี่ยนคำ
  useEffect(() => {
    if (word) play();
  }, [idx, word, play]);

  // ปุ่มลูกศร/สเปซ
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === " ") { e.preventDefault(); setFlipped((f) => !f); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  async function saveReview(meaning_th: string) {
    try {
      const res = await fetch(`${API_URL}/words/${word.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meaning_th, reviewed: true }),
      });
      if (!res.ok) throw new Error("save failed");
      setWords((ws) =>
        ws.map((w) => (w.id === word.id ? { ...w, meaning_th, th_reviewed: true } : w))
      );
    } catch {
      alert("บันทึกไม่ได้ — ตรวจว่า API (uvicorn) รันอยู่ที่ " + API_URL);
    }
  }

  if (loading) return <Center>กำลังโหลดคำศัพท์...</Center>;
  if (error) return <ErrorState detail={error} />;

  // โหมดวันนี้แต่ไม่มีการ์ดให้ดู = ครบเป้าแล้ว และคำในขอบเขตนี้เรียนหมด/รอเติม
  if (dailyMode && deck.length === 0)
    return (
      <div className="flex flex-col items-center gap-5 p-5">
        <Mascot className="mt-10 h-20 w-20" />
        <h1 className="font-[family-name:var(--font-display)] text-xl font-bold text-ocean-900">
          {todayCount >= WORDS_PER_DAY ? "วันนี้ครบเป้า 10 คำแล้ว!" : "คำในหมวดนี้เรียนครบแล้ว!"}
        </h1>
        <p className="text-center text-sm text-slate-500">
          {todayCount >= WORDS_PER_DAY
            ? "พักสมองหรือไปทวน/ฝึกของที่เรียนแล้วต่อ จะจำแน่นกว่าอัดคำใหม่รวดเดียว"
            : "ลองหมวดอื่น หรือไปฝึกให้คำที่เรียนแล้วแน่นขึ้น"}
        </p>
        <div className="flex w-full flex-col gap-2">
          <Link href="/review" className="w-full rounded-xl bg-ocean-700 px-4 py-3.5 text-center font-semibold text-white shadow transition hover:bg-ocean-900 active:scale-[0.98]">
            ไปทวนคำที่เรียนแล้ว
          </Link>
          {todayCount >= WORDS_PER_DAY && (
            <button
              onClick={() => setExtraRounds((r) => r + 1)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-medium text-slate-600 transition hover:bg-slate-50"
            >
              ขอเรียนเกินเป้าอีก {WORDS_PER_DAY} คำ
            </button>
          )}
          <Link href="/" className="w-full rounded-xl bg-slate-100 px-4 py-3 text-center font-medium text-slate-600 transition hover:bg-slate-200">
            กลับหน้าแรก
          </Link>
        </div>
      </div>
    );

  if (!word)
    return (
      <Center>
        ไม่พบคำศัพท์ —{" "}
        <Link href="/" className="ml-1 text-ocean-500 underline">
          กลับหน้าแรก
        </Link>
      </Center>
    );

  // ---------- จบชุด ----------
  if (finished) {
    const goalDone = todayCount >= WORDS_PER_DAY;
    return (
      <div className="flex flex-col items-center gap-5 p-5">
        <Mascot className="mt-8 h-20 w-20" />
        <h1 className="font-[family-name:var(--font-display)] text-xl font-bold text-ocean-900">
          {dailyMode ? (goalDone ? "ครบเป้าวันนี้ 10 คำแล้ว!" : "จบชุดวันนี้แล้ว!") : "จบชุดบัตรคำแล้ว!"}
        </h1>
        <p className="text-center text-sm text-slate-500">
          {dailyMode
            ? `วันนี้รู้จักคำใหม่ไป ${Math.min(todayCount, WORDS_PER_DAY + extraRounds * WORDS_PER_DAY)} คำ — เดี๋ยวระบบนัดทวนให้เองตามจังหวะลืม`
            : `ดูไป ${deck.length} คำ — คำที่พลิกดูแล้วจะทยอยเข้าคิวทวนให้อัตโนมัติ`}
        </p>
        {dailyMode && goalDone && (
          <button
            onClick={() => {
              setIdx(deck.length);
              setExtraRounds((r) => r + 1);
              setFinished(false);
              setFlipped(false);
            }}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-medium text-slate-600 transition hover:bg-slate-50"
          >
            ขอเรียนเกินเป้าอีก {WORDS_PER_DAY} คำ
          </button>
        )}
        {cat ? (
          <div className="flex w-full flex-col gap-2">
            <Link
              href={`/practice?cat=${cat}&mode=listen`}
              className="w-full rounded-xl bg-ocean-700 px-4 py-3.5 text-center font-semibold text-white shadow transition hover:bg-ocean-900 active:scale-[0.98]"
            >
              ไปฝึกฟังหมวดนี้ต่อ
            </Link>
            <Link
              href={`/learn/category?cat=${cat}`}
              className="w-full rounded-xl bg-slate-100 px-4 py-3 text-center font-medium text-slate-600 transition hover:bg-slate-200"
            >
              กลับเมนูหมวด
            </Link>
          </div>
        ) : (
          <Link
            href="/"
            className="w-full rounded-xl bg-ocean-700 px-4 py-3.5 text-center font-semibold text-white shadow transition hover:bg-ocean-900 active:scale-[0.98]"
          >
            กลับหน้าแรก
          </Link>
        )}
        <button
          onClick={() => {
            setFinished(false);
            setIdx(0);
            setFlipped(false);
          }}
          className="text-sm text-slate-400 underline"
        >
          ดูซ้ำอีกรอบ
        </button>
      </div>
    );
  }

  const frontPinyinShown = !pinyinHidden || peekId === word.id;
  return (
    <div className="flex flex-col items-center gap-6 p-5">
      <div className="w-full">
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span className="flex items-center gap-2">
            {cat && (
              <Link
                href={`/learn/category?cat=${cat}`}
                className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500 transition hover:bg-slate-200"
              >
                <Icon name="arrowLeft" className="h-3 w-3" /> หมวด
              </Link>
            )}
            {cat ? `บัตรคำ · ${catName(cat) ?? `หมวด ${cat}`}` : "บัตรคำ HSK 1"}
            {dailyMode && (
              <span className="rounded-md bg-star-soft px-1.5 py-0.5 text-[10px] font-bold text-star-ink">ชุดวันนี้</span>
            )}
          </span>
          <span className="tabular-nums">{reviewMode ? `ตรวจแล้ว ${reviewedCount}/${words.length}` : `${idx + 1}/${deck.length}`}</span>
        </div>
        <ProgressBar
          className="mt-2"
          size="lg"
          value={reviewMode ? reviewedCount : idx + 1}
          max={reviewMode ? words.length : deck.length}
          label="ความคืบหน้าในชุดบัตรคำ"
        />
        {dailyMode && (
          <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
            <span>
              คำใหม่วันนี้ {Math.min(todayCount, WORDS_PER_DAY)}/{WORDS_PER_DAY}
              {todayCount > WORDS_PER_DAY ? ` (+${todayCount - WORDS_PER_DAY} เกินเป้า)` : ""}
            </span>
            <Link href={cat ? `/flashcards?cat=${cat}&all=1` : "/flashcards?all=1"} className="underline hover:text-slate-600">
              ดูทั้ง{cat ? "หมวด" : "หมด"}
            </Link>
          </div>
        )}
        {/* หย่าพินอิน (m1-6) — ซ่อนพินอินด้านหน้าบัตร · ปุ่ม "ดูพินอินใบนี้" ใต้บัตรเพื่อแอบดูทีละใบ */}
        <div className="mt-2 flex justify-end">
          <PinyinToggle />
        </div>
      </div>

      {/* บัตรคำ — คลิกเพื่อพลิก */}
      <button
        onClick={() => setFlipped((f) => !f)}
        className="flex aspect-[3/2] w-full flex-col items-center justify-center rounded-3xl border border-slate-100 bg-white shadow-xl transition active:scale-[0.99]"
      >
        {!flipped ? (
          <>
            <div className="text-8xl font-bold text-slate-900">{word.hanzi}</div>
            {frontPinyinShown ? (
              <Pinyin text={word.pinyin} className="mt-4 text-2xl font-medium" />
            ) : (
              <PinyinMasked text={word.pinyin} className="mt-4 text-2xl font-medium" />
            )}
            <div className="mt-6 text-xs text-slate-400">แตะเพื่อดูคำแปล</div>
          </>
        ) : (
          <>
            <div className="text-4xl font-semibold text-ocean-800">{word.meaning_th || "—"}</div>
            <div className="mt-3 text-sm text-slate-400">{(word.meaning_en ?? []).slice(0, 2).join("; ")}</div>
            <div className="mt-2 flex items-center gap-2 text-2xl text-slate-500">
              <span className="font-[family-name:var(--font-sc)]">{word.hanzi}</span>
              <span>·</span>
              <Pinyin text={word.pinyin} className="font-medium" />
            </div>
          </>
        )}
      </button>

      {/* ปุ่มแอบดูพินอิน — แยกจากปุ่มพลิกบัตร (ไม่ซ้อนปุ่มในปุ่ม) */}
      {!flipped && !frontPinyinShown && (
        <button
          type="button"
          onClick={() => setPeekId(word.id)}
          className="-mt-3 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-ocean-700 ring-1 ring-ocean-200 transition hover:bg-ocean-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-300"
        >
          ดูพินอินใบนี้
        </button>
      )}

      {/* ปุ่มเสียง + เลื่อน */}
      <div className="flex w-full items-center justify-between gap-3">
        <button
          onClick={() => go(-1)}
          disabled={idx === 0}
          aria-label="คำก่อนหน้า"
          className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-5 py-3 font-medium text-slate-600 transition hover:bg-slate-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:pointer-events-none disabled:opacity-40"
        >
          <Icon name="arrowLeft" className="h-4 w-4" /> ก่อนหน้า
        </button>
        <div className="flex flex-col items-center gap-1.5">
          <button
            onClick={play}
            aria-label="ฟังเสียงอ่าน"
            className="flex items-center gap-2 rounded-full bg-ocean-700 px-7 py-3.5 font-semibold text-white shadow-lg shadow-ocean-900/30 transition hover:bg-ocean-900 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-300 focus-visible:ring-offset-2"
          >
            <Icon name="speaker" className="h-5 w-5" /> ฟัง
          </button>
          <button
            onClick={() => setSlow(toggleAudioRate() === 0.75)}
            aria-pressed={slow}
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition ${
              slow ? "bg-ocean-700 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            {slow ? "เสียงช้าอยู่ · แตะกลับปกติ" : "ฟังแบบช้า"}
          </button>
        </div>
        <button
          onClick={() => go(1)}
          aria-label="คำถัดไป"
          className={`inline-flex items-center gap-1 rounded-xl px-5 py-3 font-medium transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 ${
            idx === words.length - 1
              ? "bg-correct text-white shadow hover:opacity-90 focus-visible:ring-emerald-300"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200 focus-visible:ring-slate-300"
          }`}
        >
          {idx === words.length - 1 ? "จบชุด" : "ถัดไป"} <Icon name="arrowRight" className="h-4 w-4" />
        </button>
      </div>
      {reviewMode && <div className="text-sm text-slate-400">{idx + 1} / {words.length}</div>}

      {/* โหมดตรวจ (สำหรับหฤทัย) — เปิดด้วย ?review=1 เท่านั้น */}
      {reviewMode && (
        <div className="mt-2 w-full rounded-2xl border border-dashed border-slate-300 bg-white/60 p-4">
          <div className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
            ตรวจคำแปล
            {word.th_reviewed ? (
              <span className="inline-flex items-center gap-1 text-correct">
                <Icon name="check" className="h-4 w-4" strokeWidth={2.4} /> ตรวจแล้ว
              </span>
            ) : (
              <span className="text-slate-400">ยังไม่ตรวจ</span>
            )}
          </div>
          <div className="mt-2 flex gap-2">
            <button onClick={() => saveReview(word.meaning_th)}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-sm text-white transition hover:bg-emerald-700 active:scale-95">
              <Icon name="check" className="h-4 w-4" strokeWidth={2.4} /> คำแปลถูก
            </button>
            <button
              onClick={() => {
                const v = prompt("แก้คำแปลไทย:", word.meaning_th);
                if (v !== null && v.trim()) saveReview(v.trim());
              }}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-3 py-2 text-sm text-white transition hover:bg-amber-600 active:scale-95">
              <Icon name="pencil" className="h-4 w-4" /> แก้คำแปล
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


// อ่าน ?cat=&review= ผ่าน useSearchParams — key ตาม query ให้เปลี่ยน URL แล้ว state รีเซ็ตเสมอ
export default function Flashcards() {
  return (
    <Suspense fallback={<Center>กำลังโหลดคำศัพท์...</Center>}>
      <FlashcardsFromQuery />
    </Suspense>
  );
}

function FlashcardsFromQuery() {
  const sp = useSearchParams();
  const cat = Number(sp.get("cat")) || null;
  const reviewMode = sp.get("review") === "1";
  const all = sp.get("all") === "1";
  return <FlashcardsInner key={sp.toString()} cat={cat} reviewMode={reviewMode} all={all} />;
}
