"use client";

// เมนูฝึก 2 ชั้น — รายการแบบฝึกอยู่ที่ lib/practice-menu.ts ชุดเดียว (หน้าหมวดใช้ชุดเดียวกัน)
//   /practice          = เลือกทักษะ: ฝึกฟัง · ฝึกอ่าน · ฝึกเขียน · ฝึกพูด
//   /practice?group=…  = เมนูทักษะ: แบบฝึกทั้งหมดของทักษะนั้น + แถบสลับทักษะ + คำอธิบายป้าย
// แบบฝึกแต่ละแบบอยู่ทักษะเดียว (ไม่ซ้ำ) · ป้ายสถานะบอกตรง ๆ ว่าเนื้อหาพร้อมแค่ไหน
// ตัวเลข "คลังพร้อม" นับด้วยกติกาเดียวกับหน้ากิจกรรมนั้น ๆ (PA-14: เรียนแล้ว ≥4 คำ ใช้เฉพาะคำที่เรียนแล้ว)
// อีโมจิใช้เฉพาะคำพูดของ 小星 → หัวกลุ่มใช้ Icon เส้น

import { useEffect, useMemo } from "react";
import Link from "next/link";
import type { Word } from "@/lib/supabase";
import { catName } from "@/data/categories";
import { SENTENCES } from "@/data/sentences";
import { DIALOGUES, PICTURE_WORDS, QA_PAIRS } from "@/data/mock-activities";
import { findMinimalPairs } from "@/lib/thai-l1-rules";
import { MODE_ICON } from "@/lib/progress";
import {
  practiceMenu,
  groupMenuHref,
  rememberPracticeMenu,
  type HubGroup,
  type MenuGroup,
  type MenuItem,
  type MenuStatus,
} from "@/lib/practice-menu";
import { Icon } from "@/components/Icon";

const STATUS: Record<MenuStatus, { label: string; cls: string; legend: string }> = {
  ready: { label: "พร้อม", cls: "bg-emerald-50 text-emerald-700", legend: "ใช้คำศัพท์จริงจากคลัง HSK 1 ที่ตรวจแล้ว (ข้อฟังใช้ไฟล์เสียงจริง)" },
  demo: { label: "เดโม", cls: "bg-amber-50 text-amber-800", legend: "ใช้ได้ แต่เสียงยังเป็นเสียงอ่านอัตโนมัติจากเครื่อง (รอเสียงจริง)" },
  draft: { label: "ร่าง", cls: "bg-slate-100 text-slate-600", legend: "เนื้อหาฉบับร่าง (ประโยค / คู่เสียง) รอครูตรวจความถูกต้อง" },
  mock: { label: "เนื้อหาสมมุติ", cls: "bg-star-soft text-star-ink", legend: "เนื้อหาตัวอย่างไว้ลองใช้ ยังไม่ใช่ข้อสอบจริง" },
  tempimg: { label: "รูปชั่วคราว", cls: "bg-ocean-50 text-ocean-700", legend: "ใช้อีโมจิแทนรูปจริงไปก่อน" },
  beta: { label: "ทดลอง", cls: "bg-coral-soft text-rose-700", legend: "ระบบฟังเสียงพูดยังเช็กได้คร่าว ๆ จึงไม่นับคะแนน" },
};

export type PracticeHubProps = {
  cat: number | null;
  group: HubGroup | null; // null = หน้าเลือกทักษะ
  notice: string | null;
  words: Word[]; // คลังคำ HSK 1 ทั้งหมด (ไม่กรองหมวด) — กิจกรรมหน้าอื่นใช้ทั้งคลัง
  learnedIds: ReadonlySet<number>;
  listenCount: number; // คลังของ ฟังคำ (กรองหมวดแล้วถ้ามี ?cat=)
  readCount: number; // คลังของ อ่านคำ
  listenChoice: "meaning" | "hanzi";
  onStart: (m: "listen" | "read" | "order") => void;
};

