"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  loadRounds,
  summarize,
  clearRounds,
  bySkill,
  weakestSkill,
  isScored,
  isDemo,
  practiceHref,
  MODE_ICON,
  SKILL_LABEL,
  type Round,
  type QuizMode,
} from "@/lib/progress";
import {
  outboxStats,
  GENERATOR_LABEL_TH,
  type Generator,
  type OutboxBucket,
  type OutboxStats,
} from "@/lib/attempts-outbox";
import type { AnySkillCode } from "@/data/thaiL1";
import { DRAFT_NOTE_TH, kcTip } from "@/data/kc-tips";
import { loadCards } from "@/lib/fsrs";
import { Icon } from "@/components/Icon";
import { ProgressBar } from "@/components/ProgressBar";
import { MascotSays } from "@/components/Mascot";

// ป้ายของแต่ละโหมดในรายการ "การฝึกล่าสุด" (ไอคอน = MODE_ICON ชุดเดียวกับเมนูฝึก/หน้าแรก)
const roundLabel = (m: QuizMode) => (m === "read" ? "ฝึกการอ่าน" : m === "listen" ? "ฝึกการฟัง" : SKILL_LABEL[m]);

// คลัง Thai-L1 (~140 KB) โหลดแบบ lazy เฉพาะตอนต้องแปลรหัสทักษะเป็นป้ายภาษาไทย — ไม่ถ่วงหน้านี้ตอนเปิด
type ThaiL1Module = typeof import("@/data/thaiL1");

