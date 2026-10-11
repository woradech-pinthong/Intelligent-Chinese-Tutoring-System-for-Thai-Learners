"use client";

// เมนู "ฝึกทำข้อสอบ" — จัดกลุ่มตามทักษะของข้อสอบ HSK 1 (ฟัง · อ่าน) + ทักษะประกอบ (เขียน · พูด)
// ทุกการ์ดกดได้ (บอลอยากเห็นทุกกิจกรรมที่วางไว้ทำงานจริง แม้เนื้อหาบางชุดยังชั่วคราว) → ป้ายสถานะบอกตรง ๆ ว่าพร้อมแค่ไหน
// ฝึกฟัง / ฝึกอ่าน / เรียงประโยค = โหมดในหน้า /practice เอง (onStart) · ที่เหลือเป็นหน้าของตัวเอง (href)
// ตัวเลข "คลังพร้อม" นับด้วยกติกาเดียวกับหน้ากิจกรรมนั้น ๆ (PA-14: เรียนแล้ว ≥4 คำ ใช้เฉพาะคำที่เรียนแล้ว)
// อีโมจิใช้เฉพาะคำพูดของ 小星 → หัวกลุ่มใช้ Icon เส้นแทน 🎧📖✍️🎤
// รอบทดลองกับผู้เรียนจริง (ME-02 · CG-02): build ด้วย NEXT_PUBLIC_SHOW_DEMO=0 → ซ่อนการ์ดที่เนื้อหายังไม่ผ่านตรวจ
//   (เดโม / ร่าง / เนื้อหาสมมุติ / รูปชั่วคราว) · ไม่ตั้ง = โชว์ทุกการ์ดเหมือนเดิม — บอลเคาะว่ารอบทดลองจะซ่อนไหม
//   ⚠️ ซ่อนแค่การ์ดในเมนูนี้ — ลิงก์เดิมไป /practice?mode=order จากหน้าหมวด/ควิซ/สอบเสมือนยังอยู่

import { useMemo } from "react";
import Link from "next/link";
import type { Word } from "@/lib/supabase";
import { catName } from "@/data/categories";
import { SENTENCES, SENTENCES_REVIEWED } from "@/data/sentences";
import { DIALOGUES, PICTURE_WORDS, QA_PAIRS } from "@/data/mock-activities";
import { findMinimalPairs } from "@/lib/thai-l1-rules";
import { MODE_ICON, practiceHref, type QuizMode } from "@/lib/progress";
import { Icon, type IconName } from "@/components/Icon";

type Status = "ready" | "demo" | "draft" | "mock" | "tempimg" | "beta";

const STATUS: Record<Status, { label: string; cls: string; legend: string }> = {
  ready: { label: "พร้อม", cls: "bg-emerald-50 text-emerald-700", legend: "ใช้คำศัพท์จริงจากคลัง HSK 1 ที่ตรวจแล้ว (ข้อฟังใช้ไฟล์เสียงจริง)" },
  demo: { label: "เดโม", cls: "bg-amber-50 text-amber-800", legend: "ใช้ได้ แต่เสียงยังเป็นเสียงอ่านอัตโนมัติจากเครื่อง (รอเสียงจริง)" },
  draft: { label: "ร่าง", cls: "bg-slate-100 text-slate-600", legend: "เนื้อหาฉบับร่าง (ประโยค / คู่เสียง) รอครูตรวจความถูกต้อง" },
  mock: { label: "เนื้อหาสมมุติ", cls: "bg-star-soft text-star-ink", legend: "เนื้อหาตัวอย่างไว้ลองใช้ ยังไม่ใช่ข้อสอบจริง" },
  tempimg: { label: "รูปชั่วคราว", cls: "bg-ocean-50 text-ocean-700", legend: "ใช้อีโมจิแทนรูปจริงไปก่อน" },
  beta: { label: "ทดลอง", cls: "bg-coral-soft text-rose-700", legend: "ระบบฟังเสียงพูดยังเช็กได้คร่าว ๆ จึงไม่นับคะแนน" },
};

