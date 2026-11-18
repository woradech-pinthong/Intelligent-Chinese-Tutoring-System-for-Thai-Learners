// โครง 5 หมวดเนื้อหา HSK1 (ทีมอนุมัติ 26 ก.ค. 2026) — id ตรงกับคอลัมน์ words.category ใน Supabase
// ที่มา: data/wordlist/REVIEW-หมวด300คำ.md · ยอดคำจริงนับจาก DB เสมอ (ไม่ hardcode)
import type { IconName } from "@/components/Icon";

export type Category = {
  id: number;
  name: string;
  desc: string; // "จบหมวดนี้แล้วทำอะไรเป็น" แบบสั้น
  icon: IconName;
};

export const CATEGORIES: Category[] = [
  { id: 1, name: "ทักทาย & คนรอบตัว", desc: "สวัสดี แนะนำตัว ครอบครัว เพื่อน", icon: "chat" },
  { id: 2, name: "ตัวเลข เวลา & วันที่", desc: "นับเลข บอกเวลา วัน เดือน ปี อายุ", icon: "clock" },
  { id: 3, name: "กิน ดื่ม & ซื้อของ", desc: "สั่งอาหาร ถามราคา จ่ายเงิน", icon: "bowl" },
  { id: 4, name: "เรียน ทำงาน & สื่อสาร", desc: "โรงเรียน ที่ทำงาน โทรศัพท์", icon: "briefcase" },
  { id: 5, name: "เดินทาง & ชีวิตประจำวัน", desc: "ถามทาง พาหนะ กิจวัตร อากาศ", icon: "compass" },
];

export function catName(id: number | null | undefined): string | undefined {
  return CATEGORIES.find((c) => c.id === id)?.name;
}
