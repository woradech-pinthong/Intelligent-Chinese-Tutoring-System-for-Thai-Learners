-- 001_create_words.sql — สร้างตารางคำศัพท์ (รันใน Supabase: SQL Editor → paste → Run)
-- ตาม docs/08_สเปค-พัฒนา/ARCHITECTURE.md §4

create table if not exists public.words (
  id bigint generated always as identity primary key,
  hanzi text not null unique,
  traditional text,
  pinyin text not null,
  pos text[] default '{}',
  meaning_en jsonb default '[]'::jsonb,          -- จาก CC-CEDICT/dataset (ตัวอ้างอิง — ใส่เครดิต CC BY-SA)
  meaning_th text,                               -- คำแปลไทย (AI draft → ทีมตรวจ)
  th_reviewed boolean not null default false,    -- true เมื่อทีมตรวจแล้วเท่านั้น
  hsk_level int not null check (hsk_level in (1, 2)),
  audio_path text,                               -- path ใน Supabase Storage (เติมตอน generate เสียง)
  wordlist_version text not null,                -- เช่น 'HSK3.0-v2026.07' (ช่วงเปลี่ยนผ่านต้อง version-stamp)
  created_at timestamptz not null default now()
);

-- RLS: ตารางเนื้อหา = อ่านสาธารณะ / เขียนได้เฉพาะ service role (ตาม ARCHITECTURE §4)
alter table public.words enable row level security;

drop policy if exists "public read words" on public.words;
create policy "public read words" on public.words for select using (true);
-- ไม่สร้าง policy insert/update/delete → client เขียนไม่ได้ · FastAPI ใช้ service role (ข้าม RLS)

create index if not exists idx_words_hsk_level on public.words (hsk_level);
