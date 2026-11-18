# gen_seed_skills.py — สร้าง supabase/migrations/20261007000006_seed_skills_catalog.sql
# จาก data/thai-l1/catalog-v1.json (จุดผิดคนไทย 15 KC — ร่าง v1 รอทีมตรวจ) + KC คำศัพท์รายหมวด 5 + ทักษะ 3 (CG-08 = 23 KC)
# รัน: python scripts/gen_seed_skills.py   (ไฟล์ปลายทางรันซ้ำได้ — upsert ด้วย code)
# ⚠️ หลังรัน --apply แล้ว ถ้า JSON เปลี่ยน ให้รันสคริปต์นี้ใหม่แล้ว `python scripts/db_migrate.py --rerun 20261007000006_seed_skills_catalog`
import io, json, os, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "thai-l1", "catalog-v1.json")
OUT = os.path.join(ROOT, "supabase", "migrations", "20261007000006_seed_skills_catalog.sql")

# ป้ายสั้นที่ผู้เรียนเห็นบน dashboard (≤30 ตัวอักษร) — ร่างโดย AI 8 ต.ค. รอทีมตรวจ/แก้ · ถ้า JSON มี "name_th" จะใช้ของ JSON ก่อน
NAME_TH = {
    "TL-TONE-T2AS3":       "เสียง 2 เพี้ยนไปคล้ายเสียง 3",
    "TL-TONE-T3AS2":       "เสียง 3 เพี้ยนไปคล้ายเสียง 2",
    "TL-TONE-T3HALF":      "ครึ่งเสียง 3 ท้ายคำ/ท้ายประโยค",
    "TL-TONE-T3SANDHI":    "ไม่แปลงเสียง 3+3 → 2+3",
    "TL-TONE-T4OVER":      "เสียง 4 ตกช้า/ลากยาว",
    "TL-RETRO-SH-S":       "sh ออกเป็น s (ส)",
    "TL-RETRO-ZH-JZ":      "zh ออกเป็น จ / z",
    "TL-RETRO-CH-CQ":      "ch ออกเป็น ช / c",
    "TL-RETRO-R-L":        "r ออกเป็น ล/ร แบบไทย",
    "TL-RETRO-FLAT-MERGE": "แยก zh/ch/sh กับ z/c/s ไม่ออก",
    "TL-GRAM-DE-ORDER":    "วางส่วนขยาย+的 หลังคำนามแบบไทย",
    "TL-GRAM-MW":          "วลีลักษณนาม: ลำดับ/เลือก/ละ",
    "TL-GRAM-COMPL":       "บทเสริม 得/ผล วางผิดหรือละ",
    "TL-GRAM-LE":          "ใช้ 了 ผิด (แมป \"แล้ว\" ตรงตัว)",
    "TL-GRAM-ADV":         "คำวิเศษณ์วางหลังกริยาแบบไทย",
}


def q(s):
    """SQL string literal (None → NULL)"""
    if s is None:
        return "null"
    return "'" + str(s).replace("'", "''") + "'"


def short_name(text, limit=30):
    text = text.strip()
    for sep in (". ", "。", " — ", " (", " โดย", ":"):
        if sep in text and text.index(sep) < limit:
            text = text[: text.index(sep)]
    return (text[:limit] + "…") if len(text) > limit else text


d = json.load(open(SRC, encoding="utf-8"))
kcs = []
for g in d["groups"]:
    for kc in g.get("sub_errors") or []:
        kcs.append((g["group_id"], kc))
assert len(kcs) == 15, f"คาด 15 KC ได้ {len(kcs)}"
codes = [kc["kc_code"] for _, kc in kcs]
assert len(set(codes)) == 15, "kc_code ซ้ำ"
missing = [c for c in codes if c not in NAME_TH]
if missing:
    print("⚠️ ไม่มีป้ายสั้นให้:", missing, "— ใช้ตัดอัตโนมัติจาก error_th")

