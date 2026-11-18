# 🏗️ ARCHITECTURE.md — สถาปัตยกรรมระบบ "星航" (星航)

> **สถานะ:** สเปคตั้งต้นสำหรับเริ่มเขียนโค้ด (ยังไม่เริ่ม implement) · **อัปเดต:** 8 ก.ค. 2026
> **อ่านคู่กับ:** `HANDOFF-星航.md` (ภาพรวม) · `docs/01_เอกสารโครงงาน/ข้อเสนอโครงงาน-ฉบับแก้ไข-โฟกัสHSK.md` (ขอบเขต 8 โมดูล) · โน้ตใน `docs/07_คลังความรู้-Obsidian/`
>
> **หลักเหล็ก (ห้ามขัด):** ตรวจคำตอบด้วย **rule เทียบเฉลยเท่านั้น** (ไม่มี LLM ตรวจ) · **ไม่มี speech/ASR ใน MVP** (HSK 1–2 ไม่มีสอบพูด — ใช้ minimal pair ทางการฟังแทน) · ตัวเลข HSK 3.0: L1 = 300 คำ/48 ไวยากรณ์, L2 = 500 คำ/129 ไวยากรณ์ (สะสม), เกณฑ์ผ่าน 120/200 · pyBKT เทรน offline ด้วยข้อมูลผู้เรียนไทยเราเอง · Gemini Flash = ส่วนเสริมสร้าง draft เนื้อหาเท่านั้น เรียกจาก server, key ใน env

---

## 1. ภาพรวมระบบ

```
                    ┌──────────────────────────────────────────────┐
                    │        ผู้เรียนไทย (มือถือ/เดสก์ท็อป)              │
                    └──────────────────────┬───────────────────────┘
                                           │ HTTPS
┌──────────────────────────────────────────▼───────────────────────────────────┐
│  Next.js PWA (App Router) — โฮสต์: Vercel / Cloudflare Pages                  │
│  ┌─────────────────────────┐  ┌────────────────────────────────────────────┐ │
│  │ UI: Tailwind + Zustand  │  │ ชั้นออฟไลน์                                  │ │
│  │ กราฟ: Recharts          │  │  · Serwist SW  → precache แอป+เสียง+เนื้อหา  │ │
│  │ ทวนออฟไลน์: ts-fsrs      │  │  · Dexie/IndexedDB → การ์ดคำ, คิวทวน,        │ │
│  │ ลายเส้น: hanzi-writer    │  │    คำตอบค้าง sync (outbox)                  │ │
│  └───────────┬─────────────┘  └───────────────────┬────────────────────────┘ │
└──────────────┼────────────────────────────────────┼──────────────────────────┘
               │ REST/JSON (+ Supabase JWT)          │ sync เมื่อออนไลน์
               ▼                                    │
┌──────────────────────────────────────────────┐    │
│  FastAPI — โฮสต์: Hugging Face Spaces (Docker)│    │
│  items · grading (rule) · learner-model      │    │
│  (pyBKT posterior) · scheduler (py-fsrs) ·   │    │
│  diagnosis (Thai-L1 × Q-matrix) · mock-exam  │    │
│  · content (Gemini draft — optional)         │    │
│  NLP: jieba · pypinyin                       │    │
└───────┬──────────────────────────┬───────────┘    │
        │ SQL (service key)        │ (เสริมเท่านั้น)   │
        ▼                          ▼                 ▼
┌───────────────────────┐  ┌──────────────┐  ┌─────────────────────┐
│  Supabase (ตัวจริง)     │  │ Gemini Flash │  │ Supabase Auth       │
│  PostgreSQL + RLS     │  │ (LLM ช่วยร่าง  │  │ (ล็อกอินจาก client)   │
│  Storage: ไฟล์เสียง     │  │ เนื้อหา ไม่ตรวจ │  └─────────────────────┘
│  (edge-tts pregen)    │  │ ข้อสอบ)       │
└───────────────────────┘  └──────────────┘
        ▲
        │ batch (นอกระบบ runtime)
┌───────┴────────────────────────────────────────┐
│  ml/ — เทรน pyBKT offline (notebook/script)     │
│  attempts → fit → พารามิเตอร์รายทักษะ → เก็บกลับ DB │
└────────────────────────────────────────────────┘
```

**หลักการแบ่งหน้าที่:**
- **Next.js PWA** = หน้ากาก + ชั้นออฟไลน์ (Serwist เก็บ "ตัวแอป", Dexie เก็บ "ข้อมูล") — **IndexedDB = ที่พัก, Supabase = ตัวจริง**
- **FastAPI** = engine เดียวรวม ML ทั้งหมด (pyBKT/py-fsrs/jieba/pypinyin เป็น Python ทั้งหมด — รันโปรเซสเดียว) แยกจาก frontend เพื่อ reuse/ต่อยอดช่องทางอื่น (ตาม proposal 1.4.5)
- **Supabase** = DB ถาวร + Auth + Storage ไฟล์เสียง
- **Gemini Flash** = เส้นประ (optional) — ระบบหลักต้องทำงานได้แม้ปิด LLM ทิ้ง

---

## 2. Frontend (Next.js PWA)

### 2.1 โครง App Router

