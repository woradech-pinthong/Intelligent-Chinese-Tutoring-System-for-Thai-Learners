"use client";

// ฟังบทสนทนา → ตอบคำถาม (รูปแบบข้อสอบ HSK พาร์ตฟัง) — เดโมด้วยเนื้อหาสมมุติ
// ⚠️ บทสนทนา = ร่าง AI ใน src/data/mock-activities.ts (รอหฤทัยตรวจ) · เสียง = TTS ของเครื่องชั่วคราว (speak-seq.ts)
// PR-02: ซ่อนตัวจีน/พินอินของบทสนทนาจนกว่าจะตอบ · โหมดฝึกใจดี = ฟังซ้ำไม่จำกัด + ปรับช้า + เฉลยทันที
// เครื่องไม่มีเสียงจีน → บอกตรง ๆ + ลองใหม่ + "อ่านแทน" (ติดป้ายชัด และบันทึกเป็นทักษะอ่าน ไม่ใช่ฟัง)
//   รอบที่มีข้ออ่านแทน = ไม่บันทึกรอบ (saveRound) เป็นผล "ฟังบทสนทนา" · ไม่มีเสียงกลางรอบ = ปิดปุ่มตอบจนกว่าจะลองใหม่/อ่านแทน
// เสียงทุกครั้งเริ่มจากปุ่มที่ผู้ใช้แตะ (เริ่ม / ฟังอีกครั้ง / ข้อถัดไป) เพราะ iOS ไม่ให้พูดเองก่อนแตะ

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { DIALOGUES, type Dialogue } from "@/data/mock-activities";
import { shuffle } from "@/lib/random";
import { saveRound } from "@/lib/progress";
import { logAttempt } from "@/lib/attempts-outbox";
import { audioRate, toggleAudioRate } from "@/lib/daily";
import { speakSequence, cancelSpeech, hasMandarinVoice, onMandarinReady } from "@/lib/speak-seq";
import { Icon, type IconName } from "@/components/Icon";
import { Pinyin } from "@/components/Pinyin";
import { Mascot, MascotSays } from "@/components/Mascot";
import { ProgressBar } from "@/components/ProgressBar";
import { FeedbackCard } from "@/components/FeedbackCard";
import { MockBadge } from "@/components/MockBadge";

const BASE_RATE = 0.9; // TTS ช้ากว่าปกตินิด (ผู้เรียนเริ่มต้น) × audioRate() ของผู้ใช้ (ปกติ 1 · ช้า 0.75)
type VoiceState = "checking" | "ok" | "none";

const lineText = (tokens: string[]) => tokens.join("");
// จับเวลาตอบ — อยู่นอกคอมโพเนนต์ เรียกเฉพาะใน event handler
const nowMs = () => performance.now();
const msSince = (t0: number) => Math.round(performance.now() - t0);