lines = [
    "-- 20261007000006_seed_skills_catalog.sql — seed ตาราง skills (23 KC) + thai_l1_catalog (15 จุดผิดคนไทย)",
    "-- ⚠️ สร้างโดย scripts/gen_seed_skills.py จาก data/thai-l1/catalog-v1.json (สถานะ v1-draft · รอทีมตรวจ) — อย่าแก้มือ แก้ที่ JSON/สคริปต์แล้วรันใหม่",
    "--    หลัง --apply แล้ว: python scripts/db_migrate.py --rerun 20261007000006_seed_skills_catalog",
    "-- KC 23 ตัวตาม CG-08: จุดผิดคนไทย 15 (type thai_l1) + คำศัพท์รายหมวด 5 (vocab) + ทักษะ 3 ฟัง/อ่าน/เรียงประโยค (skill)",
    "-- name_th = ป้ายสั้นบน dashboard (ร่าง AI 8 ต.ค. รอทีม) · description_th/cause_th/remedy/evidence คัดจาก JSON ตรง ๆ",
    "-- ค่า BKT (bkt_prior/learn/slip/guess) ยังว่าง — เติมหลังเทรนรอบแรก (bkt_training_runs)",
    "begin;",
    "",
    "insert into public.skills (code, name_th, type, hsk_level) values",
]
rows = []
for group_id, kc in kcs:
    name = kc.get("name_th") or NAME_TH.get(kc["kc_code"]) or short_name(kc["error_th"])
    rows.append(f"  ({q(kc['kc_code'])}, {q(name)}, 'thai_l1', 1)")
cat_names = {1: "ทักทาย & คนรอบตัว", 2: "ตัวเลข เวลา & วันที่", 3: "กิน ดื่ม & ซื้อของ", 4: "เรียน ทำงาน & สื่อสาร", 5: "เดินทาง & ชีวิตประจำวัน"}
for i in range(1, 6):
    rows.append(f"  ('VOCAB-C{i}', {q('คำศัพท์หมวด ' + str(i) + ' ' + cat_names[i])}, 'vocab', 1)")
rows += [
    "  ('SKILL-LISTEN', 'ทักษะฟัง (เสียง → ความหมาย/คำ)', 'skill', 1)",
    "  ('SKILL-READ',   'ทักษะอ่าน (ตัวจีน/พินอิน → ความหมาย)', 'skill', 1)",
    "  ('SKILL-ORDER',  'ทักษะเรียงประโยค (โครงสร้างพื้นฐาน)', 'skill', 1)",
]
lines.append(",\n".join(rows))
lines.append("on conflict (code) do update set name_th = excluded.name_th, type = excluded.type, hsk_level = excluded.hsk_level;")
lines.append("")
lines.append("insert into public.thai_l1_catalog (code, error_group, description_th, example, cause_th, remedy, evidence, skill_id) values")
rows = []
for group_id, kc in kcs:
    ev = kc.get("evidence")
    ev_txt = json.dumps(ev, ensure_ascii=False) if isinstance(ev, (list, dict)) else ev
    rows.append(
        "  ("
        + ", ".join([
            q(kc["kc_code"]), q(group_id), q(kc["error_th"]), q(kc.get("example")),
            q(kc.get("thai_cause_th")), q(kc.get("teaching_th")), q(ev_txt),
            f"(select id from public.skills where code = {q(kc['kc_code'])})",
        ])
        + ")"
    )
lines.append(",\n".join(rows))
lines.append("on conflict (code) do update set error_group = excluded.error_group, description_th = excluded.description_th,")
lines.append("  example = excluded.example, cause_th = excluded.cause_th, remedy = excluded.remedy, evidence = excluded.evidence, skill_id = excluded.skill_id;")
lines.append("")
lines.append("commit;")
os.makedirs(os.path.dirname(OUT), exist_ok=True)
open(OUT, "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
print(f"✅ เขียน {os.path.relpath(OUT, ROOT)} — skills 23 แถว · thai_l1_catalog {len(kcs)} แถว")
