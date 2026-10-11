"use client";

// ฝึกพูด "ฟังแล้วพูดตาม" (shadowing รูปแบบ HSKK ระดับต้น 听后重复) — /practice/speak
// สเปค: docs/08_สเปค-พัฒนา/ทักษะพูด-วิเคราะห์ทางเลือก.md §3 · ตัวฟังเสียง + ตัวเทียบ rule-based อยู่ที่ src/lib/asr.ts
// • ไม่ใช่ข้อสอบฟัง → โชว์ตัวจีน/พินอิน/คำแปลได้ · โหมดใจดี: ฟังต้นแบบซ้ำได้ไม่จำกัด + ฟังช้า + พูดใหม่ได้เรื่อย ๆ
// • ผล ASR = ตัวช่วยเช็กเบื้องต้น "ไม่นับคะแนน" → logAttempt เป็น asr_hint (is_correct = null) · ไม่อัด/ไม่เก็บเสียง
// • เบราว์เซอร์ไม่มีตัวฟังเสียง / ไม่ใช่ https → ยังฝึกได้ด้วยปุ่มประเมินเอง (verdict 'self')
// TODO(สเปค §2 ทักษะพูด-วิเคราะห์ทางเลือก): ปุ่ม "อัดเสียงตัวเองแล้วฟังเทียบกับต้นแบบ (เสียงไม่ออกจากเครื่อง)"
//   — MediaRecorder เก็บในหน่วยความจำ ไม่อัปโหลด · วันนี้โหมดประเมินเองยังต้องฟังตัวเองตอนพูด

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { MenuLink } from "@/components/MenuLink";
import { supabase, audioUrl, type Word } from "@/lib/supabase";
import { Center, ErrorState } from "@/components/Feedback";
import { shuffle } from "@/lib/random";
import { saveRound } from "@/lib/progress";
import { loadCards } from "@/lib/fsrs";
import { audioRate, toggleAudioRate } from "@/lib/daily";
import { speakZh } from "@/lib/speak";
import { logAttempt } from "@/lib/attempts-outbox";
import { pickSpeakWords, speakFocus } from "@/lib/thai-l1-rules";
import { DRAFT_NOTE_TH } from "@/data/kc-tips";
import {
  asrSupport,
  checkSpeech,
  listenOnce,
  preloadPinyin,
  type AsrSupport,
  type ListenFail,
  type ListenSession,
  type SpeakCheck,
} from "@/lib/asr";
import { Icon } from "@/components/Icon";
import { Pinyin } from "@/components/Pinyin";
import { Mascot, MascotSays } from "@/components/Mascot";
import { ProgressBar } from "@/components/ProgressBar";

const N_WORDS = 10;
const LISTEN_MS = 8000;

type Bucket = "match" | "tone" | "retro" | "unclear" | "self_ok" | "self_no" | "skip";
type Outcome = { word: Word; bucket: Bucket; note?: string };

const BUCKET: Record<Bucket, { label: string; cls: string }> = {
  match: { label: "ตรง", cls: "bg-emerald-50 text-emerald-800" },
  tone: { label: "เพี้ยนวรรณยุกต์", cls: "bg-star-soft text-star-ink" },
  retro: { label: "เสียงม้วนลิ้นไม่ตรง", cls: "bg-star-soft text-star-ink" }, // รวมทั้งไม่ม้วน และม้วนเกิน
  unclear: { label: "ระบบฟังไม่ชัด", cls: "bg-slate-100 text-slate-600" }, // อาจเป็นที่ตัวฟังเสียงเอง — ห้ามสื่อว่าผู้เรียนพูดผิด
  self_ok: { label: "พูดได้ตรง (ประเมินเอง)", cls: "bg-emerald-50 text-emerald-800" },
  self_no: { label: "ยังไม่ตรง (ประเมินเอง)", cls: "bg-slate-100 text-slate-600" },
  skip: { label: "ข้าม", cls: "bg-slate-50 text-slate-400" },
};
const ASR_BUCKETS: Bucket[] = ["match", "tone", "retro", "unclear"];
const SELF_BUCKETS: Bucket[] = ["self_ok", "self_no"];

