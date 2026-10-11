// ค่าตั้ง "ซ่อนพินอิน" — กลไก "หย่าพินอิน" (กฎ m1-6) · จำในเครื่อง (localStorage) · ค่าเริ่มต้น = โชว์พินอิน
// ตอนมีบัญชีผู้ใช้ (m7-1) ค่อยย้ายไปเก็บที่ users.pinyin_hidden (ดู docs/08_สเปค-พัฒนา/DATABASE-ER.md)
// ทุก component ที่ใช้ usePinyinHidden() อัปเดตพร้อมกันทันทีที่สลับ (ข้ามแท็บด้วย storage event)

import { useSyncExternalStore } from "react";

const KEY = "xh_pinyin_hidden";
const CHANGE_EVENT = "xh:pinyin-hidden-change"; // storage event ยิงเฉพาะแท็บอื่น → แท็บนี้ต้องแจ้งกันเอง

// ค่าที่ตั้งในแท็บนี้แต่เขียนลง storage ไม่สำเร็จ (โหมดส่วนตัว/storage เต็ม) — กดแล้วยังมีผลจนกว่าจะปิดแท็บ
let unsaved: boolean | null = null;

/** ตอนนี้ผู้เรียนตั้ง "ซ่อนพินอิน" ไว้ไหม · ฝั่ง server = false เสมอ */
export function isPinyinHidden(): boolean {
  if (typeof window === "undefined") return false;
  if (unsaved !== null) return unsaved;
  try {
    return window.localStorage.getItem(KEY) === "true";
  } catch {
    return false;
  }
}

export function setPinyinHidden(hidden: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, String(hidden));
    unsaved = null;
  } catch {
    unsaved = hidden;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) onChange(); // key null = มีคนล้าง storage ทั้งก้อน
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * [ซ่อนอยู่ไหม, ตั้งค่า] — ตอน SSR/hydrate ได้ false (โชว์) ก่อน แล้วค่อยเป็นค่าจริงหลัง mount
 * (useSyncExternalStore จัดการให้ ไม่มี hydration mismatch และไม่ต้อง setState ใน effect)
 */
export function usePinyinHidden(): [boolean, (hidden: boolean) => void] {
  const hidden = useSyncExternalStore(subscribe, isPinyinHidden, () => false);
  return [hidden, setPinyinHidden];
}
