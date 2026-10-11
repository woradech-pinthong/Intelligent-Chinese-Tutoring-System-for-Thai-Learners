// เมนูฝึกชุดเดียวของทั้งแอป — หน้าหมวด · หน้าเลือกทักษะ (/practice) · เมนูทักษะ (/practice?group=) ใช้รายการนี้ร่วมกัน
// เส้นทางเดียว: เลือกทักษะ → เลือกแบบฝึก → ฝึก · แบบฝึกแต่ละแบบอยู่ทักษะเดียว (ไม่ซ้ำ) — บอลสั่ง "เมนูมันซ้ำ จัดดี ๆ" 12 ต.ค. 2569
// ปุ่ม "กลับเมนูฝึก" ในหน้ากิจกรรม → กลับเมนูทักษะที่เพิ่งมา (จำใน sessionStorage) รวมหมวดที่เลือกไว้ด้วย

import { useSyncExternalStore } from "react";
import type { QuizMode } from "@/lib/progress";
import type { IconName } from "@/components/Icon";
import { SENTENCES_REVIEWED } from "@/data/sentences";

export type HubGroup = "listen" | "read" | "write" | "speak";
export const HUB_GROUPS: readonly HubGroup[] = ["listen", "read", "write", "speak"];

// พร้อม / เดโม / ร่าง / เนื้อหาสมมุติ / รูปชั่วคราว / ทดลอง — สีและคำอธิบายอยู่ใน PracticeHub.tsx
export type MenuStatus = "ready" | "demo" | "draft" | "mock" | "tempimg" | "beta";

export type MenuItem = {
  id: string;
  mode: QuizMode; // ใช้เลือกไอคอน (MODE_ICON)
  title: string;
  desc: string;
  status: MenuStatus;
  badge?: string; // ข้อความป้ายแทนค่าเริ่มต้น
  href?: string; // หน้าของตัวเอง
  start?: "listen" | "read" | "order"; // โหมดในหน้า /practice เอง
  byCategory?: boolean; // ใช้เฉพาะคำในหมวดเมื่อเข้ามาจากหน้าหมวด
};

export type MenuGroup = {
  id: HubGroup;
  icon: IconName;
  title: string; // ชื่อสั้นบนแถบสลับทักษะ
  pageTitle: string; // ชื่อเมนู/การ์ดทักษะ
  hsk: string; // บอกว่า HSK 1 สอบอะไร
  note?: string; // ต่อท้ายคำอธิบายการ์ดทักษะในหน้าหมวด
  items: MenuItem[];
};

// รอบทดลองกับผู้เรียนจริง (ME-02 · CG-02): build ด้วย NEXT_PUBLIC_SHOW_DEMO=0 → ซ่อนแบบฝึกที่เนื้อหายังไม่ผ่านตรวจ
export const SHOW_DEMO = process.env.NEXT_PUBLIC_SHOW_DEMO !== "0";
const UNREVIEWED: ReadonlySet<MenuStatus> = new Set<MenuStatus>(["demo", "draft", "mock", "tempimg"]);
// ประโยคชุด sentences.ts — "พร้อม" ได้เมื่อหฤทัยตรวจครบเท่านั้น (CG-03)
const SENTENCE_STATUS: MenuStatus = SENTENCES_REVIEWED ? "ready" : "draft";

