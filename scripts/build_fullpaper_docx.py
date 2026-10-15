# -*- coding: utf-8 -*-
"""สร้างไฟล์ Word ของ Full paper CSTI-MJU ครั้งที่ 8 จากร่าง .md ลงเทมเพลต mjuF2027.docx

วิธีใช้ (รันจากรากโปรเจกต์):  python scripts/build_fullpaper_docx.py
ต้องมี:  pip install pythainlp   (ใช้ตัดคำไทยเพื่อใส่จุดตัดบรรทัดแบบไม่มีความกว้าง U+200B ให้ Word ตัดคำไทยถูกที่)

อินพุต : docs/01_เอกสารโครงงาน/fullpaper-CSTI-MJU8-ร่าง1.md  (ข้อความระหว่าง "เริ่มเนื้อหาบทความ" ถึง "จบเนื้อหาบทความ")
เทมเพลต: docs/01_เอกสารโครงงาน/mjuF2027.docx  (คง header/โลโก้/ฟอนต์ฝัง TH SarabunPSK ของผู้จัดไว้ทั้งหมด)
เอาต์พุต: docs/01_เอกสารโครงงาน/fullpaper-CSTI-MJU8.docx  (ระบุพาธอื่นเป็นอาร์กิวเมนต์แรกได้)

กติกาที่สคริปต์ทำให้: TH SarabunPSK 14 ทั้งฉบับ · ชื่อเรื่อง 16 หนา · หัวข้อหลัก 14 หนาไม่มีเลข · ย่อหน้าแรกเยื้อง 1.27 ซม. ·
ชื่อตารางเหนือตาราง/ชื่อรูปใต้รูป กึ่งกลาง · อ้างอิง APA 7 ย่อหน้าแขวน 1.27 ซม. (ตัวเอียงตาม ITALIC ด้านล่าง) ·
อักษรจีนใช้ SimSun 12 · ลูกศร → ใช้ Times New Roman · สมการ BKT เป็น Equation (OMML) · ที่ว่างรอรูป = ไฮไลต์เหลือง
ถ้าแก้ชื่อผู้แต่ง/หน่วยงาน/อีเมล ให้แก้ใน FRONT ด้านล่าง · ถ้าเพิ่มรายการอ้างอิง ต้องเพิ่มคีย์ใน ITALIC ด้วย (สคริปต์จะเตือนถ้าขาด)
"""
import re, io, os, sys, shutil, zipfile, html, datetime, tempfile, struct

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(REPO, "docs", "01_เอกสารโครงงาน")
TEMPLATE = os.path.join(DOCS, "mjuF2027.docx")
SRC = os.path.join(DOCS, "fullpaper-CSTI-MJU8-ร่าง1.md")
OUT_DOCX = sys.argv[1] if len(sys.argv) > 1 else os.path.join(DOCS, "fullpaper-CSTI-MJU8.docx")
_tmp = tempfile.mkdtemp(prefix="fullpaper-")
TPL = os.path.join(_tmp, "tpl"); OUT_DIR = os.path.join(_tmp, "out")
with zipfile.ZipFile(TEMPLATE) as _z: _z.extractall(TPL)

FONT = "TH SarabunPSK"; CJK = "SimSun"; SYM = "Times New Roman"
W = 9602            # text width (dxa) = 11906 - 2*1152
IND = 720           # first-line indent 1.27 cm
SZ = 28             # 14 pt
TABLE_SZ = int(os.environ.get("TABLE_SZ", "28"))
CJK_SZ = 24         # 12 pt for Chinese glyphs (SimSun is visually larger than Sarabun)

def esc(t): return html.escape(t, quote=False)

# ---------- runs ----------
def rpr(bold=False, italic=False, sup=False, sub=False, sz=SZ, font=FONT, highlight=None, color=None, cjk=False, spacing=None):
    if cjk:
        fonts = f'<w:rFonts w:ascii="{CJK}" w:eastAsia="{CJK}" w:hAnsi="{CJK}" w:cs="{CJK}" w:hint="eastAsia"/>'
    else:
        fonts = f'<w:rFonts w:ascii="{font}" w:hAnsi="{font}" w:cs="{font}"/>'
    x = fonts
    if bold: x += '<w:b/><w:bCs/>'
    if italic: x += '<w:i/><w:iCs/>'
    if color: x += f'<w:color w:val="{color}"/>'
    if spacing: x += f'<w:spacing w:val="{spacing}"/>'
    x += f'<w:sz w:val="{sz}"/><w:szCs w:val="{sz}"/>'
    if highlight: x += f'<w:highlight w:val="{highlight}"/>'
    if sup: x += '<w:vertAlign w:val="superscript"/>'
    if sub: x += '<w:vertAlign w:val="subscript"/>'
    return f'<w:rPr>{x}</w:rPr>'

