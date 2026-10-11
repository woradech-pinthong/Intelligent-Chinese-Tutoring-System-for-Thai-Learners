"use client";

// พินอินระบายสีตามวรรณยุกต์ — จุดสวยเฉพาะตัว + ช่วยแยกเสียง 2/3 (จุดพลาด Thai-L1)
//
// "หย่าพินอิน" (กฎ m1-6): ผู้เรียนสลับ "ซ่อนพินอิน" ได้ด้วย <PinyinToggle /> (จำค่าในเครื่อง — lib/pinyin-pref)
// มีผลเฉพาะจุดที่ส่ง hideable — จุดที่ไม่ส่งโชว์เสมอเหมือนเดิม และตั้งใจให้เป็นแบบนั้น:
//   · หน้าสอนพินอิน/วรรณยุกต์ (foundation) — พินอินคือตัวบทเรียน
//   · ควิซ / pre-test / mock — กระดาษ HSK 1–2 จริงมีพินอินกำกับ + pre/post ต้องเงื่อนไขเดียวกันทุกคน
//   · ฝั่งเฉลย/ด้านหลังบัตร — เฉลยต้องครบ
// ตอนซ่อน = เบลอ + เทา (ไม่โชว์สีวรรณยุกต์ กันเดาเสียงจากสี) + ป้าย "แตะเพื่อดูพินอิน" → แตะแล้วเปิดเฉพาะจุดนั้น
// เปลี่ยน text (ข้อถัดไป/บัตรถัดไป) = กลับไปซ่อนเองอัตโนมัติ
// ⚠️ hideable มีตัวควบคุม (role="button") ในตัว → ห้ามวางในปุ่มอื่น (nested-interactive · โปรแกรมอ่านจอกดแยกไม่ได้)
//    จุดที่อยู่ในปุ่ม (เช่น บัตรคำที่แตะเพื่อพลิก) ใช้ <PinyinMasked> แล้ววางปุ่ม "ดูพินอิน" แยกไว้นอกปุ่มแม่

import { useState, type SyntheticEvent } from "react";
import { splitSyllables, toneOf } from "@/lib/pinyin-tone";
import { usePinyinHidden } from "@/lib/pinyin-pref";

const TONE_CLASS = ["", "text-tone1", "text-tone2", "text-tone3", "text-tone4", "text-tone5"];

type PinyinProps = {
  text: string;
  className?: string;
  /** true = ให้ค่าตั้ง "ซ่อนพินอิน" มีผลกับจุดนี้ · ไม่ส่ง = โชว์เสมอ (พฤติกรรมเดิม) */
  hideable?: boolean;
};

export function Pinyin({ text, className, hideable = false }: PinyinProps) {
  return hideable ? <HideablePinyin text={text} className={className} /> : <ToneColored text={text} className={className} />;
}

function ToneColored({ text, className }: { text: string; className?: string }) {
  const syllables = splitSyllables(text);
  return (
    <span className={className}>
      {syllables.map((s, i) => (
        <span key={i} className={TONE_CLASS[toneOf(s)]}>
          {s}
          {i < syllables.length - 1 ? " " : ""}
        </span>
      ))}
    </span>
  );
}

/** พินอินแบบเบลอ (ซ่อนอยู่) — แสดงผลอย่างเดียว ไม่มีตัวควบคุมในตัว · ใช้ได้ในปุ่มอื่น (ปุ่ม "ดูพินอิน" ต้องวางแยกเอง) */
export function PinyinMasked({ text, className }: { text: string; className?: string }) {
  return (
    <span className={className}>
      <span aria-hidden="true" className="select-none text-slate-500 blur-[0.3em]">
        {text}
      </span>
    </span>
  );
}

function HideablePinyin({ text, className }: { text: string; className?: string }) {
  const [hidden] = usePinyinHidden();
  const [revealedFor, setRevealedFor] = useState<string | null>(null); // แตะเปิดดูแล้วสำหรับ text ไหน
  if (!hidden || revealedFor === text) return <ToneColored text={text} className={className} />;

  // กันคลิกทะลุไปถึงตัวแม่ที่อาจรับคลิกอยู่ (เช่นการ์ด) — แต่ห้ามวางในปุ่ม (ดูหมายเหตุบนสุด)
  const reveal = (e: SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setRevealedFor(text);
  };
  return (
    <span className={className}>
      <span
        role="button"
        tabIndex={0}
        aria-label="แตะเพื่อดูพินอิน"
        onClick={reveal}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") reveal(e);
        }}
        className="relative inline-block cursor-pointer rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-300"
      >
        <span aria-hidden="true" className="select-none text-slate-500 blur-[0.3em]">
          {text}
        </span>
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="whitespace-nowrap rounded-full bg-white/60 px-2 py-1 text-[11px] font-semibold leading-none text-ocean-700 ring-1 ring-ocean-200">
            แตะเพื่อดูพินอิน
          </span>
        </span>
      </span>
    </span>
  );
}

/** สวิตช์ "ซ่อนพินอิน" — วางไว้หัวหน้ากิจกรรมอ่าน · ค่าเดียวกันทั้งแอป (จำในเครื่อง) */
export function PinyinToggle({ className = "" }: { className?: string }) {
  const [hidden, setHidden] = usePinyinHidden();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={hidden}
      onClick={() => setHidden(!hidden)}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-300 ${
        hidden ? "bg-ocean-700 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
      } ${className}`}
    >
      <span aria-hidden="true" className={`relative h-3.5 w-6 shrink-0 rounded-full transition-colors ${hidden ? "bg-white/30" : "bg-slate-300"}`}>
        <span className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white shadow-sm transition-all ${hidden ? "left-3" : "left-0.5"}`} />
      </span>
      ซ่อนพินอิน
    </button>
  );
}
