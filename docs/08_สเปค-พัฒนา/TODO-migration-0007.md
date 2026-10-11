---
tags: [ฐานข้อมูล, migration, ความปลอดภัย, รีวิว, TODO]
updated: 2026-10-12
---

# TODO migration 0007 — ผลรีวิว schema v1 หลังรันจริง (8 ต.ค. 2569)

> **ที่มา:** หลัง `20261007000005_schema_v1.sql` + `0006` รันจริงบน Supabase (8 ต.ค.) ส่ง AI รีวิวแบบอ่านไฟล์ 3 มุม (ความปลอดภัย · เข้ากับแอป · ช่องโหว่กฎ — ไม่ต่อ DB ไม่อ่าน .env) ได้ 23 ประเด็น → 6 ประเด็นที่ร้ายแรงสุดถูก "ผู้ตรวจค้าน" อ่านไฟล์ซ้ำเพื่อหักล้าง → **ยืนยันจริงทั้ง 6** (1 สูง · 5 กลาง) · อีก 17 ประเด็นยังไม่ได้ตรวจซ้ำ (ระดับกลาง/ต่ำ)
> **กติกา:** ไม่แก้ไฟล์ 0005 — ทุกอย่างในนี้ไปเป็น **migration 0007** (อาจารย์รอบ 7: แก้ DB = migration) · รอ**บอลเคาะ**ข้อที่เป็นการตัดสินใจเชิงออกแบบก่อน (ดู §0)
> **ข้อสังเกตของผู้ตรวจค้าน:** หลายข้อ "จริงที่ชั้น DB แต่ยังไม่มีทางเกิด" — วันนี้แอปยังเขียนลง localStorage ไม่มีล็อกอิน ไม่มี API /attempts/batch → ต้องปิดให้เสร็จ**ก่อน** m7-1 (ล็อกอิน) ไม่ใช่ตอนนี้ก็ได้ แต่ห้ามลืม

## §0 ข้อที่ต้องให้บอลเคาะก่อนเขียน 0007