def is_cjk(ch):
    o = ord(ch)
    return 0x2E80 <= o <= 0x9FFF or 0xFF00 <= o <= 0xFFEF or 0x3000 <= o <= 0x303F or 0xF900 <= o <= 0xFAFF

SYMS = set("→")

NBH = "\ue000"   # placeholder for Word's non-breaking hyphen inside identifiers
NBH_XML = '</w:t><w:noBreakHyphen/><w:t xml:space="preserve">'
IDENT = re.compile(r'(?<![\w/.-])(?:TL(?:-[A-Z0-9]+)+|ts-fsrs|pinyin-pro|supabase-js|complete-hsk-vocabulary|edge-tts|zh-CN-XiaoxiaoNeural)(?![\w/.-])')
URL = re.compile(r'https?://[^\s\u200b]+')
def url_breaks(text):
    """Let Word break a URL after a path slash (APA 7) by inserting U+200B after each slash."""
    return URL.sub(lambda m: re.sub(r'(?<!/)/(?!/)', '/\u200b', m.group(0)), text)
def protect_hyphens(text):
    """Use non-breaking hyphens inside identifiers such as TL-TONE-T2AS3 or ts-fsrs (never inside URLs)."""
    parts, pos = [], 0
    for m in URL.finditer(text):
        parts.append(IDENT.sub(lambda k: k.group(0).replace("-", NBH), text[pos:m.start()])); parts.append(m.group(0)); pos = m.end()
    parts.append(IDENT.sub(lambda k: k.group(0).replace("-", NBH), text[pos:]))
    return "".join(parts)

def runs(text, bold=False, italic=False, sup=False, sub=False, sz=SZ, highlight=None, color=None, brk=True, spacing=None):
    """Split text by script so Chinese glyphs and arrows get fonts that contain them."""
    if brk: text = thai_breaks(text)
    text = protect_hyphens(url_breaks(text))
    out = []
    buf, cls = [], None
    def flush():
        if not buf: return
        t = "".join(buf)
        if cls == "cjk":
            pr = rpr(bold, italic, sup, sub, sz=min(sz, CJK_SZ) if sz >= SZ else sz, highlight=highlight, color=color, cjk=True, spacing=spacing)
        elif cls == "sym":
            pr = rpr(bold, italic, sup, sub, sz=sz - 4, font=SYM, highlight=highlight, color=color, spacing=spacing)
        else:
            pr = rpr(bold, italic, sup, sub, sz=sz, highlight=highlight, color=color, spacing=spacing)
        out.append(f'<w:r>{pr}<w:t xml:space="preserve">{esc(t).replace(NBH, NBH_XML)}</w:t></w:r>')
        buf.clear()
    for ch in text:
        c = "cjk" if is_cjk(ch) else ("sym" if ch in SYMS else "base")
        if c != cls:
            flush(); cls = c
        buf.append(ch)
    flush()
    return "".join(out)

SUBPAT = re.compile(r'P\(L(t\+1|t|0)(?=[ )|])')
def inline(text, **kw):
    """Body text with P(L_t) style subscripts rendered as real subscripts."""
    out, pos = [], 0
    for m in SUBPAT.finditer(text):
        out.append(runs(text[pos:m.start()] + "P(L", **kw))
        out.append(runs(m.group(1), sub=True, **kw))
        pos = m.end()
    out.append(runs(text[pos:], **kw))
    return "".join(out)

# ---------- paragraphs ----------
def ppr(jc="thaiDistribute", first=0, left=0, hanging=0, before=0, after=0, keep=False, tabs=None, sz=SZ):
    x = ""
    if keep: x += "<w:keepNext/>"
    if tabs: x += "<w:tabs>" + "".join(f'<w:tab w:val="{v}" w:pos="{p}"/>' for v, p in tabs) + "</w:tabs>"
    x += f'<w:spacing w:before="{before}" w:after="{after}" w:line="240" w:lineRule="auto"/>'
    ind = ""
    if left: ind += f' w:left="{left}"'
    if hanging: ind += f' w:hanging="{hanging}"'
    if first: ind += f' w:firstLine="{first}"'
    if ind: x += f"<w:ind{ind}/>"
    x += f'<w:jc w:val="{jc}"/>'
    x += f'<w:rPr><w:rFonts w:ascii="{FONT}" w:hAnsi="{FONT}" w:cs="{FONT}"/><w:sz w:val="{sz}"/><w:szCs w:val="{sz}"/></w:rPr>'
    return f"<w:pPr>{x}</w:pPr>"

