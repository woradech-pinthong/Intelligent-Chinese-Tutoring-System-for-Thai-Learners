# ⚙️ SETUP — วิธีเริ่มรันโปรเจกต์ (สำหรับสมาชิกทีม)

## 🔑 ครั้งแรกครั้งเดียว
1. `git pull` (ดึงโค้ดล่าสุด)
2. ขอไฟล์ **`.env` 2 อัน** จากบอลทางแชทส่วนตัว → วางที่:
   - `apps/web/.env.local`
   - `apps/api/.env`
3. ติดตั้งแพ็กเกจ (บอก Claude ในเครื่องว่า *"ช่วย setup ให้รันโปรเจกต์หน่อย"* หรือทำเอง):
   ```
   cd apps/web && npm install
   cd apps/api && python -m venv .venv && .venv\Scripts\activate && pip install -r requirements.txt
   ```

## ▶️ เริ่มทำงาน (ทุกครั้ง)
1. `git pull` ก่อนเสมอ
2. เลือกวิธีรันตามเครื่อง:

### 🖥️ เครื่องแรง (บอล) — รันครบในเครื่อง
- ดับเบิลคลิก `dev.bat` (เปิด API + เว็บ + เบราว์เซอร์ให้เอง)
- ใน `apps/web/.env.local`: `NEXT_PUBLIC_API_URL=http://localhost:8000`

### 💻 เครื่องช้า (ทีม) — รันแค่เว็บ ชี้ API ไปคลาวด์
- รันแค่เว็บ: พิมพ์ `npm run dev` ที่**รากโปรเจกต์**ได้เลย ไม่ต้อง cd (ไม่ต้องรัน API!)
- ใน `apps/web/.env.local` เปลี่ยนเป็น:
  ```
  NEXT_PUBLIC_API_URL=https://intelligent-chinese-tutoring-system-for.onrender.com
  ```
- → เบากว่ามาก + ฟีเจอร์ครบ (API อยู่บนคลาวด์)

### 📱 แค่อยากดู/ใช้แอป (ไม่แก้โค้ด) — เครื่องช้าก็ได้!
- เปิด URL นี้ในเบราว์เซอร์ได้เลย ไม่ต้องรัน/ติดตั้งอะไร:
  **https://intelligent-chinese-tutoring-system.vercel.app**

## 🌐 บริการที่ deploy แล้ว (ทั้งระบบ live บนคลาวด์)
| ส่วน | ที่ไหน | URL |
|---|---|---|
| **เว็บ (Next.js)** | **Vercel** | **https://intelligent-chinese-tutoring-system.vercel.app** ⭐ |
| API (FastAPI) | Render (ฟรี) | https://intelligent-chinese-tutoring-system-for.onrender.com |
| DB + Storage | Supabase | (โปรเจกต์ icts-thai) |

> 💡 push โค้ด → ทั้ง Vercel (เว็บ) และ Render (API) auto-deploy เอง

> ⚠️ API บน Render ฟรี **หลับหลัง 15 นาทีไม่มีคนใช้** → เรียกครั้งแรกช้า ~30-50 วิ (ปลุกเซิร์ฟเวอร์) แล้วค่อยเร็ว
> ⚠️ push โค้ดฝั่ง `apps/api/` → Render auto-deploy เอง (~3-5 นาที)

## ⏹️ เลิกงาน
- ปิดหน้าต่าง API/WEB (ถ้าเปิด) + บอก Claude *"เก็บงาน push"*