```
apps/web/
├── src/app/
│   ├── layout.tsx / page.tsx        # shell + landing
│   ├── (auth)/login/                # Supabase Auth (email/OTP)
│   ├── dashboard/                   # โมดูล 8: กราฟ mastery + ความพร้อมสอบ
│   ├── flashcards/                  # โมดูล 1: บัตรคำ (ts-fsrs + hanzi-writer)
│   ├── review/                      # โมดูล 4: คิวทวน FSRS วันนี้
│   ├── listening/                   # โมดูล 5: ข้อสอบฟัง + minimal pair
│   ├── reading/                     # โมดูล 6: ข้อสอบอ่าน
│   ├── mock-exam/                   # โมดูล 7: จับเวลา + คะแนน 200/120
│   ├── diagnosis/                   # โมดูล 3: รายงานจุดผิด Thai-L1
│   └── ~offline/                    # offline fallback page (Serwist)
│   └── sw.ts                        # Serwist service worker (source)
├── src/lib/
│   ├── db.ts                        # Dexie schema (ดู 2.2)
│   ├── sync.ts                      # outbox sync (ดู 2.3)
│   ├── api.ts                       # client เรียก FastAPI (แนบ Supabase JWT)
│   ├── fsrs.ts                      # ts-fsrs wrapper (ทวนออฟไลน์)
│   └── supabase.ts                  # Supabase client (Auth เท่านั้นฝั่งนี้)
├── src/stores/                      # Zustand: session, exam-timer, sync-status
└── src/components/                  # ExamQuestion, ProgressBar, MasteryChart(Recharts), AudioButton
```

### 2.2 Serwist (Service Worker)

- **precache:** app shell, หน้า route หลัก, ฟอนต์, ไฟล์เสียงของคำ/ข้อสอบที่ผู้ใช้ดาวน์โหลดชุดบทเรียนแล้ว
- **runtime cache:** ไฟล์เสียงจาก Supabase Storage → `CacheFirst` (ไฟล์ pre-generate ไม่เปลี่ยน) · ข้อมูลเนื้อหา (words/items) → `StaleWhileRevalidate`
- **offline fallback:** route `~offline` เมื่อ navigate โดยไม่มีเน็ตและไม่อยู่ใน cache
- ⚠️ ใช้ **Serwist เท่านั้น** — ห้ามใช้ next-pwa (เลิกพัฒนาแล้ว) — ดู `docs/07_คลังความรู้-Obsidian/10-เทคโนโลยี/Next.js-PWA.md`

### 2.3 Dexie / IndexedDB schema (ฝั่ง client)

```ts
// src/lib/db.ts
db.version(1).stores({
  words:          'word_id, hsk_level',        // การ์ดคำ: hanzi, pinyin, thai, audio_url (cache เนื้อหา)
  review_states:  'word_id, due',              // สถานะ FSRS ต่อการ์ด: D/S/R, due, last_review
  review_queue:   'word_id, due',              // คิวทวนวันนี้ (คำนวณจาก review_states ด้วย ts-fsrs)
  pending_attempts: 'client_attempt_id, created_at', // ⭐ outbox: คำตอบค้าง sync
  items_cache:    'item_id, module',           // ข้อสอบฝึก/ทวนที่โหลดมาแล้ว (ทำออฟไลน์ได้)
  exam_sessions:  'session_id',                // ⭐ สถานะ Mock Exam ระหว่างทำ: ข้อที่ถึง, คำตอบรายข้อ, เวลาเริ่ม/เหลือ
  meta:           'key',                       // last_sync_at, wordlist_version, user_id
});
```

- `pending_attempts` แต่ละแถว = 1 การตอบ: `client_attempt_id (UUID สร้างฝั่ง client), item_id, answer, is_correct (ตรวจ rule ฝั่ง client ได้เพราะ items_cache มีเฉลย — server ตรวจซ้ำเป็น source of truth), answered_at, module`
- `exam_sessions` เขียนทุกครั้งที่ตอบใน Mock Exam → รีเฟรช/หลุดกลางคันแล้ว **hydrate กลับมาทำต่อได้ ไม่หาย** (ตาม AC โมดูล 7 ใน PRD) — Zustand เป็นแค่ runtime state ที่ sync จากตารางนี้
- ⚠️ **iOS อาจลบ IndexedDB ถ้าไม่เปิดแอป ~7 วัน** → sync ขึ้น Supabase ให้บ่อยที่สุด ห้ามถือ IndexedDB เป็นที่เก็บถาวร

### 2.4 State + กราฟ

- **Zustand** — state ในแอป: session ผู้ใช้, ตัวจับเวลา mock exam, สถานะ sync (เบากว่า Redux)
- **Recharts** — Dashboard: กราฟ mastery รายทักษะจาก pyBKT (ไอเดียจาก mockup อาจารย์ — กราฟรายทักษะ + แสดงเกณฑ์ผ่าน 120/200 จริง ไม่ใช่เลขสมมติ)

### 2.5 กลยุทธ์ sync (offline-first)

| สถานการณ์ | พฤติกรรม |
|---|---|
| ออนไลน์ | ตอบข้อสอบ → เขียน `pending_attempts` → push ไป `POST /attempts/batch` ทันที → สำเร็จแล้วลบออกจาก outbox |
| ออฟไลน์ | เก็บลง `pending_attempts` อย่างเดียว · ทวน FSRS ต่อได้ด้วย ts-fsrs ในเครื่อง |
| กลับมาออนไลน์ | trigger จาก `navigator.onLine` + เปิดแอป → flush outbox เป็น batch (เรียงตาม `answered_at`) |
| ส่งซ้ำ (retry/หลุดกลางทาง) | server `INSERT … ON CONFLICT (client_attempt_id) DO NOTHING` → **idempotent** ไม่เกิด log ซ้ำ · **ห้าม DO UPDATE** (attempts มี trigger append-only BK-01 — ชนแล้วทั้ง batch ล้ม) |
| ข้อมูลชนกัน | **attempts เป็น append-only log → ไม่มี conflict จริง** (ไม่มีการแก้แถวเก่า) · ข้อมูลที่คำนวณได้ (mastery, ตาราง FSRS) ใช้ **server-wins**: หลัง sync สำเร็จ ให้ดึงค่า server มาทับค่า local เสมอ |

---

## 3. Backend (FastAPI บน HF Spaces)

### 3.1 โครงสร้างโมดูล

