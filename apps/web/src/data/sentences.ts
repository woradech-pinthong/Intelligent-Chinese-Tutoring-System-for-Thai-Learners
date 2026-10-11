// ชุดประโยคสำหรับโหมด "เรียงประโยค" (排列顺序) — HSK 1
// ⚠️ ฉบับร่าง (AI สร้าง) — ต้องผ่านหฤทัย (HSK 5) ตรวจก่อนใช้จริง (กติกาทีม)
// ใช้เฉพาะคำใน 300 คำ HSK1 · tokens = ลำดับที่ถูกต้อง (แต่ละ token = 1 คำ/ไทล์)
// pinyin เว้นวรรคต่อพยางค์ (ให้ระบายสีวรรณยุกต์ได้ถูก)
// เมื่อมี Auth ค่อยย้ายขึ้น Supabase เป็น item bank จริง

export type SentenceItem = {
  id: number;
  tokens: string[]; // ลำดับที่ถูกต้อง
  pinyin: string;
  meaning_th: string;
  focus_th: string; // จุดไวยากรณ์ที่ฝึก (ไทย)
  kc?: string; // Thai-L1 KC ที่ผูก (ถ้ามี) — ดู data/thai-l1/catalog-v1.json
};

/**
 * ชุดประโยคนี้ผ่านหฤทัยตรวจแล้วหรือยัง (CG-03) — เปลี่ยนเป็น true ที่นี่ที่เดียวเมื่อตรวจครบ
 * false = ร่าง: เมนูติดป้าย "ร่าง" · หน้ากิจกรรมโชว์ป้ายฉบับร่าง · รอบไม่นับเข้าความแม่นยำรวม/จุดอ่อน (DEMO_MODES)
 *         · คำตอบติด mock_ref → ตอน sync ข้าม ไม่เข้าข้อมูลเทรน BKT (CG-02)
 */
export const SENTENCES_REVIEWED = false;

/** mock_ref ของคำตอบที่ตอบประโยคร่าง (เช่น 'draft-sentence-4') · undefined เมื่อชุดประโยคผ่านการตรวจแล้ว */
export function draftSentenceRef(id: number): string | undefined {
  return SENTENCES_REVIEWED ? undefined : `draft-sentence-${id}`;
}

export const SENTENCES: SentenceItem[] = [
  { id: 1, tokens: ["我", "爱", "你"], pinyin: "wǒ ài nǐ", meaning_th: "ฉันรักเธอ", focus_th: "ประโยคพื้นฐาน: ประธาน-กริยา-กรรม" },
  { id: 2, tokens: ["我", "喜欢", "猫"], pinyin: "wǒ xǐ huan māo", meaning_th: "ฉันชอบแมว", focus_th: "ประธาน-กริยา-กรรม" },
  { id: 3, tokens: ["他", "是", "老师"], pinyin: "tā shì lǎo shī", meaning_th: "เขาเป็นครู", focus_th: "是 + คำนาม (เป็น...)" },
  { id: 4, tokens: ["这", "是", "我", "的", "书"], pinyin: "zhè shì wǒ de shū", meaning_th: "นี่คือหนังสือของฉัน", focus_th: "ของใคร: 我的 วางหน้าคำนาม (ไทยวางหลัง — จุดพลาดคนไทย)", kc: "TL-GRAM-DE-ORDER" },
  { id: 5, tokens: ["我", "有", "一", "个", "哥哥"], pinyin: "wǒ yǒu yí ge gē ge", meaning_th: "ฉันมีพี่ชายหนึ่งคน", focus_th: "จำนวน + ลักษณนาม + คำนาม (一个哥哥)", kc: "TL-GRAM-MW" },
  { id: 6, tokens: ["今天", "天气", "很", "好"], pinyin: "jīn tiān tiān qì hěn hǎo", meaning_th: "วันนี้อากาศดีมาก", focus_th: "คำบอกเวลาขึ้นต้น + 很 + คุณศัพท์" },
  { id: 7, tokens: ["我", "也", "喜欢", "你"], pinyin: "wǒ yě xǐ huan nǐ", meaning_th: "ฉันก็ชอบเธอ", focus_th: "也 (ก็) วางหน้ากริยา", kc: "TL-GRAM-ADV" },
  { id: 8, tokens: ["我", "想", "喝", "水"], pinyin: "wǒ xiǎng hē shuǐ", meaning_th: "ฉันอยากดื่มน้ำ", focus_th: "想 (อยาก) + กริยา" },
  { id: 9, tokens: ["你", "是", "学生", "吗"], pinyin: "nǐ shì xué shēng ma", meaning_th: "เธอเป็นนักเรียนใช่ไหม", focus_th: "吗 ปิดท้าย = ประโยคคำถาม" },
  { id: 10, tokens: ["我们", "都", "是", "中国", "人"], pinyin: "wǒ men dōu shì zhōng guó rén", meaning_th: "พวกเราเป็นคนจีนทั้งหมด", focus_th: "都 (ทั้งหมด) วางหน้ากริยา", kc: "TL-GRAM-ADV" },
];
