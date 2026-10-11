"use client";

// 🏠 วันนี้ — หน้าแรก ตอบคำถามเดียว: "วันนี้ฉันควรเรียนอะไร?"
// โครง: ① ทักทาย ② ระดับที่กำลังเดินทาง ③ ดาวนำทางวันนี้ (ปุ่มเดียว — กฎ MO-01)
//        ④ ทวน / จุดที่ควรฝึกเพิ่ม ⑤ หมวดทั้งหมด ⑥ ฝึกและวัดผล
// ภาษาบนจอ = ภาษาคนเท่านั้น (กฎ PA-13) · อีโมจิใช้ได้เฉพาะในคำพูดของ 小星 นอกนั้นใช้ Icon เส้น

import { useEffect, useState } from "react";
import Link from "next/link";
import { useJourney } from "@/lib/journey";
import { Icon, type IconName } from "@/components/Icon";
import { Mascot } from "@/components/Mascot";
import { LevelCard } from "@/components/LevelCard";
import { ProgressBar } from "@/components/ProgressBar";
import { Pinyin } from "@/components/Pinyin";
import { getLevel } from "@/data/levels";
import { QUIZ_TOTAL } from "@/lib/quiz";
import { loadPretest } from "@/data/mockData";
import { WORDS_PER_DAY, learnedTodayCount } from "@/lib/daily";
import { MODE_ICON, practiceHref } from "@/lib/progress";