const FAIL_TH: Record<ListenFail, string> = {
  "no-speech": "ไม่ได้ยินเสียงพูดเลย — ลองพูดดังขึ้นอีกนิด ใกล้ ๆ ไมค์",
  timeout: "หมดเวลาฟังแล้ว — แตะแล้วเริ่มพูดได้ทันทีเลย",
  denied:
    "ยังใช้ไมค์ไม่ได้ — อนุญาตไมโครโฟนให้เว็บนี้ (แตะรูปแม่กุญแจข้างช่องที่อยู่เว็บ) · iPhone ต้องเปิด Siri / การป้อนตามคำบอกด้วย",
  "no-mic": "ไม่พบไมโครโฟนในเครื่องนี้",
  network: "ตัวฟังเสียงของเบราว์เซอร์ต้องใช้อินเทอร์เน็ต — เช็กเน็ตแล้วลองใหม่",
  unsupported: "เบราว์เซอร์นี้ฟังภาษาจีนไม่ได้",
  aborted: "หยุดฟังแล้ว — แตะเพื่อพูดใหม่",
  error: "ตัวฟังเสียงขัดข้อง ลองใหม่อีกครั้ง",
};

const noSubscribe = () => () => {};

export default function SpeakPractice() {
  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // รู้ได้เฉพาะฝั่ง client — ตอน server/hydration ได้ null (กัน hydration mismatch)
  const support = useSyncExternalStore<AsrSupport | null>(noSubscribe, asrSupport, () => null);
  const [forceSelf, setForceSelf] = useState(false); // ไมค์มีปัญหา → ผู้เรียนเลือกประเมินเองแทน
  const [learnedIds] = useState(() => new Set(Object.keys(loadCards()).map(Number)));
  const [round, setRound] = useState<Word[] | null>(null); // null = หน้าแนะนำ
  const [roundNo, setRoundNo] = useState(0);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);

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

  // PA-14: คำที่เรียนแล้ว (≥4) ที่มีไฟล์เสียง · ไม่ถึงใช้ทั้งคลัง · ไม่มีไฟล์เสียงเลยใช้ทุกคำ (เล่นด้วยเสียงสังเคราะห์)
  const pool = useMemo(() => {
    const withAudio = words.filter((w) => w.audio_path);
    const base = withAudio.length >= 4 ? withAudio : words;
    const learned = base.filter((w) => learnedIds.has(w.id));
    return learned.length >= 4 ? { list: learned, learned: true } : { list: base, learned: false };
  }, [words, learnedIds]);

  function start() {
    setRound(buildRound(pool.list));
    setRoundNo((n) => n + 1);
    setOutcomes([]);
  }

  function handleDone(o: Outcome) {
    if (!round) return;
    const all = [...outcomes, o];
    setOutcomes(all);
    if (all.length < round.length) return;
    // จบรอบ → สรุปลงหน้า "ผล" · ข้ามไม่นับ · ตรง = ระบบได้ยินตรง + ประเมินเองว่าตรง
    const tried = all.filter((x) => x.bucket !== "skip");
    const correct = tried.filter((x) => x.bucket === "match" || x.bucket === "self_ok").length;
    if (tried.length) saveRound({ ts: Date.now(), mode: "speak", total: tried.length, correct });
  }

  if (loading) return <Center>กำลังโหลดคลังคำ...</Center>;
  if (error) return <ErrorState detail={error} />;
  if (!round) return <Intro support={support} poolSize={pool.list.length} fromLearned={pool.learned} onStart={start} />;
  if (outcomes.length >= round.length) return <Summary outcomes={outcomes} onAgain={start} />;

  const index = outcomes.length;
  return (
    <SpeakItem
      key={`${roundNo}-${index}`}
      word={round[index]}
      index={index}
      total={round.length}
      selfMode={support !== "ok" || forceSelf}
      canUseMic={support === "ok"}
      onSelfMode={setForceSelf}
      onDone={handleDone}
      onExit={() => setRound(null)}
    />
  );
}

