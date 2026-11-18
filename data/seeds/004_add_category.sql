-- 004_add_category.sql — เปลี่ยนคอลัมน์หมวดเป็นเลข 1-5 (โครง 5 หมวด — ทีมอนุมัติ 26 ก.ค. 2026)
-- หมายเหตุ: DB มีคอลัมน์ category แบบ text เก่า (แท็กอังกฤษจากการทดลองยุคแรก ไม่มีโค้ดไหนใช้) → แปลงทิ้งแล้วใช้เลขหมวดใหม่จาก 002_seed_words.sql
-- 1=ทักทาย&คนรอบตัว · 2=ตัวเลข เวลา&วันที่ · 3=กิน ดื่ม&ซื้อของ · 4=เรียน ทำงาน&สื่อสาร · 5=เดินทาง&ชีวิตประจำวัน
-- รันซ้ำได้ · ที่มา: data/wordlist/REVIEW-หมวด300คำ.md
alter table public.words drop constraint if exists words_category_check;
alter table public.words alter column category type smallint
  using (case when category ~ '^[1-5]$' then category::smallint else null end);
alter table public.words add constraint words_category_check check (category between 1 and 5);
comment on column public.words.category is 'หมวดเนื้อหา 1-5 (โครงที่ทีมอนุมัติ 26 ก.ค. 2026) — null = ยังไม่จัด (เช่นคำ HSK2 ในอนาคต)';
