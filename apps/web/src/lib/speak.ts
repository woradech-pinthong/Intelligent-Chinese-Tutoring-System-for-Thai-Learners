"use client";

// อ่านออกเสียงจีนด้วยเสียงสังเคราะห์ของเบราว์เซอร์ (Web Speech API) — ไม่ต้องมีไฟล์เสียง ไม่ต้องมี backend
//
// ใช้ในหน้าที่ยังไม่มีไฟล์เสียงของตัวเอง (pre-test / ข้อสอบเสมือนจริง / พื้นฐานเสียง / ฟังประโยค / พูดตามกรณีคำไม่มีไฟล์)
// หน้าจริง (บัตรคำ / ฝึกฟัง / ควิซ) ยังใช้ไฟล์เสียงที่อัดไว้ใน Supabase Storage เหมือนเดิม — คุณภาพดีกว่า
//
// ข้อจำกัด: เครื่องที่ไม่มีเสียงภาษาจีนติดตั้งจะอ่านไม่ได้ → คืน false ให้หน้าจอไปบอกผู้ใช้เอง

/** 0 = จีนกลางแผ่นดินใหญ่ · 1 = ไต้หวัน · 2 = จีนอื่น ๆ · -1 = ไม่ใช่จีนกลาง (กวางตุ้ง zh-HK / yue อ่านคำ HSK ผิดเสียง) */
function mandarinRank(lang: string): number {
  const l = lang.toLowerCase().replace(/_/g, "-");
  if (!/^(zh|cmn)(-|$)/.test(l) || /(hk|mo|yue)/.test(l)) return -1;
  if (l === "zh" || l === "cmn" || /-(cn|hans|sg)/.test(l)) return 0;
  if (/-(tw|hant)/.test(l)) return 1;
  return 2;
}

function rankedVoices(): { v: SpeechSynthesisVoice; r: number }[] {
  if (typeof window === "undefined" || !window.speechSynthesis) return [];
  return window.speechSynthesis
    .getVoices()
    .map((v) => ({ v, r: mandarinRank(v.lang) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r);
}

/** เสียงจีนกลางทั้งหมดในเครื่อง เรียงจากเหมาะสุด (zh-CN → zh-TW → zh อื่น) · ไม่รวมกวางตุ้ง */
export function mandarinVoices(): SpeechSynthesisVoice[] {
  return rankedVoices().map((x) => x.v);
}

/**
 * เฉพาะเสียงอันดับดีสุดที่เครื่องมี — มี zh-CN สักเสียง = เอาแต่ zh-CN (ไม่ปนเสียงไต้หวันที่อ่านบางคำต่างจากพินอินแผ่นดินใหญ่
 * เช่น 休息 xiū xí) · ไม่มี zh-CN ค่อยใช้ zh-TW · ใช้ตอนต้องการหลายเสียงสลับกัน (ผู้พูด A/B ในบทสนทนา)
 */
export function bestMandarinVoices(): SpeechSynthesisVoice[] {
  const all = rankedVoices();
  return all.filter((x) => x.r === all[0]?.r).map((x) => x.v);
}

/** มีเสียงจีนกลางให้ใช้ไหม — เครื่องที่มีแต่เสียงกวางตุ้งถือว่า "ไม่มี" (อ่านแล้วผิดเสียง แย่กว่าบอกตรง ๆ) */
export function hasChineseVoice(): boolean {
  return mandarinVoices().length > 0;
}

/**
 * บอกว่ามีเสียงจีนให้ใช้ไหม — ต้องผ่าน callback เพราะ Chrome โหลดรายชื่อเสียงแบบไม่พร้อมกับหน้า
 * (เรียก getVoices() ตอนเปิดหน้าครั้งแรกมักได้ [] แล้วค่อยยิง event voiceschanged ตามมา)
 * คืนฟังก์ชันสำหรับเลิกฟัง — เอาไปใช้เป็น cleanup ของ useEffect ได้ตรง ๆ
 */
export function onVoicesReady(cb: (hasZh: boolean) => void): () => void {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    queueMicrotask(() => cb(false));
    return () => {};
  }
  const check = () => cb(hasChineseVoice());
  if (window.speechSynthesis.getVoices().length > 0) queueMicrotask(check);
  window.speechSynthesis.addEventListener("voiceschanged", check);
  return () => window.speechSynthesis.removeEventListener("voiceschanged", check);
}

/** อ่านออกเสียงจีนกลาง · rate ค่าเริ่ม 0.85 · คืน false = เครื่องไม่มีเสียงจีนกลาง (หน้าจอไปบอกผู้ใช้เอง) */
export function speakZh(text: string, rate = 0.85): boolean {
  if (typeof window === "undefined" || !window.speechSynthesis) return false;
  const voice = mandarinVoices()[0];
  if (!voice) return false;

  window.speechSynthesis.cancel(); // กันเสียงข้อก่อนทับข้อใหม่
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice;
  u.lang = voice.lang;
  u.rate = rate; // ค่าเริ่ม 0.85 = ช้ากว่าปกติเล็กน้อย ผู้เรียนเริ่มต้นตามทัน · โหมด "ฟังช้า" ส่งค่าต่ำกว่านี้มา
  window.speechSynthesis.speak(u);
  return true;
}