// ---------- หน้าแนะนำ ----------
function Intro({
  support,
  poolSize,
  fromLearned,
  onStart,
}: {
  support: AsrSupport | null;
  poolSize: number;
  fromLearned: boolean;
  onStart: () => void;
}) {
  const n = Math.min(N_WORDS, poolSize);
  return (
    <div className="flex flex-col gap-5 p-5">
      <header>
        <MenuLink group="speak" className="mb-1 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600">
          <Icon name="arrowLeft" className="h-3.5 w-3.5" /> กลับเมนูฝึก
        </MenuLink>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-slate-700">ฟังแล้วพูดตาม</h1>
          <TrialBadge />
        </div>
        <p className="mt-1 text-sm text-slate-400">
          แบบเดียวกับข้อสอบพูด HSKK ระดับต้น “ฟังแล้วพูดซ้ำ” · {N_WORDS} คำ/รอบ · ฟังซ้ำได้ไม่จำกัด
        </p>
      </header>

      <MascotSays>
        ฟังเสียงต้นแบบ แล้วแตะ “พูดตาม” พูดคำนั้นดัง ๆ — จะบอกว่าระบบได้ยินเป็นคำอะไร ถ้าเพี้ยนจะชี้จุดที่คนไทยมักพลาดให้
      </MascotSays>

      <div className="flex flex-col gap-2 rounded-2xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-500">
        <p className="flex gap-2">
          <Icon name="bulb" className="mt-0.5 h-4 w-4 shrink-0 text-star-dark" />
          ตัวฟังเสียงของเบราว์เซอร์เช็กได้แค่คร่าว ๆ — เสียงที่คนไทยพูดเพี้ยนนิดหน่อยอาจถูกมันแก้ให้เป็นคำที่ถูกเอง
          ใช้เป็นตัวช่วยฝึก ไม่ใช่คะแนน
        </p>
        <p className="flex gap-2">
          <Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0 text-ocean-500" />
          <span>
            <b className="font-semibold text-slate-600">ไม่บันทึกเสียง เก็บแค่คำที่ระบบได้ยิน</b> · เบราว์เซอร์จะขออนุญาตใช้ไมค์
            แล้วส่งเสียงไปถอดเป็นข้อความที่บริการของเบราว์เซอร์เอง (เช่น Google / Apple)
          </span>
        </p>
      </div>

      {support && support !== "ok" && <UnsupportedNotice support={support} />}

      <button
        onClick={onStart}
        disabled={n === 0 || support === null}
        className="btn-ocean inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold"
      >
        <Icon name="play" className="h-4 w-4" /> เริ่มฝึก {n} คำ
      </button>
      <p className="-mt-2 text-center text-[11px] text-slate-400">
        {n === 0
          ? "คลังคำยังไม่พร้อม ลองใหม่อีกครั้งนะ"
          : `สุ่มจาก${fromLearned ? "คำที่เรียนแล้ว" : "คลังคำ HSK 1"} ${poolSize} คำ · เน้นคำที่มีเสียง 2/3 หรือ zh ch sh r ก่อน`}
      </p>
    </div>
  );
}

// ---------- 1 คำ: ฟังต้นแบบ → พูดตาม → ดูว่าระบบได้ยินอะไร ----------
type Phase = "idle" | "listening" | "checking" | "fail";