// การ์ดที่เนื้อหายังไม่ผ่านการตรวจ — ซ่อนเมื่อ build รอบทดลอง (NEXT_PUBLIC_SHOW_DEMO=0)
const SHOW_DEMO = process.env.NEXT_PUBLIC_SHOW_DEMO !== "0";
const UNREVIEWED: ReadonlySet<Status> = new Set<Status>(["demo", "draft", "mock", "tempimg"]);
// ประโยคชุด sentences.ts (เรียงประโยค / เติมคำ) — "พร้อม" ได้เมื่อหฤทัยตรวจครบเท่านั้น (CG-03)
const SENTENCE_STATUS: Status = SENTENCES_REVIEWED ? "ready" : "draft";

type Card = {
  id: string;
  mode: QuizMode; // ใช้เลือกไอคอน (MODE_ICON ชุดเดียวกับหน้าผล/หน้าแรก)
  title: string;
  desc: string;
  avail: string;
  status: Status;
  badge?: string; // ข้อความป้ายแทนค่าเริ่มต้น
  href?: string;
  onStart?: () => void;
};

type Group = { id: HubGroup; icon: IconName; title: string; sub?: string; hsk: string; cards: Card[] };

// ?group= — เข้าจากการ์ด "ฝึกฟัง / ฝึกอ่าน / ฝึกเขียน / ฝึกพูด" ในหน้าหมวด → โชว์เฉพาะกิจกรรมของทักษะนั้น (บอลกดฝึกฟังแล้วหาบทสนทนา/เลือกรูปไม่เจอ 12 ต.ค.)
export type HubGroup = "listen" | "read" | "write" | "speak";
export const HUB_GROUPS: readonly HubGroup[] = ["listen", "read", "write", "speak"];
const GROUP_PAGE_TITLE: Record<HubGroup, string> = { listen: "ฝึกฟัง", read: "ฝึกอ่าน", write: "ฝึกเขียน", speak: "ฝึกพูด" };

export type PracticeHubProps = {
  cat: number | null;
  group?: HubGroup | null; // null = ทุกทักษะ
  notice: string | null;
  words: Word[]; // คลังคำ HSK 1 ทั้งหมด (ไม่กรองหมวด) — กิจกรรมหน้าอื่นใช้ทั้งคลัง
  learnedIds: ReadonlySet<number>;
  listenCount: number; // คลังของ ฝึกฟัง (กรองหมวดแล้วถ้ามี ?cat=)
  readCount: number; // คลังของ ฝึกอ่าน
  listenChoice: "meaning" | "hanzi";
  onStart: (m: "listen" | "read" | "order") => void;
};

