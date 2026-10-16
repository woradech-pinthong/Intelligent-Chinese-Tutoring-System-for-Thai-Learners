# -*- coding: utf-8 -*-
"""gen_table_cards.py — "การ์ดตาราง" 1 รูปต่อ 1 ตาราง สำหรับอธิบายอาจารย์ว่าตารางเก็บอะไรบ้าง

ดึงชื่อช่อง/ชนิด/คีย์จาก Supabase จริง (information_schema) + แถวของบัญชีสาธิต "มิ้นท์" (supabase/seed/demo_mint.sql)
ความหมายภาษาไทยของแต่ละช่องเขียนไว้ใน MEANINGS ข้างล่าง (อิงคอมเมนต์ใน docs/08_สเปค-พัฒนา/er-drawio.sql)
ผลลัพธ์: docs/08_สเปค-พัฒนา/การ์ดตาราง/NN-<table>.png  (เรียงตามเส้นทางมิ้นท์)

รัน: python scripts/gen_table_cards.py      (ต้องมี SUPABASE_DB_URL ใน apps/api/.env · pip install "psycopg[binary]" pillow)
"""
import datetime, decimal, io, json, os, sys, uuid
import psycopg
from PIL import Image, ImageDraw, ImageFont

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "docs", "08_สเปค-พัฒนา", "การ์ดตาราง")
U = "00000000-0000-4000-8000-0000000a0001"   # บัญชีสาธิต มิ้นท์

# ลำดับตามเส้นทางมิ้นท์ ① สมัคร → ② เปิดหมวด → ③ ฟังคำ → ④ ควิซ → ⑤⑥ ตอบ → ⑦ ผล → ทักษะ
ORDER = ["categories", "words", "users", "category_progress", "review_states", "sessions", "items", "item_skills", "attempts", "skills",
         # 16 ต.ค.: อีก 14 ตารางที่เหลือ (บอลขอครบ 24 ใบ) — ประโยค · ชุดข้อสอบ pre/post · พื้นฐานเสียง · สมอง BKT · หลังบ้าน
         "sentences", "sentence_words", "sentence_states", "exam_forms", "form_items",
         "foundation_stages", "foundation_lessons", "minimal_pairs", "foundation_progress",
         "thai_l1_catalog", "mastery_snapshots", "bkt_training_runs", "approval_transfers", "roadmap_state"]