function SpeakItem({
  word,
  index,
  total,
  selfMode,
  canUseMic,
  onSelfMode,
  onDone,
  onExit,
}: {
  word: Word;
  index: number;
  total: number;
  selfMode: boolean;
  canUseMic: boolean;
  onSelfMode: (on: boolean) => void;
  onDone: (o: Outcome) => void;
  onExit: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [check, setCheck] = useState<SpeakCheck | null>(null);
  const [fail, setFail] = useState<ListenFail | null>(null);
  const [selfOk, setSelfOk] = useState<boolean | null>(null);
  const [matched, setMatched] = useState(false); // เคยได้ "ตรง" ในคำนี้แล้ว (พูดซ้ำได้ไม่จำกัด นับผลที่ดีที่สุด)
  const [slow, setSlow] = useState(() => audioRate() === 0.75); // mount หลังกดเริ่มเท่านั้น → ไม่ชน hydration
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sessionRef = useRef<ListenSession | null>(null);
  const aliveRef = useRef(false);
  const shownAtRef = useRef(0);
  const doneRef = useRef(false);
  const focus = useMemo(() => speakFocus(word.pinyin).slice(0, 2), [word.pinyin]);

  // หยุดเสียงต้นแบบ — ต้องหยุดก่อนเปิดไมค์ ไม่งั้นระบบได้ยินเสียงต้นแบบแทนเสียงเรา
  const stopModel = useCallback(() => {
    const a = audioRef.current;
    audioRef.current = null;
    if (a) {
      a.onplaying = a.onended = a.onpause = null;
      a.pause();
    }
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  }, []);

  // เล่นต้นแบบตามความเร็วที่ผู้ใช้ตั้ง (= playAtUserRate แต่เก็บ element ไว้หยุดได้)
  const play = useCallback(() => {
    stopModel();
    if (!word.audio_path) {
      speakZh(word.hanzi, audioRate() === 0.75 ? 0.6 : 0.85); // ไม่มีไฟล์เสียง → เสียงสังเคราะห์ของเบราว์เซอร์ (ตามค่า "ฟังช้า")
      return;
    }
    const a = new Audio(audioUrl(word.audio_path));
    a.playbackRate = audioRate();
    a.onplaying = () => setPlaying(true);
    a.onended = a.onpause = () => setPlaying(false);
    audioRef.current = a;
    a.play().catch(() => setPlaying(false));
  }, [word.audio_path, word.hanzi, stopModel]);

  useEffect(() => {
    aliveRef.current = true;
    shownAtRef.current = Date.now();
    play(); // ขึ้นคำใหม่ → เล่นต้นแบบให้อัตโนมัติ
    return () => {
      aliveRef.current = false;
      const s = sessionRef.current;
      sessionRef.current = null;
      s?.abort(); // ปิดไมค์ทันทีเมื่อเปลี่ยนคำ/ออกจากหน้า
      stopModel();
    };
  }, [play, stopModel]);

  function toggleSlow() {
    const rate = toggleAudioRate();
    setSlow(rate === 0.75);
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }

  async function listen() {
    if (phase === "listening") {
      sessionRef.current?.stop(); // แตะซ้ำ = พูดจบแล้ว ตรวจเลย
      return;
    }
    if (phase === "checking") return;
    stopModel();
    setPlaying(false);
    preloadPinyin();
    const session = listenOnce(LISTEN_MS); // เริ่มจากการกดปุ่มของผู้ใช้เท่านั้น
    sessionRef.current = session;
    setFail(null);
    setPhase("listening");
    const out = await session.result;
    if (!aliveRef.current || sessionRef.current !== session) return; // เปลี่ยนคำ/ออกไปแล้ว
    sessionRef.current = null;
    if (!out.ok) {
      setFail(out.reason);
      setPhase("fail");
      return;
    }
    setPhase("checking");
    const res = await checkSpeech(word, out.alternatives);
    if (!aliveRef.current) return;
    logAttempt({
      generator: "speak_along",
      variant: "asr",
      event_type: "asr_hint", // คำใบ้จาก ASR ไม่ใช่ถูก/ผิด (BKT ไม่อ่าน)
      word_id: word.id,
      skill_code: res.kc ?? "SKILL-LISTEN",
      answer: {
        heard: res.heard,
        heard_pinyin: res.heardPinyin,
        target: word.hanzi,
        verdict: res.verdict,
        kc: res.kc ?? null,
        alts: out.alternatives, // ทุกตัวที่ ASR ส่งมา — ไว้ตรวจย้อน/เทียบกับหูหฤทัยทีหลัง
        focus: focus.find((f) => f.kc)?.kc ?? null, // จุดเสี่ยงแรกที่ผูก KC (คำแนะนำครึ่งเสียง 3 ไม่มี KC)
      },
      is_correct: null,
      time_spent_ms: Date.now() - shownAtRef.current,
      context: "practice",
    });
    setCheck(res);
    if (res.verdict === "match") setMatched(true);
    setPhase("idle");
  }

  function selfCheck(ok: boolean) {
    if (selfOk !== null) return;
    logAttempt({
      generator: "speak_along",
      variant: "self",
      event_type: "asr_hint",
      word_id: word.id,
      skill_code: "SKILL-LISTEN",
      answer: { heard: null, target: word.hanzi, verdict: "self", kc: null, self_ok: ok },
      is_correct: null,
      time_spent_ms: Date.now() - shownAtRef.current,
      context: "practice",
    });
    setSelfOk(ok);
  }

  function next() {
    if (doneRef.current) return;
    doneRef.current = true;
    const bucket: Bucket =
      selfOk !== null ? (selfOk ? "self_ok" : "self_no") : matched ? "match" : (check?.verdict ?? "skip");
    const note = bucket === "tone" || bucket === "retro" || bucket === "unclear" ? check?.title_th : undefined;
    onDone({ word, bucket, note });
  }

  const listening = phase === "listening";
  const busy = listening || phase === "checking";
  const answered = check !== null || selfOk !== null;

  return (
    <div className="flex flex-col gap-4 p-5">
      {/* แถบความคืบหน้า */}
      <div>
        <div className="flex items-center justify-between gap-2 text-sm text-slate-500">
          <button onClick={onExit} className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-600">
            <Icon name="arrowLeft" className="h-3.5 w-3.5" /> ออก
          </button>
          <span className="flex items-center gap-2">
            <TrialBadge />
            <span>
              คำ {index + 1}/{total}
            </span>
          </span>
        </div>
        <ProgressBar className="mt-2" size="lg" value={index} max={total} label="ความคืบหน้าในรอบฝึกพูด" />
      </div>

      {/* คำต้นแบบ — ฝึกพูด ไม่ใช่ข้อสอบฟัง จึงโชว์ตัวจีน/พินอิน/คำแปลได้ */}
      <section className="flex flex-col items-center rounded-3xl border border-slate-100 bg-white p-6 text-center shadow-sm">
        <div lang="zh-CN" className="font-[family-name:var(--font-sc)] text-6xl font-bold text-slate-900">
          {word.hanzi}
        </div>
        <Pinyin text={word.pinyin} className="mt-2 text-2xl font-medium" />
        {word.meaning_th && <div className="mt-1 text-sm text-slate-500">{word.meaning_th}</div>}
        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={play}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full bg-ocean-800 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-ocean-900 active:scale-95 disabled:opacity-40"
          >
            <Icon name="speaker" className={`h-4 w-4 ${playing ? "animate-pulse" : ""}`} /> ฟังต้นแบบ
          </button>
          <button
            onClick={toggleSlow}
            aria-pressed={slow}
            className={`rounded-full px-3 py-2 text-xs font-medium transition ${
              slow ? "bg-ocean-700 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            {slow ? "ช้าอยู่" : "ฟังช้า"}
          </button>
        </div>
        {focus.length > 0 && (
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            <span className="font-semibold text-star-ink">ระวัง:</span> {focus.map((f) => f.detail_th).join(" · ")}
          </p>
        )}
      </section>

      {selfMode ? (
        // ---- ประเมินเอง (ไม่มีตัวฟังเสียง / ไมค์ใช้ไม่ได้) ----
        <section className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3 rounded-2xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">
            <span>
              {canUseMic ? "โหมดประเมินเอง" : "เบราว์เซอร์นี้ยังฟังเสียงพูดไม่ได้"} — พูดตามดัง ๆ แล้วเทียบกับเสียงต้นแบบด้วยหูตัวเอง
            </span>
            {canUseMic && (
              <button onClick={() => onSelfMode(false)} className="shrink-0 font-medium text-ocean-600 underline">
                ใช้ไมค์
              </button>
            )}
          </div>
          {selfOk === null ? (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => selfCheck(true)}
                className="flex items-center justify-center gap-1.5 rounded-2xl border border-correct/40 bg-emerald-50 px-4 py-4 font-semibold text-emerald-800 transition active:scale-95"
              >
                <Icon name="check" className="h-5 w-5" strokeWidth={2.4} /> พูดได้ตรง
              </button>
              <button
                onClick={() => selfCheck(false)}
                className="flex items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 py-4 font-semibold text-slate-600 transition active:scale-95"
              >
                <Icon name="refresh" className="h-5 w-5" /> ยังไม่ตรง
              </button>
            </div>
          ) : (
            <MascotSays mascotClassName="h-10 w-10">
              {selfOk
                ? "เยี่ยม! ไปคำต่อไปกัน"
                : `ไม่เป็นไร ฟังต้นแบบอีกรอบ (ลองฟังช้า) แล้วพูดตามใหม่ได้เลย${focus.length ? " — ดูจุด “ระวัง” ด้านบนด้วยนะ" : ""}`}
            </MascotSays>
          )}
        </section>
      ) : (
        // ---- ใช้ไมค์ + ตัวฟังเสียงของเบราว์เซอร์ ----
        <>
          <section className="flex flex-col items-center gap-2">
            <div className="relative">
              {listening && (
                <span
                  aria-hidden="true"
                  className="absolute inset-0 animate-ping rounded-full bg-ocean-400/40 motion-reduce:animate-none"
                />
              )}
              <button
                onClick={listen}
                disabled={phase === "checking"}
                aria-label={listening ? "พูดจบแล้ว หยุดฟัง" : "แตะแล้วพูดตาม"}
                className={`relative flex h-24 w-24 flex-col items-center justify-center gap-0.5 rounded-full text-white shadow-lg shadow-ocean-900/30 transition active:scale-95 disabled:opacity-60 ${
                  listening ? "bg-ocean-900" : "bg-ocean-700 hover:bg-ocean-900"
                }`}
              >
                <Icon name="mic" className="h-8 w-8" />
                <span className="text-sm font-semibold">{listening ? "พูดจบ" : "พูดตาม"}</span>
              </button>
            </div>
            <div aria-live="polite" className="text-center text-sm text-slate-500">
              {listening
                ? "กำลังฟัง… พูดได้เลย"
                : phase === "checking"
                  ? "กำลังเทียบเสียง…"
                  : check
                    ? "พูดใหม่ได้เรื่อย ๆ"
                    : "แตะแล้วพูดคำนี้ดัง ๆ"}
            </div>
            <p className="text-[11px] text-slate-400">ไม่บันทึกเสียง เก็บแค่คำที่ระบบได้ยิน</p>
          </section>

          {phase === "fail" && fail && (
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              <p className="flex items-start gap-2">
                <Icon name="bulb" className="mt-0.5 h-4 w-4 shrink-0 text-star-dark" />
                {FAIL_TH[fail]}
              </p>
              <button onClick={() => onSelfMode(true)} className="mt-2 text-xs font-medium text-ocean-600 underline">
                ใช้ไมค์ไม่ได้? เปลี่ยนเป็นประเมินเอง
              </button>
            </div>
          )}
          {check && phase === "idle" && <ResultCard check={check} word={word} />}
        </>
      )}

      {answered ? (
        <button
          onClick={next}
          disabled={busy}
          className="rounded-xl bg-ocean-900 px-4 py-3 font-semibold text-white shadow transition hover:bg-ocean-800 active:scale-[0.98] disabled:opacity-40"
        >
          {index + 1 >= total ? "ดูสรุป →" : "คำถัดไป →"}
        </button>
      ) : (
        <button
          onClick={next}
          disabled={busy}
          className="self-center text-xs text-slate-400 underline-offset-2 hover:underline disabled:opacity-40"
        >
          ข้ามคำนี้
        </button>
      )}
    </div>
  );
}

// ---------- ผลจากตัวฟังเสียง: คำเป้า vs ที่ระบบได้ยิน ----------
function ResultCard({ check, word }: { check: SpeakCheck; word: Word }) {
  const isMatch = check.verdict === "match";
  const isNear = check.verdict === "tone" || check.verdict === "retro";
  const box = isMatch ? "bg-emerald-50" : isNear ? "border border-star/40 bg-star-soft" : "bg-slate-50";
  const head = isMatch ? "text-correct" : isNear ? "text-star-ink" : "text-slate-600";
  return (
    <div role="status" className={`rounded-2xl p-4 ${box}`}>
      <div className={`flex items-start gap-1.5 font-semibold ${head}`}>
        <Icon
          name={isMatch ? "check" : isNear ? "target" : "refresh"}
          className="mt-0.5 h-5 w-5 shrink-0"
          strokeWidth={isMatch ? 2.6 : 2}
        />
        {check.title_th}
      </div>
      <dl className="mt-3 flex flex-col gap-1.5">
        <HeardRow label="คำเป้า" han={word.hanzi} pinyin={word.pinyin} />
        <HeardRow label="ระบบได้ยิน" han={check.heard} pinyin={check.heardPinyin} />
      </dl>
      {check.kc_label_th && (
        <div className="mt-3 inline-flex rounded-full bg-white/80 px-2.5 py-0.5 text-[11px] font-medium text-star-ink">
          จุดที่คนไทยมักพลาด · {check.kc_label_th}
        </div>
      )}
      {check.tip_th && (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-white/70 p-2.5 text-xs leading-relaxed text-slate-600">
          <Icon name="bulb" className="mt-0.5 h-4 w-4 shrink-0 text-star-dark" />
          <span>
            {check.tip_th}
            {check.tip_draft && <span className="ml-1 text-[10px] text-slate-400">({DRAFT_NOTE_TH})</span>}
          </span>
        </p>
      )}
      {check.verdict === "unclear" && (
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          อาจเป็นที่ตัวฟังเสียงพลาดเองก็ได้ — ฟังต้นแบบอีกรอบ แล้วพูดช้า ๆ ชัด ๆ ใกล้ไมค์
        </p>
      )}
    </div>
  );
}

function HeardRow({ label, han, pinyin }: { label: string; han: string; pinyin: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="w-[72px] shrink-0 text-xs text-slate-500">{label}</dt>
      <dd className="flex min-w-0 flex-wrap items-baseline gap-x-2">
        {han ? (
          <>
            <span lang="zh-CN" className="font-[family-name:var(--font-sc)] text-xl font-semibold text-ocean-900">
              {han}
            </span>
            {pinyin && <Pinyin text={pinyin} className="text-sm" />}
          </>
        ) : (
          <span className="text-sm text-slate-400">— ไม่ได้ยินเป็นคำจีน</span>
        )}
      </dd>
    </div>
  );
}

// ---------- สรุปรอบ (ไม่มีคะแนน — นับแยกตามผล) ----------
function Summary({ outcomes, onAgain }: { outcomes: Outcome[]; onAgain: () => void }) {
  const count = (b: Bucket) => outcomes.filter((o) => o.bucket === b).length;
  const usedSelf = SELF_BUCKETS.some((b) => count(b) > 0);
  const usedAsr = ASR_BUCKETS.some((b) => count(b) > 0);
  const cells = [...(usedAsr || !usedSelf ? ASR_BUCKETS : []), ...(usedSelf ? SELF_BUCKETS : [])];
  const again = outcomes.filter((o) => o.bucket === "tone" || o.bucket === "retro" || o.bucket === "unclear" || o.bucket === "self_no");
  const skipped = count("skip");

  return (
    <div className="flex flex-col items-center gap-5 p-5">
      <Mascot className="mt-6 h-20 w-20" />
      <div className="flex flex-col items-center gap-2">
        <h1 className="font-[family-name:var(--font-display)] text-xl font-bold text-ocean-900">ฝึกพูดครบรอบแล้ว!</h1>
        <TrialBadge />
      </div>

      <div className="grid w-full grid-cols-2 gap-3">
        {cells.map((b) => (
          <div key={b} className={`rounded-2xl p-4 text-center ${BUCKET[b].cls}`}>
            <div className="font-[family-name:var(--font-display)] text-3xl font-bold">{count(b)}</div>
            <div className="mt-0.5 text-xs">{BUCKET[b].label}</div>
          </div>
        ))}
      </div>
      {skipped > 0 && <p className="-mt-2 text-xs text-slate-400">ข้าม {skipped} คำ</p>}

      {again.length > 0 && (
        <section className="w-full">
          <h2 className="mb-2 text-sm font-semibold text-slate-500">คำที่ลองพูดอีกรอบได้</h2>
          <ul className="flex flex-col gap-2">
            {again.map((o, i) => (
              <li key={`${o.word.id}-${i}`} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3">
                <span lang="zh-CN" className="font-[family-name:var(--font-sc)] text-2xl font-semibold text-slate-900">
                  {o.word.hanzi}
                </span>
                <div className="min-w-0 flex-1">
                  <Pinyin text={o.word.pinyin} className="text-sm" />
                  <div className="text-xs text-slate-500">{o.note ?? BUCKET[o.bucket].label}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-center text-xs leading-relaxed text-slate-400">
        ผลรอบนี้มาจากตัวฟังเสียงของเบราว์เซอร์ (หรือประเมินเอง) — เป็นตัวช่วยเช็กเบื้องต้น ไม่ใช่คะแนนการออกเสียง
      </p>
      <div className="flex w-full gap-3">
        <button
          onClick={onAgain}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-ocean-700 px-4 py-3 font-semibold text-white shadow transition hover:bg-ocean-900 active:scale-95"
        >
          <Icon name="refresh" className="h-5 w-5" /> ฝึกอีกรอบ
        </button>
        <MenuLink
          group="speak"
          className="flex-1 rounded-xl bg-slate-100 px-4 py-3 text-center font-medium text-slate-600 transition hover:bg-slate-200 active:scale-95"
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

function TrialBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-star-soft px-2.5 py-0.5 text-[11px] font-bold text-star-ink">
      <Icon name="flask" className="h-3.5 w-3.5" /> ทดลอง — ไม่นับคะแนน
    </span>
  );
}

function UnsupportedNotice({ support }: { support: "no-api" | "insecure" }) {
  return (
    <div className="rounded-2xl border border-star/40 bg-star-soft p-4 text-sm leading-relaxed text-star-ink">
      <div className="font-semibold">
        {support === "insecure" ? "ต้องเปิดเว็บผ่าน https:// ถึงจะใช้ไมค์ได้" : "เบราว์เซอร์นี้ยังฟังเสียงพูดไม่ได้"}
      </div>
      <p className="mt-1 text-xs">
        ใช้ได้กับ Chrome หรือ Edge (Android / คอมพิวเตอร์) และ Safari บน iPhone · ถ้าเปิดจาก LINE หรือ Facebook
        ให้กด “เปิดในเบราว์เซอร์” ก่อน
      </p>
      <p className="mt-1 text-xs">ระหว่างนี้ยังฝึกได้: ฟังต้นแบบ → พูดตามดัง ๆ → กด “พูดได้ตรง” หรือ “ยังไม่ตรง” ประเมินเอง</p>
    </div>
  );
}

// สุ่ม N คำ — คำที่มีจุดเสี่ยงคนไทย (เสียง 2/3 · zh ch sh r) มาก่อน ไม่พอค่อยเติมคำอื่น แล้วสลับลำดับ
function buildRound(pool: Word[]): Word[] {
  const focus = pickSpeakWords(pool);
  const ids = new Set(focus.map((w) => w.id));
  const rest = pool.filter((w) => !ids.has(w.id));
  return shuffle([...shuffle(focus), ...shuffle(rest)].slice(0, N_WORDS));
}