def P(content, **kw): return f"<w:p>{ppr(**kw)}{content}</w:p>"
def blank(sz=SZ): return P("", jc="left", sz=sz)
def heading(text): return P(runs(text, bold=True), jc="left", keep=True)
def subheading(text): return P(runs(text, bold=True), jc="left", keep=True, before=120)
def body(text, first=IND, jc="thaiDistribute"):
    return P(inline(text), jc=jc, first=first)
def body_runin(prefix, rest):
    return P(runs(prefix, bold=True) + inline(rest), jc="thaiDistribute", first=IND)
def caption(label, rest, keep):
    return P(runs(label) + runs(rest), jc="center", keep=keep, before=120 if keep else 0, after=0 if keep else 120)
FIGS = []   # รูปที่ฝังลงเอกสาร: (rId, ไฟล์ PNG ต้นทาง, ชื่อใน word/media)
def figure(alt, rel_path):
    """บรรทัด ![alt](path.png) ในร่าง → รูปกว้างเต็มคอลัมน์ กึ่งกลาง · ![alt|82%](path.png) = ย่อเหลือ 82% ของความกว้าง
    (ถ้าไม่พบไฟล์ จะกลับเป็นแถบเหลืองรอใส่รูป)"""
    m_w = re.match(r'^(.*?)\|(\d+)%$', alt)
    pct = int(m_w.group(2)) if m_w else 100
    if m_w: alt = m_w.group(1)
    src = os.path.join(DOCS, *rel_path.split("/"))
    if not os.path.exists(src): return placeholder(f"{alt} — ไม่พบไฟล์ {rel_path}")
    n = len(FIGS) + 1; rid = f"rIdPaperFig{n}"; media = f"paperfig{n}.png"
    FIGS.append((rid, src, media))
    with open(src, "rb") as f: pw, ph = struct.unpack(">II", f.read(24)[16:24])
    cx = round(W * 635 * pct / 100); cy = round(cx * ph / pw)          # 1 dxa = 635 EMU
    pic = (f'<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="{cx}" cy="{cy}"/>'
           f'<wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="{9000 + n}" name="Figure {n}" descr="{esc(alt)}"/>'
           '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>'
           '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
           f'<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="{9000 + n}" name="{media}"/><pic:cNvPicPr/></pic:nvPicPr>'
           f'<pic:blipFill><a:blip r:embed="{rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
           f'<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>'
           '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>')
    return P(pic, jc="center", keep=True, before=120)
def placeholder(text):
    return (P(runs("[ รอใส่รูป — ลบย่อหน้านี้เมื่อใส่รูปจริง ]", bold=True, highlight="yellow"), jc="center", keep=True, before=120)
            + P(runs(text, sz=24, highlight="yellow"), jc="thaiDistribute", keep=True))

# ---------- tables ----------
from pythainlp.tokenize import word_tokenize
def is_thai(ch): return "฀" <= ch <= "๿"
# Words that must never be split by a break point (the tokenizer does not know names and loanwords).
# Add any new author name, transliteration or coined term here when the draft changes.
PROTECT = ["ตุลยนุสรญ์", "สุภาษา", "เสวียหง", "นพพล", "จันทร์กระจ่างแจ้ง", "หฤทัย", "ยุวรัตน์", "วรเดช", "ปิ่นทอง", "พยุงศักดิ์",
           "เกษมสำราญ", "ปวีณ", "เขื่อนแก้ว", "สมนึก", "สินธุปวน", "แม่โจ้", "เชียงใหม่",
           "เฟรมเวิร์ก", "กลสัทศาสตร์", "สัทศาสตร์", "บทเสริม", "ลักษณนาม", "รูปชั่วคราว", "เนื้อหาสมมุติ", "ฉบับร่าง", "พร้อมใช้",
           "หน่วยความรู้", "ตัวลวง", "ม้วนลิ้น", "คู่เสียง", "ข้อผิด", "แบบฝึก", "ชาวไทย", "ตัวยก", "อภิมาน", "แอป",
           "เอชเอสเค", "ไทป์สคริปต์", "เน็กซ์เจเอส", "รีแอกต์", "เทลวินด์ซีเอสเอส", "ไพทอน", "ฟาสต์เอพีไอ", "โพสต์เกรสคิวแอล",
           "ซูปาเบส", "โปรเกรสซีฟ", "เอนด์พอยต์", "คลาวด์", "เบราว์เซอร์", "อัลกอริทึม", "ไลบรารี", "แอปพลิเคชัน"]
