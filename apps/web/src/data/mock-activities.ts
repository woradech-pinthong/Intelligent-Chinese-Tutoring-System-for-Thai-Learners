// เนื้อหา "สมมุติ" สำหรับกิจกรรมที่ยังไม่มีเนื้อหาจริง — ให้เห็นหน้าตาฟังก์ชันก่อน (บอลสั่ง 11 ต.ค. 2569)
// ⚠️ ร่าง AI ทั้งหมด ใช้เฉพาะคำใน 300 คำ HSK 1 (ตรวจด้วยสคริปต์แล้ว) — ต้องผ่านหฤทัย (ตะวัน) ตรวจก่อนเข้าคลังจริง (กติกาทีม)
// ⚠️ "รูป" เป็นอีโมจิแทนรูปจริงชั่วคราว (แผน C5: คลังรูปฟรี) · เสียงบทสนทนาใช้ TTS ของเครื่องชั่วคราว (แผน C7: หฤทัยเขียน + edge-tts)
// tokens = 1 คำ/ชิ้น ตรงกับคำใน words · pinyin เว้นวรรคต่อพยางค์
// 12 ต.ค. แก้ตามผลรีวิวเฉพาะที่ขัดกับคลังคำที่ตรวจแล้ว: ตัด 日 ☀️ (คลัง = "วัน, วันที่" · พระอาทิตย์ = 太阳)
//   · 饺子 = "เกี๊ยวจีน" (ตามคลัง — "เกี๊ยว" เฉย ๆ คนไทยมักนึกถึง 馄饨) · QA #2 คำแปล 请问 = "ขอถามหน่อย" (เดิม "ขอโทษนะคะ" มีคำลงท้ายเพศ)
// รอหฤทัยตัดสิน (ยังไม่แก้): QA #2 您 คู่กับ 谁 ฟังห้วน (สุภาพจริง = 您是哪位 แต่ 位 ไม่อยู่ใน HSK 1)
//   · บทสนทนา #2 吗 แปล "ใช่ไหม" · #2 คำถาม "B เป็นใคร" (ถามอาชีพ?) · #5 คำถาม "B มีใคร" · QA #10 "พรุ่งนี้ฝนตก" (พยากรณ์ → "ฝนจะตก"?)
//   · 月 🌙 "เดือน/พระจันทร์" — HSK 1 ใช้เป็น "เดือน" เป็นหลัก

export type DialogueLine = { speaker: "A" | "B"; tokens: string[]; pinyin: string; meaning_th: string };
export type Dialogue = {
  id: number;
  lines: DialogueLine[];
  question_th: string;
  choices_th: string[]; // 4 ตัวเลือก
  answer: number; // index ใน choices_th
  category: number; // หมวดที่ใช้คำเป็นหลัก
};