export default function PracticeHub(p: PracticeHubProps) {
  const menu = practiceMenu();
  const n = useMemo(() => countPools(p.words, p.learnedIds), [p.words, p.learnedIds]);
  const focus = p.group ? (menu.find((g) => g.id === p.group) ?? null) : null;
  const focusId = focus?.id ?? null;
  const catLabel = p.cat ? ` · ${catName(p.cat) ?? `หมวด ${p.cat}`}` : "";

  // จำเมนูทักษะนี้ไว้ — ปุ่ม "กลับเมนูฝึก" ในหน้ากิจกรรมจะพากลับมาที่นี่ (พร้อมหมวด)
  useEffect(() => {
    if (focusId) rememberPracticeMenu(groupMenuHref(focusId, p.cat));
  }, [focusId, p.cat]);

  const back = p.cat ? (
    <Link href={`/learn/category?cat=${p.cat}`} className="mb-1 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600">
      <Icon name="arrowLeft" className="h-3.5 w-3.5" /> กลับเมนูหมวด
    </Link>
  ) : focus ? (
    <Link href="/practice" className="mb-1 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600">
      <Icon name="arrowLeft" className="h-3.5 w-3.5" /> เลือกทักษะ
    </Link>
  ) : null;

  const notice = p.notice && (
    <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-700">{p.notice}</p>
  );

  // ---------- หน้าเลือกทักษะ ----------
  if (!focus) {
    return (
      <div className="flex flex-col gap-4 p-5">
        <header>
          {back}
          <h1 className="text-xl font-semibold text-slate-700">ฝึกทำข้อสอบ{catLabel}</h1>
          <p className="mt-1 text-sm text-slate-400">เลือกทักษะที่จะฝึก · รูปแบบข้อสอบ HSK · ตรวจให้ทันที</p>
          {notice}
        </header>
        <div className="flex flex-col gap-2.5">
          {menu.map((g) => (
            <SkillCard key={g.id} group={g} href={groupMenuHref(g.id, p.cat)} />
          ))}
        </div>
        <Tip />
      </div>
    );
  }

  // ---------- เมนูทักษะ ----------
  const usedStatus = new Set(focus.items.map((c) => c.status));
  const byCat = focus.items.filter((i) => i.byCategory).map((i) => i.title);
  return (
    <div className="flex flex-col gap-5 p-5">
      <header>
        {back}
        <h1 className="text-xl font-semibold text-slate-700">
          {focus.pageTitle}
          {catLabel}
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          เลือกแบบฝึกได้ {focus.items.length} แบบ · รูปแบบข้อสอบ HSK · ตรวจให้ทันที
        </p>
        {p.cat && byCat.length > 0 && (
          <p className="mt-2 rounded-xl bg-ocean-50 px-3 py-2 text-xs leading-relaxed text-ocean-700">
            {byCat.join(" · ")} ใช้เฉพาะคำในหมวดนี้{focus.items.length > byCat.length ? " — แบบอื่นใช้คำทุกหมวด" : ""}
          </p>
        )}
        {notice}
      </header>

      {/* ไม่มีแถบสลับทักษะ — เลือกทักษะมาแล้วจากหน้าหมวด/หน้าเลือกทักษะ (บอล 12 ต.ค.: "กดฝึกฟังก็มีให้เลือกทักษะทั้งหมดอีก") · เปลี่ยนทักษะ = ปุ่มกลับด้านบน */}
      <section aria-labelledby="hub-group-title">
        <div className="mb-2 flex items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ocean-900 text-white">
            <Icon name={focus.icon} className="h-4 w-4" />
          </span>
          <p id="hub-group-title" className="text-xs leading-snug text-slate-500">
            {focus.hsk}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {focus.items.map((c) => (
            <HubCard key={c.id} item={c} avail={availOf(c, p, n)} onStart={c.start ? () => p.onStart(c.start!) : undefined} />
          ))}
        </div>
      </section>

      {/* คำอธิบายป้าย */}
      <section aria-labelledby="hub-legend" className="rounded-2xl border border-slate-100 bg-white p-4">
        <h2 id="hub-legend" className="mb-2 text-xs font-semibold text-slate-500">
          ป้ายบนการ์ดหมายถึง
        </h2>
        <dl className="flex flex-col gap-1.5 text-[11px] leading-snug text-slate-500">
          {(Object.keys(STATUS) as MenuStatus[]).filter((s) => usedStatus.has(s)).map((s) => (
            <div key={s} className="flex items-start gap-2">
              <dt className="shrink-0">
                <StatusBadge status={s} />
              </dt>
              <dd className="pt-px">{STATUS[s].legend}</dd>
            </div>
          ))}
        </dl>
      </section>

      <Tip />
    </div>
  );
}

// ---------- การ์ด ----------

const CARD_CLS =
  "flex w-full items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3.5 text-left shadow-sm transition hover:border-ocean-300 hover:shadow active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-300";

function SkillCard({ group, href }: { group: MenuGroup; href: string }) {
  return (
    <Link href={href} className={CARD_CLS}>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-ocean-50 text-ocean-700">
        <Icon name={group.icon} className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-medium text-slate-700">{group.pageTitle}</span>
        <span className="mt-0.5 block text-xs leading-snug text-slate-500">
          {group.items.length} แบบ: {group.items.map((i) => i.title).join(" · ")}
        </span>
        <span className="mt-1 block text-[11px] text-slate-400">{group.hsk}</span>
      </span>
      <Icon name="arrowRight" className="h-4 w-4 shrink-0 text-ocean-300" />
    </Link>
  );
}