export default function PracticeHub(p: PracticeHubProps) {
  const n = useMemo(() => countPools(p.words, p.learnedIds, p.cat), [p.words, p.learnedIds, p.cat]);
  const allGroups = buildGroups(p, n)
    .map((g) => ({ ...g, cards: g.cards.filter((c) => SHOW_DEMO || !UNREVIEWED.has(c.status)) }))
    .filter((g) => g.cards.length > 0);
  const focus = p.group && allGroups.some((g) => g.id === p.group) ? p.group : null;
  const groups = focus ? allGroups.filter((g) => g.id === focus) : allGroups;
  const usedStatus = new Set(groups.flatMap((g) => g.cards.map((c) => c.status)));
  const catQ = p.cat ? `&cat=${p.cat}` : "";
  const catLabel = p.cat ? ` · ${catName(p.cat) ?? `หมวด ${p.cat}`}` : "";

  return (
    <div className="flex flex-col gap-5 p-5">
      <header>
        {p.cat && (
          <Link href={`/learn/category?cat=${p.cat}`} className="mb-1 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600">
            <Icon name="arrowLeft" className="h-3.5 w-3.5" /> กลับเมนูหมวด
          </Link>
        )}
        <h1 className="text-xl font-semibold text-slate-700">
          {focus ? GROUP_PAGE_TITLE[focus] : "ฝึกทำข้อสอบ"}
          {catLabel}
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          {focus ? `เลือกแบบฝึกได้ ${groups[0]?.cards.length ?? 0} แบบ · ` : ""}รูปแบบข้อสอบ HSK · ตรวจให้ทันที · ฟังซ้ำได้ไม่จำกัด
        </p>
        {p.cat && (
          <p className="mt-2 rounded-xl bg-ocean-50 px-3 py-2 text-xs leading-relaxed text-ocean-700">
            ฝึกฟัง · ฝึกอ่าน · เกมจับคู่ ใช้เฉพาะคำในหมวดนี้ — กิจกรรมอื่นใช้คำทุกหมวด
          </p>
        )}
        {p.notice && (
          <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-700">{p.notice}</p>
        )}
      </header>

      {/* แถบทักษะ: หน้ารวม = ทางลัดเลื่อนไปแต่ละกลุ่ม · หน้าทักษะเดียว = สลับไปทักษะอื่น */}
      <nav aria-label={focus ? "สลับทักษะ" : "ไปที่กลุ่มทักษะ"} className="-mt-1 flex gap-2 overflow-x-auto pb-0.5">
        {focus && (
          <Link
            href={`/practice${p.cat ? `?cat=${p.cat}` : ""}`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-ocean-300 hover:text-ocean-700"
          >
            ทุกทักษะ
          </Link>
        )}
        {allGroups.map((g) => {
          const chip = (
            <>
              <Icon name={g.icon} className="h-3.5 w-3.5" />
              {g.title}
              <span className={`tabular-nums ${g.id === focus ? "text-ocean-100" : "text-slate-400"}`}>{g.cards.length}</span>
            </>
          );
          const cls = `inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
            g.id === focus ? "border-ocean-700 bg-ocean-700 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-ocean-300 hover:text-ocean-700"
          }`;
          return focus ? (
            <Link key={g.id} href={`/practice?group=${g.id}${catQ}`} className={cls} aria-current={g.id === focus ? "page" : undefined}>
              {chip}
            </Link>
          ) : (
            <a key={g.id} href={`#hub-${g.id}`} className={cls}>
              {chip}
            </a>
          );
        })}
      </nav>

      {groups.map((g) => (
        <section key={g.id} id={`hub-${g.id}`} aria-labelledby={`hub-${g.id}-title`} className="scroll-mt-16">
          <div className="mb-2 flex items-center gap-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ocean-900 text-white">
              <Icon name={g.icon} className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 id={`hub-${g.id}-title`} className="text-sm font-semibold text-slate-700">
                {g.title}
                {g.sub && <span className="ml-1 font-normal text-slate-400">· {g.sub}</span>}
              </h2>
              <p className="text-[11px] leading-snug text-slate-400">{g.hsk}</p>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {g.cards.map((c) => (
              <HubCard key={c.id} card={c} />
            ))}
          </div>
        </section>
      ))}

      {/* คำอธิบายป้าย */}
      <section aria-labelledby="hub-legend" className="rounded-2xl border border-slate-100 bg-white p-4">
        <h2 id="hub-legend" className="mb-2 text-xs font-semibold text-slate-500">
          ป้ายบนการ์ดหมายถึง
        </h2>
        <dl className="flex flex-col gap-1.5 text-[11px] leading-snug text-slate-500">
          {(Object.keys(STATUS) as Status[]).filter((s) => usedStatus.has(s)).map((s) => (
            <div key={s} className="flex items-start gap-2">
              <dt className="shrink-0">
                <StatusBadge status={s} />
              </dt>
              <dd className="pt-px">{STATUS[s].legend}</dd>
            </div>
          ))}
        </dl>
      </section>

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
    </div>
  );
}

// ---------- การ์ด ----------

function HubCard({ card }: { card: Card }) {
  const cls =
    "flex w-full items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3.5 text-left shadow-sm transition hover:border-ocean-300 hover:shadow active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-300";
  const inner = (
    <>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-ocean-50 text-ocean-700">
        <Icon name={MODE_ICON[card.mode]} className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className="font-medium text-slate-700">{card.title}</span>
          <StatusBadge status={card.status} text={card.badge} />
        </span>
        <span className="mt-0.5 block text-xs leading-snug text-slate-500">{card.desc}</span>
        <span className="mt-1 block text-[11px] text-slate-400">{card.avail}</span>
      </span>
      <Icon name={card.href ? "arrowRight" : "play"} className="h-4 w-4 shrink-0 text-ocean-300" />
    </>
  );
  return card.href ? (
    <Link href={card.href} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={card.onStart} className={cls}>
      {inner}
    </button>
  );
}

function StatusBadge({ status, text }: { status: Status; text?: string }) {
  return (
    <span className={`inline-block rounded-md px-1.5 py-0.5 text-[10px] font-bold leading-tight ${STATUS[status].cls}`}>
      {text ?? STATUS[status].label}
    </span>
  );
}

// ---------- ข้อมูลการ์ด ----------

type Pools = ReturnType<typeof countPools>;

// นับคลังของกิจกรรมที่อยู่หน้าอื่น — กติกาเดียวกับหน้านั้น (แก้กติกาที่หน้าไหน ต้องแก้ที่นี่ด้วย)
function countPools(words: Word[], learned: ReadonlySet<number>, cat: number | null) {
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
    match: words.filter((w) => (!cat || w.category === cat) && learned.has(w.id) && hasMeaning(w)).length, // = match/page.tsx
  };
}