export const DIALOGUES: Dialogue[] = [
  {
    id: 1, category: 1,
    lines: [
      { speaker: "A", tokens: ["你", "好", "吗"], pinyin: "nǐ hǎo ma", meaning_th: "เธอสบายดีไหม" },
      { speaker: "B", tokens: ["我", "很", "好", "谢谢"], pinyin: "wǒ hěn hǎo xiè xie", meaning_th: "ฉันสบายดี ขอบคุณ" },
    ],
    question_th: "B รู้สึกอย่างไร", choices_th: ["สบายดี", "ไม่สบาย", "ยุ่งมาก", "หิวข้าว"], answer: 0,
  },
  {
    id: 2, category: 4,
    lines: [
      { speaker: "A", tokens: ["你", "是", "学生", "吗"], pinyin: "nǐ shì xué shēng ma", meaning_th: "เธอเป็นนักเรียนใช่ไหม" },
      { speaker: "B", tokens: ["不", "是", "我", "是", "老师"], pinyin: "bú shì wǒ shì lǎo shī", meaning_th: "ไม่ใช่ ฉันเป็นครู" },
    ],
    question_th: "B เป็นใคร", choices_th: ["นักเรียน", "ครู", "หมอ", "เพื่อน"], answer: 1,
  },
  {
    id: 3, category: 3,
    lines: [
      { speaker: "A", tokens: ["你", "喝", "茶", "吗"], pinyin: "nǐ hē chá ma", meaning_th: "เธอดื่มชาไหม" },
      { speaker: "B", tokens: ["我", "不", "喝", "茶", "我", "喝", "水"], pinyin: "wǒ bù hē chá wǒ hē shuǐ", meaning_th: "ฉันไม่ดื่มชา ฉันดื่มน้ำ" },
    ],
    question_th: "B ดื่มอะไร", choices_th: ["ชา", "น้ำ", "นม", "กาแฟ"], answer: 1,
  },
  {
    id: 4, category: 5,
    lines: [
      { speaker: "A", tokens: ["今天", "天气", "怎么样"], pinyin: "jīn tiān tiān qì zěn me yàng", meaning_th: "วันนี้อากาศเป็นอย่างไร" },
      { speaker: "B", tokens: ["今天", "很", "热"], pinyin: "jīn tiān hěn rè", meaning_th: "วันนี้ร้อนมาก" },
    ],
    question_th: "วันนี้อากาศเป็นอย่างไร", choices_th: ["หนาว", "ฝนตก", "ร้อน", "หิมะตก"], answer: 2,
  },
  {
    id: 5, category: 1,
    lines: [
      { speaker: "A", tokens: ["你", "有", "哥哥", "吗"], pinyin: "nǐ yǒu gē ge ma", meaning_th: "เธอมีพี่ชายไหม" },
      { speaker: "B", tokens: ["没有", "我", "有", "一", "个", "妹妹"], pinyin: "méi yǒu wǒ yǒu yí ge mèi mei", meaning_th: "ไม่มี ฉันมีน้องสาวหนึ่งคน" },
    ],
    question_th: "B มีใคร", choices_th: ["พี่ชาย", "พี่สาว", "น้องชาย", "น้องสาว"], answer: 3,
  },
  {
    id: 6, category: 4,
    lines: [
      { speaker: "A", tokens: ["明天", "你", "去", "学校", "吗"], pinyin: "míng tiān nǐ qù xué xiào ma", meaning_th: "พรุ่งนี้เธอไปโรงเรียนไหม" },
      { speaker: "B", tokens: ["不", "去", "明天", "我", "在", "家", "休息"], pinyin: "bú qù míng tiān wǒ zài jiā xiū xi", meaning_th: "ไม่ไป พรุ่งนี้ฉันพักผ่อนอยู่บ้าน" },
    ],
    question_th: "พรุ่งนี้ B ทำอะไร", choices_th: ["ไปโรงเรียน", "พักผ่อนที่บ้าน", "ไปทำงาน", "ไปโรงพยาบาล"], answer: 1,
  },
  {
    id: 7, category: 1,
    lines: [
      { speaker: "A", tokens: ["这", "是", "谁", "的", "书"], pinyin: "zhè shì shéi de shū", meaning_th: "นี่หนังสือของใคร" },
      { speaker: "B", tokens: ["是", "我", "朋友", "的"], pinyin: "shì wǒ péng you de", meaning_th: "ของเพื่อนฉัน" },
    ],
    question_th: "หนังสือเป็นของใคร", choices_th: ["ของ B", "ของเพื่อน B", "ของครู", "ของพี่ชาย B"], answer: 1,
  },
  {
    id: 8, category: 2,
    lines: [
      { speaker: "A", tokens: ["现在", "几", "点"], pinyin: "xiàn zài jǐ diǎn", meaning_th: "ตอนนี้กี่โมง" },
      { speaker: "B", tokens: ["现在", "十", "点", "半"], pinyin: "xiàn zài shí diǎn bàn", meaning_th: "ตอนนี้สิบโมงครึ่ง" },
    ],
    question_th: "ตอนนี้กี่โมง", choices_th: ["แปดโมง", "สิบโมง", "สิบโมงครึ่ง", "เที่ยง"], answer: 2,
  },
];

