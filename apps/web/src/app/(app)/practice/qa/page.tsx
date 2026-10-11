"use client";

// จับคู่คำถาม ↔ คำตอบ (รูปแบบข้อสอบ HSK 1 พาร์ตอ่าน) — เดโมด้วยเนื้อหาสมมุติ
// ⚠️ คู่ถาม-ตอบ = ร่าง AI ใน src/data/mock-activities.ts (รอหฤทัยตรวจ) · คำอธิบายคำแสดงคำถามด้านล่างก็ร่าง AI เช่นกัน
// PR-06: ทักษะอ่าน ไม่มีเสียง · ตัวลวง = คำตอบของคู่อื่น 3 ข้อ · ตอบแล้วเฉลยคำแปลทุกตัวเลือก

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { QA_PAIRS, type QAPair } from "@/data/mock-activities";
import { Center } from "@/components/Feedback";
import { shuffle } from "@/lib/random";
import { saveRound } from "@/lib/progress";
import { logAttempt } from "@/lib/attempts-outbox";
import { Icon } from "@/components/Icon";
import { Pinyin } from "@/components/Pinyin";
import { Mascot, MascotSays } from "@/components/Mascot";
import { ProgressBar } from "@/components/ProgressBar";
import { FeedbackCard } from "@/components/FeedbackCard";
import { MockBadge } from "@/components/MockBadge";

type QAItem = { pair: QAPair; options: QAPair[] };

// คำแสดงคำถาม → คำตอบควรหน้าตาแบบไหน (เช็กตามลำดับ: 哪儿 ก่อน 哪)
const QWORD_TIPS: [string, string][] = [
  ["怎么样", "怎么样 = เป็นอย่างไร → คำตอบบอกสภาพ/ลักษณะ"],
  ["哪儿", "哪儿 = ที่ไหน → คำตอบบอกสถานที่ (在 + สถานที่)"],
  ["什么", "什么 = อะไร → คำตอบบอกว่าเป็นสิ่งไหน"],
  ["谁", "谁 = ใคร → คำตอบบอกว่าเป็นใคร"],
  ["几", "几 = กี่ → คำตอบต้องมีตัวเลข"],
  ["哪", "哪 + คำนาม = …ไหน (哪国 = ประเทศไหน)"],
  ["吗", "…吗 = ถามว่า …ไหม → คำตอบมักทวนคำหลักของคำถาม"],
];
const tipFor = (q: string[]) => QWORD_TIPS.find(([w]) => q.includes(w))?.[1];
const zh = (tokens: string[]) => tokens.join("");

// จับเวลาตอบ — อยู่นอกคอมโพเนนต์ เรียกเฉพาะใน effect / event handler
const nowMs = () => performance.now();
const msSince = (t0: number) => Math.round(performance.now() - t0);

/** ทุกคู่ สลับลำดับ · ตัวเลือก = คำตอบที่ถูก + คำตอบของคู่อื่น 3 ข้อ */
function buildRound(): QAItem[] {
  return shuffle(QA_PAIRS).map((pair) => ({
    pair,
    options: shuffle([pair, ...shuffle(QA_PAIRS.filter((p) => p.id !== pair.id)).slice(0, 3)]),
  }));
}

const noopSubscribe = () => () => {};

export default function QAPractice() {
  // สุ่มข้อฝั่ง client เท่านั้น — HTML ที่ prerender ไว้จะได้ไม่ขัดกับลำดับที่สุ่มในเครื่อง (hydration)
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [roundNo, setRoundNo] = useState(0);
  return (
    <div className="flex flex-col gap-5 p-5">
      <MockBadge title="เนื้อหาสมมุติ (ร่าง AI · รอหฤทัยตรวจ)" real="ของจริง: คู่ถาม-ตอบรายหมวดจากหฤทัย" />
      {isClient ? <QARound key={roundNo} onAgain={() => setRoundNo((n) => n + 1)} /> : <Center>กำลังเตรียมข้อ...</Center>}
    </div>
  );
}