PURPOSE = {
    "categories":        ("รายชื่อหมวด 5 หมวด (อาจารย์: cat)", "migration สร้างให้ · ไม่มีใครเพิ่มแถวในแอป · word_count DB นับเอง"),
    "words":             ("คำศัพท์ HSK 1 ทั้ง 300 คำ + เสียง (อาจารย์: word + voice · type)", "ทีมใส่จากคลังคำ · ตะวันตรวจคำแปล · แอปอ่านอย่างเดียว"),
    "users":             ("โปรไฟล์ผู้เรียน 1 คน = 1 แถว (อาจารย์: U)", "DB สร้างแถวเองตอนสมัคร (trigger) · ผู้เรียนแก้ได้เฉพาะช่องโปรไฟล์ · role/cohort แอดมินตั้ง"),
    "category_progress": ("คน × หมวด — ใครเรียนหมวดไหนไปถึงไหน", "แอปเขียนแถวของตัวเอง · quiz_best_score / quiz_passed_at / status = quiz_passed เซิร์ฟเวอร์เท่านั้น (DB กัน client — QZ-12)"),
    "review_states":     ("คน × คำ — ตารางนัดทวนของ FSRS", "แอปซิงก์ขึ้นมาหลังทวนคำ (ค่าจากสูตร FSRS ในเครื่อง) · เซิร์ฟเวอร์เป็นตัวจริง ทับค่าแอปได้ (server-wins)"),
    "sessions":          ("1 รอบกิจกรรม = 1 แถว (ฝึก / ทวน / ควิซ / pre / post)", "แอปเปิด-ปิดได้เฉพาะรอบฝึก/ทวน/ควิซ · รอบ pre/post และคะแนนทุกรอบ เซิร์ฟเวอร์เขียน · attempt_no + finished_at DB เติมเอง"),
    "items":             ("คลังข้อสอบ (อาจารย์: Lis — ตาราง Ans · V1 · A1–A4)", "AI/แอดมินสร้างผ่านเซิร์ฟเวอร์ (เริ่ม draft) · อนุมัติได้เฉพาะ approver = ตะวัน หรือผู้รับโอนสิทธิ์ — DB ตรวจให้ (RO-03) · แอปอ่านอย่างเดียว เฉพาะ approved"),
    "item_skills":       ("Q-matrix — ข้อไหนวัดทักษะอะไร (ข้อเดียวหลายป้ายได้)", "คนออกข้อติดป้ายตอนสร้าง/อนุมัติข้อ"),
    "attempts":          ("ทุกคำตอบ/ทุกการเห็นคำ 1 เหตุการณ์ = 1 แถว (อาจารย์: ตารางผล U · C · Lis · # → 1/0)", "แอป/API จดอย่างเดียว · ห้ามแก้ ห้ามลบ (BK-01 — trigger กันทุก role) · อาหารของโมเดล BKT (โมเดลอ่านเฉพาะแถว graded ที่ไม่ใช่ pre/post)"),
    "skills":            ("หน่วยความรู้ย่อย 23 ตัว ที่โมเดลวัดความแม่น (ทักษะชั้นที่ 2)", "migration seed · ค่า bkt_* โมเดลเติมหลังเทรน"),
    "sentences":         ("ประโยคสำหรับฝึกระดับประโยค (ฟังประโยค · อ่านประโยค · เติมคำ · เรียงประโยค) — คู่ของ words ในระดับประโยค", "AI ร่าง → ตะวันตรวจ/อนุมัติ · แอปอ่านเฉพาะ approved"),
    "sentence_words":    ("ประโยคนี้ประกอบจากคำไหนบ้าง เรียงตำแหน่ง (โยง sentences ↔ words)", "เติมพร้อมประโยค (สคริปต์/ตะวัน) · แอปอ่านอย่างเดียว"),
    "sentence_states":   ("คน × ประโยค — ใครเรียงประโยคไหน ผ่านหรือยัง (คู่กับ review_states ที่เป็น คน × คำ)", "แอป/เซิร์ฟเวอร์อัปเดตหลังตรวจเรียงประโยค"),
    "exam_forms":        ("ชุดข้อสอบ pre/post (ชุดเดียว ใช้ทั้งก่อนและหลังเรียน — มติอาจารย์)", "แอดมินสร้าง · แช่แข็งเมื่อ published หรือมีคนทำแล้ว (MK-02) · ชุดวิจัยห้ามโผล่ในโหมดฝึก (PL-09)"),
    "form_items":        ("สารบัญชุดข้อสอบ — ชุดไหนมีข้อไหน ลำดับที่เท่าไหร่", "แอดมินเติมตอนประกอบชุด · แช่แข็งตาม exam_forms"),
    "foundation_stages": ("ด่านของบทเรียนพื้นฐานเสียง 5 ด่าน (กติกา → พินอิน → วรรณยุกต์ → เกมแยกเสียง → ตารางอ้างอิง)", "migration seed · เกณฑ์ผ่านเป็น data แก้ได้ไม่ต้อง deploy"),
    "foundation_lessons":("บทเรียนย่อยในแต่ละด่าน (เนื้อหา + เสียง)", "ตะวันเขียน/ตรวจ · แอปอ่านเฉพาะ approved"),
    "minimal_pairs":     ("คู่เสียงที่ต่างกันจุดเดียว ที่ครูคัดแล้ว (เกมแยกเสียง) — แต่ละคู่ผูกจุดผิดคนไทย 1 หน่วย", "ตะวันคัด/อนุมัติ · วันนี้แอปสกัดคู่จาก words เองไปก่อน (22 คู่) จนกว่าตารางนี้จะมีแถว"),
    "foundation_progress":("คน × ด่าน — ใครผ่านด่านพื้นฐานเสียงไหนแล้ว", "แอปอัปเดตหลังทำด่าน · ใช้ตัดสินข้ามโมดูล 0 (PA-01/PA-08)"),
    "thai_l1_catalog":   ("คลังจุดผิดคนไทย 15 หน่วย — คำอธิบาย สาเหตุ วิธีแก้ หลักฐานวิจัย (1 แถว = 1 หน่วยใน skills)", "migration seed จาก catalog-v1.json (ร่าง รอตะวันอนุมัติ) · แอปอ่านอย่างเดียว"),
    "mastery_snapshots": ("ผลของโมเดล BKT — คนนี้แม่นหน่วยความรู้ไหนกี่ % (1 แถว = คน × หน่วย × เวลาที่คำนวณ)", "เซิร์ฟเวอร์เขียนหลังรัน BKT · แอปอ่านของตัวเอง (dashboard จุดแข็ง/จุดอ่อน)"),
    "bkt_training_runs": ("บันทึกการเทรนโมเดล BKT แต่ละรอบ — ใช้ข้อมูลถึงวันไหน กี่คำตอบ ได้ AUC เท่าไหร่ (full / ไม่มีจุดผิดคนไทย = ablation)", "สคริปต์เทรน (ml/) เขียน · ผลวิจัยในเล่มอ้างจากตารางนี้"),
    "approval_transfers":("โอนสิทธิ์อนุมัติข้อสอบชั่วคราว (ตะวัน → คนอื่น) — DB ใช้ตรวจตอนอนุมัติข้อ (RO-03)", "แอดมินเขียน · ยกเลิกด้วย revoked_at"),
    "roadmap_state":     ("ติ๊กความคืบหน้างานพัฒนาบนหน้า /roadmap (หลังบ้านทีม ไม่เกี่ยวผู้เรียน)", "ทีมติ๊กบนหน้าเว็บ · RO-04 จะจำกัดเฉพาะแอดมินเมื่อมีล็อกอิน"),
}