// รูปแทนด้วยอีโมจิ (ชั่วคราว) — ใช้ได้ทั้ง "ฟังแล้วเลือกรูป" และ "อ่านแล้วเลือกรูป" เฉพาะคำรูปธรรม
export type PictureWord = { hanzi: string; emoji: string; label_th: string };
export const PICTURE_WORDS: PictureWord[] = [
  { hanzi: "猫", emoji: "🐱", label_th: "แมว" },
  { hanzi: "狗", emoji: "🐶", label_th: "หมา" },
  { hanzi: "水", emoji: "💧", label_th: "น้ำ" },
  { hanzi: "茶", emoji: "🍵", label_th: "ชา" },
  { hanzi: "书", emoji: "📖", label_th: "หนังสือ" },
  { hanzi: "苹果", emoji: "🍎", label_th: "แอปเปิล" },
  { hanzi: "米饭", emoji: "🍚", label_th: "ข้าว" },
  { hanzi: "面包", emoji: "🍞", label_th: "ขนมปัง" },
  { hanzi: "鸡蛋", emoji: "🥚", label_th: "ไข่ไก่" },
  { hanzi: "牛奶", emoji: "🥛", label_th: "นม" },
  { hanzi: "饺子", emoji: "🥟", label_th: "เกี๊ยวจีน" },
  { hanzi: "面条儿", emoji: "🍜", label_th: "บะหมี่" },
  { hanzi: "水果", emoji: "🍇", label_th: "ผลไม้" },
  { hanzi: "菜", emoji: "🥬", label_th: "ผัก/กับข้าว" },
  { hanzi: "衣服", emoji: "👕", label_th: "เสื้อผ้า" },
  { hanzi: "车", emoji: "🚗", label_th: "รถ" },
  { hanzi: "出租车", emoji: "🚕", label_th: "แท็กซี่" },
  { hanzi: "火车", emoji: "🚆", label_th: "รถไฟ" },
  { hanzi: "飞机", emoji: "✈️", label_th: "เครื่องบิน" },
  { hanzi: "电话", emoji: "☎️", label_th: "โทรศัพท์" },
  { hanzi: "手机", emoji: "📱", label_th: "มือถือ" },
  { hanzi: "电脑", emoji: "💻", label_th: "คอมพิวเตอร์" },
  { hanzi: "电视", emoji: "📺", label_th: "โทรทัศน์" },
  { hanzi: "医生", emoji: "👨‍⚕️", label_th: "หมอ" },
  { hanzi: "老师", emoji: "👩‍🏫", label_th: "ครู" },
  { hanzi: "学生", emoji: "🧑‍🎓", label_th: "นักเรียน" },
  { hanzi: "爸爸", emoji: "👨", label_th: "พ่อ" },
  { hanzi: "妈妈", emoji: "👩", label_th: "แม่" },
  { hanzi: "孩子", emoji: "🧒", label_th: "เด็ก/ลูก" },
  { hanzi: "家", emoji: "🏠", label_th: "บ้าน" },
  { hanzi: "学校", emoji: "🏫", label_th: "โรงเรียน" },
  { hanzi: "医院", emoji: "🏥", label_th: "โรงพยาบาล" },
  { hanzi: "商店", emoji: "🏪", label_th: "ร้านค้า" },
  { hanzi: "饭店", emoji: "🍽️", label_th: "ร้านอาหาร" },
  { hanzi: "电影院", emoji: "🎬", label_th: "โรงหนัง" },
  { hanzi: "椅子", emoji: "🪑", label_th: "เก้าอี้" },
  { hanzi: "雨", emoji: "🌧️", label_th: "ฝน" },
  { hanzi: "雪", emoji: "❄️", label_th: "หิมะ" },
  { hanzi: "月", emoji: "🌙", label_th: "เดือน/พระจันทร์" },
  { hanzi: "钱", emoji: "💰", label_th: "เงิน" },
  { hanzi: "歌", emoji: "🎵", label_th: "เพลง" },
];

