-- demo_mint.sql — ข้อมูลสาธิต 1 คน "มิ้นท์ (บัญชีสาธิต)" สำหรับเดินตารางหมวด 1 กับอาจารย์ (รอบ 7 · 8 ต.ค. 2569)
-- ไม่ใช่ migration (ไม่จดใน schema_migrations) · รันซ้ำได้ — ล้างของเดิมของมิ้นท์ก่อนทุกครั้ง
--   รัน:  python scripts/db_apply.py supabase/seed/demo_mint.sql
--   ลบ:  python scripts/db_apply.py supabase/seed/demo_mint_remove.sql     ← ทำก่อนเริ่มทดลองจริง
--
-- เส้นเรื่อง (ถามตัวเอง 3 ข้อทุกจังหวะ: มิ้นท์ทำอะไร · เกิดแถวที่ตารางไหน · ระบบรู้จากช่องไหน)
--   ① สมัคร + ตอบคำถามก่อนเริ่ม (ON-02)             → users 1 แถว
--   ② เปิดหมวด 1                                      → category_progress 1 แถว (status learning)
--   ③ เปิดคำ 你好 กดฟัง (ยังไม่ตรวจถูก/ผิด)           → sessions 1 แถว (practice) · attempts 1 แถว (exposure, word_id) · review_states 1 แถว (FSRS นัดทวน)
--   ④ กดเริ่มควิซหมวด 1                               → sessions 1 แถว (quiz · attempt_no DB เติม)
--   ⑤⑥ ตอบข้อฟัง 3 ข้อ: 谢谢 ถูก · 再见 ถูก · 对不起 ผิด → attempts 3 แถว (graded, item_id) · ข้อสอบอยู่ items 3 แถว (+ item_skills Q-matrix)
--   ⑦ จบควิซ 2/3                                      → sessions.status = done · score 2 / total 3
-- หมายเหตุ: ข้อสอบ 3 ข้อเป็นตัวอย่าง status = pending (ยังไม่ผ่านทีมตรวจ — RO-03) · cohort = team → ไม่ปนผลวิจัย (ME-02)
--           ตัวเลือกข้อฟังเป็นคำแปลไทย (❓ รอบอลเคาะ: คำแปลไทย หรือตัวจีน)

do $$
declare
  v_user   uuid := '00000000-0000-4000-8000-0000000a0001';   -- uuid คงที่ของบัญชีสาธิต (ไม่มีใน auth.users)
  v_prac   bigint;
  v_quiz   bigint;
  v_i1     bigint;
  v_i2     bigint;
  v_i3     bigint;
  v_listen bigint;
  v_vocab1 bigint;