export default function Progress() {
  const [total, setTotal] = useState<number | null>(null);
  const [learned, setLearned] = useState(0);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [box, setBox] = useState<OutboxStats | null>(null); // null = ยังไม่ได้อ่าน (อ่านหลัง mount กัน hydration mismatch)
  const [l1, setL1] = useState<ThaiL1Module | null>(null);

  useEffect(() => {
    setRounds(loadRounds());
    queueMicrotask(() => setBox(outboxStats()));
    import("@/data/thaiL1").then((m) => setL1(m));
    const started = new Set(Object.keys(loadCards()).map(Number));
    (async () => {
      const { data } = await supabase.from("words").select("id").eq("hsk_level", 1);
      if (data) {
        setTotal(data.length);
        setLearned(data.filter((w) => started.has(w.id)).length);
      }
    })();
  }, []);

  const s = summarize(rounds);
  const recent = [...rounds].reverse().slice(0, 8);
  const skills = bySkill(rounds);
  const weak = weakestSkill(rounds);
  const byCount = (a: [string, OutboxBucket], b: [string, OutboxBucket]) => b[1].n - a[1].n;
  const genRows: StatRow[] = box
    ? Object.entries(box.byGenerator)
        .sort(byCount)
        .map(([g, b]) => ({ key: g, label: GENERATOR_LABEL_TH[g as Generator] ?? g, b }))
    : [];
  // ชื่อทักษะ = ป้ายสั้นภาษาไทย (ตาราง skills) · จุดผิดคนไทยแตะดูคำอธิบายสำหรับผู้เรียน (kc-tips · ฉบับร่าง) ได้
  // ไม่โชว์ error_th ของคลังแล้ว — เขียนให้นักวิจัยอ่าน (IPA [ʂ] · เลขวรรณยุกต์ 35/214)
  const skillRows: StatRow[] =
    l1 && box
      ? Object.entries(box.bySkill)
          .sort(byCount)
          .map(([code, b]) => {
            const tip = kcTip(code);
            return {
              key: code,
              label: l1.SKILL_LABEL_TH[code as AnySkillCode] ?? code,
              detail: tip ? `${tip} (${DRAFT_NOTE_TH})` : undefined,
              b,
            };
          })
      : [];

  return (
    <div className="flex flex-col gap-5 p-5">
      <header>
        <h1 className="font-[family-name:var(--font-display)] text-xl font-bold text-ocean-900">ผลการเดินทาง</h1>
        <p className="mt-0.5 text-sm text-slate-500">ความคืบหน้าและสถิติการฝึกของคุณ</p>
      </header>

      {/* สรุปการฝึก */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-ocean-900 via-ocean-800 to-ocean-600 p-6 text-white shadow-lg shadow-ocean-900/20">
        <span aria-hidden="true" className="absolute left-8 top-5 h-1 w-1 rounded-full bg-white/50" />
        <span aria-hidden="true" className="absolute right-12 top-8 h-1.5 w-1.5 rounded-full bg-white/40" />
        <span aria-hidden="true" className="absolute right-7 top-4 h-1 w-1 rounded-full bg-white/30" />
        <div className="relative">
          <div className="text-sm text-ocean-100">ความแม่นยำรวม</div>
          <div className="mt-1 font-[family-name:var(--font-display)] text-5xl font-bold">
            {s.totalQuestions ? Math.round(s.accuracy * 100) : "—"}
            {s.totalQuestions ? <span className="text-2xl font-normal text-ocean-100">%</span> : null}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
            <MiniStat label="รอบที่ฝึก" value={`${s.totalRounds}`} />
            <MiniStat label="ตอบถูก" value={`${s.totalCorrect}/${s.totalQuestions}`} />
            <MiniStat label="ฝึกต่อเนื่อง" value={`${s.streakDays} วัน`} />
          </div>
        </div>
      </section>

      {/* จุดที่ควรฝึกเพิ่ม — คิดจากรอบฝึกจริงเท่านั้น ทักษะที่ยังไม่เคยฝึกจะไม่เดาเป็น 0% */}
      <section>
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-500">
          <Icon name="compass" className="h-4 w-4" />
          จุดที่ควรฝึกเพิ่ม
        </h2>
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-4">
          {skills.map((sk) => (
            <div key={sk.mode}>
              <div className="mb-1 flex items-baseline justify-between text-xs">
                <span className="text-slate-600">
                  {sk.label}
                  {isDemo(sk.mode) && (
                    <span className="ml-1.5 rounded bg-amber-50 px-1 py-px text-[10px] font-semibold text-amber-800">เดโม · ไม่นับ</span>
                  )}
                </span>
                <span className="tabular-nums text-slate-400">
                  {sk.pct === null ? "ยังไม่เคยฝึก" : `${sk.pct}% · ${sk.correct}/${sk.total} ข้อ`}
                </span>
              </div>
              <ProgressBar
                value={sk.pct ?? 0}
                tone={sk.pct !== null && weak?.mode === sk.mode ? "star" : "ocean"}
                label={`ความแม่นยำ ${sk.label}`}
              />
            </div>
          ))}

          <div className="mt-1 border-t border-slate-100 pt-3">
            {weak ? (
              <>
                <MascotSays mascotClassName="h-10 w-10">
                  ลอง{weak.label}เพิ่มอีกนิด แล้วค่อยเดินทางต่อนะ ⭐
                </MascotSays>
                <Link
                  href={practiceHref(weak.mode)}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-ocean-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ocean-800 active:scale-[0.98]"
                >
                  {weak.label} <Icon name="arrowRight" className="h-4 w-4" />
                </Link>
              </>
            ) : (
              <p className="text-xs leading-relaxed text-slate-500">
                ฝึกให้ครบสัก 5 ข้อในแต่ละทักษะก่อน แล้วดาวจะบอกได้ว่าควรเน้นตรงไหน
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ความคืบหน้าของฉัน */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-500">คลังคำของฉัน</h2>
        <div className="rounded-2xl border border-slate-100 bg-white p-4">
          <div className="mb-1 flex justify-between text-xs text-slate-500">
            <span>คำที่เรียนแล้ว</span>
            <span className="tabular-nums">
              {learned}/{total ?? "…"}
            </span>
          </div>
          <ProgressBar value={learned} max={total ?? 300} label="คำที่เรียนแล้ว" />
          <p className="mt-2 text-[11px] text-slate-400">นับจากคำที่เริ่มเรียนแล้ว — เปิดบัตรคำ/ทวนแล้วตัวเลขนี้จะขยับ</p>
        </div>
      </section>

      {/* ประวัติการฝึกล่าสุด */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-500">การฝึกล่าสุด</h2>
        {recent.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
            ยังไม่มีการฝึก —{" "}
            <Link href="/practice" className="text-ocean-500 underline">
              เริ่มฝึกเลย
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {recent.map((r, i) => {
              const pct = Math.round((r.correct / r.total) * 100);
              const scored = isScored(r.mode); // พูดตาม = ไม่นับคะแนน → สีกลาง ไม่โชว์เศษส่วน/%
              const demo = isDemo(r.mode); // เนื้อหาเดโม/ร่าง = ไม่นับ → สีกลาง โชว์ "เดโม" แทน %
              return (
                <div
                  key={rounds.length - i}
                  className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3"
                >
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-ocean-50 text-ocean-700">
                    <Icon name={MODE_ICON[r.mode] ?? "puzzle"} className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm text-slate-600">{roundLabel(r.mode)}</div>
                    <div className="text-[11px] text-slate-400">{fmt(r.ts)}</div>
                  </div>
                  <div
                    className={`text-sm font-semibold ${!scored || demo ? "text-slate-500" : pct >= 60 ? "text-correct" : "text-coral"}`}
                  >
                    {scored ? `${r.correct}/${r.total}` : `ฝึกพูด ${r.total} คำ`}
                    <span className="ml-1 text-xs font-normal text-slate-400">
                      {!scored ? "ไม่นับคะแนน" : demo ? "เดโม" : `${pct}%`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {rounds.length > 0 && (
        <button
          onClick={() => {
            if (confirm("ล้างประวัติการฝึกทั้งหมด?")) {
              clearRounds();
              setRounds([]);
            }
          }}
          className="mx-auto text-xs text-slate-400 hover:text-coral"
        >
          ล้างประวัติการฝึก
        </button>
      )}

      {/* คำตอบรายข้อที่จดไว้ในเครื่อง (outbox) — 1 คำตอบ = 1 แถว รอส่งขึ้นตาราง attempts เมื่อมีล็อกอิน */}
      <section>
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-500">
          <Icon name="chart" className="h-4 w-4" />
          คำตอบที่จดไว้ในเครื่องนี้
        </h2>
        <div className="rounded-2xl border border-slate-100 bg-white p-4">
          {!box ? (
            <div className="h-10 animate-pulse rounded-xl bg-slate-50" />
          ) : box.total === 0 ? (
            <p className="text-xs leading-relaxed text-slate-500">
              ยังไม่มีคำตอบที่จดไว้ — ฝึกสักรอบ แล้วจะเห็นว่าตอบกิจกรรมไหนไปกี่ข้อ ถูกกี่ %
            </p>
          ) : (
            <>
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-slate-500">จดไว้ทั้งหมด</span>
                <span className="font-[family-name:var(--font-display)] text-2xl font-bold tabular-nums text-ocean-900">
                  {box.total}
                  <span className="ml-1 text-xs font-normal text-slate-400">คำตอบ</span>
                </span>
              </div>
              <StatTable head="กิจกรรม" rows={genRows} />
              {skillRows.length > 0 && <StatTable head="ทักษะ / จุดที่คนไทยมักพลาด" rows={skillRows} />}
              <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
                ถูก % คิดเฉพาะข้อที่ตรวจถูก/ผิด · ขีด — = ไม่ได้ตรวจถูก/ผิด (เช่น พูดตาม)
              </p>
            </>
          )}
          {box && box.dropped > 0 && (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
              พื้นที่เก็บในเครื่องเต็ม — คำตอบเก่าสุด {box.dropped} ข้อถูกลบไปก่อนได้ส่งขึ้นระบบ
            </p>
          )}
          <p className="mt-3 border-t border-slate-100 pt-2 text-[11px] leading-relaxed text-slate-400">
            ตอนนี้เก็บไว้ในเครื่องนี้ก่อน · เมื่อมีระบบล็อกอิน คำตอบเหล่านี้จะส่งขึ้นฐานข้อมูลให้เอง (ยกเว้นข้อจากเนื้อหาสมมุติและฉบับร่าง)
          </p>
        </div>
      </section>

      <p className="pb-2 text-center text-[11px] leading-relaxed text-slate-300">
        * ตอนนี้เก็บผลไว้ในเครื่องนี้ก่อน · เมื่อมีระบบล็อกอิน ผลการเรียนจะติดตามบัญชีไปทุกเครื่อง
      </p>
    </div>
  );
}

type StatRow = { key: string; label: string; detail?: string; b: OutboxBucket };

// ตารางเล็ก: ชื่อ · จำนวนครั้ง · % ถูก (เฉพาะแถวที่มีข้อตรวจถูก/ผิด)
function StatTable({ head, rows }: { head: string; rows: StatRow[] }) {
  return (
    <table className="mt-3 w-full text-xs">
      <thead>
        <tr className="text-[10px] text-slate-400">
          <th scope="col" className="py-1 text-left font-medium">
            {head}
          </th>
          <th scope="col" className="w-12 py-1 text-right font-medium">
            ครั้ง
          </th>
          <th scope="col" className="w-12 py-1 text-right font-medium">
            ถูก
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-t border-slate-50 align-top">
            <td className="py-1.5 pr-2 text-slate-600">
              {r.detail ? (
                <details>
                  <summary className="cursor-pointer">{r.label}</summary>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{r.detail}</p>
                </details>
              ) : (
                r.label
              )}
            </td>
            <td className="py-1.5 text-right tabular-nums text-slate-500">{r.b.n}</td>
            <td className="py-1.5 text-right tabular-nums text-slate-600">
              {r.b.graded ? `${Math.round((r.b.correct / r.b.graded) * 100)}%` : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/10 py-2">
      <div className="font-semibold">{value}</div>
      <div className="text-[11px] text-ocean-100">{label}</div>
    </div>
  );
}

function fmt(ts: number): string {
  const d = new Date(ts);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(d.getDate())}/${two(d.getMonth() + 1)} ${two(d.getHours())}:${two(d.getMinutes())}`;
}
