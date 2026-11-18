"""จีนรู้ใจ API — FastAPI backend (M3)

รันในเครื่อง:  uvicorn app.main:app --reload --port 8000
บน HF Spaces: Dockerfile รันที่พอร์ต 7860 อัตโนมัติ
เอกสาร API:   เปิด /docs (Swagger UI สร้างให้เอง)
"""

import os
from pathlib import Path

import psycopg
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(
    title="จีนรู้ใจ API",
    description="Backend ของติวเตอร์เตรียมสอบ HSK 1-2 สำหรับคนไทย — pyBKT · FSRS · Thai-L1 diagnosis",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # dev: เปิดกว้าง · prod: จำกัดเป็นโดเมนเว็บเรา
    allow_methods=["*"],
    allow_headers=["*"],
)


def _load_env():
    env = {}
    p = Path(__file__).resolve().parent.parent / ".env"
    if p.exists():
        for line in p.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return env


_ENV = _load_env()
DB_URL = os.environ.get("SUPABASE_DB_URL") or _ENV.get("SUPABASE_DB_URL")


@app.get("/")
def root():
    return {"app": "จีนรู้ใจ (中文知心)", "docs": "/docs", "health": "/health"}


@app.get("/health")
def health(db: int = 0):
    """ใช้เช็กว่า API ตื่นอยู่ — และเป็นปลายทางของ keepalive ping
    เรียกด้วย ?db=1 จะ query Supabase เบา ๆ 1 ครั้ง → นับเป็น activity กัน free tier pause
    (บทเรียน 2 ส.ค.: Supabase โดน pause เพราะไม่มีใครแตะระบบ 7 วัน — cron ต้องยิง ?db=1)
    """
    out = {"status": "ok", "service": "jeen-roo-jai-api", "version": "0.2.1"}
    if db:
        try:
            with psycopg.connect(DB_URL, connect_timeout=8) as conn:
                with conn.cursor() as cur:
                    cur.execute("select count(*) from public.words")
                    out["db"] = "ok"
                    out["words"] = cur.fetchone()[0]
        except Exception as e:
            out["db"] = f"unreachable: {type(e).__name__}"
    return out


# ── โมดูล 1: คลังคำ + ตรวจคำแปล (human review) ──────────────────────────
class ReviewIn(BaseModel):
    meaning_th: str
    reviewed: bool = True


@app.post("/words/{word_id}/review")
def review_word(word_id: int, body: ReviewIn):
    """ทีมตรวจคำแปล: อัปเดต meaning_th + ตั้ง th_reviewed
    (เขียนผ่าน server เพราะตาราง words เปิด client อ่านอย่างเดียว — ตาม ARCHITECTURE §4)
    """
    if not DB_URL:
        raise HTTPException(500, "SUPABASE_DB_URL ยังไม่ตั้งใน apps/api/.env")
    with psycopg.connect(DB_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "update public.words set meaning_th = %s, th_reviewed = %s where id = %s returning id",
                (body.meaning_th, body.reviewed, word_id),
            )
            row = cur.fetchone()
        conn.commit()
    if not row:
        raise HTTPException(404, f"ไม่พบคำ id={word_id}")
    return {"id": word_id, "meaning_th": body.meaning_th, "th_reviewed": body.reviewed}


# ── โครงโมดูลถัดไป (ARCHITECTURE.md §3 — เติมใน M4-M5) ─────────────────
# POST /attempts/batch · GET /mastery (pyBKT) · GET /review-queue (FSRS)
# GET /diagnosis (Thai-L1) · POST /mock-exam/start|submit