function QARound({ onAgain }: { onAgain: () => void }) {
  const [items] = useState(buildRound);
  const [qi, setQi] = useState(0);
  const [picked, setPicked] = useState<number | null>(null); // id ของคู่ที่เลือกคำตอบมา
  const [correct, setCorrect] = useState(0);
  const [done, setDone] = useState(false);
  const shownAt = useRef(0);
  const savedRef = useRef(false);
  const nextRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    shownAt.current = nowMs();
  }, [qi]);

  // ตอบแล้วปุ่มตัวเลือกถูกปิด → ย้ายโฟกัสไปปุ่ม "ข้อถัดไป" (คีย์บอร์ด/สวิตช์) ไม่เลื่อนจอ
  useEffect(() => {
    if (picked !== null) nextRef.current?.focus({ preventScroll: true });
  }, [picked]);

  const it = items[qi];

  function choose(id: number) {
    if (picked !== null) return;
    const ok = id === it.pair.id;
    setPicked(id);
    if (ok) setCorrect((c) => c + 1);
    logAttempt({
      generator: "qa_match",
      event_type: "graded",
      mock_ref: `qa-${it.pair.id}`,
      skill_code: "SKILL-READ",
      answer: { picked: id },
      is_correct: ok,
      time_spent_ms: msSince(shownAt.current),
      context: "practice",
    });
  }

  function next() {
    if (qi + 1 >= items.length) {
      setDone(true);
      if (!savedRef.current) {
        saveRound({ ts: Date.now(), mode: "qa", total: items.length, correct });
        savedRef.current = true;
      }
    } else {
      setQi((i) => i + 1);
      setPicked(null);
    }
  }

  if (done) return <Summary correct={correct} total={items.length} onAgain={onAgain} />;

  const answered = picked !== null;
  const isRight = picked === it.pair.id;
  const pickedPair = answered ? it.options.find((o) => o.id === picked) : undefined;
  const tip = tipFor(it.pair.q);
  return (
    <>
      <div>
        <div className="flex items-center justify-between text-sm text-slate-500">
          <Link href="/practice" className="inline-flex items-center gap-1 text-slate-400 hover:text-slate-600">
            <Icon name="arrowLeft" className="h-3.5 w-3.5" /> ออก
          </Link>
          <span>
            ข้อ {qi + 1}/{items.length} · ถูก {correct}
          </span>
        </div>
        <ProgressBar className="mt-2" size="lg" value={qi} max={items.length} label="ความคืบหน้าในรอบจับคู่ถาม-ตอบ" />
      </div>

      {qi === 0 && !answered && (
        <MascotSays mascotClassName="h-10 w-10">อ่านคำถาม แล้วเลือกคำตอบที่เข้ากันที่สุดนะ ⭐</MascotSays>
      )}

      {/* คำถาม (อ่านอย่างเดียว ไม่มีเสียง — PR-06) */}
      <div className="flex flex-col items-center rounded-3xl border border-slate-100 bg-white p-5 text-center shadow-sm">
        <div className="text-xs text-slate-400">คำถาม</div>
        <div className="mt-1 font-[family-name:var(--font-sc)] text-4xl font-bold text-slate-900">{zh(it.pair.q)}</div>
        <Pinyin text={it.pair.q_pinyin} className="mt-2 text-lg font-medium" />
        {answered ? (
          <div className="mt-2 text-sm text-slate-500">“{it.pair.q_th}”</div>
        ) : (
          <div className="mt-3 text-xs text-slate-400">คำตอบไหนเข้ากับคำถามนี้</div>
        )}
      </div>

      {/* คำตอบ 4 ตัวเลือก */}
      <div className="grid grid-cols-1 gap-3">
        {it.options.map((o) => {
          const isAns = o.id === it.pair.id;
          const isPicked = o.id === picked;
          let cls = "border-slate-200 bg-white text-slate-800 hover:border-ocean-300";
          if (answered) {
            if (isAns) cls = "border-correct bg-emerald-50 text-emerald-900";
            else if (isPicked) cls = "border-coral/50 bg-coral-soft text-ocean-900";
            else cls = "border-slate-100 bg-slate-50 text-slate-400";
          }
          return (
            <button
              key={o.id}
              onClick={() => choose(o.id)}
              disabled={answered}
              className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition ${cls}`}
            >
              <span className="min-w-0">
                <span className="block font-[family-name:var(--font-sc)] text-2xl font-semibold">{zh(o.a)}</span>
                <Pinyin text={o.a_pinyin} className="block text-sm" />
                {answered && <span className="mt-0.5 block text-xs text-slate-500">{o.a_th}</span>}
              </span>
              {answered && isAns && <Icon name="check" className="h-5 w-5 shrink-0 text-correct" strokeWidth={2.4} />}
              {answered && isPicked && !isAns && <Icon name="x" className="h-5 w-5 shrink-0 text-coral" strokeWidth={2.4} />}
            </button>
          );
        })}
      </div>

      {/* เฉลย: เลือกอะไร · ที่ถูกคืออะไร · ทำไม (คำแสดงคำถาม + คำตอบที่เลือกไปใช้ตอบคำถามไหน) */}
      {answered && (
        <FeedbackCard
          correct={isRight}
          yourAnswer={pickedPair && !isRight ? { main: zh(pickedPair.a), sub: pickedPair.a_th, chinese: true } : undefined}
          rightAnswer={{ main: zh(it.pair.a), sub: it.pair.a_th, chinese: true }}
          hint={
            isRight || !pickedPair
              ? (tip ?? `“${it.pair.q_th}” → “${it.pair.a_th}”`)
              : `${tip ? `${tip} · ` : ""}ส่วน ${zh(pickedPair.a)} ใช้ตอบคำถาม ${zh(pickedPair.q)} (${pickedPair.q_th})`
          }
        />
      )}

      {answered && (
        <button
          ref={nextRef}
          onClick={next}
          className="rounded-xl bg-ocean-900 px-4 py-3 font-semibold text-white shadow transition hover:bg-ocean-800 active:scale-[0.98]"
        >
          {qi + 1 >= items.length ? "ดูผล →" : "ข้อถัดไป →"}
        </button>
      )}
    </>
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
      <h1 className="font-[family-name:var(--font-display)] text-xl font-bold text-ocean-900">{pass ? "เยี่ยมมาก!" : "สู้ ๆ อ่านอีกนิด!"}</h1>
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