```
apps/api/
├── app/
│   ├── main.py                  # FastAPI app + CORS(origin เว็บเรา) + auth middleware
│   ├── deps.py                  # verify Supabase JWT → user_id
│   ├── routers/
│   │   ├── items.py             # เสิร์ฟข้อสอบ/แบบฝึกตามโมดูล+ทักษะที่อ่อน
│   │   ├── attempts.py          # รับ log คำตอบ (batch) → grading → เก็บ → อัปเดตโมเดล
│   │   ├── learner_model.py     # mastery รายทักษะ (pyBKT posterior)
│   │   ├── scheduler.py         # ตาราง FSRS ฝั่ง server (py-fsrs)
│   │   ├── diagnosis.py         # รายงานจุดผิด Thai-L1
│   │   ├── mock_exam.py         # ประกอบชุด+จับเวลา+คิดคะแนน 200/120
│   │   └── content.py           # (optional) Gemini ช่วยร่างเนื้อหา — มนุษย์ตรวจก่อนใช้
│   ├── services/
│   │   ├── grading.py           # ⭐ rule engine เทียบเฉลย — ไม่มี LLM เด็ดขาด
│   │   ├── bkt.py               # โหลดพารามิเตอร์ pyBKT ที่เทรนไว้ → คำนวณ posterior
│   │   ├── fsrs.py              # py-fsrs wrapper
│   │   ├── qmatrix.py           # lookup item → skills (Q-matrix)
│   │   ├── thai_l1.py           # จับคู่คำตอบผิด → thai_l1_catalog
│   │   ├── zh_nlp.py            # jieba (คุมระดับคำ) + pypinyin
│   │   └── llm.py               # Gemini client (server-side, key จาก env, สลับ provider ได้)
│   ├── models/                  # Pydantic schemas (request/response)
│   └── db.py                    # Supabase Postgres client (service role key)
├── Dockerfile                   # สำหรับ HF Spaces
└── requirements.txt             # fastapi uvicorn pydantic pyBKT py-fsrs jieba pypinyin supabase pandas scikit-learn
```

**ตรรกะการตรวจ (grading.py) ต่อประเภทข้อ** (ทุกประเภทมีเฉลยตายตัว — ดู `20-HSK/รูปแบบข้อสอบ-HSK-1-2.md`):

| ประเภทข้อ | rule |
|---|---|
| เลือกตอบ / เลือกพินอิน / ฟังเลือกภาพ | `answer == answer_key` ตรงตัว |
| จับคู่ | เทียบ mapping ทุกคู่ |
| ถูก-ผิด | เทียบ boolean |
| เรียงคำเป็นประโยค (แบบฝึก — section จริงของ HSK 3) | ลำดับที่ส่งมา ∈ ชุด `accepted_answers` |

### 3.2 API endpoints หลัก

| Method | Path | หน้าที่ |
|---|---|---|
| `GET` | `/health` | health check + keep-alive ping |
| `GET` | `/words?level=1` | คลังคำ HSK 3.0 ระดับนั้น (การ์ดคำ + audio_url) |
| `GET` | `/items?module=listening&skill_id=...&n=10` | เสิร์ฟข้อสอบ/แบบฝึก — เลือกข้อที่วัดทักษะที่ mastery ต่ำก่อน |
| `POST` | `/attempts/batch` | ⭐ รับคำตอบ (จาก outbox) → grade ด้วย rule → เก็บ attempts (append-only, idempotent ด้วย `client_attempt_id`) → อัปเดต BKT posterior + FSRS + diagnosis |
| `GET` | `/mastery` | mastery รายทักษะของผู้ใช้ (BKT posterior ล่าสุด) → Dashboard |
| `GET` | `/review-queue` | คิวทวน FSRS วันนี้ (server เป็น source of truth, client ใช้ ts-fsrs ตอนออฟไลน์) |
| `GET` | `/diagnosis` | รายงานจุดผิด Thai-L1: กลุ่มที่พลาดบ่อย + วิธีเจาะฝึก + ลิงก์แบบฝึก |
| `POST` | `/mock-exam/start` | ประกอบชุดข้อสอบฟัง+อ่านเต็มรูปแบบ + เวลาเริ่ม |
| `POST` | `/mock-exam/{session_id}/submit` | ตรวจทั้งชุด → คะแนนสเกล 200 (ผ่าน 120) → attempts เข้า BKT → สรุปรายทักษะ |
| `GET` | `/mock-exam/history` | ประวัติ mock exam (ใช้ทำ pre/post gain score) |
| `POST` | `/content/draft` | (optional) Gemini ร่างประโยคตัวอย่าง/คำอธิบายไทย — ติดธง `draft` เสมอ มนุษย์ (ทีม) ตรวจก่อนเข้า item bank |

**Auth:** client ล็อกอินผ่าน Supabase Auth → ทุก request แนบ JWT → FastAPI verify (JWKS/secret ของ Supabase) → ได้ `user_id` — endpoint เนื้อหาสาธารณะ (`/words`, `/health`) ไม่ต้องล็อกอิน

---

## 4. Data Model (Supabase / PostgreSQL)

> ⚠️ **แหล่งจริงของ data model คือ [`DATABASE-ER.md`](DATABASE-ER.md)** (มีผัง ER + แยกชั้น "ใช้จริงวันนี้" vs "พิมพ์เขียว" + changelog)
> ตารางข้างล่างนี้เป็นสรุปย่อไว้อ่านคู่สถาปัตยกรรม — **ถ้าขัดกันเมื่อไหร่ ให้ยึด `DATABASE-ER.md`** · sync ล่าสุด 20 ส.ค. 2026
>
> ทุกการตอบ 1 ข้อ = 1 แถว `attempts` — คือ dataset ที่ใช้เทรน pyBKT (ต้องมี consent ตาม PDPA — เก็บธง consent ใน `users`)

