// คลังจุดผิดคนไทย (Thai-L1 Error Catalog) ฝั่งเว็บ — อ่านจาก thai-l1-catalog.json
// ⚠️ thai-l1-catalog.json = สำเนาตรงตัวของ data/thai-l1/catalog-v1.json (สถานะ v1-draft · รอหฤทัยตรวจ)
//    แก้ที่ต้นฉบับแล้วก๊อปมาใหม่ อย่าแก้สำเนา · ตัวเลข %/citation ในนั้นห้ามโชว์ผู้ใช้จนกว่าจะ verified
// รหัส KC ชุดเดียวกับตาราง skills (supabase/migrations/20261007000006_seed_skills_catalog.sql):
//    Thai-L1 15 + คำศัพท์รายหมวด 5 + ทักษะ 3 = 23 — ใช้เป็น skill_code ตอน logAttempt()

import raw from "./thai-l1-catalog.json";

export type ThaiL1SubError = {
  kc_code: string;
  error_th: string; // อาการผิด
  thai_cause_th: string; // สาเหตุจากภาษาไทย (transfer)
  example: string; // ตัวอย่างคำ/คู่เสียง
  distractor_idea_th: string; // ไอเดียตัวลวงสำหรับปั้นข้อ
  teaching_th: string; // วิธีสอน/แก้
  evidence: string; // งานวิจัยที่อ้าง (รายละเอียดใน sources ของกลุ่ม)
};

export type ThaiL1Source = {
  citation: string;
  year: number;
  venue: string;
  url: string;
  access: string;
  supports_th: string;
  verify?: { exists: boolean; supports_claim: boolean; verdict: string; best_url: string; citation: string; note_th: string };
};

export type ThaiL1Group = {
  group_id: string; // TL-TONE | TL-RETRO | TL-GRAM
  group_name_th: string;
  summary_th: string;
  sub_errors: ThaiL1SubError[];
  sources: ThaiL1Source[];
};

export type ThaiL1Catalog = {
  name: string;
  version: string;
  status: string;
  created: string;
  note: string;
  kc_scheme: string;
  kc_index: { kc_code: string; group_id: string; error_th: string }[];
  groups: ThaiL1Group[];
};

export const CATALOG: ThaiL1Catalog = raw;

/** 15 KC จุดผิดคนไทย — ลำดับเดียวกับ kc_index ใน JSON */
export const KC_CODES = [
  "TL-TONE-T2AS3",
  "TL-TONE-T3AS2",
  "TL-TONE-T3HALF",
  "TL-TONE-T3SANDHI",
  "TL-TONE-T4OVER",
  "TL-RETRO-SH-S",
  "TL-RETRO-ZH-JZ",
  "TL-RETRO-CH-CQ",
  "TL-RETRO-R-L",
  "TL-RETRO-FLAT-MERGE",
  "TL-GRAM-DE-ORDER",
  "TL-GRAM-MW",
  "TL-GRAM-COMPL",
  "TL-GRAM-LE",
  "TL-GRAM-ADV",
] as const;
export type KcCode = (typeof KC_CODES)[number];

/** 8 รหัสที่ไม่ใช่ Thai-L1 ใน seed skills: คำศัพท์รายหมวด 1–5 + ทักษะฟัง/อ่าน/เรียงประโยค */
export const SKILL_CODES = [
  "VOCAB-C1",
  "VOCAB-C2",
  "VOCAB-C3",
  "VOCAB-C4",
  "VOCAB-C5",
  "SKILL-LISTEN",
  "SKILL-READ",
  "SKILL-ORDER",
] as const;
export type SkillCode = (typeof SKILL_CODES)[number];

export type AnySkillCode = KcCode | SkillCode;
/** ครบ 23 รหัส = ตาราง skills ทั้งตาราง */
export const ALL_SKILL_CODES: readonly AnySkillCode[] = [...KC_CODES, ...SKILL_CODES];

