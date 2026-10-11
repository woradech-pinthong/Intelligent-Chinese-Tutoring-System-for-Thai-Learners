"use client";

// เมนูในหมวด — ชั้น "เลือกทักษะ" ตามกฎ PA-10: เลือกหมวด → เลือกกิจกรรม → ค่อยเข้าฝึก
// ลำดับแนะนำ: บัตรคำ → ฟัง → อ่าน → เขียน ("หูมาก่อนตา") แต่กดข้ามได้ทุกปุ่ม ไม่ล็อก

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Icon, type IconName } from "@/components/Icon";
import { CATEGORIES } from "@/data/categories";
import { loadCards } from "@/lib/fsrs";
import { bestScore, catSkillScores, quizUnlocked, QUIZ_PASS } from "@/lib/quiz";
import { Center } from "@/components/Feedback";
import { ProgressBar } from "@/components/ProgressBar";
import { SkillBars } from "@/components/SkillPanel";
import { overall } from "@/data/mockData";

function CategoryMenuInner({ cat }: { cat: number | null }) {
  const [ids, setIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [started, setStarted] = useState<Set<number>>(new Set());
  const [quizBest, setQuizBest] = useState<number | null>(null);
  const [quizLocked, setQuizLocked] = useState(false);

  useEffect(() => {
    // อ่านของในเครื่องก่อน await จึงขึ้นจอทันที (อยู่ใน async function เพื่อไม่ setState ตรง ๆ ในตัว effect)
    (async () => {
      setStarted(new Set(Object.keys(loadCards()).map(Number)));
      if (!cat) { setLoading(false); return; }
      setQuizBest(bestScore(cat));
      setQuizLocked(!quizUnlocked(cat));
      const { data } = await supabase.from("words").select("id").eq("hsk_level", 1).eq("category", cat);
      setIds((data ?? []).map((r) => r.id));
      setLoading(false);
    })();
  }, [cat]);

  const meta = CATEGORIES.find((c) => c.id === cat);
  const learned = useMemo(() => ids.filter((id) => started.has(id)).length, [ids, started]);
  // คะแนนรายทักษะจริงจาก log ควิซท้ายหมวด (ยังไม่เคยสอบ = null → โชว์ข้อความชวน ไม่เดาตัวเลข)
  // ความแม่นเชิงโมเดลของจริงรอ BKT โมดูล 8 — ตอนนี้ใช้ % ตอบถูกสะสมไปก่อน
  const contentSkills = useMemo(
    () => (cat ? catSkillScores(cat, ids.length ? (learned / ids.length) * 100 : 0) : null),
    [cat, ids.length, learned]
  );

  if (loading) return <Center>กำลังโหลด...</Center>;
  if (!cat || !meta) return <Center>ไม่พบหมวดนี้ — <Link href="/" className="ml-1 text-ocean-500 underline">กลับไปเลือกหมวด</Link></Center>;

  return (
    <div className="flex flex-col gap-4 p-5">
      {/* หัวหมวด */}
      <div>
        <Link href="/" className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600">
          <Icon name="arrowLeft" className="h-3.5 w-3.5" /> ทุกหมวด
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-ocean-50 text-ocean-700">
            <Icon name={meta.icon} className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ocean-500">เรื่องที่เรียน</div>
            <h1 className="font-[family-name:var(--font-display)] text-lg font-bold text-ocean-900">
              หมวด {meta.id} · {meta.name}
            </h1>
            <p className="text-xs text-slate-500">{meta.desc}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <ProgressBar value={learned} max={ids.length || 1} tone="correct" label={`ความคืบหน้าหมวด ${meta.name}`} />
          <span className="shrink-0 text-xs tabular-nums text-slate-400">เรียนแล้ว {learned}/{ids.length} คำ</span>
        </div>
      </div>

      {/* คะแนนรายทักษะของหมวดนี้ — กรอบที่อาจารย์ย้ำ: หมวด = เรื่อง, ในหมวดต้องฝึกหลายทักษะ */}
      <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-slate-600">ทักษะในหมวดนี้</h2>
          {contentSkills && (
            <span className="text-xs text-slate-400">
              รวม <span className="font-bold tabular-nums text-ocean-900">{overall(contentSkills)}%</span>
            </span>
          )}
        </div>
        {contentSkills ? (
          <SkillBars scores={contentSkills} size="sm" />
        ) : (
          <p className="rounded-xl bg-ocean-50 p-3 text-xs leading-relaxed text-slate-500">
            ยังไม่มีคะแนนของหมวดนี้ — เรียนคำศัพท์แล้วลองฝึกฟัง/อ่าน/เรียงประโยคดู แล้วคะแนนรายทักษะจะขึ้นตรงนี้
          </p>
        )}
      </section>

      {/* หมวดยังไม่มีคำ → ไม่เปิดกิจกรรมให้เดินเข้าทางตัน */}
      {ids.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-400">
          หมวดนี้กำลังเติมคำศัพท์ — ลองหมวดอื่นก่อนนะ
        </div>
      )}

      {/* เมนูกิจกรรม — เรียงตามลำดับแนะนำ แต่กดอะไรก่อนก็ได้ */}
      {ids.length > 0 && (<>
      <ActivityCard
        href={`/flashcards?cat=${cat}`}
        icon="cards"
        title="เรียนคำศัพท์"
        desc="เปิดบัตรคำทีละใบ ฟังเสียง พลิกดูคำแปล"
        badge={learned === 0 ? "เริ่มที่นี่" : undefined}
        primary
      />
      {/* ฝึก 4 ทักษะ → เมนูเฉพาะทักษะ (/practice?group=) รวมทุกแบบฝึกของทักษะนั้น */}
      <ActivityCard
        href={`/practice?cat=${cat}&group=listen`}
        icon="headphone"
        title="ฝึกฟัง"
        desc="ฟังคำ · แยกเสียง · ฟังแล้วเลือกรูป · ฟังประโยค · ฟังบทสนทนา"
      />
      <ActivityCard
        href={`/practice?cat=${cat}&group=read`}
        icon="book"
        title="ฝึกอ่าน"
        desc="อ่านคำ · จริง/เท็จ · อ่านแล้วเลือกรูป · อ่านประโยค · จับคู่ถาม-ตอบ · เติมคำ"
      />
      <ActivityCard
        href={`/practice?cat=${cat}&group=write`}
        icon="pencil"
        title="ฝึกเขียน"
        desc="เรียงคำเป็นประโยค · เติมคำ (ประกอบภาษา — HSK 1 ไม่สอบเขียน)"
      />
      <ActivityCard
        href={`/practice?cat=${cat}&group=speak`}
        icon="mic"
        title="ฝึกพูด"
        desc="ฟังเสียงต้นแบบแล้วพูดตาม (ทดลอง · ไม่นับคะแนน)"
      />
      <ActivityCard
        href={`/match?cat=${cat}`}
        icon="sparkles"
        title="เกมจับคู่"
        desc="เปิดการ์ดจับคู่คำกับคำแปล/เสียง — ทวนคำที่เรียนแล้วแบบสนุก ๆ"
      />
      </>)}

      {/* ควิซท้ายหมวด (โมดูล 3) — เปิดเฉพาะหมวดที่มีคำแล้ว · QZ-12: ล็อกจนกว่าจะผ่านควิซหมวดก่อนหน้า */}
      {ids.length > 0 && quizLocked && (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-400">
            <Icon name="target" className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 font-medium text-slate-500">
              ควิซท้ายหมวด
              <span className="rounded-md bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">ยังไม่เปิด</span>
            </div>
            <div className="text-xs text-slate-400">
              ผ่านควิซหมวด {(cat ?? 1) - 1} ให้ได้ {QUIZ_PASS}/10 ก่อน แล้วควิซหมวดนี้จะเปิดให้เอง — เรียน/ฝึกหมวดนี้ได้ตามปกติ
            </div>
          </div>
        </div>
      )}
      {ids.length > 0 && !quizLocked && (
        <ActivityCard
          href={`/quiz?cat=${cat}`}
          icon="target"
          title="ควิซท้ายหมวด"
          desc={
            quizBest !== null
              ? `คะแนนเก็บ ${quizBest}/10 · สอบใหม่ได้ไม่จำกัด นับครั้งที่ดีที่สุด`
              : "สอบย่อย 10 ข้อ ผ่านที่ 7 ขึ้นไป — วัดว่าหมวดนี้แน่นหรือยัง"
          }
          badge={quizBest !== null && quizBest >= 7 ? "ผ่านแล้ว" : undefined}
          badgeTone="correct"
        />
      )}

      <p className="mt-1 text-center text-xs leading-relaxed text-slate-400">
        แนะนำ: เรียนคำศัพท์ก่อน แล้วค่อยฝึกฟัง → อ่าน · แต่เลือกแบบไหนก่อนก็ได้ตามสะดวก
      </p>
    </div>
  );
}