function HubCard({ item, avail, onStart }: { item: MenuItem; avail: string; onStart?: () => void }) {
  const inner = (
    <>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-ocean-50 text-ocean-700">
        <Icon name={MODE_ICON[item.mode]} className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className="font-medium text-slate-700">{item.title}</span>
          <StatusBadge status={item.status} text={item.badge} />
        </span>
        <span className="mt-0.5 block text-xs leading-snug text-slate-500">{item.desc}</span>
        <span className="mt-1 block text-[11px] text-slate-400">{avail}</span>
      </span>
      <Icon name={item.href ? "arrowRight" : "play"} className="h-4 w-4 shrink-0 text-ocean-300" />
    </>
  );
  return item.href ? (
    <Link href={item.href} className={CARD_CLS}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onStart} className={CARD_CLS}>
      {inner}
    </button>
  );
}

function StatusBadge({ status, text }: { status: MenuStatus; text?: string }) {
  return (
    <span className={`inline-block rounded-md px-1.5 py-0.5 text-[10px] font-bold leading-tight ${STATUS[status].cls}`}>
      {text ?? STATUS[status].label}
    </span>
  );
}

function Tip() {
  return (
    <div className="flex gap-2 rounded-2xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-500">
      <Icon name="bulb" className="mt-0.5 h-4 w-4 shrink-0 text-xp" />
      <p>
        ข้อสอบสุ่มจากคลัง HSK 1 ตรวจตามเฉลยแบบเดียวกับข้อสอบจริง ไม่ใช้ AI เดา (พูดตามเป็นตัวช่วยเช็กคร่าว ๆ
        ไม่นับคะแนน) · ผลการฝึกจะไปแสดงในหน้า{" "}
        <Link href="/progress" className="text-ocean-500 underline">
          ผล
        </Link>
      </p>
    </div>
  );
}

// ---------- ตัวเลข "คลังพร้อม" ----------

type Pools = ReturnType<typeof countPools>;

// นับคลังของกิจกรรมที่อยู่หน้าอื่น — กติกาเดียวกับหน้านั้น (แก้กติกาที่หน้าไหน ต้องแก้ที่นี่ด้วย)
function countPools(words: Word[], learned: ReadonlySet<number>) {
  const hasMeaning = (w: Word) => !!(w.meaning_th && w.meaning_th.trim());
  const preferLearned = (arr: Word[]) => {
    const l = arr.filter((w) => learned.has(w.id));
    return l.length >= 4 ? l : arr;
  };
  const withAudio = words.filter((w) => w.audio_path);
  const byHanzi = new Map(words.map((w) => [w.hanzi, w]));
  const pictures = PICTURE_WORDS.flatMap((pw) => byHanzi.get(pw.hanzi) ?? []);
  return {
    truefalse: preferLearned(words.filter(hasMeaning)).length, // = truefalse/page.tsx
    pairs: findMinimalPairs(words).length, // = ear/page.tsx
    speak: preferLearned(withAudio.length >= 4 ? withAudio : words).length, // = speak/page.tsx
    pictureRead: pictures.length, // = picture/page.tsx (จับคู่รูปกับคำจริงด้วย hanzi)
    pictureListen: pictures.filter((w) => w.audio_path).length,
  };
}

const ready = (count: number, unit: string) => (count >= 4 ? `คลังพร้อม ${count} ${unit}` : `${unit}ในคลังยังไม่พอ`);

function availOf(item: MenuItem, p: PracticeHubProps, n: Pools): string {
  const S = `คลังพร้อม ${SENTENCES.length} ประโยค`;
  switch (item.id) {
    case "listen":
      return `${ready(p.listenCount, "คำ")} · ตัวเลือก: ${p.listenChoice === "hanzi" ? "ตัวจีน" : "คำแปล"}`;
    case "read":
      return ready(p.readCount, "คำ");
    case "ear":
      return `คู่เสียงชุดทดลอง ${n.pairs} คู่ · รอครูคัดและฟังยืนยัน`; // PR-05: คู่ปั้นอัตโนมัติ ยังไม่ผ่านการคัด
    case "picture-listen":
      return `คลังพร้อม ${n.pictureListen} รูป`;
    case "picture-read":
      return `คลังพร้อม ${n.pictureRead} รูป`;
    case "truefalse":
      return ready(n.truefalse, "คำ");
    case "dialogue":
      return `คลังพร้อม ${DIALOGUES.length} บทสนทนา`;
    case "qa":
      return `คลังพร้อม ${QA_PAIRS.length} คู่`;
    case "speak":
      return `คลังพร้อม ${n.speak} คำ`;
    default:
      return S; // ฟังประโยค · อ่านประโยค · เติมคำ · เรียงประโยค
  }
}
