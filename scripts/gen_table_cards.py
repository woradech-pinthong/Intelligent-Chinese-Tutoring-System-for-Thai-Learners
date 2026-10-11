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
ORDER = ["categories", "words", "users", "category_progress", "review_states", "sessions", "items", "item_skills", "attempts", "skills"]

PURPOSE = {
    "categories":        ("รายชื่อหมวด 5 หมวด (อาจารย์: cat)", "migration สร้างให้ · ไม่มีใครเพิ่มแถวในแอป · word_count DB นับเอง"),
    "words":             ("คำศัพท์ HSK 1 ทั้ง 300 คำ + เสียง (อาจารย์: word + voice · type)", "ทีมใส่จากคลังคำ · ตะวันตรวจคำแปล · แอปอ่านอย่างเดียว"),
    "users":             ("โปรไฟล์ผู้เรียน 1 คน = 1 แถว (อาจารย์: U)", "DB สร้างแถวเองตอนสมัคร (trigger) · ผู้เรียนแก้ได้เฉพาะช่องโปรไฟล์ · role/cohort แอดมินตั้ง"),
    "category_progress": ("คน × หมวด — ใครเรียนหมวดไหนไปถึงไหน", "แอปเขียนแถวของตัวเอง (RLS) · quiz_best_score / quiz_passed_at / status = quiz_passed — DB กัน client เขียน (trigger QZ-12) · เซิร์ฟเวอร์เป็นคนเติม (ตามแผน 0007)"),
    "review_states":     ("คน × คำ — ตารางนัดทวนของ FSRS", "แอปซิงก์ขึ้นมาหลังทวนคำ (ค่าจากสูตร FSRS ในเครื่อง) · เซิร์ฟเวอร์เป็นตัวจริง ทับค่าแอปได้ (server-wins) · วันนี้ยังอยู่ในเครื่อง รอซิงก์ (FS-05)"),
    "sessions":          ("1 รอบกิจกรรม = 1 แถว (ฝึก / ทวน / ควิซ / pre / post)", "แอปเปิด-ปิดได้เฉพาะรอบฝึก/ทวน/ควิซ · รอบ pre/post เซิร์ฟเวอร์สร้าง-ปิด-ให้คะแนนเท่านั้น (RLS แล้ว) · คะแนนควิซวันนี้แอปยังเขียนได้ — ให้เซิร์ฟเวอร์เขียน = แผน 0007 · attempt_no + finished_at DB เติมเอง"),
    "items":             ("คลังข้อสอบ (อาจารย์: Lis — ตาราง Ans · V1 · A1–A4)", "AI/แอดมินสร้างผ่านเซิร์ฟเวอร์ (เริ่ม draft) · อนุมัติได้เฉพาะ approver = ตะวัน หรือผู้รับโอนสิทธิ์ — DB ตรวจให้ (RO-03) · แอปอ่านอย่างเดียว เฉพาะ approved"),
    "item_skills":       ("Q-matrix — ข้อไหนวัดทักษะอะไร (ข้อเดียวหลายป้ายได้)", "คนออกข้อติดป้ายตอนสร้าง/อนุมัติข้อ"),
    "attempts":          ("ทุกคำตอบ/ทุกการเห็นคำ 1 เหตุการณ์ = 1 แถว (อาจารย์: ตารางผล U · C · Lis · # → 1/0)", "แอป/API จดอย่างเดียว · ห้ามแก้ ห้ามลบ (BK-01 — trigger กันทุก role) · อาหารของโมเดล BKT (โมเดลอ่านเฉพาะแถว graded ที่ไม่ใช่ pre/post)"),
    "skills":            ("หน่วยความรู้ย่อย 23 ตัว ที่โมเดลวัดความแม่น (ทักษะชั้นที่ 2)", "migration seed · ค่า bkt_* โมเดลเติมหลังเทรน"),
}

MEANINGS = {
    "categories": {
        "id": "เลขหมวด 1–5 (DB บังคับช่วง)", "name_th": "ชื่อหมวด (ตั้งใจให้หน้าเลือกหมวดอ่านจากนี่ — วันนี้เว็บยังใช้สำเนาในโค้ด categories.ts แก้ทีต้อง deploy)", "summary_th": "คำอธิบายสั้นว่าหมวดนี้เรียนอะไร",
        "difficulty_order": "ลำดับแนะนำ ง่าย → ยาก (PA-09)", "word_count": "จำนวนคำในหมวด — DB นับจาก words ให้เองด้วย trigger",
        "created_at": "สร้างแถวเมื่อไหร่", "updated_at": "แก้ล่าสุดเมื่อไหร่ (DB เติมเอง)"},
    "words": {
        "id": "เลขประจำคำ", "hanzi": "ตัวจีน (ห้ามซ้ำ)", "traditional": "ตัวเต็ม (ถ้ามี)", "pinyin": "พินอินพร้อมวรรณยุกต์", "pos": "ชนิดคำ (เป็นรายการ)",
        "meaning_en": "ความหมายอังกฤษจาก CC-CEDICT", "meaning_th": "คำแปลไทย (AI แปล · ตะวันตรวจ)", "th_reviewed": "ตะวันตรวจคำแปลแล้วหรือยัง (ช่องเดิม — จะใช้ review_status แทน)",
        "review_status": "สถานะตรวจ draft / pending / approved / rejected / suspended (แผน m7-2 — วันนี้ migration เติมจาก th_reviewed ครั้งเดียว โค้ดตรวจยังเขียน th_reviewed)", "reviewed_by": "ใครตรวจ", "reviewed_at": "ตรวจเมื่อไหร่",
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
            out[t] = dict(cols=cols, pk=pk, fk=fk, rows=rows)
    return out

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
    sample_note = f"แถวตัวอย่าง: {len(rows)} แถว" + (" (ค่าหลายแถวคั่นด้วย | ตามลำดับ id)" if len(rows) > 1 else "") + " — ข้อมูลสาธิต \"มิ้นท์\" ใน Supabase"
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
    for (hd, wd) in zip(["ช่อง (ชี้ไปตารางไหน)", "ชนิด", "เก็บอะไร", "ค่าของมิ้นท์ / ตัวอย่างจริง"], COLW):
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
        for k, ln in enumerate(v_lines): draw_text(d, 20 + COLW[0] + COLW[1] + COLW[2] + 6, y + 12 + 15 * k, ln, 10.5, color="#1f4e79")
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