function ActivityCard({
  href,
  icon,
  title,
  desc,
  badge,
  badgeTone = "star",
  primary = false,
}: {
  href: string;
  icon: IconName;
  title: string;
  desc: string;
  badge?: string;
  badgeTone?: "star" | "correct";
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-2xl border p-4 transition active:scale-[0.99] ${
        primary ? "border-ocean-200 bg-ocean-50/50 hover:border-ocean-400" : "border-slate-100 bg-white hover:border-ocean-300 hover:shadow-sm"
      }`}
    >
      <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${primary ? "bg-ocean-700 text-white" : "bg-ocean-50 text-ocean-700"}`}>
        <Icon name={icon} className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 font-medium text-slate-700">
          {title}
          {badge && (
            <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${badgeTone === "correct" ? "bg-correct text-white" : "bg-star text-ocean-900"}`}>
              {badge}
            </span>
          )}
        </div>
        <div className="text-xs text-slate-400">{desc}</div>
      </div>
      <Icon name="arrowRight" className="h-4 w-4 shrink-0 text-slate-300" />
    </Link>
  );
}

// อ่าน ?cat= ผ่าน useSearchParams — key ตาม query ให้เปลี่ยนหมวดแล้ว state รีเซ็ตเสมอ
export default function CategoryMenu() {
  return (
    <Suspense fallback={<Center>กำลังโหลด...</Center>}>
      <CategoryMenuFromQuery />
    </Suspense>
  );
}

function CategoryMenuFromQuery() {
  const sp = useSearchParams();
  const cat = Number(sp.get("cat")) || null;
  return <CategoryMenuInner key={sp.toString()} cat={cat} />;
}