| ตาราง | คอลัมน์สำคัญ | หมายเหตุ |
|---|---|---|
| `categories` | `id (1-5)`, `name_th`, `summary_th`, `difficulty_order`, `word_count` | 5 หมวด — ยกออกจาก `apps/web/src/data/categories.ts` · `words`/`sentences`/`sessions` ชี้มาหาทั้งสามตาราง |
| `bkt_training_runs` | `run_at`, `data_until`, `n_attempts`, `n_users`, `kc_count`, **`variant (full\|no_thai_l1\|slam_benchmark)`**, `auc`, `auc_by_skill (jsonb)`, `params (jsonb)`, `notes` | **ที่มาของตัวเลขทุกตัวในบทที่ 4** — เทรนหลายรอบระหว่างทดลอง ถ้าเก็บแค่ค่าล่าสุดใน `skills` จะอ้างไม่ได้ว่า AUC มาจากรอบไหน · `variant` รองรับ ablation ตรง ๆ (ME-03) |
| `foundation_stages` | `code (intro\|pinyin\|tones\|ear_game\|reference)` PK, `name_th`, `position`, **`pass_threshold`**, **`soft_gate_after_tries`** | ยก `stage` จาก enum ข้อความมาเป็นตาราง · ผลพลอยได้: เกณฑ์ PA-01 (80%) และ PA-08 (3 รอบ) กลายเป็นข้อมูลที่ปรับได้ แทนเลขฝังในโค้ด |
| `foundation_lessons` | `stage (FK → foundation_stages)`, `position`, `title_th`, `body_th`, `audio_path`, `status` | เนื้อหาโมดูล 0 (m0-1..m0-5) — เดิมไม่มีที่ไหนเลย |
| `minimal_pairs` | `skill_id`, `hanzi_a/pinyin_a/audio_a_path/word_a_id`, `hanzi_b/…`, `note_th`, `status` | PR-05 ~20 คู่ (วรรณยุกต์ 2/3 ~10 + zh/ch/sh ~10) · เก็บ hanzi ตรง ๆ ไม่บังคับผูก `words` เพราะบางคู่ (妈/马) ไม่ได้อยู่ในลิสต์ 300 คำทั้งคู่ |
| `approval_transfers` | `from_user_id`, `to_user_id`, `reason`, `granted_at`, `revoked_at` | โฟลว์ §7-6 "จดบันทึกการโอนสิทธิ์ทุกครั้ง" |
| `users` | `id (uuid, = auth.users.id)`, `display_name`, **`role (learner\|admin\|approver)`**, `pdpa_consent_at`, **`consent_version`**, `target_level`, `exam_date (date)`, **`self_level (cant_read\|some_basics\|unsure — ON-02 ③ · 28 ก.ย.)`**, `audio_rate (real)`, **`pinyin_hidden`**, **`cohort`**, **`trial_started_at`**, **`anonymized_at`**, `created_at` | โปรไฟล์ต่อยอดจาก Supabase Auth · 3 คอลัมน์กลางเก็บคำตอบ onboarding ①② + ค่าตั้งเสียงช้า (ON-02/m2-7) · `cohort/trial_started_at` แยกผู้ทดลอง ~10 คน (ME-02) ออกจากบัญชีทีม · `anonymized_at` = ทางลงของ ON-05 |
| `words` | `id`, `hanzi`, `pinyin`, `meaning_en (CC-CEDICT — ใส่เครดิต CC BY-SA)`, `meaning_th (AI แปลทีเดียว + ทีมตรวจ)`, `th_reviewed`, `hsk_level (1\|2)`, `category (smallint 1-5)`, `audio_path`, `wordlist_version ('HSK3.0')` · **(พิมพ์เขียว ยังไม่มีจริง)** `image_path`, `etymology_image_path`, `etymology_story_th` | HSK 3.0 เท่านั้น (L1=300, L2=500 สะสม) — version-stamp เพราะช่วงเปลี่ยนผ่าน |
| `skills` | `id`, `code`, `name_th`, `type (vocab\|grammar\|tone\|consonant\|thai_l1)`, `hsk_level`, `bkt_prior/learn/slip/guess (พารามิเตอร์เทรนแล้ว — เริ่มด้วยค่าตั้งต้นจากงานวิจัย)` | Knowledge Components: คำศัพท์/ไวยากรณ์ 129 จุด (สะสม — HSK 1 = 48 จุดแรก)/วรรณยุกต์/พยัญชนะ **+ Thai-L1 KCs** (เช่น `TONE_2_3`, `RETROFLEX_ZH_CH_SH_R`, `MODIFIER_ORDER`) |
| `items` | `id`, `module (listening\|reading\|vocab\|grammar\|minimal_pair)`, `item_type (mcq\|match\|true_false\|pick_pinyin\|listen_pick_image\|word_order)`, **`category`**, `stem`, `choices (jsonb)`, `answer_key (jsonb — รวม accepted_answers ของข้อเรียงคำ)`, `audio_path`, `hsk_level`, `distractor_rationale (jsonb — ตัวลวงข้อไหนสะท้อน Thai-L1 จุดไหน)`, **`status (draft\|pending\|approved\|rejected\|suspended)`**, `reject_reason`, **`created_by`**, `approved_by (uuid → users)`, `approved_at`, `created_at`, **`updated_at`** | ⭐ ข้อที่ AI สร้าง (`/hsk-item`) ต้อง `status = approved` ก่อนเสิร์ฟ · `approved_by` บังคับ RO-03 เชิงข้อมูล (คนเดียว) · ข้อฟัง: stem ห้ามโชว์พินอิน/ฮั่นจื้อของสิ่งที่ให้ฟัง (audio-only) |
| `item_skills` | `item_id`, `skill_id` (PK คู่) | **Q-matrix** — ไม่มีตารางนี้ BKT ไม่รู้จะอัปเดตทักษะไหน |
| `attempts` | `id`, `client_attempt_id (unique — idempotent sync)`, `user_id`, `session_id`, **`item_id (nullable)`**, **`word_id`**, **`sentence_id`**, **`skill_id`**, **`generator`**, `answer (jsonb)`, `is_correct`, `answered_at`, `time_spent_ms`, `context (practice\|review\|quiz\|pretest\|**posttest** — 28 ก.ย. ตัด placement/micro_check · mock สงวนไว้)` | ⭐ **append-only** — ห้าม UPDATE/DELETE · ป้อนเทรน BKT + วัด AUC · **อ้างได้ทั้งข้อสอบ/คำ/ประโยค** เพราะบัตรคำ-ฝึก-ควิซปั้นข้อสดจากคำ · `skill_id` จด KC ณ เวลาตอบ (ข้อปั้นสดไม่มี `item_skills` ให้เดิน + กันข้อมูลทดลองเปลี่ยนความหมายย้อนหลัง) |
| `sessions` | `id`, `user_id`, `kind (pretest\|**posttest**\|quiz\|practice\|review — mock สงวนไว้ · 28 ก.ย. ตัด micro_check/placement)`, `form_id`, `category`, `mode`, `attempt_no`, `started_at`, `finished_at`, `status (running\|done\|abandoned)`, `total`, `score`, **`score_listening`**, **`score_reading`**, **`score_total (200)`**, **`passed (>=120)`**, `detail (jsonb)` | **แทน `mock_exam_sessions` เดิม** — เครื่องมือวัดทั้ง 5 ชนิดรูปร่างเหมือนกัน · `attempt_no` + `status` ทำให้ QZ-08/09/12 ทำงานได้ และแยกรอบที่ทิ้งกลางคันออกจากคะแนนทางการ · **pretest ≠ mock** ตาม PL-03 |
| `exam_forms` / `form_items` | `code`, **`version`**, `kind`, `item_count`, `time_limit_s`, **`locked_until`**, **`published_at`**, `status` · `form_items(form_id, item_id, position)` | ชุดข้อสอบ — บังคับ MK-02 (2 ชุด) + PL-07 (pre=post ชุดเดียวกัน) + ล็อกชุด post จนถึงวันวัดผล · **ห้ามเปิด RLS อ่านสาธารณะ** |
| `foundation_progress` | `user_id`, `stage (intro\|pinyin\|tones\|ear_game)`, `tries`, `best_accuracy`, `passed_at` | โมดูล 0 — PA-01 ประตู ~80% · PA-08 นับ "ไม่ผ่านครบ 3 รอบ" |
| **`category_progress`** | `user_id`, `category` (PK คู่), `started_at`, `words_learned [cache]`, `sentences_passed [cache]`, `quiz_best_score [cache]`, `quiz_passed_at`, `status (not_started\|learning\|quiz_passed)` | **คน × หมวด — เพิ่ม 23 ก.ย.** (อาจารย์รอบ 6: "ใครเรียน content ไหน ผ่านกี่คำ กี่ประโยค ต้องเป็นตาราง ไม่ใช่โค้ด") · คู่แฝด `foundation_progress` · รองรับ QZ-08/QZ-12 |
| **`sentence_states`** | `user_id`, `sentence_id` (PK คู่), `tries`, `best_correct`, `last_at`, `passed_at` | **คน × ประโยค — เพิ่ม 23 ก.ย.** ("รู้ทุกคำ ≠ เรียงประโยคถูก") · คู่แฝด `review_states` · ข้อมูลดิบรายครั้งอยู่ `attempts.sentence_id` |
| ~~`recommendations`~~ | **ตัดออก 23 ก.ย. (อาจารย์รอบ 6 · BK-08)** — คำแนะนำรายบุคคลให้ Gemini แต่งสดจาก SWOT บน dashboard ไม่เก็บลง DB · จุดแข็ง/จุดอ่อน query จาก `mastery_snapshots` · คำอธิบายจุดผิดอยู่ `thai_l1_catalog` | หลักฐาน "ทำตามไหม" ใช้ `attempts`/`sessions` ที่เกิดหลังเห็น dashboard แทน |
| `review_states` | `user_id`, `word_id` (PK คู่), `difficulty`, `stability`, `due`, `last_review`, **`elapsed_days`**, **`scheduled_days`**, **`learning_steps`**, `reps`, `lapses`, `state` | สถานะ FSRS v6 ต่อ user-word (sync กับ ts-fsrs ฝั่ง client — server-wins) |
| `mastery_snapshots` | `user_id`, `skill_id`, `p_mastery`, **`bkt_run_id`**, `computed_at` | ผล BKT posterior ล่าสุด (+ ประวัติไว้พล็อตพัฒนาการ) |
| ~~`mock_exam_sessions`~~ | **ยุบเข้า `sessions` แล้ว (21 ส.ค.)** — คะแนน mock เป็นคอลัมน์จริงใน `sessions` (score_listening/score_reading/score_total สเกล 200/passed ≥120 — ยกออกจาก detail jsonb 21 ส.ค.) | pre/post = หลักฐาน gain score เหมือนเดิม แต่ `kind` แยก pretest ออกจาก mock ตาม PL-03 |
| `thai_l1_catalog` | `id`, `code`, `error_group (tone_2_3\|retroflex\|grammar_transfer\|...)`, `description_th`, `example`, `cause_th (อธิบายด้วย L1 transfer)`, `remedy (วิธีเจาะสอน เช่น minimal pair)`, `evidence (อ้างอิงงานวิจัยจริง — ห้ามแต่ง)`, **`skill_id`** NOT NULL UNIQUE (KC ที่ไม่ผูก skill = BKT ตามไม่ได้ = ไม่มีความหมาย) | จุดขายหลัก — เผยแพร่เป็น open dataset ได้ (Zenodo DOI) |
| `sentences` | `id`, `category`, `tokens (jsonb — ลำดับคำเฉลย)`, `pinyin`, `meaning_th`, `focus_th`, **`skill_id (FK — เดิมเป็น `kc_code` text ลอย)`**, `audio_path`, **`source_attribution`**, `status` | **เนื้อหาเรียน ไม่ใช่ข้อสอบ** (คนละตารางกับ `items`) — ตอนนี้อยู่ใน `apps/web/src/data/sentences.ts` จะยกขึ้นตารางนี้ · ต้องผ่านทีมก่อนเสิร์ฟ (CG-01) · `source_attribution` = เครดิตถ้าดึงประโยคจาก Tatoeba (CC BY 2.0 FR) |
| `sentence_words` | `sentence_id`, `word_id`, `position` (PK ร่วม) | **M:N ประโยค ↔ คำ** — บังคับกฎ "ประโยคใช้เฉพาะคำที่เรียนแล้ว" และเตือนก่อนลบคำที่ถูกอ้างอยู่ (RO-02) |