// จับคู่คำถาม ↔ คำตอบ (ทักษะอ่าน · รูปแบบข้อสอบ HSK 1 พาร์ตอ่าน)
export type QAPair = { id: number; q: string[]; q_pinyin: string; q_th: string; a: string[]; a_pinyin: string; a_th: string };
export const QA_PAIRS: QAPair[] = [
  { id: 1, q: ["你", "好", "吗"], q_pinyin: "nǐ hǎo ma", q_th: "เธอสบายดีไหม", a: ["我", "很", "好"], a_pinyin: "wǒ hěn hǎo", a_th: "ฉันสบายดี" },
  { id: 2, q: ["请问", "您", "是", "谁"], q_pinyin: "qǐng wèn nín shì shéi", q_th: "ขอถามหน่อย คุณเป็นใคร", a: ["我", "是", "老师"], a_pinyin: "wǒ shì lǎo shī", a_th: "ฉันเป็นครู" },
  { id: 3, q: ["你", "是", "哪", "国", "人"], q_pinyin: "nǐ shì nǎ guó rén", q_th: "เธอเป็นคนประเทศไหน", a: ["我", "是", "中国", "人"], a_pinyin: "wǒ shì zhōng guó rén", a_th: "ฉันเป็นคนจีน" },
  { id: 4, q: ["这", "是", "什么"], q_pinyin: "zhè shì shén me", q_th: "นี่คืออะไร", a: ["这", "是", "我", "的", "手机"], a_pinyin: "zhè shì wǒ de shǒu jī", a_th: "นี่คือมือถือของฉัน" },
  { id: 5, q: ["你", "有", "几", "个", "孩子"], q_pinyin: "nǐ yǒu jǐ ge hái zi", q_th: "เธอมีลูกกี่คน", a: ["我", "有", "两", "个", "孩子"], a_pinyin: "wǒ yǒu liǎng ge hái zi", a_th: "ฉันมีลูกสองคน" },
  { id: 6, q: ["你", "想", "吃", "什么"], q_pinyin: "nǐ xiǎng chī shén me", q_th: "เธออยากกินอะไร", a: ["我", "想", "吃", "饺子"], a_pinyin: "wǒ xiǎng chī jiǎo zi", a_th: "ฉันอยากกินเกี๊ยวจีน" },
  { id: 7, q: ["现在", "几", "点"], q_pinyin: "xiàn zài jǐ diǎn", q_th: "ตอนนี้กี่โมง", a: ["现在", "八", "点"], a_pinyin: "xiàn zài bā diǎn", a_th: "ตอนนี้แปดโมง" },
  { id: 8, q: ["他", "在", "哪儿"], q_pinyin: "tā zài nǎr", q_th: "เขาอยู่ที่ไหน", a: ["他", "在", "家"], a_pinyin: "tā zài jiā", a_th: "เขาอยู่ที่บ้าน" },
  { id: 9, q: ["你", "喜欢", "猫", "吗"], q_pinyin: "nǐ xǐ huan māo ma", q_th: "เธอชอบแมวไหม", a: ["喜欢", "我", "有", "一", "只", "猫"], a_pinyin: "xǐ huan wǒ yǒu yì zhī māo", a_th: "ชอบ ฉันมีแมวหนึ่งตัว" },
  { id: 10, q: ["明天", "天气", "怎么样"], q_pinyin: "míng tiān tiān qì zěn me yàng", q_th: "พรุ่งนี้อากาศเป็นอย่างไร", a: ["明天", "下雨"], a_pinyin: "míng tiān xià yǔ", a_th: "พรุ่งนี้ฝนตก" },
];