MEANINGS = {
    "categories": {
        "id": "เลขหมวด 1–5 (DB บังคับช่วง)", "name_th": "ชื่อหมวดที่โชว์บนหน้าเลือกหมวด", "summary_th": "คำอธิบายสั้นว่าหมวดนี้เรียนอะไร",
        "difficulty_order": "ลำดับแนะนำ ง่าย → ยาก (PA-09)", "word_count": "จำนวนคำในหมวด — DB นับจาก words ให้เองด้วย trigger",
        "created_at": "สร้างแถวเมื่อไหร่", "updated_at": "แก้ล่าสุดเมื่อไหร่ (DB เติมเอง)"},
    "words": {
        "id": "เลขประจำคำ", "hanzi": "ตัวจีน (ห้ามซ้ำ)", "traditional": "ตัวเต็ม (ถ้ามี)", "pinyin": "พินอินพร้อมวรรณยุกต์", "pos": "ชนิดคำ (เป็นรายการ)",
        "meaning_en": "ความหมายอังกฤษจาก CC-CEDICT", "meaning_th": "คำแปลไทย (AI แปล · ตะวันตรวจ)", "th_reviewed": "ตะวันตรวจคำแปลแล้วหรือยัง (ช่องเดิม — จะใช้ review_status แทน)",
        "review_status": "สถานะตรวจ draft / pending / approved / rejected / suspended (ใช้แทน th_reviewed)", "reviewed_by": "ใครตรวจ", "reviewed_at": "ตรวจเมื่อไหร่",
        "hsk_level": "ระดับ HSK 1 หรือ 2", "category": "อยู่หมวดไหน (1–5)", "audio_path": "ชื่อไฟล์เสียงใน Storage เช่น words/147.mp3",
        "image_path": "รูปประกอบคำ (แผน)", "etymology_image_path": "รูปที่มาของตัวอักษร (แผน)", "etymology_story_th": "เรื่องเล่าที่มาของตัวอักษร (แผน)",
        "wordlist_version": "มาจากคลังคำเวอร์ชันไหน", "created_at": "สร้างเมื่อไหร่", "updated_at": "แก้ล่าสุดเมื่อไหร่"},
    "users": {
        "id": "รหัสผู้ใช้ (uuid) = รหัสบัญชีล็อกอินของ Supabase Auth", "display_name": "ชื่อที่โชว์", "role": "learner / admin / approver (ตะวัน = approver)",
        "pdpa_consent_at": "ยอมรับ PDPA เมื่อไหร่", "consent_version": "ยอมรับข้อความ consent ฉบับไหน", "target_level": "เป้าสอบ: 1 = HSK1 · 2 = HSK2 · 0 = ยังไม่คิดเรื่องสอบ · ว่าง = ข้ามคำถาม (ON-02 ①)",
        "exam_date": "วันสอบที่ตั้งใจ", "self_level": "ประเมินตัวเอง อ่านจีนออกไหม (cant_read / some_basics / studied_before / unsure)",
        "audio_rate": "ความเร็วเสียงที่ตั้งไว้", "pinyin_hidden": "ซ่อนพินอินไหม (ค่าตั้งของผู้ใช้)", "cohort": "trial = ผู้เข้าร่วมทดลอง · team = บัญชีทีม/สาธิต (ไม่ปนผลวิจัย)",
        "trial_started_at": "เริ่มทดลองเมื่อไหร่", "anonymized_at": "ถอนความยินยอม → ล้างข้อมูลส่วนตัวเมื่อไหร่ (ON-05)", "created_at": "สมัครเมื่อไหร่", "updated_at": "แก้ล่าสุดเมื่อไหร่"},
    "category_progress": {
        "user_id": "คนไหน", "category": "หมวดไหน", "started_at": "เริ่มหมวดนี้เมื่อไหร่", "words_learned": "เรียนไปกี่คำ (นับจาก review_states)",
        "sentences_passed": "ผ่านกี่ประโยค (นับจาก sentence_states)", "quiz_best_score": "คะแนนควิซดีสุด (เซิร์ฟเวอร์เขียน)",
        "quiz_passed_at": "ผ่านควิซ ≥7/10 ครั้งแรกเมื่อไหร่ → ปลดล็อก “ควิซ” หมวดถัดไป (QZ-12 · การเรียน/ฝึกเปิดเสรีทุกหมวด)", "status": "not_started / learning / quiz_passed"},
    "review_states": {
        "user_id": "คนไหน", "word_id": "คำไหน", "difficulty": "ความยากของคำนี้สำหรับคนนี้ (FSRS)", "stability": "ความคงทนของความจำ — ประมาณกี่วันก่อนลืม (FSRS)",
        "due": "นัดทวนครั้งถัดไปเมื่อไหร่", "last_review": "ทวนล่าสุดเมื่อไหร่", "elapsed_days": "ห่างจากทวนครั้งก่อนกี่วัน", "scheduled_days": "ตั้งนัดไว้กี่วัน",
        "learning_steps": "อยู่ขั้นไหนของช่วงกำลังเรียน", "reps": "ทวนมาแล้วกี่ครั้ง", "lapses": "ลืมแล้วกี่ครั้ง", "state": "new / learning / review / relearning"},
    "sessions": {
        "id": "เลขรอบ", "user_id": "ใครทำ", "kind": "ชนิดรอบ: pretest / posttest / quiz / practice / review (mock = ค่าสงวน ยังไม่ใช้)", "form_id": "ชุดข้อสอบ (เฉพาะ pre/post)",
        "category": "หมวดไหน (ว่างถ้า pre/post)", "mode": "โหมดฝึก: listen / read / order / match", "attempt_no": "ครั้งที่เท่าไหร่ของ (คน · ชนิด · หมวด) — DB เติมเอง",
        "started_at": "เริ่มเมื่อไหร่", "finished_at": "จบเมื่อไหร่ (DB เติมเองเมื่อ done/abandoned ถ้าแอปไม่ส่งมา)", "status": "running / done / abandoned (done หรือ abandoned = ปลายทาง แก้กลับไม่ได้)",
        "total": "จำนวนข้อในรอบ", "score": "ตอบถูกกี่ข้อ", "score_listening": "pre/post: คะแนนฟัง (เต็ม 100)", "score_reading": "pre/post: คะแนนอ่าน (เต็ม 100)",
        "score_total": "pre/post: รวม (เต็ม 200)", "passed": "pre/post: ผ่านเกณฑ์ 120 ไหม", "detail": "รายละเอียดอื่น (json) เช่น เวลาต่อพาร์ต"},
    "items": {
        "id": "เลขข้อ", "module": "ด้าน: listening / reading / vocab / grammar / minimal_pair", "item_type": "รูปแบบข้อ: mcq / match / true_false / pick_pinyin / listen_pick_image / word_order",
        "category": "ข้อของหมวดไหน", "stem": "โจทย์ (ข้อฟัง: ห้ามใส่ตัวจีน/พินอิน/ข้อความของสิ่งที่ให้ฟัง — PR-02)", "choices": "ตัวเลือก (json)", "answer_key": "เฉลยตายตัว — ผู้เรียนมองไม่เห็น (MK-04)",
        "distractor_rationale": "ตัวลวงแต่ละตัวดักจุดผิดอะไร (json · ใช้วิจัย)", "audio_path": "ไฟล์เสียงของข้อ", "hsk_level": "ระดับ HSK",
        "status": "draft / pending / approved / rejected / suspended — เสิร์ฟเฉพาะ approved", "reject_reason": "เหตุผลที่ไม่อนุมัติ", "created_by": "ใครสร้างข้อ",
        "approved_by": "ใครอนุมัติ — ต้องเป็น role approver (ตะวัน) หรือผู้รับโอนสิทธิ์ใน approval_transfers · DB ตรวจให้ + เติม approved_at เอง (RO-03)", "approved_at": "อนุมัติเมื่อไหร่", "created_at": "สร้างเมื่อไหร่", "updated_at": "แก้ล่าสุดเมื่อไหร่"},
    "item_skills": {"item_id": "ข้อไหน", "skill_id": "วัดทักษะ (หน่วยความรู้ย่อย) อะไร"},
    "attempts": {
        "id": "เลขเหตุการณ์", "client_attempt_id": "รหัสที่แอปตั้งเอง — กันบันทึกซ้ำตอนซิงก์ออฟไลน์ (OF-01)", "user_id": "ใครตอบ", "session_id": "รอบไหน",
        "event_type": "graded = ตอบแล้วตรวจได้ · exposure = แค่เห็น/ฟัง · asr_hint = พูดตาม (แผน)", "item_id": "ข้อจากคลังข้อสอบ", "word_id": "ข้อที่ปั้นสดจากคำ",
        "sentence_id": "ข้อที่ปั้นจากประโยค", "skill_id": "ป้ายทักษะ ณ เวลาตอบ (โมเดลนับถูก/ผิดต่อป้ายนี้)",
        "generator": "กิจกรรมที่ทำ: flashcard / listen_mc4 / read_mc4 / match / order / ear_game / speak_along", "answer": "สิ่งที่ตอบ (json)",
        "is_correct": "ถูก/ผิด — มีค่าเฉพาะ graded · ว่างถ้าเป็น exposure หรือ asr_hint (ผลพูดตามไม่ตัดสินถูก/ผิด)", "answered_at": "ตอบเมื่อไหร่", "time_spent_ms": "ใช้เวลากี่มิลลิวินาที", "app_version": "เวอร์ชันแอปตอนตอบ",
        "context": "practice / review / quiz / pretest / posttest — ถ้ามีรอบ DB บังคับให้ตรง sessions.kind · แอปจดได้แค่ practice/review/quiz · pre/post เซิร์ฟเวอร์จด"},
    "skills": {
        "id": "เลขทักษะ", "code": "รหัส เช่น TL-TONE-T2AS3 · VOCAB-C1 · SKILL-LISTEN", "name_th": "ชื่อไทย", "type": "thai_l1 (จุดผิดคนไทย 15) · vocab (คำศัพท์หมวด 5) · skill (ฟัง/อ่าน/เรียง 3) · DB สำรอง grammar / tone / consonant ไว้ ยังไม่ใช้",
        "hsk_level": "ระดับ HSK", "bkt_prior": "BKT: โอกาสรู้อยู่แล้วตั้งแต่ต้น", "bkt_learn": "BKT: โอกาสเรียนรู้ต่อครั้ง", "bkt_slip": "BKT: รู้แต่ตอบผิด",
        "bkt_guess": "BKT: ไม่รู้แต่เดาถูก", "bkt_run_id": "ค่ามาจากรอบเทรนไหน", "created_at": "สร้างเมื่อไหร่"},
    "sentences": {
        "id": "เลขประโยค", "category": "ประโยคของหมวดไหน", "tokens": "คำที่ประกอบเป็นประโยค เรียงตามลำดับที่ถูก (ใช้สับให้เรียง / เว้นช่องให้เติม)",
        "pinyin": "พินอินทั้งประโยค", "meaning_th": "คำแปลไทย (โจทย์ของฟังประโยค/อ่านประโยค)", "focus_th": "จุดไวยากรณ์ที่ประโยคนี้สอน (การ์ด “ต่างจากไทยตรงไหน”)",
        "skill_id": "จุดผิดคนไทยที่ประโยคนี้ดัก (หน่วยใน skills) — ว่างถ้าเป็นประโยคโครงสร้างทั่วไป", "audio_path": "ไฟล์เสียงจริงของประโยค (ว่าง = ใช้เสียงอ่านจากเครื่องไปก่อน)",
        "source_attribution": "เครดิตที่มา ถ้าดึงจากคลังเปิด (เช่น Tatoeba)", "status": "draft / pending / approved / rejected / suspended — เสิร์ฟเฉพาะ approved",
        "created_at": "สร้างเมื่อไหร่", "updated_at": "แก้ล่าสุดเมื่อไหร่"},
    "sentence_words": {"sentence_id": "ประโยคไหน", "word_id": "คำไหน (โยงไป words — เอาเสียง/คำแปลรายคำมาใช้ได้)", "position": "อยู่ตำแหน่งที่เท่าไหร่ในประโยค (เริ่ม 1)"},
    "sentence_states": {"user_id": "คนไหน", "sentence_id": "ประโยคไหน", "tries": "ลองเรียงมาแล้วกี่รอบ", "best_correct": "เคยเรียงถูกครบไหม",
                        "last_at": "ทำล่าสุดเมื่อไหร่", "passed_at": "เรียงถูกครั้งแรกเมื่อไหร่ (ว่าง = ยังไม่ผ่าน)"},
    "exam_forms": {
        "id": "เลขชุด", "code": "รหัสชุด เช่น HSK1-PREPOST-A", "version": "เวอร์ชัน — ออกชุดใหม่ = code เดิม version +1 (ชุดเดิมห้ามแก้)", "name_th": "ชื่อชุด",
        "kind": "pretest = ชุดวิจัยใช้ทั้ง pre และ post · mock = สงวนไว้ ยังไม่ใช้", "hsk_level": "ระดับ HSK", "item_count": "กี่ข้อ (นับจาก form_items)",
        "time_limit_s": "เวลาทำ (วินาที)", "locked_until": "ชุด post ห้ามเสิร์ฟจนถึงวันวัดผล", "published_at": "แช่แข็งเมื่อไหร่ — หลังจากนี้ห้ามแก้ข้อในชุด",
        "research_use_only": "true = ใช้ได้แค่ pre/post · ข้อในชุดห้ามโผล่ในโหมดฝึกและควิซ (กัน practice effect — PL-09)",
        "status": "draft / pending / approved / rejected / suspended", "created_at": "สร้างเมื่อไหร่", "updated_at": "แก้ล่าสุดเมื่อไหร่"},
    "form_items": {"form_id": "ชุดไหน", "item_id": "ข้อไหน (จาก items)", "position": "ข้อที่เท่าไหร่ในชุด (post สลับลำดับตอนเสิร์ฟ ไม่แก้ค่านี้)"},
    "foundation_stages": {"code": "รหัสด่าน: intro / pinyin / tones / ear_game / reference", "name_th": "ชื่อด่าน", "position": "ลำดับด่าน",
                          "pass_threshold": "เกณฑ์ผ่าน (ear_game = 0.80 · ด่านอ่านอย่างเดียว = ว่าง)", "soft_gate_after_tries": "ไม่ผ่านครบกี่รอบถึงเปิดประตูนุ่มให้ข้ามได้ (PA-08)"},
    "foundation_lessons": {"id": "เลขบทเรียน", "stage": "อยู่ด่านไหน", "position": "ลำดับในด่าน", "title_th": "ชื่อบทเรียน", "body_th": "เนื้อหา",
                           "audio_path": "ไฟล์เสียงประกอบ", "status": "draft / pending / approved …", "created_at": "สร้างเมื่อไหร่", "updated_at": "แก้ล่าสุดเมื่อไหร่"},
    "minimal_pairs": {
        "id": "เลขคู่", "skill_id": "จุดผิดคนไทยที่คู่นี้ดัก (เช่น TL-TONE-T2AS3 · TL-RETRO-FLAT-MERGE)", "hanzi_a": "คำ A (ตัวจีน)", "pinyin_a": "พินอินคำ A",
        "audio_a_path": "เสียงคำ A", "word_a_id": "คำ A คือคำไหนใน words (ว่างถ้าไม่อยู่ใน 300 คำ)", "hanzi_b": "คำ B (ตัวจีน)", "pinyin_b": "พินอินคำ B",
        "audio_b_path": "เสียงคำ B", "word_b_id": "คำ B คือคำไหนใน words", "note_th": "อธิบายแบบคนไทยว่าสองคำต่างกันตรงไหน (โชว์ตอนตอบผิด)",
        "status": "draft / pending / approved …", "created_at": "สร้างเมื่อไหร่", "updated_at": "แก้ล่าสุดเมื่อไหร่"},
    "foundation_progress": {"user_id": "คนไหน", "stage": "ด่านไหน", "tries": "ทำมาแล้วกี่รอบ", "best_accuracy": "ความแม่นดีสุด (เทียบ pass_threshold)", "passed_at": "ผ่านด่านเมื่อไหร่"},
    "thai_l1_catalog": {
        "id": "เลขรายการ", "code": "รหัสจุดผิด เช่น TL-TONE-T2AS3", "error_group": "กลุ่ม: TL-TONE วรรณยุกต์ · TL-RETRO ม้วนลิ้น · TL-GRAM ไวยากรณ์",
        "description_th": "ลักษณะข้อผิด", "example": "ตัวอย่างข้อผิด", "cause_th": "สาเหตุจากภาษาไทย", "remedy": "วิธีเจาะสอน",
        "evidence": "งานวิจัยที่รองรับ (ตรวจแล้วว่ามีจริง — ห้ามแต่ง)", "skill_id": "ตรงกับหน่วยไหนใน skills (1 ต่อ 1)"},
    "mastery_snapshots": {"user_id": "คนไหน", "skill_id": "หน่วยความรู้ไหน", "p_mastery": "ความน่าจะเป็นว่าแม่นแล้ว 0–1 (ผล BKT)",
                          "bkt_run_id": "คำนวณด้วยพารามิเตอร์จากรอบเทรนไหน", "computed_at": "คำนวณเมื่อไหร่ (เก็บทุกรอบ ดูพัฒนาการได้)"},
    "bkt_training_runs": {
        "id": "เลขรอบเทรน", "run_at": "เทรนเมื่อไหร่", "data_until": "ใช้คำตอบถึงวันไหน", "n_attempts": "ใช้กี่คำตอบ", "n_users": "จากผู้เรียนกี่คน", "kc_count": "กี่หน่วยความรู้",
        "variant": "full = มีจุดผิดคนไทย · no_thai_l1 = ตัดออก (ablation) · slam_benchmark = ทดสอบ pipeline", "split_seed": "seed แบ่ง train/test (ทำซ้ำได้)",
        "auc": "ค่า AUC บนชุดทดสอบ (เติมหลังเทรนจริง)", "auc_by_skill": "AUC แยกรายหน่วย (json)", "params": "พารามิเตอร์ทุกหน่วยของรอบนี้ (json)", "notes": "บันทึก"},
    "approval_transfers": {"id": "เลขรายการ", "from_user_id": "ผู้โอนสิทธิ์ (approver)", "to_user_id": "ผู้รับสิทธิ์", "reason": "เหตุผล", "granted_at": "โอนเมื่อไหร่", "revoked_at": "ยกเลิกเมื่อไหร่ (ว่าง = ยังมีผล)"},
    "roadmap_state": {"item_id": "รหัสงานในหน้า /roadmap", "done": "ติ๊กเสร็จแล้วไหม", "updated_by": "ใครติ๊ก", "updated_at": "ติ๊กเมื่อไหร่"},
}