**RLS (Row-Level Security):**
- ตารางต่อผู้ใช้ (`attempts`, `sessions`, `review_states`, `sentence_states`, `category_progress`, `mastery_snapshots`, `foundation_progress`, `users`): เปิด RLS — policy `user_id = auth.uid()` (SELECT/INSERT ของตัวเองเท่านั้น · `attempts` ไม่ให้ UPDATE/DELETE เลย = append-only ทั้งเชิง policy)
- **`exam_forms` / `form_items`: ไม่เปิดอ่านสาธารณะ** — ถ้าเปิด ผู้ทดลองจะรู้ว่าชุด post มีข้อไหน · เสิร์ฟผ่าน endpoint ที่เช็ก `locked_until` เท่านั้น
- **ถอนความยินยอม (ON-05):** ไม่ลบแถว `attempts` (ขัด append-only + ทำลาย dataset) — ล้าง PII ใน `users` แล้วประทับ `anonymized_at` · ต้องเขียนวิธีนี้ในข้อความ consent
- ตารางเนื้อหา (`words`, `skills`, `items`, `item_skills`, `thai_l1_catalog`, `sentences`, `sentence_words`): อ่านสาธารณะ (SELECT ทุกคน) เขียนได้เฉพาะ service role — **นโยบาย `answer_key`:** ข้อ**ฝึก/ทวน**เสิร์ฟพร้อมเฉลยได้ (จำเป็นต่อการตรวจออฟไลน์ — server ตรวจซ้ำเป็น source of truth) · ข้อใน **Mock Exam** เสิร์ฟผ่าน view/endpoint ที่**ตัด `answer_key` ออก** และตรวจฝั่ง server เท่านั้น (ยังเป็น rule เทียบเฉลย 100%) — กัน pre/post gain score ปนเปื้อนจากการเห็นเฉลยล่วงหน้า
- FastAPI ใช้ **service role key** (ข้าม RLS) แต่กรอง `user_id` จาก JWT เองทุก query