export default function DialoguePractice() {
  const [voice, setVoice] = useState<VoiceState>("checking");
  const [retries, setRetries] = useState(0);
  const [round, setRound] = useState<Dialogue[] | null>(null); // null = หน้าแนะนำ
  const [qi, setQi] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correct, setCorrect] = useState(0);
  const [done, setDone] = useState(false);
  const [readMode, setReadMode] = useState(false); // อ่านแทนฟัง (ไม่มีเสียง/ไม่ได้ยิน)
  const [readUsed, setReadUsed] = useState(false); // รอบนี้มีข้อที่ตอบแบบอ่านแทน → ไม่นับรอบเป็นผลการฟัง
  const [slow, setSlow] = useState(false);
  const [speaking, setSpeaking] = useState<number | null>(null); // บรรทัดที่กำลังพูด
  const shownAt = useRef(0);
  const playToken = useRef(0);
  const savedRef = useRef(false);
  const nextRef = useRef<HTMLButtonElement>(null);

  useEffect(() => onMandarinReady((ok) => setVoice(ok ? "ok" : "none")), []);
  useEffect(() => cancelSpeech, []); // ออกจากหน้า = หยุดเสียง
  // ตอบแล้วปุ่มตัวเลือกถูกปิด → ย้ายโฟกัสไปปุ่ม "ข้อถัดไป" (คีย์บอร์ด/สวิตช์) ไม่เลื่อนจอ
  useEffect(() => {
    if (picked !== null) nextRef.current?.focus({ preventScroll: true });
  }, [picked]);

  function play(d: Dialogue) {
    const token = ++playToken.current;
    setSpeaking(null);
    void speakSequence(
      d.lines.map((l) => lineText(l.tokens)),
      {
        rate: BASE_RATE * audioRate(),
        gapMs: 500,
        pitches: d.lines.map((l) => (l.speaker === "A" ? 1.15 : 0.85)),
        voiceSlots: d.lines.map((l) => (l.speaker === "A" ? 0 : 1)),
        onLine: (i) => {
          if (playToken.current === token) setSpeaking(i);
        },
      }
    ).then(() => {
      if (playToken.current === token) setSpeaking(null);
    });
  }

  function start(asReading: boolean) {
    const r = shuffle(DIALOGUES);
    setRound(r);
    setQi(0);
    setPicked(null);
    setCorrect(0);
    setDone(false);
    setReadMode(asReading);
    setReadUsed(false);
    setSlow(audioRate() === 0.75);
    savedRef.current = false;
    shownAt.current = nowMs();
    if (!asReading && voice !== "none") play(r[0]);
  }

  function exitToIntro() {
    cancelSpeech();
    setSpeaking(null);
    setRound(null);
  }

  // สลับเป็นอ่านแทนกลางรอบ — หยุดเสียงที่ยังพูดค้างด้วย (บทสนทนาโผล่บนจอแล้ว ไม่ต้องฟังต่อ)
  function switchToReading() {
    cancelSpeech();
    setSpeaking(null);
    setReadMode(true);
  }

  function retryVoice() {
    const ok = hasMandarinVoice();
    setVoice(ok ? "ok" : "none");
    setRetries((n) => n + 1);
    if (ok && round && !done) play(round[qi]);
  }

  function choose(i: number) {
    if (picked !== null || !round) return;
    const d = round[qi];
    const ok = i === d.answer;
    setPicked(i);
    if (ok) setCorrect((c) => c + 1);
    if (readMode) setReadUsed(true);
    logAttempt({
      generator: "listen_dialogue",
      variant: readMode ? "read_fallback" : "tts",
      event_type: "graded",
      mock_ref: `dialogue-${d.id}`,
      skill_code: readMode ? "SKILL-READ" : "SKILL-LISTEN", // อ่านแทน = ไม่ใช่การฟัง อย่าให้ปนสถิติฟัง
      answer: { picked: i },
      is_correct: ok,
      time_spent_ms: msSince(shownAt.current),
      context: "practice",
    });
  }

  function next() {
    if (!round) return;
    if (qi + 1 >= round.length) {
      cancelSpeech();
      setDone(true);
      if (!savedRef.current) {
        // มีข้ออ่านแทน = ไม่ใช่ผลการฟัง → ไม่บันทึกรอบ (คำตอบรายข้อยังอยู่ใน outbox เป็น SKILL-READ)
        if (!readUsed) saveRound({ ts: Date.now(), mode: "dialogue", total: round.length, correct });
        savedRef.current = true;
      }
      return;
    }
    const ni = qi + 1;
    setQi(ni);
    setPicked(null);
    shownAt.current = nowMs();
    if (!readMode && voice !== "none") play(round[ni]);
    else setSpeaking(null);
  }

  const badge = (
    <MockBadge
      title="เนื้อหาสมมุติ (ร่าง AI · รอหฤทัยตรวจ) · เสียงชั่วคราวจากเครื่อง"
      real="ของจริง: บทสนทนา 10–20 บทที่หฤทัยเขียน + ไฟล์เสียงจริง"
    />
  );
  const noVoiceNow = voice === "none" && !readMode; // ไม่มีเสียงให้ฟัง และยังไม่ได้เลือกอ่านแทน → ยังตอบไม่ได้

  // ---------- หน้าแนะนำ ----------
  if (!round) {
    return (
      <div className="flex flex-col gap-5 p-5">
        {badge}
        <header>
          <Link href="/practice" className="mb-1 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600">
            <Icon name="arrowLeft" className="h-3.5 w-3.5" /> กลับเมนูฝึก
          </Link>
          <h1 className="text-xl font-semibold text-slate-700">ฟังบทสนทนา</h1>
          <p className="mt-1 text-sm text-slate-400">
            รูปแบบข้อสอบ HSK พาร์ตฟัง · ฟัง A คุยกับ B แล้วตอบคำถาม · {DIALOGUES.length} ข้อ/รอบ
          </p>
        </header>
        <ul className="flex flex-col gap-2.5 rounded-2xl border border-slate-100 bg-white p-4 text-sm text-slate-600">
          <Step icon="headphone">เครื่องอ่านประโยคของ A แล้วต่อด้วย B — ฟังซ้ำได้ไม่จำกัด ปรับให้ช้าลงได้</Step>
          <Step icon="lock">ตัวจีนกับพินอินซ่อนไว้จนกว่าจะตอบ เหมือนข้อสอบจริง</Step>
          <Step icon="bulb">ตอบแล้วเฉลยทันที พร้อมคำแปลทั้งบท</Step>
        </ul>
        {voice === "none" ? (
          <NoVoice retries={retries} onRetry={retryVoice} onRead={() => start(true)} />
        ) : (
          <div className="flex flex-col gap-2">
            <p className="flex items-center justify-center gap-1.5 text-xs text-slate-400">
              {voice === "ok" ? (
                <>
                  <Icon name="check" className="h-3.5 w-3.5 text-correct" strokeWidth={2.4} /> เครื่องนี้มีเสียงภาษาจีน พร้อมฟัง
                </>
              ) : (
                "กำลังเช็กเสียงภาษาจีนในเครื่อง..."
              )}
            </p>
            <button
              onClick={() => start(false)}
              disabled={voice === "checking"}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-ocean-700 px-4 py-3 font-semibold text-white shadow transition hover:bg-ocean-900 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-300 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40"
            >
              <Icon name="play" className="h-4 w-4" /> เริ่มฟัง
            </button>
          </div>
        )}
      </div>
    );
  }

  // ---------- หน้าสรุปผล ----------
  if (done) {
    return (
      <div className="flex flex-col gap-5 p-5">
        {badge}
        <Summary correct={correct} total={round.length} readUsed={readUsed} onAgain={() => start(voice === "none")} />
      </div>
    );
  }

  // ---------- หน้าทำข้อ ----------
  const d = round[qi];
  const answered = picked !== null;
  const isRight = picked === d.answer;
  const reveal = answered || readMode;
  const last = d.lines[d.lines.length - 1];
  return (
    <div className="flex flex-col gap-5 p-5">
      {badge}
      <div>
        <div className="flex items-center justify-between text-sm text-slate-500">
          <button onClick={exitToIntro} className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-600">
            <Icon name="arrowLeft" className="h-3.5 w-3.5" /> ออก
          </button>
          <span>
            ข้อ {qi + 1}/{round.length} · ถูก {correct}
          </span>
        </div>
        <ProgressBar className="mt-2" size="lg" value={qi} max={round.length} label="ความคืบหน้าในรอบฟังบทสนทนา" />
      </div>

      {readMode ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
          <span className="font-semibold">โหมดอ่านแทน</span> — เห็นบทสนทนาเลยเพราะฟังเสียงไม่ได้ · ข้อในรอบนี้นับเป็นการอ่าน
          ไม่นับเป็นการฟัง
        </p>
      ) : (
        qi === 0 &&
        !answered && <MascotSays mascotClassName="h-10 w-10">ฟังให้จบทั้ง A และ B ก่อน แล้วค่อยตอบนะ ⭐</MascotSays>
      )}

      {/* บทสนทนา (ซ่อนข้อความจนกว่าจะตอบ — PR-02) */}
      <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
        <Bubbles d={d} reveal={reveal} speaking={speaking} />
        {!readMode &&
          (voice === "none" ? (
            <div className="mt-4">
              <NoVoice retries={retries} onRetry={retryVoice} onRead={switchToReading} />
            </div>
          ) : (
            <div className="mt-4 flex flex-col items-center gap-1.5">
              <button
                onClick={() => play(d)}
                aria-label="ฟังบทสนทนาอีกครั้ง"
                className="grid h-16 w-16 place-items-center rounded-full bg-ocean-800 text-white shadow-lg shadow-ocean-900/30 transition hover:bg-ocean-900 active:scale-95"
              >
                <Icon name="speaker" className="h-7 w-7" />
              </button>
              <div className="text-sm text-slate-400">
                แตะเพื่อฟังทั้งบทอีกครั้ง
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
                <button onClick={switchToReading} className="text-[11px] text-slate-400 underline hover:text-slate-600">
                  ไม่ได้ยินเสียง? อ่านบทสนทนาแทน
                </button>
              )}
            </div>
          ))}
      </div>

      {/* คำถาม + ตัวเลือก */}
      <div>
        <div className="mb-2 text-center font-semibold text-slate-700">{d.question_th}</div>
        {noVoiceNow && !answered && (
          <p className="mb-2 text-center text-xs text-amber-700">
            ยังไม่มีเสียงให้ฟัง เลยยังตอบไม่ได้ — กดลองอีกครั้ง หรืออ่านบทสนทนาแทน
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          {d.choices_th.map((c, i) => {
            const isAns = i === d.answer;
            const isPicked = i === picked;
            let cls = "border-slate-200 bg-white text-slate-700 hover:border-ocean-300";
            if (answered) {
              if (isAns) cls = "border-correct bg-emerald-50 text-emerald-800";
              else if (isPicked) cls = "border-coral/50 bg-coral-soft text-ocean-900";
              else cls = "border-slate-100 bg-slate-50 text-slate-400";
            }
            return (
              <button
                key={i}
                onClick={() => choose(i)}
                disabled={answered || noVoiceNow}
                className={`flex min-h-14 items-center justify-between gap-2 rounded-2xl border px-4 py-3 text-left transition ${cls} ${
                  noVoiceNow && !answered ? "opacity-50" : ""
                }`}
              >
                <span>{c}</span>
                {answered && isAns && <Icon name="check" className="h-5 w-5 shrink-0 text-correct" strokeWidth={2.4} />}
                {answered && isPicked && !isAns && <Icon name="x" className="h-5 w-5 shrink-0 text-coral" strokeWidth={2.4} />}
              </button>
            );
          })}
        </div>
      </div>

      {/* เฉลย: เลือกอะไร · ที่ถูกคืออะไร · เพราะประโยคไหน */}
      {answered && (
        <FeedbackCard
          correct={isRight}
          yourAnswer={!isRight ? { main: d.choices_th[picked] } : undefined}
          rightAnswer={{ main: d.choices_th[d.answer] }}
          hint={`${last.speaker} พูดว่า “${last.meaning_th}” → คำตอบคือ “${d.choices_th[d.answer]}”`}
        />
      )}

      {answered && (
        <button
          ref={nextRef}
          onClick={next}
          className="rounded-xl bg-ocean-900 px-4 py-3 font-semibold text-white shadow transition hover:bg-ocean-800 active:scale-[0.98]"
        >
          {qi + 1 >= round.length ? "ดูผล →" : "ข้อถัดไป →"}
        </button>
      )}
    </div>
  );
}