/** ป้ายสั้นภาษาไทย (= name_th ใน seed 0006 — ร่าง AI 8 ต.ค. รอหฤทัย) ใช้บนชิป/dashboard */
export const SKILL_LABEL_TH: Record<AnySkillCode, string> = {
  "TL-TONE-T2AS3": "เสียง 2 เพี้ยนไปคล้ายเสียง 3",
  "TL-TONE-T3AS2": "เสียง 3 เพี้ยนไปคล้ายเสียง 2",
  "TL-TONE-T3HALF": "ครึ่งเสียง 3 ท้ายคำ/ท้ายประโยค",
  "TL-TONE-T3SANDHI": "ไม่แปลงเสียง 3+3 → 2+3",
  "TL-TONE-T4OVER": "เสียง 4 ตกช้า/ลากยาว",
  "TL-RETRO-SH-S": "sh ออกเป็น s (ส)",
  "TL-RETRO-ZH-JZ": "zh ออกเป็น จ / z",
  "TL-RETRO-CH-CQ": "ch ออกเป็น ช / c",
  "TL-RETRO-R-L": "r ออกเป็น ล/ร แบบไทย",
  "TL-RETRO-FLAT-MERGE": "แยก zh/ch/sh กับ z/c/s ไม่ออก",
  "TL-GRAM-DE-ORDER": "วางส่วนขยาย+的 หลังคำนามแบบไทย",
  "TL-GRAM-MW": "วลีลักษณนาม: ลำดับ/เลือก/ละ",
  "TL-GRAM-COMPL": "บทเสริม 得/ผล วางผิดหรือละ",
  "TL-GRAM-LE": 'ใช้ 了 ผิด (แมป "แล้ว" ตรงตัว)',
  "TL-GRAM-ADV": "คำวิเศษณ์วางหลังกริยาแบบไทย",
  "VOCAB-C1": "คำศัพท์หมวด 1 ทักทาย & คนรอบตัว",
  "VOCAB-C2": "คำศัพท์หมวด 2 ตัวเลข เวลา & วันที่",
  "VOCAB-C3": "คำศัพท์หมวด 3 กิน ดื่ม & ซื้อของ",
  "VOCAB-C4": "คำศัพท์หมวด 4 เรียน ทำงาน & สื่อสาร",
  "VOCAB-C5": "คำศัพท์หมวด 5 เดินทาง & ชีวิตประจำวัน",
  "SKILL-LISTEN": "ทักษะฟัง (เสียง → ความหมาย/คำ)",
  "SKILL-READ": "ทักษะอ่าน (ตัวจีน/พินอิน → ความหมาย)",
  "SKILL-ORDER": "ทักษะเรียงประโยค (โครงสร้างพื้นฐาน)",
};

/** รหัสคำศัพท์รายหมวดจาก words.category (1–5) — ใช้เป็น skill_code ของข้อศัพท์ที่ปั้นสดจากคำ */
export function vocabCodeOf(category: number | null | undefined): SkillCode | undefined {
  return category && category >= 1 && category <= 5 ? (`VOCAB-C${category}` as SkillCode) : undefined;
}

export function isKcCode(code: string): code is KcCode {
  return (KC_CODES as readonly string[]).includes(code);
}

export type KcInfo = {
  code: KcCode;
  group_id: string;
  group_name_th: string;
  error_th: string;
  thai_cause_th: string;
  teaching_th: string;
  example: string;
  distractor_idea_th: string;
};

const INFO: ReadonlyMap<string, KcInfo> = new Map(
  CATALOG.groups.flatMap((g) =>
    g.sub_errors.map((s): [string, KcInfo] => [
      s.kc_code,
      {
        code: s.kc_code as KcCode,
        group_id: g.group_id,
        group_name_th: g.group_name_th,
        error_th: s.error_th,
        thai_cause_th: s.thai_cause_th,
        teaching_th: s.teaching_th,
        example: s.example,
        distractor_idea_th: s.distractor_idea_th,
      },
    ])
  )
);

/** ข้อมูล KC 1 ตัวสำหรับ feedback/สอน — undefined ถ้าไม่ใช่รหัส Thai-L1 (เช่น VOCAB-C1) */
export function kcInfo(code: string): KcInfo | undefined {
  return INFO.get(code);
}

// ตอน dev: เตือนถ้า KC_CODES ในโค้ดเริ่มไม่ตรง kc_index ใน JSON (เช่น หฤทัยแก้คลังแล้วก๊อปมาใหม่)
if (process.env.NODE_ENV !== "production") {
  const inJson = CATALOG.kc_index.map((k) => k.kc_code);
  const same = inJson.length === KC_CODES.length && inJson.every((c, i) => c === KC_CODES[i]);
  if (!same) console.warn("[thaiL1] KC_CODES ไม่ตรง kc_index ใน thai-l1-catalog.json — อัปเดตให้ตรงกัน", inJson);
}