---

## 5. ML Pipeline (pyBKT + การวัดผล)

```
attempts (Supabase) ──export──▶ ml/ notebook: fit pyBKT ต่อทักษะ (offline/batch)
                                      │
                                      ▼
                     พารามิเตอร์รายทักษะ P(L0), P(T), P(S), P(G)
                                      │  เขียนกลับ → skills.bkt_*
                                      ▼
              FastAPI (runtime): คำนวณแค่ posterior ต่อการตอบ (เบา เร็ว)
                                      │
                                      ▼
                    mastery_snapshots ──▶ Dashboard (กราฟ Recharts)
                                      └──▶ จัดลำดับ: เสิร์ฟข้อที่ทักษะอ่อน + ให้น้ำหนักคิวทวน
```

- **วงจร:** ทุกการตอบ (ฝึก/ทวน/mock exam) → `attempts` → เทรนใหม่เป็นรอบ ๆ (batch — ไม่เทรนใน runtime) → พารามิเตอร์อัปเดต → posterior แม่นขึ้น
- **Cold start:** ผู้ใช้/ระบบใหม่ยังไม่มีข้อมูล → ใช้ค่าพารามิเตอร์ตั้งต้นจากงานวิจัย (ใส่ไว้ใน `skills.bkt_*` ตั้งแต่ seed)
- **การวัด AUC:** แบ่ง `attempts` ของผู้เรียนไทยเป็น train/test → fit ด้วย train → predict ความน่าจะเป็นบน test → `roc_auc_score` (scikit-learn) · ช่วงปกติของงาน KT ≈ 0.7–0.85
- **Benchmark Duolingo SLAM 2018:** ใช้พิสูจน์ว่า pipeline ถูกต้อง + เทียบว่า AUC สมเหตุสมผล — **คนละการทดลอง** กับโมเดลจริง (SLAM ไม่มีจีน/ไทย — ห้ามเอามาเทรนต่อกัน)
- **Ablation:** เทรน 2 เวอร์ชัน — Q-matrix **มี vs ไม่มี Thai-L1 KCs** → เทียบ AUC → พิสูจน์ว่าจุดขายมีผลจริง
- **FSRS แยกขาดจาก BKT:** FSRS ตอบ "ทวนเมื่อไหร่" (ต่อ user-word, ค่าตั้งต้นสำเร็จรูป ไม่ต้องเทรน) · pyBKT ตอบ "แม่นแค่ไหน" (ต่อ skill, เทรนเอง) — mastery จาก BKT ใช้ช่วยจัดลำดับความสำคัญของสิ่งที่เข้าคิวทวน/ฝึกได้ แต่อย่าสับสนสองตัวนี้ในเล่ม

---

## 6. เสียง (pre-generate — ไม่เรียก TTS สดใน MVP)

```
HSK 3.0 wordlist + สคริปต์ข้อสอบฟัง/minimal pair
        │  scripts/generate_audio.py (รันครั้งเดียว/เมื่อเนื้อหาเปลี่ยน)
        ▼
edge-tts (zh-CN, ฟรี ไม่ต้อง key แต่ต้องเน็ต — จึงทำเป็น batch ล่วงหน้า)
        ▼
ไฟล์เสียง (mp3) — ตั้งชื่อตาม id: words/{word_id}.mp3, items/{item_id}.mp3
        ▼
Supabase Storage (public bucket `audio` — โควตาฟรี 1GB พอ)
        ▼
client โหลดผ่าน Serwist runtime cache (CacheFirst) → ฟังออฟไลน์ได้
```