const ready = (count: number, unit: string) => (count >= 4 ? `คลังพร้อม ${count} ${unit}` : `${unit}ในคลังยังไม่พอ`);

function buildGroups(p: PracticeHubProps, n: Pools): Group[] {
  const S = SENTENCES.length;
  const fill: Omit<Card, "id" | "desc"> = {
    mode: "fill",
    title: "เติมคำ",
    avail: `คลังพร้อม ${S} ประโยค`,
    status: SENTENCE_STATUS,
    href: practiceHref("fill"),
  };
  return [
    {
      id: "listen",
      icon: "headphone",
      title: "ฟัง",
      hsk: "ข้อสอบ HSK 1 มีส่วนฟัง 20 ข้อ",
      cards: [
        {
          id: "listen",
          mode: "listen",
          title: "ฝึกฟัง",
          desc: "ฟังคำ แล้วเลือกคำแปลหรือตัวจีนที่ได้ยิน",
          avail: `${ready(p.listenCount, "คำ")} · ตัวเลือก: ${p.listenChoice === "hanzi" ? "ตัวจีน" : "คำแปล"}`,
          status: "ready",
          onStart: () => p.onStart("listen"),
        },
        {
          id: "ear",
          mode: "ear",
          title: "แยกเสียง",
          desc: "ฟังคำ 1 คำ แล้วเลือกพินอินที่ได้ยินจากเสียงที่คล้ายกัน — ฝึกแยกวรรณยุกต์และเสียงม้วนลิ้นที่คนไทยมักสับสน",
          avail: `คู่เสียงชุดทดลอง ${n.pairs} คู่ · รอครูคัดและฟังยืนยัน`, // PR-05: คู่ปั้นอัตโนมัติ ยังไม่ผ่านการคัด
          status: "draft",
          href: practiceHref("ear"),
        },
        {
          id: "picture-listen",
          mode: "picture",
          title: "ฟังแล้วเลือกรูป",
          desc: "ฟังคำ แล้วแตะรูปที่ตรงกับคำที่ได้ยิน",
          avail: `คลังพร้อม ${n.pictureListen} รูป`,
          status: "tempimg",
          href: "/practice/picture?mode=listen",
        },
        {
          id: "listen-sentence",
          mode: "listen_sentence",
          title: "ฟังประโยค จริง/เท็จ",
          desc: "ฟังประโยค แล้วตัดสินว่าข้อความภาษาไทยตรงกับที่ได้ยินไหม",
          avail: `คลังพร้อม ${S} ประโยค`,
          status: "demo",
          badge: SENTENCES_REVIEWED ? undefined : "เดโม · ประโยคร่าง",
          href: practiceHref("listen_sentence"),
        },
        {
          id: "dialogue",
          mode: "dialogue",
          title: "ฟังบทสนทนา",
          desc: "ฟังบทสนทนาสั้น ๆ ของ 2 คน แล้วตอบคำถาม",
          avail: `คลังพร้อม ${DIALOGUES.length} บทสนทนา`,
          status: "mock",
          badge: "เนื้อหาสมมุติ · เสียงจากเครื่อง",
          href: practiceHref("dialogue"),
        },
      ],
    },
    {
      id: "read",
      icon: "book",
      title: "อ่าน",
      hsk: "ข้อสอบ HSK 1 มีส่วนอ่าน 20 ข้อ",
      cards: [
        {
          id: "read",
          mode: "read",
          title: "ฝึกอ่าน",
          desc: "อ่านตัวจีน + พินอิน แล้วเลือกคำแปลที่ถูก",
          avail: ready(p.readCount, "คำ"),
          status: "ready",
          onStart: () => p.onStart("read"),
        },
        {
          id: "truefalse",
          mode: "truefalse",
          title: "จริง/เท็จ",
          desc: "ดูตัวจีนกับคำแปล แล้วตัดสินว่าตรงกันไหม",
          avail: ready(n.truefalse, "คำ"),
          status: "ready",
          href: practiceHref("truefalse"),
        },
        {
          id: "picture-read",
          mode: "picture_read",
          title: "อ่านแล้วเลือกรูป",
          desc: "อ่านตัวจีน แล้วแตะรูปที่ตรงกับคำนั้น",
          avail: `คลังพร้อม ${n.pictureRead} รูป`,
          status: "tempimg",
          href: "/practice/picture?mode=read",
        },
        {
          id: "read-sentence",
          mode: "read_sentence",
          title: "อ่านประโยค",
          desc: "อ่านทั้งประโยค แล้วเลือกคำแปลที่ถูก",
          avail: `คลังพร้อม ${S} ประโยค`,
          status: SENTENCE_STATUS,
          href: practiceHref("read_sentence"),
        },
        {
          id: "qa",
          mode: "qa",
          title: "จับคู่ถาม-ตอบ",
          desc: "อ่านคำถาม แล้วเลือกคำตอบที่เข้ากัน",
          avail: `คลังพร้อม ${QA_PAIRS.length} คู่`,
          status: "mock",
          href: practiceHref("qa"),
        },
        { ...fill, id: "fill-read", desc: "อ่านประโยคที่เว้นช่องไว้ แล้วเลือกคำมาเติมให้ถูก" },
        {
          id: "match",
          mode: "match",
          title: "เกมจับคู่",
          desc: "เปิดการ์ดจับคู่คำ↔คำแปล ทวนแบบสนุก ๆ",
          avail: n.match >= 4 ? `คำที่เรียนแล้ว ${n.match} คำ` : "เปิดบัตรคำให้ได้ 4 คำก่อน แล้วเกมจะเปิดให้",
          status: "ready",
          href: p.cat ? `/match?cat=${p.cat}` : practiceHref("match"),
        },
      ],
    },
    {
      id: "write",
      icon: "pencil",
      title: "เขียน",
      sub: "ประกอบภาษา",
      hsk: "HSK 1 ไม่สอบเขียน — ฝึกไว้ให้เข้าใจโครงประโยค อ่านประโยคได้คล่องขึ้น",
      cards: [
        {
          id: "order",
          mode: "order",
          title: "เรียงประโยค",
          desc: "แตะคำมาเรียงเป็นประโยค ดักจุดที่คนไทยมักเรียงผิด",
          avail: `คลังพร้อม ${S} ประโยค`,
          status: SENTENCE_STATUS,
          onStart: () => p.onStart("order"),
        },
        { ...fill, id: "fill-write", desc: "เลือกคำไวยากรณ์ เช่น 的 个 也 都 มาเติมให้ประโยคถูก (ชุดเดียวกับเติมคำในกลุ่มอ่าน)" },
      ],
    },
    {
      id: "speak",
      icon: "mic",
      title: "พูด",
      hsk: "HSK 1–2 ไม่สอบพูด — ฝึกไว้ให้กล้าพูด และแยกเสียงได้แม่นขึ้น",
      cards: [
        {
          id: "speak",
          mode: "speak",
          title: "พูดตาม",
          desc: "ฟังเสียงต้นแบบ แล้วพูดตาม ระบบช่วยเช็กเสียงให้คร่าว ๆ",
          avail: `คลังพร้อม ${n.speak} คำ`,
          status: "beta",
          badge: "ทดลอง · ไม่นับคะแนน",
          href: practiceHref("speak"),
        },
      ],
    },
  ];
}
