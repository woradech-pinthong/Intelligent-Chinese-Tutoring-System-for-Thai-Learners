"""build_wordlist.py — สร้างคลังคำศัพท์ HSK 1 (ลิสต์ข้อสอบจริง 300 คำ) ของโปรเจกต์จีนรู้ใจ

แหล่งข้อมูล:
1. hsk30-exam-level1-hanzi-v2026.07.json — ลิสต์คำสอบ HSK1 300 คำ
   (ยืนยันโดย intersect 2 แหล่งอิสระ: mandarinbean.com ∩ hsk1.org เมื่อ 2026-07-12 — ทีมควรตรวจกับ
    ประกาศทางการ chinesetest.cn อีกครั้งเมื่อระบบ 3.0 นิ่งหลัง 18 ก.ค. 2026)
2. complete-hsk-vocabulary (github.com/drkameleon — MIT) — ดึงพินอิน/ตัวเต็ม/ความหมายอังกฤษ
   ⚠️ ระวัง: ระดับ "new-1" ใน dataset นี้ = band มาตรฐาน GF0025 (506 คำ) ไม่ใช่ลิสต์ข้อสอบ (300 คำ)
3. pypinyin — fallback สร้างพินอินให้คำ/วลีที่ไม่อยู่ใน dataset

ผลลัพธ์: data/wordlist/hsk30-level1-v2026.07.json (300 คำเป๊ะ)
รัน:      python scripts/build_wordlist.py
"""

import json
import urllib.request
from pathlib import Path

from pypinyin import Style, pinyin as to_pinyin

SOURCE_URL = "https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/main/complete.json"
OUT_DIR = Path(__file__).resolve().parent.parent / "data" / "wordlist"
VERSION = "HSK3.0-v2026.07"


def fetch_source() -> list:
    cache = OUT_DIR / ".cache-complete.json"
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    print(f"กำลังโหลด {SOURCE_URL} ...")
    with urllib.request.urlopen(SOURCE_URL) as r:
        raw = r.read().decode("utf-8")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    cache.write_text(raw, encoding="utf-8")
    return json.loads(raw)


def build_index(entries: list) -> dict:
    """index ตามตัวย่อ — ถ้าซ้ำ เลือกตัวที่อยู่ระดับต่ำสุด (พื้นฐานสุด)"""

    def best_level(e):
        levels = [int(t.split("-")[1]) for t in e.get("level", []) if t.startswith("new-")]
        return min(levels) if levels else 99

    idx: dict = {}
    for e in entries:
        s = e.get("simplified", "")
        if s not in idx or best_level(e) < best_level(idx[s]):
            idx[s] = e
    return idx


def pinyin_fallback(word: str) -> str:
    return " ".join(p[0] for p in to_pinyin(word, style=Style.TONE))


def main():
    exam_words = json.loads((OUT_DIR / "hsk30-exam-level1-hanzi-v2026.07.json").read_text(encoding="utf-8"))
    assert len(exam_words) == 300, f"ลิสต์คำสอบต้องมี 300 คำ (ได้ {len(exam_words)})"

    idx = build_index(fetch_source())
    out, missing = [], []
    for w in exam_words:
        e = idx.get(w)
        if e:
            form = (e.get("forms") or [{}])[0]
            out.append({
                "hanzi": w,
                "traditional": form.get("traditional", w),
                "pinyin": (form.get("transcriptions") or {}).get("pinyin", "") or pinyin_fallback(w),
                "pos": e.get("pos", []),
                "meaning_en": (form.get("meanings") or [])[:4],
                "meaning_th": "",
                "th_reviewed": False,
                "hsk_level": 1,
                "wordlist_version": VERSION,
            })
        else:  # คำ/วลีสอบที่ไม่อยู่ใน dataset — สร้างโครงด้วย pypinyin แล้วให้ AI+ทีมเติม
            missing.append(w)
            out.append({
                "hanzi": w,
                "traditional": w,
                "pinyin": pinyin_fallback(w),
                "pos": [],
                "meaning_en": [],
                "meaning_th": "",
                "th_reviewed": False,
                "hsk_level": 1,
                "wordlist_version": VERSION,
            })

    path = OUT_DIR / "hsk30-level1-v2026.07.json"
    path.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"✅ สร้าง {path.name}: {len(out)} คำ (ครบ 300)")
    print(f"   มีข้อมูลเต็มจาก dataset: {len(out) - len(missing)} คำ")
    print(f"   คำ/วลีที่ต้องเติมความหมายเอง ({len(missing)}): {missing}")


if __name__ == "__main__":
    main()
