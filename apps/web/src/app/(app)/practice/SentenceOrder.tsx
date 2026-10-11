"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { SENTENCES, SENTENCES_REVIEWED, draftSentenceRef, type SentenceItem } from "@/data/sentences";
// คำอธิบายสำหรับผู้เรียน (ไฟล์เล็ก) — ไม่ import คลัง Thai-L1 JSON (~140 KB) เข้า bundle แรกของ /practice
import { DRAFT_NOTE_TH, kcTip } from "@/data/kc-tips";
import { saveRound } from "@/lib/progress";
import { logAttempt } from "@/lib/attempts-outbox";
import { shuffle } from "@/lib/random";
import { Icon } from "@/components/Icon";
import { Pinyin } from "@/components/Pinyin";
import { Mascot } from "@/components/Mascot";
import { ProgressBar } from "@/components/ProgressBar";
import { DraftSentenceBadge } from "@/components/MockBadge";

const N_PER_ROUND = 5;

type Tile = { key: number; text: string };
type From = "pool" | "answer";

// สถานะการลาก (Pointer Events — ใช้ได้ทั้งนิ้วมือถือ + เมาส์ ต่างจาก HTML5 drag ที่ touch ใช้ไม่ได้)
type Drag = {
  tile: Tile;
  from: From;
  x: number;
  y: number;
  startX: number;
  startY: number;
  w: number;
  h: number;
  active: boolean; // ขยับเกิน threshold แล้ว = เป็นการลาก (ไม่ใช่แตะ)
};



function makeTiles(s: SentenceItem): Tile[] {
  const tiles = s.tokens.map((t, i) => ({ key: i, text: t }));
  let pool = shuffle(tiles);
  // กันสับแล้วได้ลำดับถูกพอดี (จะไม่ท้าทาย) — สับใหม่ถ้าเรียงตรงเป๊ะ
  if (pool.map((t) => t.text).join("") === s.tokens.join("") && s.tokens.length > 1) {
    pool = shuffle(tiles);
  }
  return pool;
}