- minimal pair (วรรณยุกต์ 2/3, zh/ch/sh/r) = คู่ไฟล์เสียงเทียบ ต่างกันจุดเดียว — วินิจฉัย "หู" โดยไม่ต้อง ASR
- MeloTTS = ตัวสำรองถ้า edge-tts มีปัญหา (ตาม proposal 1.3.3)
- เสียง/คำอ่านที่ generate ต้องผ่านหูทีมตรวจก่อนใช้ใน item bank (กติกาทีม)

---

## 7. Deployment + Environment

| ชิ้น | บริการ | รายละเอียด |
|---|---|---|
| Web (apps/web) | **Vercel หรือ Cloudflare Pages** | ผูก GitHub → build อัตโนมัติทุก push · env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_BASE_URL` |
| API (apps/api) | **Hugging Face Spaces (Docker)** | `Dockerfile` รัน `uvicorn app.main:app --host 0.0.0.0 --port 7860` · RAM 16GB (pyBKT+pandas สบาย) · secrets ผ่าน **HF Spaces secrets**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `GEMINI_API_KEY` |
| DB/Auth/Storage | **Supabase** (region Singapore — ข้อเสนอผู้เขียน: ใกล้ผู้ใช้ไทยสุด, ทีมยืนยันตอน setup) | free tier: DB 500MB / Auth 50k MAU / Storage 1GB |

**เรื่อง "หลับ" — กันหน้าแตกวันเดโม:**
- HF Spaces: ไม่มี request 48 ชม. → หลับ (ปลุกได้ ตื่นช้าครั้งแรก)
- Supabase: ไม่มี query 7 วัน → โปรเจกต์ pause
- แก้ด้วย **GitHub Actions cron** (`.github/workflows/keepalive.yml`): ping `GET /health` (ซึ่ง query DB เบา ๆ 1 ครั้ง → ปลุกทั้งสองตัว) — เปิดใช้อย่างน้อยช่วงก่อนเดโม/นำเสนอ

**.env:**
- แต่ละ app มี `.env.example` (ระบุ key ที่ต้องมี ไม่มีค่า) commit ได้ · ค่าจริงอยู่ใน `.env.local`/`.env` ซึ่ง **`.gitignore` กันไว้แล้ว — ห้าม commit เด็ดขาด**
- ค่า production ใส่ในหน้า env ของแต่ละบริการ (Vercel/CF · HF secrets) — **LLM key อยู่ฝั่ง server เท่านั้น ห้ามฝังใน frontend**

---

## 8. โครงสร้าง Repo ที่เสนอ (monorepo)

> โค้ดอยู่ repo `github.com/barbon441/Intelligent-Chinese-Tutoring-System-for-Thai-Learners` — เอกสารทั้งหมดอยู่ใน `docs/01–08` เพิ่มส่วนโค้ดดังนี้

```
├── apps/
│   ├── web/                  # Next.js PWA (ดู §2) — TypeScript
│   └── api/                  # FastAPI (ดู §3) — Python
├── packages/
│   └── shared/               # types/schema ที่สองฝั่งใช้ร่วม
│       ├── schemas/          # JSON Schema ของ Item, Attempt, ReviewState ฯลฯ
│       └── constants.ts|py   # ค่าคงที่: HSK_LEVELS, PASS_SCORE=120, MAX_SCORE=200, module codes
├── data/                     # ข้อมูลตั้งต้น (version-stamp ทุกไฟล์)
│   ├── wordlist/             # hsk30-level1.json (300), hsk30-level2.json (500 สะสม)
│   ├── item-bank/            # ข้อสอบ + เฉลย + Q-matrix mapping (ผ่านทีมตรวจแล้วเท่านั้น)
│   ├── thai-l1-catalog/      # คลังจุดผิด (โครงตาม §4) — เผยแพร่เป็น open dataset ได้
│   └── seeds/                # SQL/สคริปต์ seed ลง Supabase
├── ml/                       # เทรน pyBKT offline
│   ├── notebooks/            # 01-slam-benchmark.ipynb, 02-fit-thai-data.ipynb, 03-ablation-thai-l1.ipynb
│   └── scripts/              # export_attempts.py, fit_bkt.py, write_params.py
├── scripts/
│   └── generate_audio.py     # pipeline เสียง (ดู §6)
├── .github/workflows/        # keepalive.yml (+ CI ภายหลัง)
└── docs/                     # เอกสารทั้งหมด (01_…08_ เดิม)
```

**คอนเวนชันชื่อไฟล์:**
- โค้ด: อังกฤษล้วน — TS ใช้ `kebab-case.ts(x)`, Python ใช้ `snake_case.py`
- ข้อมูลใน `data/`: `หมวด-ระดับ-เวอร์ชัน.json` เช่น `hsk30-level1-v2026.07.json` (มาตรฐาน 3.0 อยู่ช่วงเปลี่ยนผ่าน — ต้อง version-stamp)
- เอกสารภาษาไทยอยู่ใน `docs/` (หมวด 01–08) · **ห้ามสร้างไฟล์สำเนา `(1)`/`ฉบับใหม่2` — แก้ในไฟล์เดิม** (กติกาทีม)

---

## 9. Decision Log ย่อ

| # | การตัดสินใจ | เหตุผลสั้น | โน้ตอ้างอิง (docs/07_คลังความรู้-Obsidian) |
|---|---|---|---|
| 1 | โฟกัส HSK 1–2 (มาตรฐาน 3.0) | ข้อสอบมีเฉลยชัด → ตรวจ rule ได้ + BKT มี ground truth + จบใน 4 เดือน | `40-การตัดสินใจ/ปรับขอบเขต-โฟกัสHSK.md` |
| 2 | ตรวจด้วย rule เทียบเฉลย — ไม่มี LLM ตรวจ | ไวยากรณ์จีนหลวม ตรวจอิสระไม่น่าเชื่อถือ (ข้อห่วงใหญ่สุดของอาจารย์) + ผลตรวจถูก 100% | `20-HSK/รูปแบบข้อสอบ-HSK-1-2.md`, `20-HSK/การวัดผลโครงงาน.md` |
| 3 | pyBKT (ไม่ใช่ DKT) เทรน offline ด้วยข้อมูลไทยเราเอง | ข้อมูลน้อย DKT เทรนไม่ไหว · BKT เบา โปร่งใส อธิบายกรรมการได้ · SLAM = benchmark เท่านั้น | `10-เทคโนโลยี/pyBKT.md` |
| 4 | FSRS v6 (ts-fsrs + py-fsrs) — แยกขาดจาก mastery | มีค่าตั้งต้นสำเร็จรูป ไม่ต้องเทรน · มีงานวิจัยรองรับ (SSP-MMC KDD 2022) | `10-เทคโนโลยี/FSRS.md` |
| 5 | minimal pair ทางการฟัง แทน ASR/วิเคราะห์เสียงพูด | HSK 1–2 ไม่มีสอบพูด + อาจารย์เตือนอย่าเน้นดัดสำเนียง — วินิจฉัย 2/3, zh/ch/sh ทาง "หู" ได้ | `10-เทคโนโลยี/NLP-จีน-และเสียง.md`, `30-Thai-L1/จุดผิดคนไทย.md` |
| 6 | Thai-L1 KCs เข้า Q-matrix เป็นทักษะให้ BKT วัด | จุดขายหลัก + ablation พิสูจน์ผลได้ | `30-Thai-L1/จุดผิดคนไทย.md`, `20-HSK/การวัดผลโครงงาน.md` |
| 7 | offline-first: Serwist + Dexie, Supabase = ตัวจริง | iOS ลบ IndexedDB ได้ (~7 วันไม่เปิด) · log การตอบ = ของมีค่าสุด ห้ามหาย | `10-เทคโนโลยี/Next.js-PWA.md`, `10-เทคโนโลยี/Supabase.md` |
| 8 | โฮสต์ฟรี: Vercel/CF Pages + HF Spaces + Supabase | ยืนยันเงื่อนไข 2026 แล้ว · ❌ Render free (RAM 512MB) / Fly.io / Railway / Koyeb (เลิกฟรี) | `10-เทคโนโลยี/โฮสติ้งฟรี.md` |
| 9 | Serwist ไม่ใช่ next-pwa | next-pwa เลิกพัฒนาแล้ว | `10-เทคโนโลยี/Next.js-PWA.md` |
| 10 | แปลไทยทีเดียวจาก จีน+อังกฤษ (CC-CEDICT อ้างอิง) + ทีมตรวจ | กันความหมายเพี้ยนสะสมจากแปลทอดต่อทอด · CC BY-SA ต้องใส่เครดิต | `10-เทคโนโลยี/NLP-จีน-และเสียง.md` |
| 11 | LLM (Gemini Flash) = เสริมเท่านั้น เรียกจาก server | ไม่ใช่ส่วนที่ใช้ประเมินผลโครงงาน · key ใน env ห้ามฝัง frontend · ออกแบบสลับ provider ได้ | proposal §1.3.4, `40-การตัดสินใจ/ปรับขอบเขต-โฟกัสHSK.md` |
| 12 | UX จาก mockup อาจารย์: กราฟรายทักษะ, ข้อสอบทีละข้อ+progress+ย้อนแก้, interaction เรียงคำ | ตรงทิศทางเรา — แต่ไม่เอาส่วนสอบพูด/ASR, เกณฑ์สมมติ, ข้อฟังเฉลยตัวเอง | `40-การตัดสินใจ/วิเคราะห์-mockup-อาจารย์.md` |

---

## 10. สิ่งที่สถาปัตยกรรมต้องเผื่อ (Extensibility)

| การต่อยอด | สิ่งที่ออกแบบเผื่อไว้แล้ว | งานเพิ่มตอนทำจริง |
|---|---|---|
| **HSK 3 (phase 2 — ถ้าทัน)** | `hsk_level` เป็นคอลัมน์ทุกตารางเนื้อหา · `item_type = word_order` + `accepted_answers` มีใน schema ตั้งแต่แรก (ใช้เป็นแบบฝึกใน 1–2 ได้เลย และเป็นที่วัดจุดผิดลำดับคำของคนไทยตรงที่สุด) · jieba มีอยู่แล้วสำหรับ grader เรียงคำ | เพิ่มคำ +500 (รวม 1,000) / ไวยากรณ์ +81 (รวม 210) · โหมด**ตัด pinyin** ในการแสดงผล · section เขียน (เรียงคำ + เติมอักษร) · ⚠️ **อย่าทำ HSK 5–6** (เรียงความปลายเปิด = กับดัก) |
| **ปลั๊กช่องทางอื่น** (แอปอื่น/ช่องทางแชต/หลาย client) | FastAPI เป็น engine อิสระ frontend-agnostic (proposal 1.6.1) — ทุกความสามารถอยู่หลัง REST API + auth ต่อ user | เพิ่ม client ใหม่เรียก API เดิม (ไม่ต้องแตะ engine) |
| **สลับ LLM provider** (Gemini → Typhoon ฯลฯ) | LLM ถูกกักอยู่ใน `services/llm.py` ที่เดียว, stateless, config ผ่าน env — ไม่มีส่วนไหนของ grading/learner model พึ่ง LLM | เขียน adapter ใหม่ + เปลี่ยน env — ระบบหลักไม่กระทบ |
| **อัปเกรดโมเดล KT** (DKT/AKT — future work) | `attempts` เป็น log มาตรฐาน `user/skill/ถูก-ผิด/เวลา` ใช้ได้กับ KT ทุกตระกูล · Q-matrix แยกเป็นตาราง | เพิ่มโมเดลใน `ml/` เทียบ AUC กับ BKT |
| **เสียงพูด/ASR (future work)** | attempts มี `time_spent_ms`/context รองรับ item type ใหม่ | โมดูลใหม่ทั้งชิ้น — นอกขอบเขตปีนี้ |