| # | คำถาม | ทางเลือก | ผลต่อ 0007 |
|---|---|---|---|
| 1 | **ควิซท้ายหมวดตรวจที่ไหน** | (ก) server ตรวจผ่าน API `/attempts/batch` แล้วเขียน sessions.score เอง — client แค่เปิด/ปิดรอบ · (ข) client ตรวจเอง (ออฟไลน์) แล้ว DB มี trigger คำนวณ is_correct ซ้ำจาก answer_key | ยืนยัน #1 #3 · เลือก (ก) = ตัด grant insert/update คอลัมน์คะแนนออกจาก client · เลือก (ข) = ต้องเปิด answer_key ให้ client บางส่วน (ขัด MK-04) |
| 2 | **ข้อชุดวิจัย (pre/post) ซ่อนจากหน้าฝึกไหม** (PL-09 ①) | (ก) ข้อที่อยู่ใน exam_forms.research_use_only ห้ามโผล่ใน items_public และห้ามถูกตอบนอก pre/post · (ข) ปล่อย แต่ยอมรับว่า gain score ปนเปื้อน | ยืนยัน #2 #5 · (ก) = แก้ policy items_public_read + trigger กัน attempts |
| 3 | **ผู้เรียนเห็นผลรายข้อของ pre/post ไหม** (PL-07) | (ก) ไม่เห็น — attempts/sessions ของ pre/post อ่านไม่ได้จาก client เห็นแค่คะแนนรวมผ่าน API · (ข) เห็นคะแนนรวม+ผ่าน/ไม่ผ่าน แต่ไม่เห็นรายข้อ | ยืนยัน #6 · แก้ policy select ของ attempts/sessions |
| 4 | **เสียงข้อฟังใช้ไฟล์เดียวกับคำ** (`words/{id}.mp3`) | (ก) ยอมรับ (ผู้เรียนที่เปิดตาราง words เทียบ audio_path รู้เฉลยได้ — ต้องเป็นคนแกะ API) · (ข) คัดลอกเสียงไปชื่อใหม่ `items/{id}.mp3` ตอนอนุมัติข้อ | ยังไม่ตรวจซ้ำ (ความปลอดภัย #4) |


## §1 ยืนยันแล้ว 6 ประเด็น (ผู้ตรวจค้านอ่านไฟล์ซ้ำแล้วหักล้างไม่ได้)

### #1 Quiz results are fully client-writable: sessions.score/passed/status and attempts.is_correct for kind/context='quiz' (even after a session is done) — QZ-12/QZ-11 integrity rests on forgeable rows

- **มุม:** ความปลอดภัย · **ระดับ (ผู้ตรวจค้าน):** 🟠 กลาง · **ที่:** `20261007000005_schema_v1.sql:663`
- **หลักฐาน:** L663-668: sessions_insert_own / sessions_update_own allow kind='quiz' with no column restriction (status='done', score, total, passed, detail all free; L361 sessions_fill_finished_at even fills finished_at for a direct status='done' insert). L398-404: sessions_state_guard only blocks a status change out of a terminal state plus the identity columns, so `UPDATE sessions SET score=10` on a done quiz session passes. L674-679: attempts_insert_own accepts context='quiz' with client-chosen is_correct/skill_id/answered_at and does not require the session to be running. L466-469 + L473-493: category_progress.quiz_best_score / quiz_passed_at are documented as '[cache] จาก sessions kind=quiz (server เ…
- **เกิดอะไรถ้าไม่แก้:** Trial learner (cohort 'trial') takes her JWT from the app and the public anon key: POST /rest/v1/sessions {kind:'quiz',category:2,status:'done',score:10,total:10} → accepted; or she finishes quiz 2 with 5/10 and then PATCH /rest/v1/sessions?id=eq.N {score:10} → accepted because status did not change. She also POSTs ten attempts {context:'quiz',event_type:'graded',is_correct:true,item_id:…}. Whatever server job fills category_progress.quiz_best_score/quiz_passed_at from sessions/attempts marks category 2 passed → quiz 3 unlocks without passing quiz 2 (QZ-12 defeated), the forged attempts enter …
- **ผู้ตรวจค้านว่า:** Verified against supabase/migrations/20261007000005_schema_v1.sql (live on Supabase since 8 Oct). Minimal repro with any authenticated JWT + the public anon key (every trial learner will hold one): (1) POST /rest/v1/sessions {user_id:<own uid>, kind:'quiz', category:2, status:'done', score:10, total:10, passed:true} → sessions_insert_own (L665-666) only checks user_id and kind∈(quiz,practice,review); sessions_set_attempt_no fills attempt_no (L338-349); sessions_fill_finished_at fires BEFORE INSERT (L352-362) so CHECK sessions_done_has_finished (L326) passes; sessions_posttest_guard ignores kind=quiz (L369-387) → row accepted. (2) Or after an honest 5/10: PATCH /rest/v1/sessions?id=eq.N {scor…
- **ทางแก้ที่เสนอ (ร่าง 0007):**

```sql
Migration 0007 — quiz results become server-written like pre/post; client may only open/close its own round:

-- (ก) column-level: client cannot write result columns
revoke insert, update on public.sessions from anon, authenticated;
grant insert (user_id, kind, category, mode, started_at) on public.sessions to authenticated;
grant update (status, finished_at)                        on public.sessions to authenticated;

-- (ข) quiz attempts come only from POST /attempts/batch (service connection, grades against answer_key); client logs practice/review only, and only into a running round
drop policy attempts_insert_own on public.attempts;
create policy attempts_insert_own on public.attempts for insert
  with check (user_id = auth.uid() and context in ('practice','review')
    and (session_id is null or exists (select 1 from public.sessions s
           where s.id = session_id and s.user_id = auth.uid() and s.status = 'running')));

-- (ค) a finished round is immutable in every column, not just status
create or replace function public.sessions_state_guard() returns trigger language plpgsql as $$
begin
  if old.status <> 'running' then
    raise exception 'session % is % — terminal state, no changes (PL-10 §2.1)', old.id, old.status;
  end if;
  if new.user_id <> old.user_id or new.kind <> old.kind or new.attempt_no <> old.attempt_no
     or new.category is distinct from old.category or new.form_id is distinct from old.form_id then
    raise exception 'session %: user_id/kind/form_id/category/attempt_no are immutable', old.id;
  end if;
  return new;
end $$;

Code: the API writes score/total/passed when it marks the quiz done (same UPDATE, old.status='running'). If the team wants to keep the client-generated word quiz (buildQuizSet) offline, the alternative is a BEFORE INSERT trigger that recomputes is_correct server-side from `answer` vs items.answer_key / words for client-role rows — but that still needs (ก) and (ค). Web must select explicit sessions columns (as with items) once column grants exist.
```

### #2 PL-09 ① ไม่ได้ถูกบังคับ: ข้อในชุดวิจัย (research_use_only) อ่านได้สาธารณะและถูกตอบในควิซ/ฝึกได้

- **มุม:** ช่องโหว่กฎ · **ระดับ (ผู้ตรวจค้าน):** 🔴 สูง · **ที่:** `20261007000005_schema_v1.sql:718`
- **หลักฐาน:** 0005 บรรทัด 718 policy items_public_read กรองแค่ status='approved' · บรรทัด 720-724 column grant + view items_public ก็กรองแค่ approved · บรรทัด 674-679 attempts_insert_own ให้ client แทรก context quiz/practice บน item_id ใด ๆ ได้ · exam_forms.research_use_only (บรรทัด 195) เป็นแค่ธง ไม่มี trigger/policy ตัวไหนอ่านมัน · กฎ PL-09 ในกฎการทำงานระบบ-BUSINESS-RULES.md บรรทัด 35 เขียนว่า "schema รองรับแล้ว: research_use_only บังคับมาตรการ ①" ซึ่งไม่จริง · query-ตรวจสอบข้อมูล.sql บรรทัด 160-165 (query ⑦) จับการรั่วได้แค่หลังเกิดเหตุ
- **เกิดอะไรถ้าไม่แก้:** มิ้น (cohort trial) ทำ pre วันแรก ชุด HSK1-PREPOST-A 40 ข้อ (approved + research_use_only) → วันที่ 2-9 เธอทำควิซ/ฝึก — ทันทีที่หน้าควิซเริ่มดึงข้อจาก item bank ผ่าน items_public ตามหมวด (QZ-01) ข้อ 40 ข้อนั้นอยู่ใน pool ด้วย เพราะ DB ไม่รู้ว่า "ข้อนี้เป็นชุดวิจัย" → เธอเจอข้อเดิมซ้ำตลอด 10 วัน → post D10 คะแนนขึ้นเพราะจำข้อ (practice effect) ไม่ใช่เพราะเก่งขึ้น = ข้อโต้แย้งที่ PL-09 เองบอกว่าถ้าตอบไม่ได้ gain ทั้งเล่มถูกตั้งคำถาม · ซ้ำร้าย ใครมี anon key ก็ select stem, choices, audio_path จาก items_public ได้ทั้งคลังรวมข้อ pre/post (ไม่เห็นเฉลย แต่เห็นโจทย์+ฟังเสียงได้) · ทีมจะรู้ตอนรัน quer…
- **ผู้ตรวจค้านว่า:** Verified against the files; the finding stands, with one sub-claim downgraded and one timing caveat. Confirmed facts (supabase/migrations/20261007000005_schema_v1.sql): `research_use_only` exists only at line 195 and in the CHECK at line 200 (kind='pretest' → flag true); no policy, view, trigger or function anywhere in 0005 reads it (grep of form_items/exam_forms hits only the DDL, the frozen-form guards at 405-440, and the revokes at 728-729). Policy `items_public_read` (718) and view `items_public` (722-724) filter only `status='approved'`. `attempts_insert_own` (674-679) accepts any `item_id` for context practice/review/quiz, even with `session_id` null; `attempts_context_guard` (529-543)…
- **ทางแก้ที่เสนอ (ร่าง 0007):**

```sql
-- 0007: ข้อในชุดวิจัยห้ามโผล่ให้ client และห้ามถูกตอบนอกรอบ pre/post/mock (PL-09 ①)
-- ต้องเป็น security definer เพราะ form_items/exam_forms ถูก revoke จาก anon/authenticated แล้ว
create or replace function public.item_is_research(iid bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.form_items fi join public.exam_forms f on f.id = fi.form_id
                  where fi.item_id = iid and f.research_use_only);
$$;
drop policy if exists items_public_read on public.items;
create policy items_public_read on public.items for select
  using (status = 'approved' and not public.item_is_research(id));
create or replace view public.items_public with (security_invoker = true) as
  select id, module, item_type, category, stem, choices, audio_path, hsk_level, status, created_at
    from public.items where status = 'approved' and not public.item_is_research(id);
create or replace function public.attempts_research_guard() returns trigger
language plpgsql as $$
begin
  if new.item_id is not null and new.context not in ('pretest','posttest','mock')
     and public.item_is_research(new.item_id) then
    raise exception 'item % is in a research_use_only form — not allowed in context % (PL-09 ①)', new.item_id, new.context;
  end if;
  return new;
end $$;
drop trigger if exists attempts_research_guard on public.attempts;
create trigger attempts_research_guard before insert on public.attempts
  for each row execute function public.attempts_research_guard();
-- ผลพลอยได้: แถว "ข้อในชุดวิจัยที่หลุดไปโผล่ในควิซ/ฝึก" ของ query ⑦ จะเป็น 0 เชิงโครงสร้าง
```

### #3 คะแนนควิซ (sessions.score/passed) ฝั่ง client เขียนได้เต็ม — guard "server เท่านั้น" ของ QZ-12 จึงเป็นแค่เปลือก

- **มุม:** ช่องโหว่กฎ · **ระดับ (ผู้ตรวจค้าน):** 🟠 กลาง · **ที่:** `20261007000005_schema_v1.sql:666`
- **หลักฐาน:** บรรทัด 665-668 sessions_update_own ให้ client update ทุกคอลัมน์ของรอบ quiz/practice/review ของตัวเอง (รวม score, total, passed, score_total) — ต่างจาก users ที่ทำ column-level grant ไว้ (บรรทัด 655-657) · บรรทัด 398-404 sessions_state_guard ล็อกแค่ status/identity ไม่ล็อก score ของรอบที่ done แล้ว · บรรทัด 473-490 category_progress_guard ห้าม client ตั้ง quiz_passed/quiz_best_score แต่ค่าเหล่านี้ "server เขียนจาก sessions kind=quiz" (บรรทัด 468-469) ซึ่ง client ควบคุมได้ · บรรทัด 674-679 client แทรก attempts graded + item_id + is_correct=true ใน context quiz ได้ ทั้งที่ไม่เห็น answer_key (DATABASE-ER.md บรรทัด 415 บอกว่าข้อจากคลัง ควิซ/pre/post ต้องตรวจผ่าน API) · query ③ (query-ตรวจสอบข้อมู…
- **เกิดอะไรถ้าไม่แก้:** มิ้นตกควิซหมวด 1 สองรอบ อยากปลดล็อกควิซหมวด 2 (QZ-12) → เปิด DevTools ใช้ JWT ของตัวเอง: supabase.from('sessions').update({score:10,total:10,status:'done'}) บนรอบของตัวเอง (หรือแก้ score ของรอบที่ done ไปแล้วก็ได้ — state guard ไม่ดู score) → sessions บอกว่าผ่าน 10/10 → server ที่จะเขียน quiz_best_score/quiz_passed_at อ่านค่านี้ไปปลดล็อก → ตัวเลข "คะแนนเก็บ 50" ในเล่ม (query ③) และ PL-09 ④ "ตัวเลขชุดที่สองที่ไม่มี practice effect" ปลอมได้จากฝั่ง client ทั้งที่ comment บรรทัด 473 อ้างว่า client ตั้งเองไม่ได้ · ถึงไม่มีใครโกง: บั๊ก sync server-wins ผิดทิศก็ทับ score ของรอบที่จบแล้วได้เงียบ ๆ
- **ผู้ตรวจค้านว่า:** ยืนยันจากไฟล์จริง — หลักฐานไม่ได้อ่านผิด และไม่มีอะไรที่อื่นปิดทางไว้: (1) supabase/migrations/20261007000005_schema_v1.sql:661-668 — sessions_insert_own / sessions_update_own ให้ client (user_id = auth.uid()) แทรก/แก้แถว kind quiz|practice|review ได้ทุกคอลัมน์ ไม่มี revoke/grant ระดับคอลัมน์บน sessions (grep grant|revoke ทุก migration: มีแค่ users :655-657, items :719-721, และ revoke all ของ exam_forms/form_items/bkt_training_runs/approval_transfers :728-731) — ซึ่งรูปแบบ revoke เหล่านี้ + แอปสดอ่าน words ผ่าน anon โดย 0001 มีแค่ policy ยืนยันว่าตารางใหม่ได้ default grant ALL ให้ anon/authenticated ตามปกติของ Supabase (2) :395-409 sessions_state_guard เช็กแค่ status (ห้ามเปลี่ยนหลัง termina…
- **ทางแก้ที่เสนอ (ร่าง 0007):**

```sql
-- 0007: คะแนนรอบเป็นของ server · client แก้ได้แค่ status/finished_at/detail ของรอบฝึก/ทวน
revoke update on public.sessions from anon, authenticated;
grant update (status, finished_at, detail) on public.sessions to authenticated;
-- รอบควิซ (คะแนนทางการ QZ-11) สร้าง/ปิดจบ/คิดคะแนนผ่าน FastAPI (service role) ตาม DATABASE-ER "ข้อจากคลังตรวจผ่าน API"
drop policy if exists sessions_insert_own on public.sessions;
create policy sessions_insert_own on public.sessions for insert
  with check (user_id = auth.uid() and kind in ('practice','review') and form_id is null);
drop policy if exists sessions_update_own on public.sessions;
create policy sessions_update_own on public.sessions for update
  using (user_id = auth.uid() and kind in ('practice','review'))
  with check (user_id = auth.uid() and kind in ('practice','review'));
-- attempts ที่อ้าง item_id (ข้อจากคลัง) ให้ API เขียนหลังตรวจกับ answer_key เท่านั้น (MK-04) · client จดได้เฉพาะข้อปั้นสดจาก words/sentences
drop policy if exists attempts_insert_own on public.attempts;
create policy attempts_insert_own on public.attempts for insert
  with check (user_id = auth.uid() and context in ('practice','review') and item_id is null
    and (session_id is null or exists (select 1 from public.sessions s where s.id = session_id and s.user_id = auth.uid())));
-- ล็อกคะแนนของรอบที่จบแล้ว (ทุก role) — เพิ่มใน sessions_state_guard:
--   if old.status <> 'running' and (new.score, new.total, new.passed, new.score_listening, new.score_reading, new.score_total)
--      is distinct from (old.score, old.total, old.passed, old.score_listening, old.score_reading, old.score_total) then
--     raise exception 'session %: scores are immutable after %', old.id, old.status; end if;
-- ทางเลือกขั้นต่ำถ้ายังอยากให้ควิซอยู่ฝั่ง client ชั่วคราว: คง insert quiz ได้ แต่ revoke คอลัมน์คะแนนตามบรรทัดแรก และให้ trigger ตอน status→done คำนวณ score/total จาก count(attempts graded ใน session) แทนค่าที่ client ส่ง (ยังเหลือความเชื่อใจ is_correct ของข้อปั้นสด ซึ่งรับได้เพราะไม่ใช่คะแนนทางการ)
```

### #4 ไม่มีประตูอนุมัติที่ชั้น DB: attempts อ้างข้อที่ยังไม่ approved ได้ · รอบ pre/post อ้างชุด draft ได้ · ข้อในชุดแช่แข็งเปลี่ยน status หลุดได้ (CG-01/CG-02 + โฟลว์ §4.2)

- **มุม:** ช่องโหว่กฎ · **ระดับ (ผู้ตรวจค้าน):** 🟠 กลาง · **ที่:** `20261007000005_schema_v1.sql:501`
- **หลักฐาน:** บรรทัด 495-518 attempts.item_id เป็น FK เฉย ๆ ไม่ดู items.status · บรรทัด 324-326 รอบ pretest/posttest ต้องมี form_id แต่ exam_forms.status/published_at (บรรทัด 194-196) ไม่ถูกตรวจเลย — เปิด pre บนชุด draft ที่มีข้อ pending ได้ · บรรทัด 431-443 items_frozen_in_form เทียบ stem/choices/answer_key/audio/type/module แต่ไม่เทียบ status → ข้อในชุดที่แช่แข็งถูกตั้ง rejected/suspended ได้ · บรรทัด 446-460 items_approver_guard ตรวจแค่ว่าใครกดอนุมัติ · โฟลว์ผู้ใช้-สิทธิ์แอดมิน.md บรรทัด 158 "แก้ข้อที่อนุมัติแล้ว = สถานะเด้งกลับรออนุมัติอัตโนมัติ" ไม่มี trigger ใดทำ · หลักฐานว่ารั่วจริง: supabase/seed/demo_mint.sql บรรทัด 60-94 แทรก attempts graded บนข้อ status='pending' ผ่านได้ และ query ⑦ (query-ตรวจ…
- **เกิดอะไรถ้าไม่แก้:** มิ้นเป็นคนแรกของกลุ่มที่ทำ pre; บอลเปิดชุด HSK1-PREPOST-A ทั้งที่หฤทัยตรวจไม่ครบ (5 ข้อยัง pending, exam_forms.status ยัง draft) → DB รับ session + attempts ปกติ → แค่มี session แถวเดียว ชุดก็แช่แข็ง (บรรทัด 416) → 2 วันต่อมาหฤทัยพบข้อ 17 เฉลยผิด: แก้ stem/answer_key ไม่ได้แล้ว แต่เปลี่ยน status เป็น rejected ได้ (trigger ไม่ดู status) → endpoint post ที่กรอง approved เสิร์ฟ 39 ข้อ ขณะ pre ของมิ้นมี 40 → pre กับ post ไม่ใช่เครื่องมือเดียวกัน · ออก version ใหม่ก็ไม่ช่วย เพราะ posttest guard (บรรทัด 384-385) บังคับ form_id ต้องเท่ากับ pre → gain ของมิ้นและทุกคนที่ทำ pre ไปแล้วต้องตัดข้อ 17 ด้วยม…
- **ผู้ตรวจค้านว่า:** Narrowed but real at the DB layer. Minimal repro (service role, e.g. via scripts/db_apply.py — the only live write path today): (1) insert into exam_forms (code,version,name_th,kind,research_use_only) values ('HSK1-PREPOST-A',1,'x','pretest',true) → status defaults 'draft', published_at null; (2) insert into form_items rows pointing at items with status='pending'; (3) insert into sessions (user_id,kind,form_id) values (<mint>,'pretest',<fid>) → accepted (0005 line 325 only requires non-null form_id; exam_forms.status is never read by any trigger/constraint/policy/code anywhere in the repo); (4) insert into attempts (… event_type='graded', item_id=<pending item>, context='pretest') → accepted…
- **ทางแก้ที่เสนอ (ร่าง 0007):**

```sql
-- 0007: ประตูอนุมัติ (CG-01/CG-02/RO-03/โฟลว์ §4.2) ที่ชั้น DB — ทุก role
create or replace function public.attempts_item_approved_guard() returns trigger
language plpgsql as $$
begin
  if new.item_id is not null and not exists (select 1 from public.items i where i.id = new.item_id and i.status = 'approved') then
    raise exception 'item % is not approved — attempt rejected (CG-02)', new.item_id;
  end if;
  return new;
end $$;
drop trigger if exists attempts_item_approved_guard on public.attempts;
create trigger attempts_item_approved_guard before insert on public.attempts
  for each row execute function public.attempts_item_approved_guard();

-- รอบ pre/post/mock ต้องอ้างชุดที่ approved + published และทุกข้อในชุด approved
create or replace function public.sessions_form_ready_guard() returns trigger
language plpgsql as $$
begin
  if new.kind in ('pretest','posttest','mock') then
    if not exists (select 1 from public.exam_forms f where f.id = new.form_id and f.status = 'approved' and f.published_at is not null) then
      raise exception 'exam_form % must be approved + published before a % session', new.form_id, new.kind;
    end if;
    if exists (select 1 from public.form_items fi join public.items i on i.id = fi.item_id
                where fi.form_id = new.form_id and i.status <> 'approved') then
      raise exception 'exam_form % still contains non-approved items', new.form_id;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists sessions_form_ready_guard on public.sessions;
create trigger sessions_form_ready_guard before insert on public.sessions
  for each row execute function public.sessions_form_ready_guard();

-- items_frozen_in_form: เพิ่มเงื่อนไข — ถ้าอยู่ในชุดแช่แข็งและ old.status='approved' แล้ว new.status ต่างออกไป → raise (ต้องออก version ใหม่)
-- trigger ใหม่ items_edit_resets_approval (before update of stem, choices, answer_key, audio_path, item_type, module):
--   ถ้า old.status='approved' และเนื้อข้อเปลี่ยน และผู้แก้ไม่ใช่ approver/ผู้รับโอนสิทธิ์ → new.status := 'pending'; new.approved_by := null; new.approved_at := null
-- หมายเหตุ: demo_mint.sql ต้องปรับให้ข้อสาธิตเป็น approved (approved_by = uuid หฤทัย) ไม่งั้น seed จะถูก guard นี้ปฏิเสธ — ซึ่งคือพฤติกรรมที่ต้องการ
```

### #5 Pre/post (research_use_only) items are readable by anyone through items_public / items_public_read — closing form_items hides only membership, not the questions

- **มุม:** ความปลอดภัย · **ระดับ (ผู้ตรวจค้าน):** 🟠 กลาง · **ที่:** `20261007000005_schema_v1.sql:722`
- **หลักฐาน:** L718 policy items_public_read and L722-725 view items_public filter only on status='approved'. Pre/post items are ordinary approved items referenced by form_items (L234-240), so their stem/choices/audio_path/category are served to the anon role. L728-729 revoke exam_forms/form_items — the design intent is explicit in DATABASE-ER.md L412 / ARCHITECTURE.md L227 ('ถ้าเปิดอ่าน ผู้ทดลองจะรู้ว่าชุด post มีข้อไหน · เสิร์ฟผ่าน endpoint ที่เช็ก locked_until เท่านั้น') and PL-09 ① (rulebook L35: keep pre/post items out of the learner's reach because of practice effect; DATABASE-ER.md L521-523). With ~145 items in the bank (CG-06) and the whole bank listable, the learner does not need to know which one…
- **เกิดอะไรถ้าไม่แก้:** A trial learner (or anyone with the anon key, which ships in the Vercel bundle) calls GET /rest/v1/items_public?select=* once during the 10-day trial, gets every approved item including the 40-item pretest/posttest form with stems, choices and audio, and reviews them before the posttest (answers for listening/vocab items derivable from the public words table). locked_until in the serving endpoint protects nothing; the post score inflates for reasons unrelated to the app → the gain score that the whole report rests on is invalid and the committee question PL-09 was written to answer cannot be a…
- **ผู้ตรวจค้านว่า:** Confirmed by static review. Minimal reproduction: supabase/migrations/20261007000005_schema_v1.sql L641 enables RLS on items; L718 policy items_public_read uses only `status = 'approved'`; L720-721 grant column-level SELECT (stem, choices, audio_path, ...) on items to anon/authenticated; L722-725 create view items_public (security_invoker) with the same filter and grant it to anon/authenticated. A grep for "research" in the migration hits only exam_forms (L195, L200) — nothing on items distinguishes research-form items, and no trigger/policy excludes them. Pre/post items are ordinary items rows (L234-240 form_items.item_id -> items; L200 forces pretest forms to research_use_only; L325 pre/po…
- **ทางแก้ที่เสนอ (ร่าง 0007):**

```sql
Migration 0007 — flag research items on items (cache maintained from form_items × exam_forms.research_use_only) and exclude them from the client row filter:

alter table public.items add column if not exists research_only boolean not null default false;  -- [cache]
create or replace function public.refresh_item_research_only() returns trigger language plpgsql as $$
begin
  update public.items i
     set research_only = exists (select 1 from public.form_items fi join public.exam_forms f on f.id = fi.form_id
                                  where fi.item_id = i.id and f.research_use_only)
   where i.id in (coalesce(new.item_id, -1), coalesce(old.item_id, -1));
  return null;
end $$;
create trigger form_items_research_flag after insert or update or delete on public.form_items
  for each row execute function public.refresh_item_research_only();
create or replace function public.refresh_form_research_only() returns trigger language plpgsql as $$
begin
  update public.items i
     set research_only = exists (select 1 from public.form_items fi join public.exam_forms f on f.id = fi.form_id
                                  where fi.item_id = i.id and f.research_use_only)
   where i.id in (select item_id from public.form_items where form_id = new.id);
  return null;
end $$;
create trigger exam_forms_research_flag after update of research_use_only on public.exam_forms
  for each row execute function public.refresh_form_research_only();
update public.items i set research_only = exists (select 1 from public.form_items fi join public.exam_forms f on f.id = fi.form_id where fi.item_id = i.id and f.research_use_only);

drop policy items_public_read on public.items;
create policy items_public_read on public.items for select using (status = 'approved' and not research_only);
grant select (research_only) on public.items to anon, authenticated;
create or replace view public.items_public with (security_invoker = true) as
  select id, module, item_type, category, stem, choices, audio_path, hsk_level, status, created_at
    from public.items where status = 'approved' and not research_only;

The API (postgres connection) still sees research items and serves pre/post after checking locked_until. item_skills stays public (Q-matrix only, no content).
```

### #6 Learner can read per-item pre/post results (attempts.is_correct/answer) and the pretest verdict columns — PL-07/PL-09 ③ 'ไม่เฉลยรายข้อใน pre' is enforced only in the UI

- **มุม:** ความปลอดภัย · **ระดับ (ผู้ตรวจค้าน):** 🟠 กลาง · **ที่:** `20261007000005_schema_v1.sql:672`
- **หลักฐาน:** L672 attempts_select_own: using (user_id = auth.uid()) with no context filter → rows with context 'pretest'/'posttest' (item_id, answer, is_correct) are readable by the learner. L661 sessions_select_own exposes every column of the learner's pretest session including passed, score_listening, score_reading, score_total, detail. Policy: นโยบาย-post-test-PL10.md L61 (pre result page: 'ไม่มีคำว่าถึง/ไม่ถึงเกณฑ์ · ไม่เฉลยรายข้อ (PL-07)'), rulebook L35 PL-09 ③ ('ไม่เฉลย/ไม่บอกคะแนนรายข้อใน pre — บังคับให้จริง'), and PL-09 pre=post same form. The per-item correctness is exactly the information that makes repeating the same form inflate the score.
- **เกิดอะไรถ้าไม่แก้:** Right after the pretest the learner calls GET /rest/v1/attempts?context=eq.pretest&is_correct=eq.false&select=item_id,answer with her JWT → the list of items she missed; she cross-references items_public (stem/choices) and words to learn the right answers to precisely the items the posttest reuses, and reads sessions.passed although the result page must not state pass/fail. Targeted memorisation of missed items → post gain overstated; the countermeasure the team promised the committee (PL-09 ③) is not actually enforced anywhere.
- **ผู้ตรวจค้านว่า:** Evidence is read correctly and nothing else blocks it. supabase/migrations/20261007000005_schema_v1.sql L672 `attempts_select_own … using (user_id = auth.uid())` has no `context` filter, and L661 `sessions_select_own` exposes every column (incl. `passed`, `score_*`, `detail`). The only column-level revokes/grants in 0005 are on users (L655-657), items (L719-725) and exam_forms/form_items/bkt_training_runs/approval_transfers (L728-731); 0006 adds no grants/policies. Default Supabase grants to anon/authenticated demonstrably exist (0001 `words` has only a policy and the web reads it with the anon key — vault 2026-10-08 L50 smoke test), so `attempts`/`sessions` are reachable over PostgREST. Tri…
- **ทางแก้ที่เสนอ (ร่าง 0007):**

```sql
Migration 0007 — pre/post evidence is served only by the API, never by PostgREST:

drop policy attempts_select_own on public.attempts;
create policy attempts_select_own on public.attempts for select
  using (user_id = auth.uid() and context not in ('pretest','posttest'));

-- verdict columns of a round are not readable directly; the pre/post result endpoint decides what to show
revoke select on public.sessions from anon, authenticated;
grant select (id, user_id, kind, form_id, category, mode, attempt_no, started_at, finished_at, status, total, score)
  on public.sessions to authenticated;   -- passed / score_listening / score_reading / score_total / detail → API only

Web: select explicit sessions columns (select('*') will be refused, same pattern as items). The offline outbox never needs to read pre/post attempts back (pre/post are online via the API).
```

## §2 ยังไม่ได้ตรวจซ้ำ 17 ประเด็น (ระดับกลาง/ต่ำ — อ่านแล้วตัดสินเอง หรือส่งตรวจซ้ำรอบหน้า)

| # | มุม | ระดับ | ประเด็น | ที่ | ทางแก้ย่อ |
|---|---|---|---|---|---|
| 7 | ความปลอดภัย | 🟠 กลาง | Listening items reuse words/{id}.mp3 as audio_path, so the public words table reveals the correct answer of every listening item even though answer_key is hidde… | `demo_mint.sql:61` | Enforce opaque audio names for bank items in 0007 and change the item generator before the bank is built: alter table public.items add constraint items_audio_opaque check (audio_path is null or audio_path !~ '^words/'); … |
| 8 | เข้ากับแอป | 🟠 กลาง | POST /words/{id}/review (used by the flashcards review mode) updates only th_reviewed, so the new words.review_status / reviewed_at drift from day one | `main.py:85` | Migration 0007 (and update er-drawio.sql in the same commit): alter table public.words alter column review_status set default 'pending'; update public.words set review_status = case when th_reviewed then 'approved' else … |
| 9 | เข้ากับแอป | 🟠 กลาง | Quiz is generated, graded and unlocked entirely on the client, but 0005 makes the QZ-12 columns in category_progress server-only and no server grader exists | `page.tsx:151` | Migration 0007: make the guard role-based (works for RPC helpers, PostgREST still runs as anon/authenticated) and add an RPC that derives the result from DB rows instead of trusting client numbers: create or replace func… |
| 10 | เข้ากับแอป | 🟠 กลาง | Pre-test / mock-test ship their answer keys in the JS bundle and save to localStorage; 0005 forbids any client path for pretest/posttest and no API endpoint exi… | `page.tsx:67` | Code (FastAPI, service connection, verify the Supabase JWT and take user_id from it — ARCHITECTURE.md:230): `POST /pretest/start` inserts sessions(kind='pretest', form_id) and returns `select i.id, i.module, i.item_type,… |
| 11 | เข้ากับแอป | 🟠 กลาง | Local practice/quiz logs have no client_attempt_id, no per-answer rows and no outbox, so the planned import into append-only attempts loses data or duplicates i… | `quiz.ts:8` | Code change now, before more local data accumulates (no SQL needed): write the outbox shape from today — in quiz.ts QuizItemLog add `client_attempt_id: crypto.randomUUID()`, `answered_at`, `time_spent_ms`, `word_id ¦ sen… |
| 12 | เข้ากับแอป | 🟠 กลาง | 0005 hides answer_key for ALL items, contradicting the documented offline-grading plan for practice items; the moment practice/quiz switch from words to items t… | `20261007000005_schema_v1.sql:720` | Team decision first (PL-09 ① vs offline-first). If practice items may carry keys, migration 0007 exposes them only for approved items that are not in any research/pretest form, leaving items_public and MK-04 untouched: c… |
| 13 | ช่องโหว่กฎ | 🟠 กลาง | ON-01/ON-05 ไม่ได้ถูกบังคับ: DB เก็บ log ของคนที่ยังไม่ให้/ถอน consent แล้วได้ และคนที่ถอนแล้วยังแก้ display_name กลับได้ | `20261007000005_schema_v1.sql:674` | -- 0007: ไม่มี consent ที่ยังมีผล = DB ไม่รับ log (ON-01/ON-05) — ทุก role create or replace function public.user_may_log(uid uuid) returns boolean language sql stable security definer set search_path = public as $$ sele… |
| 14 | ช่องโหว่กฎ | 🟠 กลาง | category_progress ไม่ได้ถูกเติมจาก sessions จริง และ status/quiz_passed เดินถอยหลังหรือถูกลบได้ (QZ-12 / PL-10 §2.2) | `20261007000005_schema_v1.sql:690` | -- 0007: cache คน×หมวด ให้ DB ดูแลจาก sessions (เหมือน categories.word_count) · ใช้คู่กับ finding #2 (sessions.score ต้องเชื่อได้ก่อน) create or replace function public.refresh_category_progress_quiz() returns trigger la… |
| 15 | ช่องโหว่กฎ | 🟠 กลาง | BK-02 ไม่ได้ถูกบังคับ: อนุมัติข้อที่ไม่มีแถว Q-matrix ได้ และ attempts แบบ graded มี skill_id = null ได้ → BKT มองไม่เห็น | `20261007000005_schema_v1.sql:449` | -- 0007: อนุมัติได้ต่อเมื่อมี Q-matrix ≥1 (BK-02) · attempts ที่ตรวจได้ต้องมี KC -- ใน items_approver_guard เพิ่มก่อน return new: -- if new.status = 'approved' and not exists (select 1 from public.item_skills k where k.i… |
| 16 | ช่องโหว่กฎ | 🟠 กลาง | client สร้างรอบที่อ้าง form_id ได้ → แช่แข็งชุดวิจัยจากฝั่งผู้เรียน · การแช่แข็งนับรอบ abandoned/บัญชีทีม · sessions ไม่มี idempotency key (OF-01) → retry ได้รอ… | `20261007000005_schema_v1.sql:416` | -- 0007 alter table public.sessions add column if not exists client_session_id text unique; -- OF-01 เหมือน attempts · API ใช้ insert … on conflict (client_session_id) do nothing returning id -- policy sessions_insert_ow… |
| 17 | ความปลอดภัย | 🟢 ต่ำ | items_approver_guard fires only on UPDATE OF status: INSERT with status='approved' and later edits of approved_by/approved_at bypass RO-03 (INSERT part already … | `20261007000005_schema_v1.sql:616` | create or replace function public.items_approver_guard() returns trigger language plpgsql as $$ begin if new.status = 'approved' and (tg_op = 'INSERT' or new.status is distinct from old.status or new.approved_by is disti… |
| 18 | ความปลอดภัย | 🟢 ต่ำ | roadmap_state remains anon-writable with USING(true) and no WITH CHECK, and 0005 added updated_by that any anonymous caller can set to any user's uuid (RO-04, k… | `20260712000003_roadmap_state.sql:21` | Interim (does not break the still-anonymous /roadmap page): drop policy "roadmap_state public insert" on public.roadmap_state; create policy "roadmap_state public insert" on public.roadmap_state for insert with check (up… |
| 19 | ความปลอดภัย | 🟢 ต่ำ | attempts.client_attempt_id is globally unique while the API is specified to INSERT … ON CONFLICT DO NOTHING — another user can pre-occupy ids and silently suppr… | `20261007000005_schema_v1.sql:497` | alter table public.attempts drop constraint attempts_client_attempt_id_key; alter table public.attempts add constraint attempts_user_client_attempt_uq unique (user_id, client_attempt_id); -- API: insert … on conflict (us… |
| 20 | เข้ากับแอป | 🟢 ต่ำ | No breaking change found: every live query/write of the web app, the FastAPI service and the demo seed is still valid after 0005/0006 | `supabase.ts:15` | No migration 0007 change needed for the live paths. Keep `supabase/seed/demo_mint.sql` as the regression check: it exercises users, category_progress, sessions, attempts (exposure + graded), items, item_skills and review… |
| 21 | เข้ากับแอป | 🟢 ต่ำ | ts-fsrs Card stored by the client does not fit review_states: state is a numeric enum and Card carries last_elapsed_days | `fsrs.ts:25` | Either a mapping layer in fsrs.ts (`const STATE_TEXT = ['new','learning','review','relearning'] as const; state: STATE_TEXT[card.state]`, inverse on read, and strip last_elapsed_days), or migration 0007 makes the table m… |
| 22 | เข้ากับแอป | 🟢 ต่ำ | Quiz 'write' answers reference sentence ids from a TypeScript file while attempts.sentence_id has an FK to the empty sentences table | `page.tsx:147` | Migration 0007 (after หฤทัย's CG-03 review) seeds sentences with explicit ids equal to sentences.ts so the client ids stay valid, then the client should read `sentences` (status='approved') instead of the TS file: insert… |
| 23 | ช่องโหว่กฎ | 🟢 ต่ำ | words.review_status ถูกเพิ่มแต่ไม่ได้ต่อสาย: policy อ่านยังเปิดหมด · API/seed ยังเขียน th_reviewed · word_count นับทุกสถานะ (CG-01) | `20261007000005_schema_v1.sql:56` | -- 0007: th_reviewed เป็นเงาของ review_status · เสิร์ฟ/นับเฉพาะ approved alter table public.words alter column review_status set default 'pending'; update public.words set review_status = case when th_reviewed then 'appr… |

### รายละเอียดข้อ 7–23

**#7 Listening items reuse words/{id}.mp3 as audio_path, so the public words table reveals the correct answer of every listening item even though answer_key is hidden** (`demo_mint.sql:61`)
- หลักฐาน: demo_mint.sql L61/L67/L73 (applied to the live DB per vault 2026-10-08 L51): audio_path 'words/241.mp3' with answer_key '"ขอบคุณ"' — 241 is the words.id whose meaning_th is the answer; scripts/generate_audio.py L83-84 fixes the convention words/{id}.mp3 and apps/web/src/lib/supabase.ts L10-13 builds public URLs on a public bucket. words is public-read (20260707000001_words.sql L24) and items_public exposes audio_path (schema_v1 L723); the pre/post endpoint must also send audio_path to play the c…
- เกิดอะไร: During a quiz or the pre/posttest the learner opens the Network tab, sees …/audio/words/241.mp3, calls GET /rest/v1/words?id=eq.241&select=meaning_th → 'ขอบคุณ' and picks it without listening. Every listening item in the bank is answerable this way; PL-05 uses the listening part of the pretest to place learners (module 0 vs category 1) and the listening section is a whole part of the pre/post, so …
- ทางแก้: Enforce opaque audio names for bank items in 0007 and change the item generator before the bank is built: alter table public.items add constraint items_audio_opaque check (audio_path is null or audio_path !~ '^words/'); Code: when an item is created from a word, copy/encode the clip to items/<item_id>-<8 random hex>.mp3 (same public bucket is fine) or, for research forms, store under a private bucket and let the pre/post endpoint return short-lived signed URLs. Update demo_mint.sql to use the ne…

**#8 POST /words/{id}/review (used by the flashcards review mode) updates only th_reviewed, so the new words.review_status / reviewed_at drift from day one** (`main.py:85`)
- หลักฐาน: main.py:84-86 runs `update public.words set meaning_th = %s, th_reviewed = %s where id = %s` and nothing else; it is called from the live UI apps/web/src/app/(app)/flashcards/page.tsx:117-121 (review mode at :346-371). 0005:56 adds review_status WITHOUT a default, 0005:63 backfills it exactly once (`approved` if th_reviewed else `pending`), and reviewed_by/reviewed_at (0005:57-58) are never written by any code. docs/08_สเปค-พัฒนา/er-drawio.sql:35-36 declares th_reviewed as "backward-compat" and …
- เกิดอะไร: หฤทัย opens /flashcards?review=1 and presses "คำแปลถูก" on 本 → DB row becomes th_reviewed=true, review_status='pending', reviewed_at NULL. When the m7-2 admin queue or any content filter uses `review_status = 'approved'` the word is listed as unreviewed (or hidden from learners), while the flashcards badge (flashcards/page.tsx:351-357) still says "ตรวจแล้ว". The reverse happens once the admin page…
- ทางแก้: Migration 0007 (and update er-drawio.sql in the same commit): alter table public.words alter column review_status set default 'pending'; update public.words set review_status = case when th_reviewed then 'approved' else 'pending' end where review_status is null; alter table public.words alter column review_status set not null; create or replace function public.words_sync_review_flags() returns trigger language plpgsql as $$ begin if tg_op = 'INSERT' then if new.th_reviewed then new.review_status…

**#9 Quiz is generated, graded and unlocked entirely on the client, but 0005 makes the QZ-12 columns in category_progress server-only and no server grader exists** (`page.tsx:151`)
- หลักฐาน: Questions are built client-side from words (quiz/page.tsx:567-613 buildQuizSet), graded client-side (gradeOf :137-141), the result goes only to localStorage (finish :143-156 → lib/quiz.ts:40-48 saveAttempt) and the lock is computed from localStorage (lib/quiz.ts:72-76 quizUnlocked, used at learn/category/page.tsx:32). 0005:474-493 category_progress_guard raises for the client role whenever status='quiz_passed', quiz_passed_at or quiz_best_score is set, and is_client_role() (0005:29-32) is true f…
- เกิดอะไร: m3-2 is implemented the obvious way: after มิ้น scores 8/10 on หมวด 1 the client runs `supabase.from('category_progress').upsert({user_id, category: 1, quiz_best_score: 8, quiz_passed_at, status: 'quiz_passed'})` → 400 "category_progress.status=quiz_passed is set by the server only (QZ-12)" → ควิซหมวด 2 never unlocks on any device. The likely workaround (keep quizUnlocked on localStorage) means th…
- ทางแก้: Migration 0007: make the guard role-based (works for RPC helpers, PostgREST still runs as anon/authenticated) and add an RPC that derives the result from DB rows instead of trusting client numbers: create or replace function public.is_client_role() returns boolean language sql stable as $$ select current_user in ('anon', 'authenticated'); $$; create or replace function public.finish_quiz(p_session_id bigint) returns public.category_progress language plpgsql security definer set search_path = pub…

**#10 Pre-test / mock-test ship their answer keys in the JS bundle and save to localStorage; 0005 forbids any client path for pretest/posttest and no API endpoint exists** (`page.tsx:67`)
- หลักฐาน: pretest/page.tsx:67 `savePretest(r)` writes localStorage key xh_pretest_v1 (mockData.ts:148-169); mock-test/page.tsx:41 `saveMockTest(gradePretest(answers))`. The keys are in the client bundle: mockData.ts:97-138 PRETEST_QUESTIONS carry `answer:` indexes and gradePretest (:203-222) grades on the client. 0005 blocks the client everywhere the real flow needs to write: sessions_insert_own allows only kind quiz/practice/review (0005:662-664), attempts_insert_own only context practice/review/quiz (00…
- เกิดอะไร: m5-1 goes live by swapping savePretest for `supabase.from('sessions').insert({kind: 'pretest', form_id: 1})` → 42501 "new row violates row-level security policy for table sessions"; the dev then tries `from('exam_forms').select()` to find the form → "permission denied for table exam_forms". The pre-test cannot be recorded from the client at all, and until the keys leave the bundle PL-07/PL-09 are …
- ทางแก้: Code (FastAPI, service connection, verify the Supabase JWT and take user_id from it — ARCHITECTURE.md:230): `POST /pretest/start` inserts sessions(kind='pretest', form_id) and returns `select i.id, i.module, i.item_type, i.stem, i.choices, i.audio_path from form_items fi join items i on i.id = fi.item_id where fi.form_id = %s order by fi.position` (no answer_key); `POST /pretest/submit` grades server-side, inserts attempts with `on conflict (client_attempt_id) do nothing` and context 'pretest', …

**#11 Local practice/quiz logs have no client_attempt_id, no per-answer rows and no outbox, so the planned import into append-only attempts loses data or duplicates it** (`quiz.ts:8`)
- หลักฐาน: QuizItemLog is {skill, ref, correct} (quiz.ts:8-12) with a single `ts` per quiz (:14-20); practice and match store only aggregates Round {ts, mode, total, correct} (progress.ts:7-12, written at practice/page.tsx:109 and match/page.tsx:126). attempts requires one row per answer with client_attempt_id NOT NULL UNIQUE (0005:497), answered_at, context, event_type and a target via CHECK attempts_has_target (0005:512), plus time_spent_ms (0005:509); the append-only trigger (0005:525-526) means a bad u…
- เกิดอะไร: During the 10-day trial มิ้น does 6 practice rounds and 3 quizzes before login ships. At first sign-in the importer has no per-item rows for the 6 rounds (Round holds totals only) → they are dropped, so BKT never sees them. For the 3 quizzes it must mint client_attempt_id at upload time; the phone loses signal mid-upload, the retry mints new UUIDs and the 30 answers are inserted twice (the unique …
- ทางแก้: Code change now, before more local data accumulates (no SQL needed): write the outbox shape from today — in quiz.ts QuizItemLog add `client_attempt_id: crypto.randomUUID()`, `answered_at`, `time_spent_ms`, `word_id | sentence_id`, `generator` ('listen_mc4' | 'read_mc4' | 'order'), `context: 'quiz'`; in practice/page.tsx and match/page.tsx log each answer the same way instead of only saveRound totals (keep Round for the UI). For data that already exists, make the importer deterministic so retries…

**#12 0005 hides answer_key for ALL items, contradicting the documented offline-grading plan for practice items; the moment practice/quiz switch from words to items there is no way to grade** (`20261007000005_schema_v1.sql:720`)
- หลักฐาน: 0005:719-725: `revoke all on public.items from anon, authenticated`, a column grant that excludes answer_key/distractor_rationale, and view items_public without answer_key — regardless of whether the item belongs to a research form. ARCHITECTURE.md:110 says is_correct is "ตรวจ rule ฝั่ง client ได้เพราะ items_cache มีเฉลย" and :229 distinguishes "ข้อฝึก/ทวนเสิร์ฟพร้อมเฉลยได้" from Mock Exam items served "ตัด answer_key"; BUSINESS-RULES MK-04 (line 117) scopes the key-stripping to mock. The quiz p…
- เกิดอะไร: m7-3 item bank goes live and the quiz switches from words to items (QZ-07): `supabase.from('items').select('*')` → 42501 permission denied (column grant); switching to items_public works but returns no answer_key, so gradeOf cannot grade and the offline mode of ARCHITECTURE 2.5 (:124 "ออฟไลน์ เก็บลง pending_attempts") is impossible. The team is pushed into either server-grading every practice tap …
- ทางแก้: Team decision first (PL-09 ① vs offline-first). If practice items may carry keys, migration 0007 exposes them only for approved items that are not in any research/pretest form, leaving items_public and MK-04 untouched: create or replace view public.items_practice with (security_invoker = false) as select i.id, i.module, i.item_type, i.category, i.stem, i.choices, i.audio_path, i.hsk_level, i.answer_key from public.items i where i.status = 'approved' and not exists (select 1 from public.form_item…

**#13 ON-01/ON-05 ไม่ได้ถูกบังคับ: DB เก็บ log ของคนที่ยังไม่ให้/ถอน consent แล้วได้ และคนที่ถอนแล้วยังแก้ display_name กลับได้** (`20261007000005_schema_v1.sql:674`)
- หลักฐาน: บรรทัด 107-120 handle_new_user สร้างแถว users ทันทีที่สมัคร โดย pdpa_consent_at = null · บรรทัด 663-664 และ 674-679 policy insert ของ sessions/attempts เช็กแค่ user_id/context/session ไม่เช็ก consent · บรรทัด 123-126 anonymize_user ล้างแค่ display_name + exam_date แล้วตั้ง anonymized_at — ไม่มีอะไรห้าม insert ต่อหลังจากนั้น · บรรทัด 656-657 grant update display_name ให้ authenticated ยังอยู่หลังถอน · query ⑦ บรรทัด 167-168 พึ่งพาว่า display_name จะว่างตลอดไป · กฎ ON-01 (กฎการทำงานระบบ-BUSINESS-R…
- เกิดอะไร: มิ้นสมัคร → trigger สร้างแถว users (consent ว่าง) → เธอกด "ไม่ยอมรับ" ตาม ON-08 แต่ reload แล้วหน้า consent ถูกข้ามเพราะบั๊ก (หรือมีคนยิง API ตรง) → ทุกคำตอบลง attempts ได้ปกติ เพราะ DB ไม่เคยถามว่ามี consent → ข้อมูลที่เก็บโดยไม่มีความยินยอมปนเข้า dataset ที่จะเผยแพร่ · ต่อมาเธอขอถอน (ON-05): admin เรียก anonymize_user แต่ auth.users ยังอยู่จนกว่าจะลบด้วย admin API อีกขั้น ระหว่างนั้นมือถือเธอ sy…
- ทางแก้: -- 0007: ไม่มี consent ที่ยังมีผล = DB ไม่รับ log (ON-01/ON-05) — ทุก role create or replace function public.user_may_log(uid uuid) returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.users u where u.id = uid and u.pdpa_consent_at is not null and u.anonymized_at is null); $$; create or replace function public.consent_guard() returns trigger language plpgsql as $$ begin if not public.user_may_log(new.user_id) then raise exception…

**#14 category_progress ไม่ได้ถูกเติมจาก sessions จริง และ status/quiz_passed เดินถอยหลังหรือถูกลบได้ (QZ-12 / PL-10 §2.2)** (`20261007000005_schema_v1.sql:690`)
- หลักฐาน: บรรทัด 462-472 ตารางมี CHECK แค่ค่าของ status ไม่มีอะไรผูก status='quiz_passed' กับ quiz_passed_at หรือกับ session quiz ที่ done · บรรทัด 474-490 guard ห้าม client "ตั้งเป็น" quiz_passed แต่ปล่อยให้เปลี่ยนจาก quiz_passed กลับเป็น learning/not_started ได้ · บรรทัด 689-690 policy for all = client ลบแถวตัวเองได้ · ไม่มี trigger จาก sessions → category_progress เลย ต่างจาก categories.word_count ที่มี (บรรทัด 71-82) ทั้งที่ er-drawio.sql บรรทัด 18 กำหนดว่า [cache] ต้องมีคนอัปเดต ห้าม drift · DATABASE…
- เกิดอะไร: มิ้นผ่านควิซหมวด 1 (7/10): session quiz status=done ถูกบันทึก → endpoint ฝั่ง server ที่ควรเขียน quiz_best_score/quiz_passed_at ล้มกลางทาง (หรือยังไม่ได้เขียนเลย) → หน้าเลือกหมวดบอกว่าควิซหมวด 2 ยังล็อก ทั้งที่ sessions มีหลักฐานผ่าน และไม่มีอะไรใน DB ซ่อมให้ · กลับกัน: แอปบนมือถือเธอ sync category_progress แบบ server-wins ผิดทิศ หรือเผลอลบแถว (policy อนุญาต) → quiz_passed หาย → ปลดล็อก post ตาม P…
- ทางแก้: -- 0007: cache คน×หมวด ให้ DB ดูแลจาก sessions (เหมือน categories.word_count) · ใช้คู่กับ finding #2 (sessions.score ต้องเชื่อได้ก่อน) create or replace function public.refresh_category_progress_quiz() returns trigger language plpgsql security definer set search_path = public as $$ declare passed boolean := (new.score * 10 >= coalesce(new.total, 10) * 7); -- QZ-02 เกณฑ์ 7/10 begin if new.kind = 'quiz' and new.status = 'done' and new.category is not null then insert into public.category_progress …

**#15 BK-02 ไม่ได้ถูกบังคับ: อนุมัติข้อที่ไม่มีแถว Q-matrix ได้ และ attempts แบบ graded มี skill_id = null ได้ → BKT มองไม่เห็น** (`20261007000005_schema_v1.sql:449`)
- หลักฐาน: บรรทัด 446-460 items_approver_guard ตรวจแค่ approved_by ไม่ตรวจว่ามี item_skills อย่างน้อย 1 แถว · บรรทัด 228-232 item_skills ไม่มีอะไรบังคับทิศกลับ (ข้อ approved ลบ Q-matrix ทิ้งได้) · บรรทัด 504 attempts.skill_id nullable และ CHECK บรรทัด 513-517 ไม่บังคับ skill_id สำหรับ event_type='graded' · query ④ (query-ตรวจสอบข้อมูล.sql บรรทัด 97-98) กรอง skill_id not null → แถวเหล่านี้หายจาก BKT เงียบ ๆ · query ⑦ บรรทัด 145-146 นับเป็น "ข้อมูลมีปัญหา" · กฎ BK-02 (กฎการทำงานระบบ-BUSINESS-RULES.md บรรทัด …
- เกิดอะไร: /hsk-item สร้างข้อ 8 ข้อ ส่งหฤทัยตรวจ หฤทัยกดอนุมัติ (approved_by ถูกต้องตาม RO-03) แต่คนสร้างลืม insert item_skills → ข้อถูกเสิร์ฟในควิซให้มิ้น → attempts ของเธอ skill_id = null (ไม่มี Q-matrix ให้ API เดิน) → DB รับแถวได้ → BKT ข้ามแถวเหล่านี้ (query ④) → query ⑤ รายงานว่า KC ที่ข้อนั้นควรวัด "ข้อมูลบาง <5 โอกาส" → ทีมดัน drill เพิ่มให้มิ้นทั้งที่จริงเธอตอบไปแล้ว 8 ครั้งแต่ไม่ได้ติดป้าย · รู้ตอน…
- ทางแก้: -- 0007: อนุมัติได้ต่อเมื่อมี Q-matrix ≥1 (BK-02) · attempts ที่ตรวจได้ต้องมี KC -- ใน items_approver_guard เพิ่มก่อน return new: -- if new.status = 'approved' and not exists (select 1 from public.item_skills k where k.item_id = new.id) then -- raise exception 'item % has no item_skills row — Q-matrix required before approval (BK-02)', new.id; -- end if; create or replace function public.item_skills_keep_approved() returns trigger language plpgsql as $$ begin if exists (select 1 from public.item…

**#16 client สร้างรอบที่อ้าง form_id ได้ → แช่แข็งชุดวิจัยจากฝั่งผู้เรียน · การแช่แข็งนับรอบ abandoned/บัญชีทีม · sessions ไม่มี idempotency key (OF-01) → retry ได้รอบซ้ำ / double-tap ล้ม 23505** (`20261007000005_schema_v1.sql:416`)
- หลักฐาน: บรรทัด 414-416 exam_form_is_frozen = published หรือ "มี session ใด ๆ" อ้าง form (รวม running/abandoned และ cohort team) · บรรทัด 663-664 sessions_insert_own ไม่บังคับ form_id is null ทั้งที่ er-drawio.sql บรรทัด 289 นิยาม quiz/practice เป็น "ชุดที่ระบบสุ่มสด form_id null" · บรรทัด 525-526 attempts append-only ทุก role → ล้างรอบทดสอบต้อง disable trigger (supabase/seed/demo_mint_remove.sql บรรทัด 7-9 ทำท่านี้อยู่แล้ว) · บรรทัด 306-327 sessions ไม่มี client key เทียบ attempts.client_attempt_id (บรร…
- เกิดอะไร: (ก) บอลเทสต์เส้นทาง pre ด้วยบัญชีทีม 1 รอบแล้วปิดจอ (abandoned) ก่อนหฤทัยตรวจเสร็จ → ชุดแช่แข็งถาวร หฤทัยแก้ข้อไม่ได้ → ต้อง disable attempts_append_only ลบ attempts แล้วลบ session (ท่าเดียวกับ demo_mint_remove) ทุกครั้ง · (ข) มิ้นเน็ตหลุดตอนกด "เริ่มควิซ" แอป retry → ได้ 2 แถว running attempt_no 1 และ 2 เพราะไม่มี key ให้ ON CONFLICT → QZ-09 "ครั้งที่เท่าไหร่" เพี้ยน และ query ⑦ "running เกิน 1 ว…
- ทางแก้: -- 0007 alter table public.sessions add column if not exists client_session_id text unique; -- OF-01 เหมือน attempts · API ใช้ insert … on conflict (client_session_id) do nothing returning id -- policy sessions_insert_own: เพิ่ม form_id is null (รอบฝึก/ควิซ = ชุดสุ่มสด) — รวมกับ finding #2 ได้ -- แช่แข็งเมื่อ "มีคนทำจริง": รอบ pre/post/mock ของคนที่ไม่ใช่บัญชีทีม (MK-02 "หลังมีคนทำ pre แล้ว") create or replace function public.exam_form_is_frozen(fid bigint) returns boolean language sql stable as…

**#17 items_approver_guard fires only on UPDATE OF status: INSERT with status='approved' and later edits of approved_by/approved_at bypass RO-03 (INSERT part already logged in vault 2026-10-08, still unfixed)** (`20261007000005_schema_v1.sql:616`)
- หลักฐาน: L615-617 trigger is `before update of status`; L446-460 validates approved_by only when status transitions to 'approved'. Two bypasses: (1) INSERT … status='approved' (approved_by null) never runs the guard; (2) UPDATE items SET approved_by = <any user> or approved_at = <anything> with status unchanged does not fire the trigger, so the RO-03 record can be rewritten after approval. Scope: service connection / scripts only — anon/authenticated have no INSERT/UPDATE on items (L719), so this is not …
- เกิดอะไร: A bulk-import script or an admin endpoint inserts generated items with status='approved' (or a later 'fix' sets approved_by to Ball's uuid on already-approved rows): the DB that is supposed to prove 'หฤทัยคนเดียวที่กดอนุมัติได้' (DATABASE-ER.md L404) holds approved items with approved_by null or wrong, and nothing refuses it.
- ทางแก้: create or replace function public.items_approver_guard() returns trigger language plpgsql as $$ begin if new.status = 'approved' and (tg_op = 'INSERT' or new.status is distinct from old.status or new.approved_by is distinct from old.approved_by) then if new.approved_by is null or not exists ( select 1 from public.users u where u.id = new.approved_by and (u.role = 'approver' or exists (select 1 from public.approval_transfers t where t.to_user_id = u.id and t.revoked_at is null))) then raise excep…

**#18 roadmap_state remains anon-writable with USING(true) and no WITH CHECK, and 0005 added updated_by that any anonymous caller can set to any user's uuid (RO-04, known — interim fix possible now)** (`20260712000003_roadmap_state.sql:21`)
- หลักฐาน: 20260712000003 L18 insert `with check (true)`, L21 update `using (true)` with no WITH CHECK — the only USING(true) write policies in the schema. 20261007000005 L134 adds `updated_by uuid references public.users(id)` without touching these policies; FK validation bypasses RLS, so any existing users.id is accepted. The reviewer's uuid is public via words.reviewed_by (words is public-read). The web page writes as anon (apps/web/src/app/roadmap/page.tsx L67-69 upsert) and never sends updated_by. Rul…
- เกิดอะไร: Anyone who finds the Supabase URL + anon key in the bundle flips the team's progress checklist or inserts unlimited rows, and can plant updated_by = หฤทัย's uuid so the audit column attributes the change to her — the column meant to answer 'ใครติ๊ก' (RO-04) can be forged from day one.
- ทางแก้: Interim (does not break the still-anonymous /roadmap page): drop policy "roadmap_state public insert" on public.roadmap_state; create policy "roadmap_state public insert" on public.roadmap_state for insert with check (updated_by is null or updated_by = auth.uid()); drop policy "roadmap_state public update" on public.roadmap_state; create policy "roadmap_state public update" on public.roadmap_state for update using (true) with check (updated_by is null or updated_by = auth.uid()); After m7-1 (pag…

**#19 attempts.client_attempt_id is globally unique while the API is specified to INSERT … ON CONFLICT DO NOTHING — another user can pre-occupy ids and silently suppress a victim's attempts if ids are predictable** (`20261007000005_schema_v1.sql:497`)
- หลักฐาน: L497 `client_attempt_id text not null unique` (table-wide, not per user). L21 comment fixes the API contract to `ON CONFLICT (client_attempt_id) DO NOTHING`. L674-679 attempts_insert_own lets any authenticated user insert rows with an arbitrary client_attempt_id under their own user_id. The client id format is not implemented yet (no client_attempt_id anywhere in apps/web/src), so this only bites if the outbox uses guessable ids (e.g. `${sessionId}-${index}` or timestamps) — raising it now becau…
- เกิดอะไร: If the outbox later generates ids like `${userId}-${seq}` or `${sessionId}-${n}`, user B inserts those ids first under user_id B (allowed by the policy); user A's /attempts/batch sync hits DO NOTHING on every row and reports success while none of A's answers are stored — BK-01 log loss that no one notices until the BKT training set is short.
- ทางแก้: alter table public.attempts drop constraint attempts_client_attempt_id_key; alter table public.attempts add constraint attempts_user_client_attempt_uq unique (user_id, client_attempt_id); -- API: insert … on conflict (user_id, client_attempt_id) do nothing -- Client: generate client_attempt_id with crypto.randomUUID() regardless (defence in depth).

**#20 No breaking change found: every live query/write of the web app, the FastAPI service and the demo seed is still valid after 0005/0006** (`supabase.ts:15`)
- หลักฐาน: The live app has exactly two Supabase surfaces. (1) words, read-only via anon: practice/page.tsx:47, match/page.tsx:46, flashcards/page.tsx:49, quiz/page.tsx:65, review/page.tsx:30, lib/journey.ts:72, learn/category/page.tsx:33, progress/page.tsx:21 select only id/hanzi/pinyin/meaning_th/meaning_en/th_reviewed/audio_path/hsk_level/category and filter on hsk_level / category. All of these columns exist with unchanged types (0001:5-18, 0004:13-22); 0005 only ADDs columns to words (0005:56-62) and …
- เกิดอะไร: None today: มิ้น opens /learn, /flashcards, /practice, /quiz, /review and gets the same rows as before; หฤทัย ticks an item on /roadmap and the upsert succeeds with updated_by = NULL; the Render keepalive /health?db=1 still counts words. The seven findings below are things that break the moment the planned writes (m3-2, m4-3, m5-1, m7-1, m7-3) start, not regressions of 0005.
- ทางแก้: No migration 0007 change needed for the live paths. Keep `supabase/seed/demo_mint.sql` as the regression check: it exercises users, category_progress, sessions, attempts (exposure + graded), items, item_skills and review_states against the new triggers, so re-run it (then demo_mint_remove.sql) after every future migration.

**#21 ts-fsrs Card stored by the client does not fit review_states: state is a numeric enum and Card carries last_elapsed_days** (`fsrs.ts:25`)
- หลักฐาน: CardMap = Record<number, Card> (fsrs.ts:25) is persisted verbatim (saveCards :51-58). In the installed ts-fsrs 5.4.1, Card.state is the numeric enum State (node_modules/ts-fsrs/dist/index.d.ts:2-6 New=0, Learning=1, Review=2, Relearning=3; :55 `state: State`) and Card has last_elapsed_days (:31). 0005:558 defines `state text check (state in ('new','learning','review','relearning'))` and review_states (0005:546-560) has no last_elapsed_days column. roadmap.ts:329 (m4-3) plans "ย้ายสถานะการ์ดจาก l…
- เกิดอะไร: m4-3 sync does `supabase.from('review_states').upsert(Object.entries(loadCards()).map(([id, c]) => ({user_id, word_id: +id, ...c})))` → PostgREST rejects the whole batch: "new row for relation review_states violates check constraint review_states_state_check" (state = '2'), or earlier "Could not find the 'last_elapsed_days' column" (PGRST204). Nothing syncs, and because the design is server-wins (…
- ทางแก้: Either a mapping layer in fsrs.ts (`const STATE_TEXT = ['new','learning','review','relearning'] as const; state: STATE_TEXT[card.state]`, inverse on read, and strip last_elapsed_days), or migration 0007 makes the table match ts-fsrs 1:1 (update er-drawio.sql in the same commit): alter table public.review_states add column if not exists last_elapsed_days integer; alter table public.review_states drop constraint if exists review_states_state_check; alter table public.review_states alter column sta…

**#22 Quiz 'write' answers reference sentence ids from a TypeScript file while attempts.sentence_id has an FK to the empty sentences table** (`page.tsx:147`)
- หลักฐาน: quiz/page.tsx:147 logs `ref: question.s.id` for write items, where SENTENCES comes from apps/web/src/data/sentences.ts:16-26 (hardcoded ids 1-10, also used by SentenceOrder practice via practice/page.tsx:12). 0005:503 `sentence_id bigint references public.sentences(id)` (and sentence_states.sentence_id at 0005:565); public.sentences (0005:243-256, identity ids) has no seed in 0005 or 0006, so it is empty on the live DB. BUSINESS-RULES line 201 ① records that these 10 sentences are live but not y…
- เกิดอะไร: Once attempts sync exists, มิ้น's first quiz contains write items 4 and 7 → the upload fails with `insert or update on table "attempts" violates foreign key constraint "attempts_sentence_id_fkey"`; ON CONFLICT DO NOTHING does not cover FK errors, so with a naive outbox the two rows block the queue permanently. If sentences are later seeded in a different order, the old `ref` values silently point …
- ทางแก้: Migration 0007 (after หฤทัย's CG-03 review) seeds sentences with explicit ids equal to sentences.ts so the client ids stay valid, then the client should read `sentences` (status='approved') instead of the TS file: insert into public.sentences (id, category, tokens, pinyin, meaning_th, focus_th, skill_id, status) overriding system value values (1, 1, '["我","爱","你"]', 'wǒ ài nǐ', 'ฉันรักเธอ', 'ประโยคพื้นฐาน: ประธาน-กริยา-กรรม', (select id from public.skills where code = 'SKILL-ORDER'), 'pending'),…

**#23 words.review_status ถูกเพิ่มแต่ไม่ได้ต่อสาย: policy อ่านยังเปิดหมด · API/seed ยังเขียน th_reviewed · word_count นับทุกสถานะ (CG-01)** (`20261007000005_schema_v1.sql:56`)
- หลักฐาน: 0005 บรรทัด 56 เพิ่ม review_status (nullable, ไม่มี default) · บรรทัด 63 backfill ครั้งเดียวจาก th_reviewed แล้วไม่มี trigger sync อีก · policy "public read words" ใน 20260707000001_words.sql บรรทัด 24 ยัง using (true) ขณะที่ sentences/minimal_pairs/foundation_lessons (0005 บรรทัด 706-710) กรอง approved · apps/api/app/main.py บรรทัด 75-92 endpoint /words/{id}/review เขียนแค่ meaning_th + th_reviewed · 20260707000002_seed_words.sql upsert เขียน th_reviewed ไม่เขียน review_status (คำใหม่จะได้ null…
- เกิดอะไร: หฤทัยพบคำแปลผิดของคำที่เคย approved แล้วตั้ง review_status='suspended' ผ่านหน้า Admin ใหม่ (หรือใช้ API เก่าตั้ง th_reviewed=false) → อีกช่องไม่เปลี่ยนตาม → บัตรคำ/ควิซของมิ้นยังเสิร์ฟคำนั้นพร้อมคำแปลผิด (policy เปิดหมด, web ไม่กรอง) และหน้าเลือกหมวดยังโชว์ "หมวด 1 มี 70 คำ" ทั้งที่ใช้ได้ 69 · วันนี้ยังไม่เห็นเพราะ 300 คำ approved ครบ แต่คำ HSK2 ที่ seed เข้ามาใหม่จะมี review_status=null ตลอด → ถ้…
- ทางแก้: -- 0007: th_reviewed เป็นเงาของ review_status · เสิร์ฟ/นับเฉพาะ approved alter table public.words alter column review_status set default 'pending'; update public.words set review_status = case when th_reviewed then 'approved' else 'pending' end where review_status is null; alter table public.words alter column review_status set not null; create or replace function public.words_sync_review() returns trigger language plpgsql as $$ begin if tg_op = 'UPDATE' and new.th_reviewed is distinct from old.…

## §2b จากการสร้างกิจกรรมฝึกครบชุด (11 ต.ค.)

> ที่มา: branch `feat/practice-complete` — ทุกกิจกรรมฝึกจดคำตอบรายข้อลง outbox ในเครื่อง (`apps/web/src/lib/attempts-outbox.ts` · localStorage `xh_attempts_outbox_v1`) รูปแถวเดียวกับ `attempts` · ยังไม่มี sync → ต้องปิดข้อเหล่านี้ใน 0007 **ก่อน**เปิด `POST /attempts/batch` ไม่งั้นทั้ง batch ล้มที่ CHECK

- **ขยาย CHECK `attempts.generator`** (0005 รับแค่ `flashcard, listen_mc4, read_mc4, match, order, ear_game, speak_along`) → เพิ่ม `fill_blank` · `true_false` · `listen_sentence` · `read_sentence` (+ 3 ค่าจากหน้าเดโม `listen_dialogue` · `pick_image` · `qa_match`)
- **`sessions.mode` ขยาย CHECK ให้รับทุก QuizMode ที่ sync** — CHECK วันนี้รับแค่ `listen, read, order, match` แต่ `saveRound()` ส่งได้ทุก QuizMode → ถ้าจะ sync รอบฝึกเป็น sessions ต้องเพิ่ม `ear, speak, fill, truefalse, listen_sentence, read_sentence` ด้วย (+ `dialogue, picture, picture_read, qa` ถ้าจะเก็บรอบเดโม — เลือกรูปแยก ฟัง `picture` / อ่าน `picture_read` ตั้งแต่ 12 ต.ค.) · รอบ `speak` ไม่นับคะแนน (`UNSCORED_MODES`) · รอบเดโม/ประโยคร่างไม่นับเข้าความแม่นยำรวม/จุดอ่อน (`DEMO_MODES` ใน `lib/progress.ts`)
- **แถวที่ห้าม sync = มี `mock_ref`** — นอกจากเนื้อหาสมมุติ (`dialogue-3` / `qa-7`) ตอนนี้คำตอบของ**ประโยคร่าง** `sentences.ts` ทุกกิจกรรม (เรียงประโยค / เติมคำ / อ่านประโยค / ฟังประโยค) ติด `mock_ref = 'draft-sentence-<id>'` ด้วย จนกว่าหฤทัยตรวจครบแล้วตั้ง `SENTENCES_REVIEWED = true` (CG-02 — คำตอบต่อข้อที่ยังไม่อนุมัติห้ามเข้าข้อมูลเทรน BKT) · แถวเก่าที่ติดไว้แล้วยังข้ามตลอด (ข้ออาจถูกแก้ระหว่างตรวจ)
- **กฎ `skill_code` ของ `fill_blank` (Q-matrix)** — ประโยคผูก kc → ใช้ kc นั้น · ไม่ผูก: ช่องเป็นคำไวยากรณ์ (`GRAMMAR_WORDS` ใน `fill/page.tsx` เช่น 的 个 也 都 吗 是) = `SKILL-ORDER` · ช่องเป็นคำเนื้อหา (你 爱 喜欢 猫 …) = `SKILL-READ` — ไม่ปนข้อศัพท์เข้าทักษะเรียงประโยค (ถ้าประโยคมีหมวดในอนาคต ใช้ `VOCAB-C<หมวด>` แทน `SKILL-READ` ได้)
- **`ear_game` / `speak_along` เลิกผูก `TL-TONE-T4OVER`** — T4OVER ในคลังคือคุณภาพการออกเสียง 4 (ตกช้า/ลากยาว) ไม่ใช่การสับสนวรรณยุกต์ → คู่วรรณยุกต์ที่มีเสียง 4 log เป็น `SKILL-LISTEN` · ข้อฟังม้วนลิ้น zh/ch/sh↔z/c/s = `TL-RETRO-FLAT-MERGE` ทั้งสองทิศ (SH-S/ZH-JZ/CH-CQ เหลือเฉพาะพูดตาม) · ตอบผิดใช้ KC ของ "ตัวที่เลือก" (BK-03) — แถวเก่าใน outbox ก่อน 12 ต.ค. ยังมี T4OVER/SH-S จากข้อฟัง ถ้าจะเทรนให้กรองทิ้งหรือแมปใหม่
- **พิจารณา seed `SKILL-SPEAK`** ในตาราง skills (type `skill`, level 1) — วันนี้ `speak_along` ใช้ `skill_code` = KC Thai-L1 ที่ตรวจเจอ หรือ `SKILL-LISTEN` → ปนกับสถิติฟัง (BKT ไม่อ่าน `asr_hint` อยู่แล้ว แต่ dashboard จะแยกทักษะพูดไม่ได้)
- **แผนที่ช่อง outbox → คอลัมน์ `attempts`** — ชื่อตรงกัน 1:1: `client_attempt_id` · `generator` · `event_type` · `word_id` · `sentence_id` · `answer` · `is_correct` · `answered_at` · `time_spent_ms` · `context` · `app_version` · ที่ต่าง:
  - `skill_code` → `skill_id` (server แปลจาก `skills.code` · รหัสที่ไม่รู้จัก = ปฏิเสธแถว)
  - `variant` → **ไม่มีคอลัมน์** — เพิ่ม `variant text` ใน 0007 หรือให้ server พับเข้า `answer.variant`
  - `mock_ref` → ไม่มีคอลัมน์ และ**ห้าม sync** (เนื้อหาสมมุติของฟังบทสนทนา / จับคู่ถาม-ตอบ ไม่มีคำ/ประโยคใน DB ให้อ้าง)
  - server เติมเอง: `id` · `user_id` (จาก JWT) · `session_id` · `item_id` (null — ข้อปั้นสดจากคำ)
  - `sentence_id` = id ใน `sentences.ts` → ต้อง seed ตาราง sentences ให้ id ตรงกันก่อน (#22) ไม่งั้นติด FK

## §3 ของที่ผู้ตรวจบอกว่า "ถูกแล้ว ไม่ต้องแก้ซ้ำ"
- pre/post: client สร้าง/แก้ sessions kind pretest/posttest ไม่ได้ · attempts context pretest/posttest จดจาก client ไม่ได้ (PL-10 §2.7) ✓
- answer_key ไม่เปิดให้ anon/authenticated ที่ตาราง items (MK-04) ✓ · view `items_public` เป็น security_invoker ✓
- attempts append-only (BK-01) ✓ · attempt_no/finished_at DB เติมเอง ✓ · users แก้ได้เฉพาะคอลัมน์โปรไฟล์ (role/cohort ล็อก) ✓
- เว็บที่ขึ้นอยู่ (อ่าน words/roadmap_state ด้วย anon key) **ไม่มีอะไรพัง** หลัง 0005 (เข้ากับแอป #7)

## §4 ลำดับที่เสนอ
1. บอลเคาะ §0 (4 ข้อ) — ข้อ 1 สำคัญสุด เพราะกำหนดว่า API ต้องมี `/attempts/batch` ก่อนล็อกอิน
2. เขียน `20261010000007_hardening.sql` ตาม §1 (+ ข้อง่ายใน §2: approver guard ตอน insert · schema_migrations เปิด RLS · roadmap_state ตัด anon write เมื่อมีล็อกอิน) → dry-run → รีวิว → apply
3. ตามด้วยโค้ดฝั่ง API/เว็บที่ §2 ชี้ (review_status แทน th_reviewed · client_attempt_id ในบันทึกออฟไลน์ · FSRS state ให้ตรง review_states)

เกี่ยวข้อง: [[กฎการทำงานระบบ-BUSINESS-RULES]] · [[DATABASE-ER]] · [[นโยบาย-post-test-PL10]] · บันทึก [[2026-10-08]] · [[2026-10-12]]