TYPE_TH = {"character varying": "text", "timestamp with time zone": "timestamptz", "integer": "int", "boolean": "bool", "ARRAY": "list",
           "double precision": "float", "USER-DEFINED": "enum"}

def db_url():
    url = os.environ.get("SUPABASE_DB_URL")
    if url: return url
    for line in open(os.path.join(ROOT, "apps", "api", ".env"), encoding="utf-8"):
        if line.startswith("SUPABASE_DB_URL="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("❌ ไม่พบ SUPABASE_DB_URL")

SAMPLE_SQL = {
    "categories": "select * from categories where id = 1", "words": "select * from words where id = 147",
    "users": f"select * from users where id = '{U}'", "category_progress": f"select * from category_progress where user_id = '{U}'",
    "review_states": f"select * from review_states where user_id = '{U}'", "sessions": f"select * from sessions where user_id = '{U}' order by id",
    "items": "select * from items where distractor_rationale->>'seed' = 'demo-mint' order by id limit 1",
    "item_skills": "select * from item_skills where item_id = 1 order by skill_id", "attempts": f"select * from attempts where user_id = '{U}' order by id",
    "skills": "select * from skills where id in (21, 16, 1) order by id desc",
    "sentences": "select * from sentences order by id limit 1", "sentence_words": "select * from sentence_words order by sentence_id, position limit 2",
    "sentence_states": f"select * from sentence_states where user_id = '{U}' limit 1", "exam_forms": "select * from exam_forms order by id limit 1",
    "form_items": "select * from form_items order by form_id, position limit 2", "foundation_stages": "select * from foundation_stages where code = 'ear_game'",
    "foundation_lessons": "select * from foundation_lessons order by id limit 1", "minimal_pairs": "select * from minimal_pairs order by id limit 1",
    "foundation_progress": f"select * from foundation_progress where user_id = '{U}' limit 1", "thai_l1_catalog": "select * from thai_l1_catalog where code = 'TL-TONE-T2AS3'",
    "mastery_snapshots": f"select * from mastery_snapshots where user_id = '{U}' order by computed_at desc limit 1",
    "bkt_training_runs": "select * from bkt_training_runs order by id desc limit 1", "approval_transfers": "select * from approval_transfers order by id limit 1",
    "roadmap_state": "select * from roadmap_state where done order by updated_at desc limit 1",
}

# ตารางที่ยังว่างใน Supabase → โชว์ "ตัวอย่างตามแบบ" ให้เห็นว่าแถวหน้าตาเป็นอย่างไร (สีเทา + หมายเหตุชัดเจน ไม่ใช่ข้อมูลจริง)
# {skill:CODE} / {word:ตัวจีน} / {wordid:ตัวจีน} จะถูกแทนด้วย id จริงตอนรัน · ตารางโมเดลใช้ข้อความแทนตัวเลข (ห้ามมีตัวเลข AUC/ความแม่นสมมุติ)
EMPTY_WHEN = {
    "sentences": "ตะวันตรวจประโยคชุดแรก (10 ประโยค) แล้วใส่ลงตาราง", "sentence_words": "ใส่ประโยคพร้อมคำที่ประกอบ",
    "sentence_states": "มีล็อกอิน + ผู้เรียนเรียงประโยคครั้งแรก", "exam_forms": "สร้างชุด pre/post 40 ข้อ (หลังอาจารย์เคาะจำนวนข้อ)",
    "form_items": "ประกอบชุด pre/post", "foundation_lessons": "ตะวันเขียนบทเรียนพื้นฐานเสียง", "minimal_pairs": "ตะวันคัดคู่เสียงจาก 22 คู่ที่ระบบสกัดให้",
    "foundation_progress": "มีล็อกอิน + ผู้เรียนทำด่านพื้นฐานเสียง", "mastery_snapshots": "รัน BKT ครั้งแรกหลังมีคำตอบในฐานข้อมูล",
    "bkt_training_runs": "เทรน BKT รอบแรก (หลังทดลองเก็บคำตอบ)", "approval_transfers": "ตะวันโอนสิทธิ์อนุมัติให้คนอื่นชั่วคราว",
}
DESIGN_EXAMPLE = {
    "sentences": dict(id=4, category=1, tokens=["这", "是", "我", "的", "书"], pinyin="zhè shì wǒ de shū", meaning_th="นี่คือหนังสือของฉัน",
                      focus_th="ของใคร: 我的 วางหน้าคำนาม (ไทยวางหลัง)", skill_id="{skill:TL-GRAM-DE-ORDER}", audio_path="sentences/4.mp3",
                      source_attribution=None, status="approved", created_at="(วันที่ใส่)", updated_at=None),
    "sentence_words": [dict(sentence_id=4, word_id="{word:这}", position=1), dict(sentence_id=4, word_id="{word:书}", position=5)],
    "sentence_states": dict(user_id=U, sentence_id=4, tries=2, best_correct=True, last_at="(เวลาที่ทำ)", passed_at="(ครั้งแรกที่เรียงถูก)"),
    "exam_forms": dict(id=1, code="HSK1-PREPOST-A", version=1, name_th="แบบทดสอบก่อน/หลังเรียน HSK 1 ชุด A", kind="pretest", hsk_level=1, item_count=40,
                       time_limit_s=2400, locked_until="(วันวัดผล)", published_at="(วันแช่แข็ง)", research_use_only=True, status="approved", created_at="(วันที่สร้าง)", updated_at=None),
    "form_items": [dict(form_id=1, item_id="(ข้อฟังข้อที่ 1)", position=1), dict(form_id=1, item_id="(ข้ออ่านข้อที่ 1)", position=21)],
    "foundation_lessons": dict(id=1, stage="tones", position=1, title_th="วรรณยุกต์ 4 เสียง เทียบกับเสียงไทย", body_th="(เนื้อหาบทเรียน)",
                               audio_path="foundation/tones-1.mp3", status="approved", created_at="(วันที่ใส่)", updated_at=None),
    "minimal_pairs": dict(id=1, skill_id="{skill:TL-TONE-T2AS3}", hanzi_a="玩", pinyin_a="wán", audio_a_path="words/{wordid:玩}.mp3", word_a_id="{word:玩}",
                          hanzi_b="晚", pinyin_b="wǎn", audio_b_path="words/{wordid:晚}.mp3", word_b_id="{word:晚}",
                          note_th="เสียง 2 ขึ้นเส้นเดียว · เสียง 3 กดต่ำก่อนแล้วค่อยขึ้น", status="approved", created_at="(วันที่คัด)", updated_at=None),
    "foundation_progress": dict(user_id=U, stage="ear_game", tries=2, best_accuracy="(ความแม่นดีสุด เช่น 0.85)", passed_at="(วันที่ผ่าน)"),
    "mastery_snapshots": dict(user_id=U, skill_id="{skill:SKILL-LISTEN}", p_mastery="(ค่า 0–1 จาก BKT หลังเทรนจริง)", bkt_run_id=1, computed_at="(เวลาที่คำนวณ)"),
    "bkt_training_runs": dict(id=1, run_at="(วันเทรน)", data_until="(วันตัดข้อมูล)", n_attempts="(จำนวนคำตอบที่ใช้)", n_users="(จำนวนผู้เรียน)", kc_count=23,
                              variant="full", split_seed=42, auc="(ค่าจริงหลังเทรน)", auc_by_skill="(json)", params="(json)", notes=None),
    "approval_transfers": dict(id=1, from_user_id="(id ของตะวัน)", to_user_id="(id ของบอล)", reason="ตะวันติดงานประจำ 2 สัปดาห์", granted_at="(วันโอน)", revoked_at=None),
}

def fetch():
    out = {}
    with psycopg.connect(db_url()) as conn, conn.cursor() as cur:
        for t in ORDER:
            cur.execute("""select column_name, data_type from information_schema.columns
                           where table_schema = 'public' and table_name = %s order by ordinal_position""", (t,))
            cols = [(r[0], TYPE_TH.get(r[1], r[1])) for r in cur.fetchall()]
            cur.execute("""select kcu.column_name from information_schema.table_constraints tc
                           join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name
                           where tc.table_schema = 'public' and tc.table_name = %s and tc.constraint_type = 'PRIMARY KEY' order by kcu.ordinal_position""", (t,))
            pk = list(dict.fromkeys(r[0] for r in cur.fetchall()))
            cur.execute("""select kcu.column_name, ccu.table_name from information_schema.table_constraints tc
                           join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name
                           join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
                           where tc.table_schema = 'public' and tc.table_name = %s and tc.constraint_type = 'FOREIGN KEY'""", (t,))
            fk = {r[0]: r[1] for r in cur.fetchall()}
            cur.execute(SAMPLE_SQL[t])
            names = [d[0] for d in cur.description]
            rows = [dict(zip(names, r)) for r in cur.fetchall()]
            design = False
            if not rows and t in DESIGN_EXAMPLE:
                ex = DESIGN_EXAMPLE[t]; rows = [dict(r) for r in (ex if isinstance(ex, list) else [ex])]
                for r in rows:
                    for k, v in r.items():
                        if isinstance(v, str) and "{" in v: r[k] = resolve(cur, v)
                design = True
            demo = (not design) and any(str(r.get("user_id")) == U for r in rows)
            out[t] = dict(cols=cols, pk=pk, fk=fk, rows=rows, design=design, demo=demo)
    return out

def resolve(cur, text):
    """แทน {skill:CODE} → id ใน skills · {word:汉字} / {wordid:汉字} → id ใน words"""
    import re
    def _rep(m):
        kind, key = m.group(1), m.group(2)
        if kind == "skill":
            cur.execute("select id from skills where code = %s", (key,)); r = cur.fetchone()
            return f"{r[0]} ({key})" if r else f"? ({key})"
        cur.execute("select id from words where hanzi = %s", (key,)); r = cur.fetchone()
        if kind == "wordid": return str(r[0]) if r else "?"
        return f"{r[0]} ({key})" if r else f"? ({key})"
    return re.sub(r"\{(skill|word|wordid):([^}]+)\}", _rep, text)

def fmt(v):
    if v is None: return "–"
    if isinstance(v, bool): return "true" if v else "false"
    if isinstance(v, datetime.datetime): return v.strftime("%Y-%m-%d %H:%M")
    if isinstance(v, datetime.date): return v.isoformat()
    if isinstance(v, uuid.UUID): s = str(v); return "…" + s[-6:]
    if isinstance(v, (dict, list)): return json.dumps(v, ensure_ascii=False)
    if isinstance(v, float): return f"{v:g}"
    if isinstance(v, decimal.Decimal): return f"{float(v):g}"
    return str(v)

# ---------------- วาด ----------------
S = 2
FONTS = {}
def font(kind, size, bold=False):
    key = (kind, size, bold)
    if key not in FONTS:
        if kind == "cjk": path = "C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc"
        else: path = "C:/Windows/Fonts/leelawdb.ttf" if bold else "C:/Windows/Fonts/LeelawUI.ttf"
        FONTS[key] = ImageFont.truetype(path, int(size * S))
    return FONTS[key]
def kind_of(ch):
    o = ord(ch)
    return "th" if (0x0E00 <= o <= 0x0E7F or o < 0x80 or ch in "·–—“”’«»") else "cjk"
def runs(text):
    out, cur, k = [], "", None
    for ch in text:
        kk = kind_of(ch)
        if kk != k and cur: out.append((k, cur)); cur = ""
        cur += ch; k = kk
    if cur: out.append((k, cur))
    return out
def tw(text, size, bold=False): return sum(font(k, size, bold).getlength(s) for k, s in runs(text)) / S
def draw_text(d, x, y, s, size=10.5, bold=False, color="black"):
    px = x * S
    for k, seg in runs(s):
        f = font(k, size, bold); d.text((px, y * S), seg, font=f, fill=color, anchor="lm"); px += f.getlength(seg)
def wrap(s, size, maxw, bold=False, max_lines=3):
    words_, lines, line = s.split(" "), [], ""
    for w in words_:
        cand = (line + " " + w).strip()
        if tw(cand, size, bold) <= maxw: line = cand; continue
        if line: lines.append(line); line = ""
        # คำเดียวยาวเกิน → ตัดตามตัวอักษร
        while tw(w, size, bold) > maxw:
            k = len(w)
            while k > 1 and tw(w[:k], size, bold) > maxw: k -= 1
            lines.append(w[:k]); w = w[k:]
        line = w
    if line: lines.append(line)
    if len(lines) > max_lines:
        lines = lines[:max_lines]; last = lines[-1]
        while last and tw(last + "…", size, bold) > maxw: last = last[:-1]
        lines[-1] = last + "…"
    return lines

COLW = [235, 95, 470, 340]   # ช่อง · ชนิด · เก็บอะไร · ค่าของมิ้นท์/ตัวอย่าง
W = sum(COLW) + 40

def card(idx, t, data, date):
    cols, pk, fk, rows = data["cols"], data["pk"], data["fk"], data["rows"]
    purpose, writer = PURPOSE[t]
    meanings = MEANINGS[t]
    # เตรียมแถว
    body = []
    for name, typ in cols:
        label = name + ("  (คีย์)" if name in pk else "") + (f"  → {fk[name]}" if name in fk else "")
        mean = meanings.get(name, "?? ยังไม่มีคำอธิบาย")
        vals = [fmt(r.get(name)) for r in rows]
        val = " | ".join(vals) if len(rows) > 1 else (vals[0] if vals else "–")
        m_lines = wrap(mean, 10.5, COLW[2] - 12); v_lines = wrap(val, 10.5, COLW[3] - 12, max_lines=2)
        l_lines = wrap(label, 10.5, COLW[0] - 12, bold=True, max_lines=2)
        n = max(len(m_lines), len(v_lines), len(l_lines))
        body.append((l_lines, typ, m_lines, v_lines, 10 + 15 * n))
    head_h = 92
    design = data.get("design", False)
    if design:
        sample_note = f"ตารางนี้ยังว่างใน Supabase — ช่องขวาเป็น \"ตัวอย่างตามแบบ\" ไม่ใช่ข้อมูลจริง · แถวแรกจะเกิดเมื่อ: {EMPTY_WHEN.get(t, '—')}"
    elif data.get("demo"):
        sample_note = f"แถวตัวอย่าง: {len(rows)} แถว" + (" (ค่าหลายแถวคั่นด้วย | ตามลำดับ id)" if len(rows) > 1 else "") + " — ข้อมูลสาธิต \"มิ้นท์\" ใน Supabase"
    else:
        sample_note = f"แถวตัวอย่าง: {len(rows)} แถว" + (" (ค่าหลายแถวคั่นด้วย |)" if len(rows) > 1 else "") + " — ข้อมูลจริงใน Supabase (ข้อมูลตั้งต้น ไม่ใช่ของมิ้นท์)"
    val_head = "ตัวอย่างตามแบบ (ยังไม่มีแถวจริง)" if design else "ค่าของมิ้นท์ / ตัวอย่างจริง"
    H = head_h + 26 + sum(b[4] for b in body) + 44
    im = Image.new("RGB", (W * S, H * S), "white"); d = ImageDraw.Draw(im)
    # หัวการ์ด
    d.rectangle([0, 0, W * S, head_h * S], fill="#dae8fc")
    draw_text(d, 20, 22, f"{idx:02d}  {t}", 17, True)
    draw_text(d, 20, 46, purpose, 11.5, color="#1a1a1a")
    draw_text(d, 20, 64, "คีย์หลัก: (" + ", ".join(pk) + ")   ·   ใครเขียน: " + writer, 10, color="#444444")
    draw_text(d, 20, 80, sample_note, 9.5, color="#666666")
    # หัวคอลัมน์
    y = head_h
    x = 20
    for (hd, wd) in zip(["ช่อง (ชี้ไปตารางไหน)", "ชนิด", "เก็บอะไร", val_head], COLW):
        d.rectangle([x * S, y * S, (x + wd) * S, (y + 26) * S], fill="#f5f5f5", outline="#6c8ebf", width=S)
        draw_text(d, x + 6, y + 13, hd, 10, True); x += wd
    y += 26
    for i, (l_lines, typ, m_lines, v_lines, rh) in enumerate(body):
        x = 20
        fill = "#fff2cc" if (cols[i][0] in pk or cols[i][0] in fk) else "white"
        for ci, wd in enumerate(COLW):
            d.rectangle([x * S, y * S, (x + wd) * S, (y + rh) * S], fill=fill if ci == 0 else "white", outline="#6c8ebf", width=S)
            x += wd
        for k, ln in enumerate(l_lines): draw_text(d, 26, y + 12 + 15 * k, ln, 10.5, True)
        draw_text(d, 20 + COLW[0] + 6, y + 12, typ, 10, color="#555555")
        for k, ln in enumerate(m_lines): draw_text(d, 20 + COLW[0] + COLW[1] + 6, y + 12 + 15 * k, ln, 10.5)
        for k, ln in enumerate(v_lines): draw_text(d, 20 + COLW[0] + COLW[1] + COLW[2] + 6, y + 12 + 15 * k, ln, 10.5, color="#8a8a8a" if design else "#1f4e79")
        y += rh
    draw_text(d, 20, y + 20, f"สีเหลือง = คีย์/ช่องที่ชี้ไปตารางอื่น · ชื่อช่อง/ชนิดดึงจาก Supabase จริง {date} · ความหมายอิง er-drawio.sql · สร้างด้วย scripts/gen_table_cards.py",
              9, color="#777777")
    path = os.path.join(OUT_DIR, f"{idx:02d}-{t}.png")
    im.save(path, optimize=True)
    missing = [n for n, _ in cols if n not in meanings]
    return path, len(cols), missing

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    data = fetch()
    date = datetime.date.today().isoformat()
    for i, t in enumerate(ORDER, 1):
        path, n, missing = card(i, t, data[t], date)
        print(f"✅ {os.path.basename(path)}  {n} ช่อง" + (f"  ⚠️ ไม่มีคำอธิบาย: {missing}" if missing else ""))
        extra = [k for k in MEANINGS[t] if k not in [c for c, _ in data[t]["cols"]]]
        if extra: print(f"   ⚠️ MEANINGS มีช่องที่ไม่มีใน DB: {extra}")

if __name__ == "__main__":
    main()
