import { createClient } from "@supabase/supabase-js";

// ต่อ Supabase จากฝั่งเว็บด้วย anon key (public — ปลอดภัยที่จะอยู่ใน frontend)
// ตาราง words เปิดอ่านสาธารณะ (RLS: public read) → ดึงได้เลยไม่ต้องล็อกอิน
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// public URL ของไฟล์เสียงใน Storage (bucket 'audio')
export function audioUrl(path: string): string {
  return `${supabaseUrl}/storage/v1/object/public/audio/${path}`;
}

export type Word = {
  id: number;
  hanzi: string;
  pinyin: string;
  meaning_th: string;
  meaning_en: string[];
  th_reviewed: boolean;
  audio_path: string | null;
  hsk_level: number;
  category?: number | null; // หมวด 1-5 (โครงทีมอนุมัติ 26 ก.ค.)
};