const MENU: MenuGroup[] = [
  {
    id: "listen",
    icon: "headphone",
    title: "ฟัง",
    pageTitle: "ฝึกฟัง",
    hsk: "ข้อสอบ HSK 1 มีส่วนฟัง 20 ข้อ",
    items: [
      { id: "listen", mode: "listen", title: "ฟังคำ", desc: "ฟังคำ แล้วเลือกคำแปลหรือตัวจีนที่ได้ยิน", status: "ready", start: "listen", byCategory: true },
      { id: "ear", mode: "ear", title: "แยกเสียง", desc: "ฟังคำ 1 คำ แล้วเลือกพินอินที่ได้ยินจากเสียงที่คล้ายกัน — ฝึกแยกวรรณยุกต์และเสียงม้วนลิ้นที่คนไทยมักสับสน", status: "draft", href: "/practice/ear" },
      { id: "picture-listen", mode: "picture", title: "ฟังแล้วเลือกรูป", desc: "ฟังคำ แล้วแตะรูปที่ตรงกับคำที่ได้ยิน", status: "tempimg", href: "/practice/picture?mode=listen" },
      { id: "listen-sentence", mode: "listen_sentence", title: "ฟังประโยค จริง/เท็จ", desc: "ฟังประโยค แล้วตัดสินว่าข้อความภาษาไทยตรงกับที่ได้ยินไหม", status: "demo", badge: SENTENCES_REVIEWED ? undefined : "เดโม · ประโยคร่าง", href: "/practice/listen-sentence" },
      { id: "dialogue", mode: "dialogue", title: "ฟังบทสนทนา", desc: "ฟังบทสนทนาสั้น ๆ ของ 2 คน แล้วตอบคำถาม", status: "mock", badge: "เนื้อหาสมมุติ · เสียงจากเครื่อง", href: "/practice/dialogue" },
    ],
  },
  {
    id: "read",
    icon: "book",
    title: "อ่าน",
    pageTitle: "ฝึกอ่าน",
    hsk: "ข้อสอบ HSK 1 มีส่วนอ่าน 20 ข้อ",
    items: [
      { id: "read", mode: "read", title: "อ่านคำ", desc: "อ่านตัวจีน + พินอิน แล้วเลือกคำแปลที่ถูก", status: "ready", start: "read", byCategory: true },
      { id: "truefalse", mode: "truefalse", title: "จริง/เท็จ", desc: "ดูตัวจีนกับคำแปล แล้วตัดสินว่าตรงกันไหม", status: "ready", href: "/practice/truefalse" },
      { id: "picture-read", mode: "picture_read", title: "อ่านแล้วเลือกรูป", desc: "อ่านตัวจีน แล้วแตะรูปที่ตรงกับคำนั้น", status: "tempimg", href: "/practice/picture?mode=read" },
      { id: "read-sentence", mode: "read_sentence", title: "อ่านประโยค", desc: "อ่านทั้งประโยค แล้วเลือกคำแปลที่ถูก", status: SENTENCE_STATUS, href: "/practice/read-sentence" },
      { id: "qa", mode: "qa", title: "จับคู่ถาม-ตอบ", desc: "อ่านคำถาม แล้วเลือกคำตอบที่เข้ากัน", status: "mock", href: "/practice/qa" },
      { id: "fill", mode: "fill", title: "เติมคำ", desc: "อ่านประโยคที่เว้นช่องไว้ แล้วเลือกคำ เช่น 的 个 也 都 มาเติมให้ถูก", status: SENTENCE_STATUS, href: "/practice/fill" },
    ],
  },
  {
    id: "write",
    icon: "pencil",
    title: "เขียน",
    pageTitle: "ฝึกเขียน",
    hsk: "HSK 1 ไม่สอบเขียน — ฝึกประกอบประโยคไว้ให้เข้าใจโครงประโยค อ่านได้คล่องขึ้น",
    note: "ประกอบภาษา — HSK 1 ไม่สอบเขียน",
    items: [
      { id: "order", mode: "order", title: "เรียงประโยค", desc: "แตะคำมาเรียงเป็นประโยค ดักจุดที่คนไทยมักเรียงผิด", status: SENTENCE_STATUS, start: "order" },
    ],
  },
  {
    id: "speak",
    icon: "mic",
    title: "พูด",
    pageTitle: "ฝึกพูด",
    hsk: "HSK 1–2 ไม่สอบพูด — ฝึกไว้ให้กล้าพูด และแยกเสียงได้แม่นขึ้น",
    note: "ทดลอง · ไม่นับคะแนน",
    items: [
      { id: "speak", mode: "speak", title: "พูดตาม", desc: "ฟังเสียงต้นแบบ แล้วพูดตาม ระบบช่วยเช็กเสียงให้คร่าว ๆ", status: "beta", badge: "ทดลอง · ไม่นับคะแนน", href: "/practice/speak" },
    ],
  },
];

/** เมนูหลังกรองแบบฝึกที่ยังไม่ผ่านตรวจ (ถ้า build รอบทดลอง) */
export function practiceMenu(): MenuGroup[] {
  return MENU.map((g) => ({ ...g, items: g.items.filter((i) => SHOW_DEMO || !UNREVIEWED.has(i.status)) })).filter((g) => g.items.length > 0);
}

export function groupMenuHref(group: HubGroup, cat?: number | null): string {
  return `/practice?group=${group}${cat ? `&cat=${cat}` : ""}`;
}

/** โหมดในหน้า /practice (ลิงก์เดิม ?mode=) อยู่ทักษะไหน — ออกจากแบบฝึกแล้วกลับเมนูทักษะนั้น */
export function groupOfStart(mode: string | null): HubGroup | null {
  if (mode === "listen") return "listen";
  if (mode === "read") return "read";
  if (mode === "order") return "write";
  return null;
}

// ---------- จำเมนูทักษะล่าสุด → ปุ่มกลับในหน้ากิจกรรม ----------

const MENU_KEY = "xh_practice_menu";

export function rememberPracticeMenu(url: string): void {
  try {
    sessionStorage.setItem(MENU_KEY, url);
  } catch {
    /* โหมดส่วนตัว/ปิด storage — ใช้ค่าสำรอง */
  }
}

function storedMenu(): string | null {
  try {
    return sessionStorage.getItem(MENU_KEY);
  } catch {
    return null;
  }
}

const noopSubscribe = () => () => {};

/** ลิงก์ "กลับเมนูฝึก": เมนูทักษะที่เพิ่งมา (ถ้าตรงทักษะ) ไม่งั้นเมนูของทักษะนั้น · ไม่ระบุทักษะ = เมนูล่าสุด หรือหน้าเลือกทักษะ */
export function usePracticeMenuHref(group?: HubGroup): string {
  const fallback = group ? groupMenuHref(group) : "/practice";
  return useSyncExternalStore(
    noopSubscribe,
    () => {
      const m = storedMenu();
      if (!m || !m.startsWith("/practice")) return fallback;
      return !group || m.includes(`group=${group}`) ? m : fallback;
    },
    () => fallback,
  );
}