PROTECT_PATTERNS = [(w, re.compile("\u200b?".join(re.escape(c) for c in w))) for w in PROTECT]
def thai_breaks(text):
    """Insert Word's no-width optional break (U+200B) between Thai words.
    Word without Thai proofing tools only wraps at spaces, which stretches justified lines and
    splits words inside narrow table cells; these invisible break points fix both on any machine."""
    if not any(is_thai(c) for c in text): return text
    toks = word_tokenize(text, engine="newmm", keep_whitespace=True)
    out = []
    for k, tok in enumerate(toks):
        if k > 0 and tok and toks[k-1] and is_thai(tok[0]) and is_thai(toks[k-1][-1]): out.append("\u200b")
        out.append(tok)
    joined = "".join(out)
    for w, pat in PROTECT_PATTERNS: joined = pat.sub(w, joined)
    return joined
def table(rows, widths, sz=TABLE_SZ):
    assert sum(widths) == W, (sum(widths), widths)
    b = '<w:tblBorders>' + "".join(f'<w:{e} w:val="single" w:sz="4" w:space="0" w:color="auto"/>' for e in ("top","left","bottom","right","insideH","insideV")) + '</w:tblBorders>'
    x = ('<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/>'
         f'<w:tblW w:w="{W}" w:type="dxa"/><w:jc w:val="center"/>{b}<w:tblLayout w:type="fixed"/>'
         '<w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar>'
         '<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>')
    x += "<w:tblGrid>" + "".join(f'<w:gridCol w:w="{w}"/>' for w in widths) + "</w:tblGrid>"
    keep_all = len(rows) <= 8       # keep a short table together (keepNext on every row but the last); longer ones split with a repeated header
                                    # (15 ต.ค.: 12 → 8 — ตารางที่ 4 มี 11 แถว ถ้าบังคับไม่แยกจะตกไปทั้งตารางเหลือที่ว่างครึ่งหน้า)
    for ri, row in enumerate(rows):
        assert len(row) == len(widths), row
        hdr = ri == 0
        x += "<w:tr><w:trPr><w:cantSplit/>" + ("<w:tblHeader/>" if hdr else "") + "</w:trPr>"
        for ci, cell in enumerate(row):
            x += f'<w:tc><w:tcPr><w:tcW w:w="{widths[ci]}" w:type="dxa"/>' + ('<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>' if hdr else '') + '</w:tcPr>'
            x += P(inline(cell, bold=hdr, sz=sz), jc="center" if hdr else "left", sz=sz, keep=(keep_all and ri < len(rows) - 1) or hdr)   # หัวตารางติดกับแถวแรกเสมอ
            x += "</w:tc>"
        x += "</w:tr>"
    x += "</w:tbl>"
    return x

# ---------- equations (OMML) ----------
MATH_SZ = 24
def mr(t, nor=False, sz=None):
    sz = sz or (SZ if nor else MATH_SZ)
    mpr = "<m:rPr><m:nor/></m:rPr>" if nor else ""
    wpr = (f'<w:rPr><w:rFonts w:ascii="{FONT}" w:hAnsi="{FONT}" w:cs="{FONT}"/><w:sz w:val="{sz}"/><w:szCs w:val="{sz}"/></w:rPr>'
           if nor else f'<w:rPr><w:sz w:val="{sz}"/><w:szCs w:val="{sz}"/></w:rPr>')
    return f'<m:r>{mpr}{wpr}<m:t xml:space="preserve">{esc(t)}</m:t></m:r>'