export default function SentenceOrder({ onExit }: { onExit: () => void }) {
  const round = useMemo(() => shuffle(SENTENCES).slice(0, Math.min(N_PER_ROUND, SENTENCES.length)), []);
  const [qi, setQi] = useState(0);
  const [pool, setPool] = useState<Tile[]>(() => makeTiles(round[0]));
  const [answer, setAnswer] = useState<Tile[]>([]);
  const [checked, setChecked] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [done, setDone] = useState(false);
  const savedRef = useRef(false);
  const shownAtRef = useRef(0); // เวลาที่ข้อนี้โผล่ — ใช้คิด time_spent_ms ตอนกดตรวจ

  // ---- drag state ----
  const [drag, setDrag] = useState<Drag | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const dragEndAt = useRef(0); // กัน click ที่ยิงตามหลัง drag
  const answerRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    shownAtRef.current = performance.now();
  }, [qi]);

  // กด "ตรวจ" แล้วปุ่มนั้นหายไป → ย้ายโฟกัสไปปุ่ม "ข้อถัดไป" (คีย์บอร์ด/สวิตช์) ไม่เลื่อนจอ
  useEffect(() => {
    if (checked) nextRef.current?.focus({ preventScroll: true });
  }, [checked]);

  const s = round[qi];
  const isCorrect = checked && answer.map((t) => t.text).join("") === s.tokens.join("");
  const allPlaced = answer.length === s.tokens.length;
  const tip = kcTip(s.kc); // คำอธิบายจุดผิดคนไทยที่ประโยคนี้ผูกไว้ (ฉบับร่าง · ถ้ามี)

  function pick(tile: Tile) {
    if (checked) return;
    setPool((p) => p.filter((t) => t.key !== tile.key));
    setAnswer((a) => (a.some((t) => t.key === tile.key) ? a : [...a, tile]));
  }

  function unpick(tile: Tile) {
    if (checked) return;
    setAnswer((a) => a.filter((t) => t.key !== tile.key));
    setPool((p) => (p.some((t) => t.key === tile.key) ? p : [...p, tile]));
  }

  // วาง tile ลงแถวคำตอบที่ตำแหน่ง idx (จาก pool หรือย้ายภายใน answer)
  function placeAt(tile: Tile, from: From, idx: number) {
    if (checked) return;
    if (from === "pool") {
      setPool((p) => p.filter((t) => t.key !== tile.key));
      setAnswer((a) => {
        if (a.some((t) => t.key === tile.key)) return a;
        const arr = [...a];
        arr.splice(Math.min(idx, arr.length), 0, tile);
        return arr;
      });
    } else {
      setAnswer((a) => {
        const cur = a.findIndex((t) => t.key === tile.key);
        if (cur < 0) return a;
        const arr = a.filter((t) => t.key !== tile.key);
        const target = cur < idx ? idx - 1 : idx; // ชดเชยช่องที่หายไปเมื่อย้ายไปข้างหน้า
        arr.splice(Math.max(0, Math.min(target, arr.length)), 0, tile);
        return arr;
      });
    }
  }

  // หา "ตำแหน่งแทรก" ในแถวคำตอบจากพิกัดพอยน์เตอร์ (รองรับหลายบรรทัดเพราะ flex-wrap)
  function computeDropIndex(x: number, y: number): number | null {
    const el = answerRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const pad = 28; // hitbox ใจดีหน่อย ลากหลุดนิดหน่อยยังนับ
    if (x < r.left - pad || x > r.right + pad || y < r.top - pad || y > r.bottom + pad) return null;
    const tiles = Array.from(el.querySelectorAll<HTMLElement>("[data-akey]"));
    for (let i = 0; i < tiles.length; i++) {
      const tr = tiles[i].getBoundingClientRect();
      if (y < tr.top - 4) return i; // อยู่บรรทัดเหนือไทล์นี้
      if (y <= tr.bottom + 4 && x < tr.left + tr.width / 2) return i; // บรรทัดเดียวกัน ก่อนกึ่งกลาง
    }
    return tiles.length;
  }

  function setDragBoth(d: Drag | null) {
    dragRef.current = d;
    setDrag(d);
  }

  // handlers ใช้ร่วมกันทั้งไทล์ใน pool และใน answer
  function tileHandlers(tile: Tile, from: From) {
    return {
      onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
        if (checked) return;
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragBoth({
          tile,
          from,
          x: e.clientX,
          y: e.clientY,
          startX: e.clientX,
          startY: e.clientY,
          w: r.width,
          h: r.height,
          active: false,
        });
      },
      onPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => {
        const d = dragRef.current;
        if (!d || d.tile.key !== tile.key || d.from !== from) return;
        const active = d.active || Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 8;
        const nd = { ...d, x: e.clientX, y: e.clientY, active };
        setDragBoth(nd);
        setDropIdx(active ? computeDropIndex(e.clientX, e.clientY) : null);
      },
      onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
        const d = dragRef.current;
        if (!d) return;
        if (d.active) {
          dragEndAt.current = performance.now();
          const idx = computeDropIndex(e.clientX, e.clientY);
          if (idx !== null) placeAt(d.tile, d.from, idx);
          else if (d.from === "answer") unpick(d.tile); // ลากออกนอกแถวคำตอบ = เอาคืนคลัง
          // ลากจาก pool แล้วปล่อยนอกเป้า = เด้งกลับ (ไม่ทำอะไร)
        }
        setDragBoth(null);
        setDropIdx(null);
      },
      onPointerCancel: () => {
        setDragBoth(null);
        setDropIdx(null);
      },
      onClick: () => {
        // แตะ (ไม่ลาก) = พฤติกรรมเดิม · กัน click ที่ browser ยิงตามหลังการลาก
        if (performance.now() - dragEndAt.current < 350) return;
        if (from === "pool") pick(tile);
        else unpick(tile);
      },
    };
  }

  function check() {
    if (checked) return;
    const order = answer.map((t) => t.text);
    const ok = order.join("") === s.tokens.join("");
    setChecked(true);
    if (ok) setCorrectCount((c) => c + 1);
    // บันทึกคำตอบรายข้อลง outbox (นอกเหนือจาก saveRound ท้ายรอบ)
    logAttempt({
      generator: "order",
      event_type: "graded",
      sentence_id: s.id,
      mock_ref: draftSentenceRef(s.id), // ประโยคร่าง → sync ข้าม (ไม่เข้าข้อมูลเทรน BKT)
      skill_code: s.kc ?? "SKILL-ORDER",
      answer: { order },
      is_correct: ok,
      time_spent_ms: Math.round(performance.now() - shownAtRef.current),
      context: "practice",
    });
  }

  function next() {
    if (qi + 1 >= round.length) {
      setDone(true);
      if (!savedRef.current) {
        saveRound({ ts: Date.now(), mode: "order", total: round.length, correct: correctCount });
        savedRef.current = true;
      }
      return;
    }
    const ni = qi + 1;
    setQi(ni);
    setPool(makeTiles(round[ni]));
    setAnswer([]);
    setChecked(false);
  }

  // ---------- สรุปผล ----------
  if (done) {
    const pct = Math.round((correctCount / round.length) * 100);
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
        <h1 className="font-[family-name:var(--font-display)] text-xl font-bold text-ocean-900">{pass ? "เยี่ยมมาก!" : "ฝึกอีกนิด!"}</h1>
        <div className="w-full rounded-3xl bg-gradient-to-br from-ocean-900 via-ocean-800 to-ocean-600 p-6 text-center text-white shadow-lg shadow-ocean-900/20">
          <div className="font-[family-name:var(--font-display)] text-5xl font-extrabold">
            {correctCount}
            <span className="text-2xl font-normal text-ocean-100"> / {round.length}</span>
          </div>
          <div className="mt-1 text-ocean-100">เรียงถูก {pct}%</div>
        </div>
        <div className="flex w-full gap-3">
          <button
            onClick={onExit}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-ocean-700 px-4 py-3 font-semibold text-white shadow transition hover:bg-ocean-900 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-300 focus-visible:ring-offset-2"
          >
            <Icon name="arrowLeft" className="h-5 w-5" /> กลับเมนูฝึก
          </button>
        </div>
      </div>
    );
  }

  // ---------- ทำข้อ ----------
  return (
    <div className="flex flex-col gap-5 p-5">
      {!SENTENCES_REVIEWED && <DraftSentenceBadge />}
      {/* หัว + progress */}
      <div>
        <div className="flex items-center justify-between text-sm text-slate-500">
          <button onClick={onExit} className="inline-flex items-center gap-1 text-slate-400">
            <Icon name="arrowLeft" className="h-4 w-4" /> ออก
          </button>
          <span>
            ข้อ {qi + 1}/{round.length} · ถูก {correctCount}
          </span>
        </div>
        <ProgressBar className="mt-2" size="lg" value={qi} max={round.length} label="ความคืบหน้าในรอบเรียงประโยค" />
      </div>

      {/* โจทย์: ความหมายไทย */}
      <div className="rounded-2xl border border-slate-100 bg-white p-4 text-center shadow-sm">
        <div className="text-xs text-slate-400">เรียงคำให้เป็นประโยคที่แปลว่า</div>
        <div className="mt-1 text-lg font-semibold text-slate-700">“{s.meaning_th}”</div>
      </div>

      {/* แถวคำตอบ (แตะ/ลากออก · ลากมาวาง/สลับตำแหน่งได้) */}
      <div
        ref={answerRef}
        data-answer
        className={`flex min-h-[64px] flex-wrap items-center gap-2 rounded-2xl border-2 border-dashed p-3 transition-colors ${
          drag?.active && dropIdx !== null ? "border-ocean-500 bg-ocean-50" : "border-slate-300 bg-slate-50"
        }`}
      >
        {answer.length === 0 && !drag?.active && (
          <span className="text-sm text-slate-300">แตะหรือลากคำด้านล่างมาเรียงตรงนี้</span>
        )}
        {answer.map((tile, i) => {
          const beingDragged = drag?.active && drag.tile.key === tile.key && drag.from === "answer";
          const cls = checked
            ? isCorrect
              ? "border-emerald-400 bg-emerald-50 text-emerald-800"
              : "border-coral/40 bg-coral-soft text-ocean-900"
            : "border-ocean-100 bg-white text-slate-800";
          return (
            <Fragment key={tile.key}>
              {drag?.active && dropIdx === i && <span className="h-10 w-1 shrink-0 rounded-full bg-ocean-500" />}
              <button
                data-akey={tile.key}
                disabled={checked}
                draggable={false}
                {...tileHandlers(tile, "answer")}
                className={`touch-none select-none rounded-xl border px-3 py-2 text-xl font-[family-name:var(--font-sc)] shadow-sm transition active:scale-95 ${cls} ${
                  beingDragged ? "opacity-30" : ""
                }`}
              >
                {tile.text}
              </button>
            </Fragment>
          );
        })}
        {drag?.active && dropIdx === answer.length && <span className="h-10 w-1 shrink-0 rounded-full bg-ocean-500" />}
      </div>

      {/* คลังคำ (สับ) */}
      <div data-pool className="flex flex-wrap items-center justify-center gap-2 rounded-2xl bg-white p-3">
        {pool.map((tile) => {
          const beingDragged = drag?.active && drag.tile.key === tile.key && drag.from === "pool";
          return (
            <button
              key={tile.key}
              disabled={checked}
              draggable={false}
              {...tileHandlers(tile, "pool")}
              className={`touch-none select-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-xl font-[family-name:var(--font-sc)] text-slate-800 shadow-sm transition hover:border-ocean-300 active:scale-95 disabled:opacity-40 ${
                beingDragged ? "opacity-30" : ""
              }`}
            >
              {tile.text}
            </button>
          );
        })}
        {pool.length === 0 && !checked && <span className="py-2 text-sm text-slate-300">วางครบแล้ว กด “ตรวจ”</span>}
      </div>

      {/* ghost ลอยตามนิ้ว/เมาส์ตอนลาก */}
      {drag?.active && (
        <div
          className="pointer-events-none fixed z-50"
          style={{ left: drag.x - drag.w / 2, top: drag.y - drag.h / 2, width: drag.w }}
        >
          <div className="scale-105 rounded-xl border border-ocean-300 bg-white px-3 py-2 text-center text-xl font-[family-name:var(--font-sc)] text-slate-800 shadow-xl">
            {drag.tile.text}
          </div>
        </div>
      )}

      {/* เฉลยหลังตรวจ */}
      {checked && (
        <div className={`rounded-2xl p-4 ${isCorrect ? "bg-emerald-50" : "border border-coral/25 bg-coral-soft"}`}>
          <div className={`flex items-center gap-1.5 text-sm font-semibold ${isCorrect ? "text-correct" : "text-ocean-900"}`}>
            <Icon name={isCorrect ? "check" : "x"} className={`h-4 w-4 ${isCorrect ? "" : "text-coral"}`} strokeWidth={2.4} />
            {isCorrect ? "ถูกต้อง!" : "ลองอีกครั้งนะ — ที่ถูกคือ:"}
          </div>
          <div className="mt-2 text-2xl font-[family-name:var(--font-sc)] text-slate-800">{s.tokens.join(" ")}</div>
          <Pinyin text={s.pinyin} className="text-sm" />
          {isCorrect && (
            <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-white/70 p-2 text-xs text-slate-500">
              <Icon name="bulb" className="mt-0.5 h-4 w-4 shrink-0 text-xp" /> {s.focus_th}
            </div>
          )}
        </div>
      )}

      {/* เรียงผิด → อธิบายว่าจีนต่างจากไทยตรงไหน: focus ของประโยค + เคล็ดลับสำหรับผู้เรียน (kc-tips) ถ้าผูก kc
          ไม่โชว์ error_th / teaching_th ของคลังแล้ว — เขียนให้ครูอ่าน (สอนสูตร… / 数+量+名 / 状语) */}
      {checked && !isCorrect && (
        <div className="rounded-2xl border border-star/30 bg-star-soft p-4">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-star-ink">
            <Icon name="bulb" className="h-4 w-4 shrink-0 text-star-dark" /> ต่างจากไทยตรงไหน
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{s.focus_th}</p>
          {tip && (
            <div className="mt-3 border-t border-star/30 pt-3 text-xs leading-relaxed text-slate-600">
              <span className="font-semibold text-star-ink">เคล็ดลับ: </span>
              {tip}
              <span className="ml-1 text-[10px] text-slate-400">({DRAFT_NOTE_TH})</span>
            </div>
          )}
        </div>
      )}

      {/* ปุ่มตรวจ / ถัดไป */}
      {!checked ? (
        <button
          onClick={check}
          disabled={!allPlaced}
          className="rounded-xl bg-ocean-700 px-4 py-3 font-semibold text-white shadow transition hover:bg-ocean-900 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-300 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40"
        >
          ตรวจ
        </button>
      ) : (
        <button
          ref={nextRef}
          onClick={next}
          className="rounded-xl bg-ocean-700 px-4 py-3 font-semibold text-white shadow transition hover:bg-ocean-900 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-300 focus-visible:ring-offset-2"
        >
          {qi + 1 >= round.length ? "ดูผล →" : "ข้อถัดไป →"}
        </button>
      )}
    </div>
  );
}