begin
  -- 0) ล้างของเดิมของมิ้นท์ (attempts เป็น append-only — ปิด trigger ชั่วคราวเฉพาะตอนล้าง)
  alter table public.attempts disable trigger attempts_append_only;
  delete from public.attempts where user_id = v_user;
  alter table public.attempts enable trigger attempts_append_only;
  delete from public.review_states     where user_id = v_user;
  delete from public.category_progress where user_id = v_user;
  delete from public.sessions          where user_id = v_user;
  delete from public.items             where distractor_rationale->>'seed' = 'demo-mint';   -- item_skills หายตาม (cascade)
  delete from public.users             where id = v_user;

  select id into v_listen from public.skills where code = 'SKILL-LISTEN';
  select id into v_vocab1 from public.skills where code = 'VOCAB-C1';

  -- ① สมัคร → users
  insert into public.users (id, display_name, role, pdpa_consent_at, consent_version, target_level, self_level, cohort)
  values (v_user, 'มิ้นท์ (บัญชีสาธิต)', 'learner', now() - interval '30 minutes', 'demo', 1, 'cant_read', 'team');

  -- ② เปิดหมวด 1 → category_progress (คน × หมวด)
  insert into public.category_progress (user_id, category, started_at, words_learned, sentences_passed, quiz_best_score, status)
  values (v_user, 1, now() - interval '25 minutes', 1, 0, 2, 'learning');

  -- ③ เปิดคำ 你好 (id 147) กดฟัง → sessions (practice) + attempts (exposure · word_id · ไม่มีถูก/ผิด) + review_states (FSRS)
  insert into public.sessions (user_id, kind, category, mode, status, total, started_at)
  values (v_user, 'practice', 1, 'listen', 'done', 1, now() - interval '24 minutes')
  returning id into v_prac;

  insert into public.attempts (client_attempt_id, user_id, session_id, event_type, word_id, skill_id, generator, answer, is_correct, answered_at, time_spent_ms, app_version, context)
  values ('demo-mint-practice1-147', v_user, v_prac, 'exposure', 147, v_vocab1, 'flashcard', null, null, now() - interval '23 minutes', 9000, 'seed-demo', 'practice');

  insert into public.review_states (user_id, word_id, difficulty, stability, due, last_review, elapsed_days, scheduled_days, learning_steps, reps, lapses, state)
  values (v_user, 147, 5.0, 0.4, now() + interval '10 minutes', now() - interval '23 minutes', 0, 0, 1, 1, 0, 'learning');

  -- ⑤ ข้อสอบฟัง 3 ข้อของหมวด 1 (= ตาราง "Lis" ในรูปอาจารย์) — เจนจากคำ · ตัวลวงหมวดเดียวกัน ไม่ซ้ำเฉลย · V1 = เสียง · answer_key = ตัวล็อก
  insert into public.items (module, item_type, category, stem, audio_path, choices, answer_key, distractor_rationale, hsk_level, status)
  values ('listening', 'mcq', 1, 'ฟังแล้วเลือกความหมาย', 'words/241.mp3',
          '["ขอบคุณ","สวัสดี","ลาก่อน","ขอโทษ"]', '"ขอบคุณ"',
          '{"seed":"demo-mint","word_id":241,"note":"ข้อตัวอย่างสาธิต รอทีมตรวจ"}', 1, 'pending')
  returning id into v_i1;

  insert into public.items (module, item_type, category, stem, audio_path, choices, answer_key, distractor_rationale, hsk_level, status)
  values ('listening', 'mcq', 1, 'ฟังแล้วเลือกความหมาย', 'words/272.mp3',
          '["สวัสดี","ลาก่อน","ขอบคุณ","ขอโทษ"]', '"ลาก่อน"',
          '{"seed":"demo-mint","word_id":272,"note":"ข้อตัวอย่างสาธิต รอทีมตรวจ"}', 1, 'pending')
  returning id into v_i2;

  insert into public.items (module, item_type, category, stem, audio_path, choices, answer_key, distractor_rationale, hsk_level, status)
  values ('listening', 'mcq', 1, 'ฟังแล้วเลือกความหมาย', 'words/45.mp3',
          '["ขอโทษ","สวัสดี","ขอบคุณ","ลาก่อน"]', '"ขอโทษ"',
          '{"seed":"demo-mint","word_id":45,"note":"ข้อตัวอย่างสาธิต รอทีมตรวจ"}', 1, 'pending')
  returning id into v_i3;

  -- Q-matrix: ข้อนี้วัดทักษะอะไร (BK-02)
  insert into public.item_skills (item_id, skill_id) values
    (v_i1, v_listen), (v_i1, v_vocab1),
    (v_i2, v_listen), (v_i2, v_vocab1),
    (v_i3, v_listen), (v_i3, v_vocab1);

  -- ④ กดเริ่มควิซหมวด 1 → sessions (quiz · attempt_no ให้ DB เติม · finished_at เติมเองเมื่อ done)
  insert into public.sessions (user_id, kind, category, mode, status, total, score, started_at)
  values (v_user, 'quiz', 1, null, 'done', 3, 2, now() - interval '5 minutes')
  returning id into v_quiz;

  -- ⑤⑥ ตอบทีละข้อ → attempts 1 แถว/ข้อ (graded · item_id · context ต้องตรง sessions.kind)
  insert into public.attempts (client_attempt_id, user_id, session_id, event_type, item_id, skill_id, generator, answer, is_correct, answered_at, time_spent_ms, app_version, context)
  values
    ('demo-mint-quiz1-1', v_user, v_quiz, 'graded', v_i1, v_listen, 'listen_mc4', '"ขอบคุณ"', true,  now() - interval '4 minutes', 4200, 'seed-demo', 'quiz'),
    ('demo-mint-quiz1-2', v_user, v_quiz, 'graded', v_i2, v_listen, 'listen_mc4', '"ลาก่อน"', true,  now() - interval '3 minutes', 3800, 'seed-demo', 'quiz'),
    ('demo-mint-quiz1-3', v_user, v_quiz, 'graded', v_i3, v_listen, 'listen_mc4', '"สวัสดี"', false, now() - interval '2 minutes', 6100, 'seed-demo', 'quiz');
end $$;