export default function Home() {
  const j = useJourney();
  const [pretestDone, setPretestDone] = useState<boolean | null>(null);
  const [todayCount, setTodayCount] = useState(0);

  // ยังไม่เคยทำแบบทดสอบก่อนเรียน = ยังไม่มีคะแนนฐาน → ต้องชวนทำก่อนอย่างอื่น (มติ PL-08)
  useEffect(() => {
    queueMicrotask(() => {
      setPretestDone(loadPretest() !== null);
      setTodayCount(learnedTodayCount());
    });
  }, []);

  // ดาวนำทางวันนี้ — เลือกจากสถานะจริงของผู้เรียน ไม่ใช่สุ่มหรือค่าตายตัว
  const star = pickToday(j);

  return (
    <div className="flex flex-col gap-5 p-5">
      {/* ① ทักทาย */}
      <section className="flex items-center gap-3">
        <Mascot className="h-12 w-12 shrink-0" />
        <div className="min-w-0">
          <div className="font-[family-name:var(--font-sc)] text-2xl leading-tight text-ocean-900">你好！</div>
          <p className="text-sm text-slate-500">
            {j.streakDays > 1 ? `เดินทางต่อเนื่องมา ${j.streakDays} วันแล้ว เก่งมาก` : "วันนี้เราเดินทางต่อกันนะ"}
          </p>
        </div>
      </section>

      {/* ⓪ ก่อนออกเดินทาง — ยังไม่มีคะแนนฐาน ต้องทำแบบทดสอบก่อนเรียนก่อน */}
      {pretestDone === false && (
        <Link
          href="/pretest"
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-ocean-900 via-ocean-800 to-ocean-600 p-5 text-white shadow-lg shadow-ocean-900/20 transition active:scale-[0.99]"
        >
          <span aria-hidden="true" className="absolute left-6 top-4 h-1 w-1 rounded-full bg-white/50" />
          <span aria-hidden="true" className="absolute right-14 top-7 h-1.5 w-1.5 rounded-full bg-white/40" />
          <div className="relative flex items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/15">
              <Icon name="target" className="h-5 w-5 text-star" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">ก่อนออกเดินทาง</div>
              <div className="text-xs leading-snug text-ocean-100">
                มาดูกันว่าตอนนี้คุณมีพื้นฐานภาษาจีนแค่ไหน — ใช้เวลาราว 3 นาที
              </div>
            </div>
            <Icon name="arrowRight" className="h-5 w-5 shrink-0 text-star" />
          </div>
        </Link>
      )}

      {/* ② ระดับที่กำลังเดินทาง */}
      <LevelCard
        level={getLevel("hsk1")}
        active
        pct={j.levelPct}
        caption={j.totalWords ? `เริ่มเรียนไปแล้ว ${j.learnedWords} จาก ${j.totalWords} คำ` : "กำลังโหลดคลังคำ..."}
      />

      {/* ②.5 เป้าวันนี้ — คำใหม่วันละ 10 คำเท่ากันทุกคน (กฎ ON-06) */}
      <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-slate-600">คำใหม่วันนี้</h2>
          <span className="text-xs tabular-nums text-slate-400">
            {Math.min(todayCount, WORDS_PER_DAY)}/{WORDS_PER_DAY} คำ
          </span>
        </div>
        <ProgressBar
          className="mt-2"
          value={Math.min(todayCount, WORDS_PER_DAY)}
          max={WORDS_PER_DAY}
          tone={todayCount >= WORDS_PER_DAY ? "correct" : undefined}
          label="ความคืบหน้าเป้าคำใหม่วันนี้"
        />
        {todayCount >= WORDS_PER_DAY && (
          <p className="mt-1.5 text-xs font-medium text-correct">ครบเป้าวันนี้แล้ว เก่งมาก — ทวนของเดิมหรือฝึกต่อได้เลย</p>
        )}
      </section>

      {/* ③ ดาวนำทางวันนี้ — ทางไปต่อทางเดียว ไม่ต้องเลือกเยอะ */}
      <section className="rounded-3xl border border-star/40 bg-star-soft p-5">
        <div className="flex items-center gap-1.5 text-xs font-bold text-star-ink">
          <Icon name="star" className="h-4 w-4" fill="currentColor" strokeWidth={0} />
          วันนี้ดาวนำทางคุณไปที่
        </div>
        {star ? (
          <>
            <div className="mt-2.5 flex items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-ocean-700 shadow-sm">
                <Icon name={star.icon} className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-ocean-900">{star.title}</div>
                <div className="text-xs leading-snug text-star-ink/80">{star.why}</div>
              </div>
            </div>
            <Link
              href={star.href}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-ocean-900 px-5 py-3.5 font-semibold text-white shadow transition hover:bg-ocean-800 active:scale-[0.98]"
            >
              ออกเดินทาง <Icon name="arrowRight" className="h-4 w-4" />
            </Link>
          </>
        ) : (
          <div className="mt-3 h-[104px] animate-pulse rounded-2xl bg-white/60" />
        )}
      </section>

      {/* ④ ทวน + จุดที่ควรฝึกเพิ่ม */}
      <section className="grid grid-cols-2 gap-3">
        <QuickCard
          href="/review"
          icon="refresh"
          value={j.due === null ? "…" : String(j.due)}
          unit="คำ"
          label="ดาวที่กำลังจาง"
          hint={j.due === 0 ? "วันนี้ทวนครบแล้ว" : "รอทวนวันนี้"}
          tone="ocean"
        />
        <QuickCard
          href="/progress"
          icon="target"
          value={j.weakest?.pct != null ? `${j.weakest.pct}%` : "—"}
          unit=""
          label={j.weakest ? `จุดอ่อน: ${j.weakest.label}` : "จุดที่ควรฝึกเพิ่ม"}
          hint={j.weakest ? "แตะดูผลรายทักษะ" : "ฝึกสัก 1 รอบแล้วจะรู้"}
          tone="coral"
        />
      </section>

      {/* ④.5 คำที่กำลังจะลืม — โชว์ตัวคำจริง ๆ ให้เห็น ไม่ใช่แค่ตัวเลข */}
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-500">
            <Icon name="star" className="h-3.5 w-3.5 text-star-dark" fill="currentColor" strokeWidth={0} />
            คำที่กำลังจะลืม
          </h2>
          <Link href="/review" className="inline-flex items-center gap-0.5 text-xs font-medium text-ocean-600 hover:text-ocean-800">
            ทบทวนทั้งหมด <Icon name="arrowRight" className="h-3 w-3" />
          </Link>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          {j.dueWords.length > 0 ? (
            <>
              <p className="text-xs leading-relaxed text-slate-500">
                วันนี้มี {j.due} คำที่เริ่มจำได้ไม่แม่น ทบทวนก่อนเดินทางต่อจะจำได้นานที่สุด
              </p>
              <div className="mt-3 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {j.dueWords.map((w) => (
                  <div key={w.hanzi} className="shrink-0 rounded-xl border border-slate-100 bg-ocean-50/50 px-3 py-2 text-center">
                    <div className="font-[family-name:var(--font-sc)] text-xl font-semibold text-slate-900">{w.hanzi}</div>
                    <Pinyin text={w.pinyin} className="block text-[11px] font-medium" />
                    <div className="text-[10px] text-slate-500">{w.meaning_th}</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-xs leading-relaxed text-slate-500">
              ยังไม่มีคำถึงกำหนดทวนตอนนี้ — เรียนคำใหม่ไปก่อน เดี๋ยวระบบนัดทวนให้เองตามจังหวะที่จำได้ดีที่สุด
            </p>
          )}
        </div>
      </section>

      {/* ⑤ หมวดทั้งหมดของ HSK 1 */}
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-slate-500">หมวดทั้งหมดของ HSK 1</h2>
          <Link href="/journey" className="inline-flex items-center gap-0.5 text-xs font-medium text-ocean-600 hover:text-ocean-800">
            ดูเส้นทางทั้งหมด <Icon name="arrowRight" className="h-3 w-3" />
          </Link>
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          {j.islands.map((island, i) => (
            <Link
              key={island.cat.id}
              href={`/learn/category?cat=${island.cat.id}`}
              className={`flex items-center gap-3 px-4 py-3 transition hover:bg-ocean-50/60 ${i > 0 ? "border-t border-slate-50" : ""}`}
            >
              <div
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
                  island.passed
                    ? "bg-emerald-50 text-correct"
                    : island.status === "current"
                      ? "bg-star-soft text-star-ink"
                      : "bg-ocean-50 text-ocean-700"
                }`}
              >
                <Icon name={island.passed ? "check" : island.cat.icon} className="h-5 w-5" strokeWidth={island.passed ? 2.4 : 1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="truncate font-medium text-slate-700">{island.cat.name}</span>
                  {island.status === "current" && (
                    <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-star px-1 py-0.5 text-[9px] font-bold text-ocean-900">
                      <Icon name="star" className="h-2.5 w-2.5" fill="currentColor" strokeWidth={0} />
                      อยู่ตรงนี้
                    </span>
                  )}
                  {island.passed && (
                    <span className="shrink-0 rounded bg-emerald-50 px-1 py-0.5 text-[9px] font-bold text-correct">
                      ผ่าน {island.quizBest}/{QUIZ_TOTAL}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <ProgressBar
                    value={island.learned}
                    max={island.total || 1}
                    size="sm"
                    tone={island.passed ? "correct" : "ocean"}
                    label={`ความคืบหน้า ${island.cat.name}`}
                  />
                  <span className="shrink-0 text-[10px] tabular-nums text-slate-400">
                    {island.learned}/{island.total}
                  </span>
                </div>
              </div>
              <Icon name="arrowRight" className="h-4 w-4 shrink-0 text-slate-300" />
            </Link>
          ))}
        </div>
      </section>

      {/* ⑥ ฝึกและวัดผล */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-500">ฝึกและวัดผล</h2>
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/practice"
            className="flex flex-col items-center gap-1.5 rounded-2xl border border-slate-100 bg-white p-4 text-center shadow-sm transition hover:border-ocean-300"
          >
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-ocean-50 text-ocean-700">
              <Icon name="pencil" className="h-5 w-5" />
            </div>
            <div className="text-sm font-medium text-slate-700">ฝึกทำข้อสอบ</div>
            <div className="text-[11px] leading-snug text-slate-400">ฟัง · อ่าน · เขียน · พูด ตรวจทันที</div>
          </Link>
          <Link
            href="/mock-test"
            className="flex flex-col items-center gap-1.5 rounded-2xl border border-slate-100 bg-white p-4 text-center shadow-sm transition hover:border-ocean-300"
          >
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-star-soft text-star-ink">
              <Icon name="flask" className="h-5 w-5" />
            </div>
            <div className="text-sm font-medium text-slate-700">ข้อสอบเสมือนจริง</div>
            <div className="text-[11px] leading-snug text-slate-400">20 ข้อ 25 นาที · ครอบทั้ง 5 หมวด</div>
          </Link>
        </div>
      </section>

      <p className="pb-2 text-center text-[11px] text-slate-400">เวอร์ชันพัฒนา · ฟีเจอร์ใหม่จะทยอยเปิดเพิ่ม</p>
    </div>
  );
}

// ---------- "ดาวนำทางวันนี้" ----------
// ลำดับความสำคัญ: ยังไม่เริ่ม → เริ่มเลย · มีของค้างทวน → ทวนก่อน (จำแม่นสุด)
//   หมวดปัจจุบันยังเรียนไม่ครบ → เรียนคำใหม่ · เรียนครบแล้ว → สอบท้ายหมวด · ผ่านหมดแล้ว → ฝึกจุดที่ยังอ่อน
type Star = { href: string; title: string; why: string; icon: IconName };

function pickToday(j: ReturnType<typeof useJourney>): Star | null {
  if (j.loading || j.due === null) return null;

  const cur = j.current;
  if (j.learnedWords === 0 && cur) {
    return {
      href: `/flashcards?cat=${cur.cat.id}`,
      title: `เริ่มที่หมวด ${cur.cat.id} · ${cur.cat.name}`,
      why: "หมวดแรกง่ายสุด — เริ่มจากคำทักทายที่ได้ใช้จริง",
      icon: "cards",
    };
  }
  if (j.due > 0) {
    return {
      href: "/review",
      title: `ทวน ${j.due} คำที่กำลังจะลืม`,
      why: "ทวนก่อนแล้วค่อยเรียนคำใหม่ จำแม่นที่สุด",
      icon: "refresh",
    };
  }
  if (cur && cur.learned < cur.total) {
    return {
      href: `/flashcards?cat=${cur.cat.id}`,
      title: `เรียนคำใหม่ที่หมวด ${cur.cat.id} · ${cur.cat.name}`,
      why: `ไม่มีคำค้างทวนแล้ว — หมวดนี้เหลืออีก ${cur.total - cur.learned} คำ`,
      icon: "cards",
    };
  }
  if (cur) {
    return {
      href: `/quiz?cat=${cur.cat.id}`,
      title: `สอบท้ายหมวด ${cur.cat.id} · ${cur.cat.name}`,
      why: "เรียนครบทั้งหมวดแล้ว — วัดสักตั้งว่าแน่นจริงไหม",
      icon: "target",
    };
  }
  if (j.weakest) {
    return {
      href: practiceHref(j.weakest.mode), // แผนที่โหมด → หน้า ชุดเดียวกับหน้าผล (lib/progress)
      title: j.weakest.label,
      why: `ผ่านครบทุกหมวดแล้ว — ${j.weakest.label}ยังแม่น ${j.weakest.pct}% ฝึกเพิ่มอีกนิด`,
      icon: MODE_ICON[j.weakest.mode] ?? "pencil",
    };
  }
  return { href: "/practice", title: "ฝึกทำข้อสอบ", why: "ผ่านครบทุกหมวดแล้ว — ฝึกให้คล่องมือ", icon: "pencil" };
}

// ---------- การ์ดตัวเลขสั้น ๆ ----------
function QuickCard({
  href,
  icon,
  value,
  unit,
  label,
  hint,
  tone,
}: {
  href: string;
  icon: IconName;
  value: string;
  unit: string;
  label: string;
  hint: string;
  tone: "ocean" | "coral";
}) {
  const toneCls = tone === "ocean" ? "bg-ocean-50 text-ocean-700" : "bg-coral-soft text-coral";
  return (
    <Link
      href={href}
      className="flex flex-col gap-1 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition hover:border-ocean-300 active:scale-[0.99]"
    >
      <span className={`grid h-9 w-9 place-items-center rounded-xl ${toneCls}`}>
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <span className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold leading-none text-ocean-900">
        {value}
        {unit && <span className="ml-0.5 text-sm font-normal text-slate-400">{unit}</span>}
      </span>
      <span className="truncate text-xs font-medium text-slate-600">{label}</span>
      <span className="text-[11px] leading-snug text-slate-400">{hint}</span>
    </Link>
  );
}
