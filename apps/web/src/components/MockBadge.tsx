// ป้ายบอกตรง ๆ ว่าเนื้อหาในหน้านี้เป็นของชั่วคราว/ฉบับร่าง + ของจริงต้องมีอะไร
// ใช้ร่วมทุกหน้ากิจกรรมที่เนื้อหายังไม่ผ่านการตรวจ (เนื้อหาสมมุติ · ประโยคร่าง · รูปชั่วคราว)
// 16 ต.ค. (บอลเคาะ): ไม่โชว์กล่องนี้ในหน้าแบบฝึกแล้ว — สถานะเนื้อหาบอกที่เดียวคือชิปบนการ์ดเมนู (PracticeHub)
//   หน้าต่าง ๆ ยังเรียก <MockBadge> ไว้เหมือนเดิม เผื่อเปิดคืน: ตั้ง SHOW_CONTENT_NOTES = true

import { Icon } from "@/components/Icon";

const SHOW_CONTENT_NOTES = false;

export function MockBadge({ title, real }: { title: string; real: string }) {
  if (!SHOW_CONTENT_NOTES) return null;
  return (
    <div className="rounded-xl border border-amber-200/70 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
      <div className="flex items-center gap-1.5 font-semibold">
        <Icon name="flask" className="h-3.5 w-3.5 shrink-0" /> {title}
      </div>
      <div className="text-amber-700">{real}</div>
    </div>
  );
}

/** ป้ายชุดประโยคร่าง (src/data/sentences.ts) — ใช้ในเรียงประโยค / เติมคำ / อ่านประโยค */
export function DraftSentenceBadge() {
  return (
    <MockBadge
      title="ประโยคฉบับร่าง (ร่าง AI · รอหฤทัยตรวจ)"
      real="ของจริง: ประโยคที่ครูตรวจแล้ว แยกตามหมวด หมวดละ 5–10 ประโยค"
    />
  );
}