// ---------- ฟองคำพูด A / B (ก่อนตอบโชว์แค่จุด ๆ ว่าใครกำลังพูด) ----------
function Bubbles({ d, reveal, speaking }: { d: Dialogue; reveal: boolean; speaking: number | null }) {
  return (
    <div className="flex flex-col gap-3">
      {d.lines.map((l, i) => {
        const isA = l.speaker === "A";
        const active = speaking === i;
        return (
          <div key={i} className={`flex items-end gap-2 ${isA ? "" : "flex-row-reverse"}`}>
            <span
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold transition ${
                isA ? "bg-ocean-100 text-ocean-800" : "bg-star-soft text-star-ink"
              } ${active ? "ring-2 ring-ocean-400 ring-offset-2" : ""}`}
            >
              {l.speaker}
            </span>
            <div className={`min-w-0 max-w-[80%] rounded-2xl px-3.5 py-2.5 ${isA ? "rounded-bl-md bg-ocean-50" : "rounded-br-md bg-star-soft"}`}>
              {reveal ? (
                <>
                  <div className="font-[family-name:var(--font-sc)] text-xl leading-snug text-slate-900">{lineText(l.tokens)}</div>
                  <Pinyin text={l.pinyin} className="text-sm" />
                  <div className="mt-0.5 text-xs text-slate-500">{l.meaning_th}</div>
                </>
              ) : (
                <>
                  <span className="sr-only">{active ? `${l.speaker} กำลังพูด` : `ประโยคของ ${l.speaker} ซ่อนไว้จนกว่าจะตอบ`}</span>
                  <span aria-hidden="true" className={`flex gap-1 py-1.5 ${active ? "animate-pulse" : ""}`}>
                    {[0, 1, 2].map((k) => (
                      <span key={k} className={`h-2 w-2 rounded-full ${active ? "bg-ocean-500" : "bg-slate-300"}`} />
                    ))}
                  </span>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function NoVoice({ retries, onRetry, onRead }: { retries: number; onRetry: () => void; onRead: () => void }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
      <div className="text-sm font-semibold">เครื่องนี้ยังไม่มีเสียงภาษาจีน</div>
      <p className="mt-1 text-xs leading-relaxed text-amber-700">
        เลยอ่านบทสนทนาออกเสียงให้ไม่ได้ · ลองเปิดด้วย Chrome หรือ Edge (Android/คอมพิวเตอร์) หรือ Safari (iPhone)
        หรือเพิ่มเสียงภาษาจีนในการตั้งค่าเครื่อง แล้วกดลองอีกครั้ง
      </p>
      {retries > 0 && <p className="mt-1 text-xs text-amber-700">ลองแล้ว {retries} ครั้ง — ยังไม่พบเสียงภาษาจีน</p>}
      <div className="mt-3 flex gap-2">
        <button
          onClick={onRetry}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white px-3 py-2.5 text-sm font-medium text-amber-800 shadow-sm transition hover:bg-amber-100 active:scale-95"
        >
          <Icon name="refresh" className="h-4 w-4" /> ลองอีกครั้ง
        </button>
        <button
          onClick={onRead}
          className="flex-1 rounded-xl bg-ocean-700 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-ocean-900 active:scale-95"
        >
          อ่านบทสนทนาแทน
        </button>
      </div>
    </div>
  );
}

function Step({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <Icon name={icon} className="mt-0.5 h-4 w-4 shrink-0 text-ocean-500" />
      <span>{children}</span>
    </li>
  );
}

function Summary({
  correct,
  total,
  readUsed,
  onAgain,
}: {
  correct: number;
  total: number;
  readUsed: boolean;
  onAgain: () => void;
}) {
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
      <h1 className="font-[family-name:var(--font-display)] text-xl font-bold text-ocean-900">{pass ? "เยี่ยมมาก!" : "สู้ ๆ ฟังอีกนิด!"}</h1>
      <div className="relative w-full overflow-hidden rounded-3xl bg-gradient-to-br from-ocean-900 via-ocean-800 to-ocean-600 p-6 text-center text-white shadow-lg shadow-ocean-900/20">
        <span aria-hidden="true" className="absolute left-7 top-5 h-1 w-1 rounded-full bg-white/50" />
        <span aria-hidden="true" className="absolute right-10 top-7 h-1.5 w-1.5 rounded-full bg-white/40" />
        <div className="relative font-[family-name:var(--font-display)] text-5xl font-extrabold">
          {correct}
          <span className="text-2xl font-normal text-ocean-100"> / {total}</span>
        </div>
        <div className="relative mt-1 text-ocean-100">ความแม่นยำ {pct}%</div>
      </div>
      {readUsed && (
        <p className="w-full rounded-xl bg-amber-50 px-3 py-2 text-center text-xs leading-relaxed text-amber-800">
          รอบนี้อ่านแทนฟัง จึงไม่นับเป็นผลการฟัง
        </p>
      )}
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