def msub(b, s): return f"<m:sSub><m:e>{b}</m:e><m:sub>{s}</m:sub></m:sSub>"
def mfrac(n, d): return f"<m:f><m:num>{n}</m:num><m:den>{d}</m:den></m:f>"
def PL(sub="t"): return mr("P(") + msub(mr("L"), mr(sub)) + mr(")")
def PLc(cond): return mr("P(") + msub(mr("L"), mr("t")) + mr(" | ") + mr(cond, nor=True) + mr(")")
EQ = {
    "(1)": PLc("ตอบถูก") + mr(" = ") + mfrac(PL() + mr("(1 − P(S))"), PL() + mr("(1 − P(S)) + (1 − ") + PL() + mr(")P(G)")),
    "(2)": PLc("ตอบผิด") + mr(" = ") + mfrac(PL() + mr("P(S)"), PL() + mr("P(S) + (1 − ") + PL() + mr(")(1 − P(G))")),
    "(3)": PL("t+1") + mr(" = ") + PLc("ผลการตอบ") + mr(" + (1 − ") + PLc("ผลการตอบ") + mr(")P(T)"),
}
def equation(num):
    tabs = [("center", W // 2), ("right", W)]
    r = rpr()
    return (f'<w:p>{ppr(jc="left", tabs=tabs, before=60, after=60)}<w:r>{r}<w:tab/></w:r>'
            f'<m:oMath>{EQ[num]}</m:oMath><w:r>{r}<w:tab/><w:t>{num}</w:t></w:r></w:p>')

# ---------- references: italic parts (APA 7) ----------
ITALIC = {
    "ตุลยนุสรญ์": ["วารสารบัณฑิตวิจัย, 8"],
    "นพพล": ["วารสารสวนสุนันทาวิชาการและวิจัย, 13"],
    "Aroonawongsa": ["Rajamangala University of Technology Tawan-ok Social Science Journal, 14"],
    "Badrinath": ["Proceedings of the 14th International Conference on Educational Data Mining"],
    "Cai, Y.-W.": ["Theory and Practice in Language Studies, 5"],
    "Center for Language Education and Cooperation. (n.d.)": ["中文水平考试 HSK（一级）样卷"],
    "Center for Language Education and Cooperation. (2025)": ["中文水平考试 HSK 考试大纲"],
    "Cepeda": ["Psychological Bulletin, 132"],
    "Corbett": ["User Modeling and User-Adapted Interaction, 4"],
    "drkameleon": [("complete-hsk-vocabulary [Data set]", "complete-hsk-vocabulary")],
    "Hao, Y.": ["Brain Sciences, 12"],
    "HSK1.org": ["HSK 1 vocabulary list"],
    "Huang, M.": ["Chinese Language and Culture Journal, 11"],
    "Inceoglu": ["ReCALL, 35"],
    "Kitikanan": ["Annual Review of Education, Communication and Language Sciences, 9"],
    "Kongkamnerd": ["Journal of Sinology, 18"],
    "Li, L.": ["Chinese Language and Culture Journal, 8"],
    "Li, Y.": ["English Language Teaching, 9"],
    "Mandarin Bean": ["New HSK 1 word list"],
    "MDBG": ["CC-CEDICT"],
    "Ministry of Education": ["国际中文教育中文水平等级标准"],
    "Open Spaced Repetition": [("ts-fsrs (Version", "ts-fsrs")],
    "Pichaichanlert": ["Journal of Sinology, 16"],
    "Roediger": ["Psychological Science, 17"],
    "Rungruang": ["Asian Social Science, 13"],
    "Settles": ["Proceedings of the 54th Annual Meeting of the Association for Computational Linguistics (Volume 1: Long Papers)"],
    "Wang, Y.": ["The Journal of the Acoustical Society of America, 106"],
    "Ye, J.": ["Proceedings of the 28th ACM SIGKDD Conference on Knowledge Discovery and Data Mining"],
    "Zhang, C.": ["现代语言学", ("[Modern Linguistics], 11(4)", "11")],
    "Zhang, H.": ["Behavioral Sciences, 15"],
    "Zhang, L.": ["Journal of Second Language Studies, 3"],
    "Zhang, S.": ["Lawarath Social E-Journal, 8"],
}
def reference(text):
    spec = None
    for k, v in ITALIC.items():
        if text.startswith(k):
            if spec is not None: raise SystemExit("ambiguous ref key: " + text[:40])
            spec = v
    if spec is None: raise SystemExit("no italic spec for reference: " + text[:60])
    spans = []
    for item in spec:
        if isinstance(item, tuple):
            ctx, inner = item
            assert text.count(ctx) == 1, ctx
            i = text.index(ctx); j = text.index(inner, i); spans.append((j, j + len(inner)))
        else:
            assert text.count(item) == 1, (item, text.count(item), text[:50])
            i = text.index(item); spans.append((i, i + len(item)))
    spans.sort()
    out, pos = [], 0
    for a, b in spans:
        out.append(runs(text[pos:a])); out.append(runs(text[a:b], italic=True)); pos = b
    out.append(runs(text[pos:]))
    return P("".join(out), jc="left", left=IND, hanging=IND, after=120)

# ---------- front matter ----------
def sup_runs(s, **kw):
    """'ชื่อ^1, ... ชื่อ^{1,*}' -> runs with superscripts."""
    out = []
    for part in re.split(r'(\^\{[^}]*\}|\^\S)', s):
        if not part: continue
        if part.startswith("^{"): out.append(runs(part[2:-1], sup=True, brk=False, **kw))
        elif part.startswith("^"): out.append(runs(part[1:], sup=True, brk=False, **kw))
        else: out.append(runs(part, brk=False, **kw))
    return "".join(out)

FRONT = {
    "title_th": "ระบบติวเตอร์ภาษาจีนอัจฉริยะสำหรับคนไทย",
    "title_en": "INTELLIGENT CHINESE TUTORING SYSTEM FOR THAI LEARNERS",
    "authors_th": "หฤทัย ยุวรัตน์^1, วรเดช ปิ่นทอง^1, พยุงศักดิ์ เกษมสำราญ^1, ปวีณ เขื่อนแก้ว^1 และ สมนึก สินธุปวน^{1,*}",
    "authors_en": "Haluethai Yuwarat^1, Woradech Pinthong^1, Payungsak Kasemsumran^1, Paween Khoenkaew^1 and Somnuek Sinthupuan^{1,*}",
    "affil": "^1 สาขาวิชาวิทยาการคอมพิวเตอร์ คณะวิทยาศาสตร์ มหาวิทยาลัยแม่โจ้ เชียงใหม่ 50290 ประเทศไทย",
    "corr": "* ผู้นิพนธ์ประสานงาน: ผศ.ดร. สมนึก สินธุปวน  อีเมล: somnuk@mju.ac.th",
}

def front_matter():
    x = P(runs(FRONT["title_th"], bold=True, sz=32, brk=False), jc="thaiDistribute", sz=32)
    x += P(runs(FRONT["title_en"], bold=True, sz=32, brk=False), jc="thaiDistribute", sz=32)
    x += blank()
    x += P(sup_runs(FRONT["authors_th"]), jc="left")
    x += P(sup_runs(FRONT["authors_en"], spacing=-4), jc="left")   # condensed 0.2 pt: 5 English names then fit on one line
    x += P(sup_runs(FRONT["affil"], italic=True), jc="left")
    x += P(runs(FRONT["corr"], sz=24, brk=False), jc="left", sz=24)
    x += blank()
    return x

# ---------- parse the draft ----------
MAIN = ["บทคัดย่อ", "Abstract", "บทนำ", "ทบทวนวรรณกรรม", "วิธีการดำเนินการวิจัย", "ผลการวิจัยและอภิปรายผล", "บทสรุป", "กิตติกรรมประกาศ", "เอกสารอ้างอิง"]
SUB = ["ข้อผิดของผู้เรียนชาวไทยที่เกิดจากภาษาแม่", "การติดตามความรู้แบบเบส์และตารางจับคู่ข้อสอบกับหน่วยความรู้",
       "การทบทวนแบบเว้นระยะและผลของการทดสอบต่อความจำ (testing effect)", "การฝึกรับรู้วรรณยุกต์และข้อจำกัดของการรู้จำเสียงพูด",
       "มาตรฐานและรูปแบบข้อสอบ HSK ระบบ 3.0", "1. การศึกษาและรวบรวมข้อมูล", "2. การวิเคราะห์และออกแบบระบบ", "3. การพัฒนาระบบ",
       "4. การทดสอบและการวางแผนประเมินผล", "ผลการพัฒนาระบบ", "ผลการทดสอบการทำงานของระบบ", "อภิปรายผล"]
RUNIN = ["1.1 ความต้องการของระบบ", "1.2 คลังคำศัพท์และเนื้อหา", "1.3 คลังข้อผิดเฉพาะผู้เรียนชาวไทย", "2.1 สถาปัตยกรรมของระบบ",
         "2.2 ฐานข้อมูล", "2.3 การออกแบบการสอนและแบบฝึก", "2.4 แบบจำลองผู้เรียนและการทบทวน", "2.5 การตรวจคำตอบและการวินิจฉัยข้อผิด",
         "4.1 การทดสอบการทำงาน", "4.2 แผนการประเมินกับผู้เรียน"]
WIDTHS = {1: [1450, 2650, 2650, 2852], 2: [2000, 2100, 5502], 3: [2700, 4300, 2602], 4: [3600, 1500, 1600, 2902]}

def parse_body():
    t = io.open(SRC, encoding="utf-8").read()
    a = t.index("## ===== เริ่มเนื้อหาบทความ"); b = t.index("## ===== จบเนื้อหาบทความ")
    lines = [l.rstrip() for l in t[a:b].split("\n")[1:]]
    section = None
    i = 0; xml = []; n_main = 0; plain_texts = []   # plain_texts: for the fidelity check
    def add_text(s): plain_texts.append(s)
    while i < len(lines):
        l = lines[i].strip()
        if not l: i += 1; continue
        if l.startswith("### ["):
            section = l[5:l.index("]")] if "]" in l else l; i += 1; continue
        if section and (section.startswith("ชื่อเรื่อง") or section.startswith("ผู้แต่ง")):
            add_text(l); i += 1; continue           # front matter is hard-coded above
        if l in MAIN:
            if n_main >= 1: xml.append(blank())
            xml.append(heading(l)); add_text(l); n_main += 1; i += 1; continue
        if l in SUB:
            xml.append(subheading(l)); add_text(l); i += 1; continue
        if l.startswith("คำสำคัญ :") or l.startswith("Keywords:"):
            k = "คำสำคัญ :" if l.startswith("คำสำคัญ") else "Keywords:"
            xml.append(blank()); xml.append(P(runs(k) + runs(l[len(k):]), jc="left"))
            add_text(l); i += 1; continue
        def next_nonblank(k):
            while k < len(lines) and not lines[k].strip(): k += 1
            return k
        if l.startswith("ตารางที่ ") and next_nonblank(i + 1) < len(lines) and " | " in lines[next_nonblank(i + 1)]:
            m = re.match(r'(ตารางที่ \d+)\s*(.*)', l); num = int(re.search(r'\d+', m.group(1)).group())
            xml.append(caption(m.group(1) + " ", m.group(2), keep=True)); add_text(l)
            rows = []; i = next_nonblank(i + 1)
            while i < len(lines) and " | " in lines[i]:
                cells = [c.strip() for c in lines[i].split(" | ")]; rows.append(cells); add_text(" | ".join(cells))
                i = next_nonblank(i + 1)
            xml.append(table(rows, WIDTHS[num])); xml.append(blank(sz=12)); continue
        m_fig = re.match(r'^!\[(.*?)\]\((.+?\.png)\)$', l)
        if m_fig:
            xml.append(figure(m_fig.group(1), m_fig.group(2))); i += 1; continue   # ไม่นับในตรวจความครบของข้อความ
        if l.startswith("【"):
            inner = l.strip("【】").strip()
            xml.append(placeholder(inner)); add_text(l); i += 1; continue
        if l.startswith("รูปที่ "):
            m = re.match(r'(รูปที่ \d+)\s*(.*)', l)
            xml.append(caption(m.group(1) + " ", m.group(2), keep=False)); add_text(l); i += 1; continue
        if l.startswith("P(L") and re.search(r'\((\d)\)$', l):
            xml.append(equation(re.search(r'(\(\d\))$', l).group(1))); add_text(l); i += 1; continue
        if l.startswith("หมายเหตุ "):
            xml.append(P(runs("หมายเหตุ ", bold=True) + runs(l[len("หมายเหตุ "):], sz=SZ), jc="thaiDistribute", after=120)); add_text(l); i += 1; continue
        if section and section.startswith("เอกสารอ้างอิง") and l != "เอกสารอ้างอิง":
            xml.append(reference(l)); add_text(l); i += 1; continue
        if section and section.startswith("Abstract") and l != "Abstract":
            xml.append(body(l, jc="both")); add_text(l); i += 1; continue
        hit = [p for p in RUNIN if l.startswith(p + " ")]
        if hit:
            xml.append(body_runin(hit[0], l[len(hit[0]):])); add_text(l); i += 1; continue
        xml.append(body(l)); add_text(l); i += 1
    return "".join(xml), plain_texts

def main():
    sys.stdout.reconfigure(encoding="utf-8")   # ชื่อไฟล์รูปเป็นภาษาไทย
    if os.path.exists(OUT_DIR): shutil.rmtree(OUT_DIR)
    shutil.copytree(TPL, OUT_DIR)
    doc = io.open(os.path.join(OUT_DIR, "word", "document.xml"), encoding="utf-8").read()
    body_xml, plain = parse_body()
    start = doc.index("<w:body>") + len("<w:body>"); end = doc.index("<w:sectPr")
    new = doc[:start] + front_matter() + body_xml + doc[end:]
    if FIGS:   # รูปที่ฝัง: คัดลอกไฟล์ + เพิ่ม relationship (ชนิด png มีใน [Content_Types].xml ของเทมเพลตแล้ว)
        rels_p = os.path.join(OUT_DIR, "word", "_rels", "document.xml.rels"); rels = io.open(rels_p, encoding="utf-8").read()
        for rid, src, media in FIGS:
            shutil.copyfile(src, os.path.join(OUT_DIR, "word", "media", media))
            rels = rels.replace("</Relationships>", f'<Relationship Id="{rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/{media}"/></Relationships>')
        io.open(rels_p, "w", encoding="utf-8").write(rels)
        print("embedded figures:", ", ".join(os.path.basename(s) for _, s, _ in FIGS))
    # the template still carries an old first-page header ("ครั้งที่ 6") and footer; unlink them so "Different First Page" can never show them
    new = re.sub(r'<w:(?:header|footer)Reference w:type="first" r:id="[^"]+"/>', '', new)
    io.open(os.path.join(OUT_DIR, "word", "document.xml"), "w", encoding="utf-8").write(new)
    # document properties
    core_p = os.path.join(OUT_DIR, "docProps", "core.xml"); core = io.open(core_p, encoding="utf-8").read()
    core = re.sub(r'<dc:title>.*?</dc:title>', f'<dc:title>{esc(FRONT["title_th"])}</dc:title>', core)
    core = re.sub(r'<dc:creator>.*?</dc:creator>', '<dc:creator>หฤทัย ยุวรัตน์; วรเดช ปิ่นทอง</dc:creator>', core)
    core = re.sub(r'<cp:lastModifiedBy>.*?</cp:lastModifiedBy>', '<cp:lastModifiedBy>วรเดช ปิ่นทอง</cp:lastModifiedBy>', core)
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    core = re.sub(r'(<dcterms:modified[^>]*>).*?(</dcterms:modified>)', rf'\g<1>{now}\g<2>', core)
    core = re.sub(r'<cp:lastPrinted>.*?</cp:lastPrinted>', '', core)
    io.open(core_p, "w", encoding="utf-8").write(core)
    app_p = os.path.join(OUT_DIR, "docProps", "app.xml"); app = io.open(app_p, encoding="utf-8").read()
    app = re.sub(r'<HeadingPairs>.*?</HeadingPairs>', '', app, flags=re.S)      # old template title lived here
    app = re.sub(r'<TitlesOfParts>.*?</TitlesOfParts>', '', app, flags=re.S)
    app = re.sub(r'<(TotalTime|Pages|Words|Characters|Lines|Paragraphs|CharactersWithSpaces)>[^<]*</\1>', '', app)
    io.open(app_p, "w", encoding="utf-8").write(app)
    # zip ([Content_Types].xml first)
    if os.path.exists(OUT_DOCX): os.remove(OUT_DOCX)
    with zipfile.ZipFile(OUT_DOCX, "w", zipfile.ZIP_DEFLATED) as z:
        z.write(os.path.join(OUT_DIR, "[Content_Types].xml"), "[Content_Types].xml")
        for root, _, files in os.walk(OUT_DIR):
            for f in files:
                full = os.path.join(root, f); rel = os.path.relpath(full, OUT_DIR).replace(os.sep, "/")
                if rel == "[Content_Types].xml": continue
                z.write(full, rel)
    # fidelity check: every draft line's text must appear in the docx text, in order
    docx_text = html.unescape(re.sub(r'<[^>]+>', '', re.sub(r'</w:p>', '\n', new[start:].replace('<w:noBreakHyphen/>', '-'))))
    docx_text = re.sub(r'[ \t]+', ' ', docx_text.replace("​", ""))
    missing = []; pos = 0
    for s in plain:
        key = re.sub(r'[ \t]+', ' ', s.strip("【】").strip())
        key = key.replace("^{", "").replace("}", "").replace("^", "")
        j = docx_text.find(key, pos)
        if j < 0:
            if " | " in key and all(docx_text.find(c.strip(), pos) >= 0 for c in key.split(" | ")): continue
            missing.append(key[:80])
        else: pos = j
    print("draft lines:", len(plain), "| not found in docx (order-sensitive):", len(missing))
    for m in missing: print("  MISSING:", m)
    print("wrote", OUT_DOCX, os.path.getsize(OUT_DOCX), "bytes")

if __name__ == "__main__":
    main()
