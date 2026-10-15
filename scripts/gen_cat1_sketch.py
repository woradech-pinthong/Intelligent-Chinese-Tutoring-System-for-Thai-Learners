# -*- coding: utf-8 -*-
# "ผังหมวด 1 ตามรูปอาจารย์" ฉบับทีม (ข้อมูลจริงจาก seed demo_mint.sql) → docs/08_สเปค-พัฒนา/ผังหมวด1-ตามรูปอาจารย์.{drawio,png} (วาดเองด้วย PIL)
# รัน: python scripts/gen_cat1_sketch.py · 16 ต.ค.: เพิ่มกล่อง category_progress (หลอดใต้ชื่อหมวด) ใต้ categories
import html, io, os, re, sys, unicodedata
import xml.etree.ElementTree as ET
from PIL import Image, ImageDraw, ImageFont, features
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
DOCS = "D:/Project_term_1_2569/docs/08_สเปค-พัฒนา"
OUT_DRAWIO = f"{DOCS}/ผังหมวด1-ตามรูปอาจารย์.drawio"
OUT_PNG = f"{DOCS}/ผังหมวด1-ตามรูปอาจารย์.png"
U = "…0a0001"
ROW, HDR = 30, 32
BLUE, GREEN = ("#dae8fc", "#6c8ebf"), ("#d5e8d4", "#82b366")
YEL, GREY = "#fff2cc", "#f5f5f5"

tables, boxes, notes, edges, badges = [], [], [], [], []
def table(tid, x, y, title, cols, rows, color, hl=()):
    w = sum(wd for _, wd in cols); h = HDR + ROW * (len(rows) + 1)
    tables.append(dict(id=tid, x=x, y=y, w=w, h=h, title=title, cols=cols, rows=rows, color=color, hl=set(hl)))
def box(bid, x, y, w, h, lines, fill="#ffffff", stroke="#999999", dashed=False, title=None):
    boxes.append(dict(id=bid, x=x, y=y, w=w, h=h, lines=lines, fill=fill, stroke=stroke, dashed=dashed, title=title))
def note(nid, x, y, w, h, text):
    notes.append(dict(id=nid, x=x, y=y, w=w, h=h, text=text))
def edge(eid, pts, label=None, lab_at=None):
    edges.append(dict(id=eid, pts=pts, label=label, lab_at=lab_at))
def badge(x, y, txt):
    badges.append((x, y, txt))

# ---------- ① หมวด → ทักษะ ----------
table("categories", 40, 80, "categories — หมวด (อาจารย์: cat)", [("id", 45), ("name_th", 215)],
      [[1, "ทักทาย & คนรอบตัว"], [2, "ตัวเลข เวลา & วันที่"], [3, "กิน ดื่ม & ซื้อของ"],
       [4, "เรียน ทำงาน & สื่อสาร"], [5, "เดินทาง & ชีวิตประจำวัน"]], BLUE, hl=(0,))
box("skills", 380, 80, 300, 135, [], dashed=True, title="ทักษะที่วางในหมวด (อาจารย์: skills)")
box("m_listen", 395, 112, 62, 36, ["ฟัง", "listening"], fill=BLUE[0], stroke=BLUE[1])
box("m_read",   465, 112, 62, 36, ["อ่าน", "reading"], fill=BLUE[0], stroke=BLUE[1])
box("m_speak",  535, 112, 62, 36, ["พูด", "future"], fill=GREY, dashed=True)
box("m_write",  605, 112, 62, 36, ["เขียน", "ไม่สอบ"], fill=GREY, dashed=True)
note("skills_note", 390, 158, 282, 52, "ไม่ใช่ตารางแยก — เป็นค่าในช่อง items.module / attempts.generator · HSK 1 สอบแค่ ฟัง + อ่าน")
# ---------- ชั้นทักษะที่ 2 (16 ต.ค.): skills = รายชื่อหน่วยที่วัดได้ 23 ตัว · item_skills = ข้อไหนวัดหน่วยไหน ----------
table("skills_tbl", 760, 80, "skills — หน่วยความรู้ที่วัดได้ 23 แถว (ชั้นที่ 2 ละเอียดกว่า 4 ด้าน)",
      [("id", 40), ("code", 130), ("name_th", 200), ("type", 60)],
      [[21, "SKILL-LISTEN", "ทักษะฟัง (เสียง → ความหมาย)", "skill"], [16, "VOCAB-C1", "คำศัพท์หมวด 1", "vocab"],
       [1, "TL-TONE-T2AS3", "เสียง 2 เพี้ยนไปคล้ายเสียง 3", "thai_l1"], ["…", "… รวม 23 แถว", "จุดผิดคนไทย 15 · คำหมวด 5 · ทักษะ 3", ""]], BLUE, hl=(0, 1))
table("item_skills", 1260, 80, "item_skills — ข้อไหนวัดหน่วยไหน",
      [("item_id→items", 110), ("skill_id→skills", 110)], [[1, 21], [1, 16]], BLUE, hl=(0, 1))
edge("e_chips_skills", [(680, 150), (760, 150)], None, None)
edge("e_is_skills", [(1260, 150), (1190, 150)], None, None)
edge("e_is_items", [(1400, 202), (1400, 330)], "ข้อนี้วัดหน่วยไหน", (1400, 250))

# ---------- ② คำ + เสียง → ข้อสอบ ----------
table("words", 420, 330, "words — คำ + เสียง ของหมวด 1 (อาจารย์: word + voice · type)",
      [("id", 45), ("hanzi", 70), ("pinyin", 80), ("meaning_th", 100), ("audio_path (เสียง)", 120), ("category → categories", 110)],
      [[147, "你好", "nǐ hǎo", "สวัสดี", "words/147.mp3", 1], [241, "谢谢", "xiè xie", "ขอบคุณ", "words/241.mp3", 1],
       [272, "再见", "zài jiàn", "ลาก่อน", "words/272.mp3", 1], ["…", "… รวม 70 คำ", "", "", "", 1]], GREEN)
table("items", 980, 330, "items — ข้อสอบฟัง (อาจารย์: Lis)",
      [("id", 40), ("V1 = audio_path", 120), ("Ans = answer_key", 110), ("A1–A4 = choices", 230)],
      [[1, "words/241.mp3 (谢谢)", "ขอบคุณ", "[ขอบคุณ, สวัสดี, ลาก่อน, ขอโทษ]"],
       [2, "words/272.mp3 (再见)", "ลาก่อน", "[สวัสดี, ลาก่อน, ขอบคุณ, ขอโทษ]"],
       [3, "words/45.mp3 (对不起)", "ขอโทษ", "[ขอโทษ, สวัสดี, ขอบคุณ, ลาก่อน]"]], BLUE)
note("items_note", 980, 268, 370, 50, "ข้อละ 1 เสียง + เฉลย 1 (ตัวล็อก) + ตัวลวง 3 จากหมวดเดียวกัน ไม่ซ้ำ · ทุกข้อติดป้ายทักษะใน item_skills (SKILL-LISTEN + VOCAB-C1)")

# ---------- ③ คน → รอบ → ผล → นับ ----------
table("users", 40, 600, "users — ผู้เรียน (อาจารย์: U)", [("id", 110), ("display_name", 150)],
      [["…0a0001", "มิ้นท์ (บัญชีสาธิต)"]], BLUE, hl=(0,))
table("sessions", 380, 600, "sessions — รอบควิซหมวด 1 (อาจารย์: C)",
      [("id", 40), ("user_id → users", 100), ("kind", 70), ("category → categories", 110), ("score / total", 80)],
      [[2, "…0a0001", "quiz", 1, "2 / 3"]], BLUE, hl=(0,))
table("attempts", 840, 600, "attempts — ผลรายข้อ (อาจารย์: U · C · Lis · # → 1/0)",
      [("user_id → users", 100), ("session_id → sessions", 110), ("item_id → items", 100), ("is_correct", 90)],
      [["…0a0001", 2, 1, "1 (true)"], ["…0a0001", 2, 2, "1 (true)"], ["…0a0001", 2, 3, "0 (false)"]], BLUE, hl=(0, 1, 2))
box("count", 1270, 600, 230, 150, [
    "คน = มิ้นท์ · หมวด = 1 · ข้อฟัง",
    "นับ is_correct = 1",
    "→ ถูก 2 จาก 3 ข้อ",
    "(ดู attempts จับคู่ sessions)",
], fill=YEL, stroke="#d6b656", title="นับยังไง")
# ---------- เลขป้ายตามการกดในเว็บ (16 ต.ค.): 0 สมัคร · ① เลือกหมวด · ② หน้าหมวด (ทักษะ) · ③ บัตรคำ · ④ ควิซ (ข้อ → รอบ → คำตอบ) · ⑤ ผล/นับ ----------
badge(26, 96, "①"); badge(26, 396, "①")
badge(366, 96, "②"); badge(746, 96, "②"); badge(1246, 96, "②")
badge(406, 346, "③")
badge(966, 346, "④"); badge(366, 616, "④"); badge(826, 616, "④")
badge(1256, 616, "⑤")
badge(26, 616, "0")
note("skill_note", 40, 775, 1460, 30, "ชั้นทักษะที่ 2: 4 ด้านของอาจารย์ (ฟัง/อ่าน) = ค่าในช่อง · ตาราง skills = หน่วยย่อยที่โมเดลวัด · ข้อสอบชี้ว่าวัดหน่วยไหนผ่าน item_skills (1 ข้อหลายป้ายได้) · ทุกคำตอบใน attempts ก๊อปป้ายมาใส่ skill_id → โมเดล BKT นับถูก/ผิดแยกตามป้าย = ความแม่นรายหน่วย (mastery_snapshots)")

# ---------- ลูกศร ----------
edge("e_cat_skills", [(300, 157), (380, 157)], "วางทักษะอะไร", (340, 143))
edge("e_skills_words", [(560, 215), (560, 330)], "คำของหมวด 1 → words.category = 1", (670, 272))
edge("e_words_items", [(945, 420), (980, 420)], "เจน · ไม่ซ้ำ", (962, 404))
# ---------- หลอดใต้ชื่อหมวด = คน × หมวด (จุดที่สับสนกับ categories รอบ 7) ----------
table("category_progress", 40, 380, "category_progress — คน × หมวด (หลอดใต้ชื่อหมวด)",
      [("user_id→users", 85), ("category→categories", 112), ("words_learned", 78), ("quiz_best_score", 88)],
      [["…0a0001", 1, 1, 2]], BLUE, hl=(0,))
note("prog_note", 140, 476, 260, 44, "หลอด = words_learned ÷ categories.word_count (70) · แถวนี้เกิดตอนมิ้นท์เปิดหมวด 1 ครั้งแรก")
edge("e_cat_prog", [(170, 292), (170, 380)], "หมวดไหน (category)", (262, 336))
edge("e_prog_users", [(75, 472), (75, 600)], "คนไหน (user_id)", (165, 545))
edge("e_users_sess", [(300, 677), (380, 677)], "user_id", (340, 663))
edge("e_sess_att", [(780, 677), (840, 677)], "session_id", (810, 663))
edge("e_items_att", [(1100, 482), (1100, 600)], "attempts.item_id → items.id", (1190, 540))
edge("e_att_count", [(1240, 675), (1270, 675)], None, None)
TITLE = "ผังหมวด 1 ฉบับทีม — เดินตามรูปที่อาจารย์วาด (นัดรอบ 7 · 1 ต.ค. 69) · ชื่อตาราง/ช่อง/ค่า = ของจริงใน Supabase"
SUB = "หมวด → ทักษะ → คำ+เสียง → ข้อสอบ → ผลรายคน → นับ · สีเหลือง = แถวของมิ้นท์ (ผู้เรียนสาธิต) · บนลูกศร = ช่องที่ใช้โยง · เลขแดง = ลำดับที่กดในเว็บ (0 สมัคร · ① เลือกหมวด · ② หน้าหมวด/ทักษะ · ③ บัตรคำ · ④ ควิซ · ⑤ ผล)"

# ================= draw.io =================
def esc(s): return html.escape(str(s), quote=True)
cells = []
def st_table(t): return (f'shape=table;startSize={HDR};container=1;collapsible=0;childLayout=tableLayout;fontStyle=1;fontSize=12;html=1;'
                         f'align=left;spacingLeft=8;fillColor={t["color"][0]};strokeColor={t["color"][1]};')
for t in tables:
    cells.append(f'<mxCell id="{t["id"]}" value="{esc(t["title"])}" style="{st_table(t)}" vertex="1" parent="1"><mxGeometry x="{t["x"]}" y="{t["y"]}" width="{t["w"]}" height="{t["h"]}" as="geometry"/></mxCell>')
    for ri, r in enumerate([[c for c, _ in t["cols"]]] + t["rows"]):
        rid = f'{t["id"]}_r{ri}'
        cells.append(f'<mxCell id="{rid}" value="" style="shape=tableRow;horizontal=0;startSize=0;swimlaneHead=0;swimlaneBody=0;strokeColor=inherit;top=0;left=0;bottom=0;right=0;collapsible=0;dropTarget=0;fillColor=none;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;" vertex="1" parent="{t["id"]}"><mxGeometry y="{HDR + ROW * ri}" width="{t["w"]}" height="{ROW}" as="geometry"/></mxCell>')
        cx = 0
        for ci, (val, (_, wd)) in enumerate(zip(r, t["cols"])):
            extra = "fontStyle=1;fillColor=#f5f5f5;fontSize=10;" if ri == 0 else (f"fillColor={YEL};" if (ri - 1) in t["hl"] else "")
            cells.append(f'<mxCell id="{rid}_c{ci}" value="{esc(val)}" style="shape=partialRectangle;html=1;whiteSpace=wrap;connectable=0;strokeColor=inherit;overflow=hidden;fillColor=none;top=0;left=0;bottom=0;right=0;pointerEvents=1;fontSize=11;align=center;{extra}" vertex="1" parent="{rid}"><mxGeometry x="{cx}" width="{wd}" height="{ROW}" as="geometry"><mxRectangle width="{wd}" height="{ROW}" as="alternateBounds"/></mxGeometry></mxCell>')
            cx += wd
for b in boxes:
    small = b["id"].startswith("m_")
    style = (f'rounded=1;arcSize=6;whiteSpace=wrap;html=1;align={"center" if small else "left"};verticalAlign={"middle" if small else "top"};'
             f'spacing={4 if small else 8};fontSize={12 if small else 11};fillColor={b["fill"]};strokeColor={b["stroke"]};{"dashed=1;" if b["dashed"] else ""}')
    if small: raw = f"{b['lines'][0]}<br><font style='font-size:9px'>{b['lines'][1]}</font>"
    else: raw = (f"<b>{b['title']}</b><br>" if b["title"] else "") + "<br>".join(b["lines"])
    cells.append(f'<mxCell id="{b["id"]}" value="{esc(raw)}" style="{style}" vertex="1" parent="1"><mxGeometry x="{b["x"]}" y="{b["y"]}" width="{b["w"]}" height="{b["h"]}" as="geometry"/></mxCell>')
for n in notes:
    cells.append(f'<mxCell id="{n["id"]}" value="{esc(n["text"])}" style="text;html=1;whiteSpace=wrap;align=left;verticalAlign=top;fontSize=10;fontColor=#666666;strokeColor=none;fillColor=none;spacing=2;" vertex="1" parent="1"><mxGeometry x="{n["x"]}" y="{n["y"]}" width="{n["w"]}" height="{n["h"]}" as="geometry"/></mxCell>')
cells.append(f'<mxCell id="title" value="&lt;b&gt;&lt;font style=&#x27;font-size:15px&#x27;&gt;{esc(TITLE)}&lt;/font&gt;&lt;/b&gt;&lt;br&gt;{esc(SUB)}" style="text;html=1;whiteSpace=wrap;align=left;verticalAlign=top;fontSize=11;strokeColor=none;fillColor=none;" vertex="1" parent="1"><mxGeometry x="40" y="8" width="1600" height="50" as="geometry"/></mxCell>')
for e in edges:
    pts = e["pts"]; src = (pts[0]); dst = pts[-1]
    inner = '<Array as="points">' + "".join(f'<mxPoint x="{x}" y="{y}"/>' for x, y in pts[1:-1]) + '</Array>'
    cells.append(f'<mxCell id="{e["id"]}" value="" style="endArrow=block;endFill=1;html=1;rounded=0;strokeWidth=1.5;strokeColor=#333333;" edge="1" parent="1"><mxGeometry relative="1" as="geometry"><mxPoint x="{src[0]}" y="{src[1]}" as="sourcePoint"/><mxPoint x="{dst[0]}" y="{dst[1]}" as="targetPoint"/>{inner}</mxGeometry></mxCell>')
    if e["label"]:
        lx, ly = e["lab_at"]
        cells.append(f'<mxCell id="{e["id"]}_l" value="{esc(e["label"])}" style="text;html=1;align=center;verticalAlign=middle;fontSize=10;fillColor=#ffffff;strokeColor=none;" vertex="1" parent="1"><mxGeometry x="{lx - 70}" y="{ly - 9}" width="140" height="18" as="geometry"/></mxCell>')
for i, (x, y, txt) in enumerate(badges):
    cells.append(f'<mxCell id="badge{i}" value="{esc(txt)}" style="text;html=1;align=center;verticalAlign=middle;fontSize=14;fontStyle=1;fontColor=#b85450;strokeColor=none;fillColor=none;" vertex="1" parent="1"><mxGeometry x="{x - 18}" y="{y - 10}" width="34" height="20" as="geometry"/></mxCell>')
xml = ('<mxfile host="app.diagrams.net">\n  <diagram name="ผังหมวด 1 ตามรูปอาจารย์" id="cat1-sketch">\n'
       '    <mxGraphModel dx="1018" dy="686" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" '
       'page="1" pageScale="1" pageWidth="1654" pageHeight="1169" math="0" shadow="0">\n      <root>\n'
       '        <mxCell id="0"/>\n        <mxCell id="1" parent="0"/>\n        ' + "\n        ".join(cells) +
       '\n      </root>\n    </mxGraphModel>\n  </diagram>\n</mxfile>\n')
ET.fromstring(xml.encode("utf-8"))
io.open(OUT_DRAWIO, "w", encoding="utf-8", newline="\n").write(xml)

# ตรวจทับกัน
geo = {t["id"]: (t["x"], t["y"], t["w"], t["h"]) for t in tables}
geo.update({b["id"]: (b["x"], b["y"], b["w"], b["h"]) for b in boxes})
geo.update({n["id"]: (n["x"], n["y"], n["w"], n["h"]) for n in notes})
inner = {"m_listen", "m_read", "m_speak", "m_write", "modal_note"}
bad = []
ids = list(geo)
for i in range(len(ids)):
    for j in range(i + 1, len(ids)):
        a, b = ids[i], ids[j]
        if (a == "modal" and b in inner) or (b == "modal" and a in inner): continue
        ax, ay, aw, ah = geo[a]; bx, by, bw, bh = geo[b]
        if ax < bx + bw and bx < ax + aw and ay < by + bh and by < ay + ah: bad.append((a, b))
# ลูกศรทะลุกล่องไหม (เช็กจุดกลางทุก segment)
def hits(p, q):
    out = []
    for k, (x, y, w, h) in geo.items():
        if k in inner or k == "modal": continue
        for tt in (0.25, 0.5, 0.75):
            px, py = p[0] + (q[0] - p[0]) * tt, p[1] + (q[1] - p[1]) * tt
            if x < px < x + w and y < py < y + h: out.append(k); break
    return out
cross = [(e["id"], hits(e["pts"][i], e["pts"][i + 1])) for e in edges for i in range(len(e["pts"]) - 1)]
cross = [(a, b) for a, b in cross if b]
print("กล่อง", len(geo), "· ลูกศร", len(edges), "· ทับกัน:", bad or "ไม่มี", "· ลูกศรทะลุกล่อง:", cross or "ไม่มี")

# ================= PNG (PIL) =================
S = 2
W, H = 1540, 860
im = Image.new("RGB", (W * S, H * S), "white"); d = ImageDraw.Draw(im)
FONTS = {}
def font(kind, size, bold=False):
    key = (kind, size, bold)
    if key not in FONTS:
        if kind == "cjk": path = "C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc"
        else: path = "C:/Windows/Fonts/leelawdb.ttf" if bold else "C:/Windows/Fonts/LeelawUI.ttf"
        FONTS[key] = ImageFont.truetype(path, int(size * S))
    return FONTS[key]
def kind_of(ch):
    o = ord(ch)
    if 0x0E00 <= o <= 0x0E7F or o < 0x80 or ch in "·–—“”’«»": return "th"
    return "cjk"
def runs(text):
    out, cur, k = [], "", None
    for ch in text:
        kk = kind_of(ch)
        if 0x0E30 <= ord(ch) <= 0x0E4E and k == "th": kk = "th"
        if kk != k and cur: out.append((k, cur)); cur = ""
        cur += ch; k = kk
    if cur: out.append((k, cur))
    return out
def tw(text, size, bold=False): return sum(font(k, size, bold).getlength(s) for k, s in runs(text))
def text(x, y, s, size=11, bold=False, color="black", anchor="l"):
    """x,y in diagram units; anchor l/c = left/center · y = ศูนย์กลางแนวตั้ง"""
    w = tw(s, size, bold)
    px = x * S - (w / 2 if anchor == "c" else 0); py = y * S
    for k, seg in runs(s):
        f = font(k, size, bold)
        d.text((px, py), seg, font=f, fill=color, anchor="lm")
        px += f.getlength(seg)
def fit(s, size, maxw, bold=False):
    if tw(s, size, bold) <= maxw * S: return s
    while s and tw(s + "…", size, bold) > maxw * S: s = s[:-1]
    return s + "…"
def rect(x, y, w, h, fill=None, stroke="#333333", width=1, dashed=False):
    if dashed:
        pts = [(x, y), (x + w, y), (x + w, y + h), (x, y + h), (x, y)]
        if fill: d.rectangle([x * S, y * S, (x + w) * S, (y + h) * S], fill=fill)
        for (ax, ay), (bx, by) in zip(pts, pts[1:]):
            L = max(abs(bx - ax), abs(by - ay)); n = int(L / 6)
            for i in range(0, n, 2):
                t0, t1 = i / n, min((i + 1) / n, 1)
                d.line([((ax + (bx - ax) * t0) * S, (ay + (by - ay) * t0) * S), ((ax + (bx - ax) * t1) * S, (ay + (by - ay) * t1) * S)], fill=stroke, width=width * S)
    else:
        d.rectangle([x * S, y * S, (x + w) * S, (y + h) * S], fill=fill, outline=stroke, width=width * S)

# title
text(40, 22, TITLE, 15, True); text(40, 44, SUB, 10.5, color="#444444")
for b in boxes:
    rect(b["x"], b["y"], b["w"], b["h"], fill=b["fill"], stroke=b["stroke"], dashed=b["dashed"])
    if b["id"].startswith("m_"):
        text(b["x"] + b["w"] / 2, b["y"] + 13, b["lines"][0], 12, True, anchor="c")
        text(b["x"] + b["w"] / 2, b["y"] + 29, b["lines"][1], 8.5, color="#444444", anchor="c")
        continue
    yy = b["y"] + 14
    if b["title"]: text(b["x"] + 8, yy, fit(b["title"], 11.5, b["w"] - 16, True), 11.5, True); yy += 20
    for l in b["lines"]:
        text(b["x"] + 8, yy, fit(l, 10.5, b["w"] - 16), 10.5); yy += 17
for n in notes:
    # ตัดบรรทัดอัตโนมัติ
    words_, line, yy = n["text"].split(" "), "", n["y"] + 8
    for wd in words_:
        if tw((line + " " + wd).strip(), 10) > (n["w"] - 4) * S:
            text(n["x"] + 2, yy, line, 10, color="#666666"); yy += 14; line = wd
        else: line = (line + " " + wd).strip()
    if line: text(n["x"] + 2, yy, line, 10, color="#666666")
for t in tables:
    x, y, w = t["x"], t["y"], t["w"]
    rect(x, y, w, t["h"], fill="white", stroke=t["color"][1])
    rect(x, y, w, HDR, fill=t["color"][0], stroke=t["color"][1])
    text(x + 8, y + HDR / 2, fit(t["title"], 12, w - 16, True), 12, True)
    for ri, r in enumerate([[c for c, _ in t["cols"]]] + t["rows"]):
        ry = y + HDR + ROW * ri; cx = x
        for ci, (val, (_, wd)) in enumerate(zip(r, t["cols"])):
            fill = GREY if ri == 0 else (YEL if (ri - 1) in t["hl"] else "white")
            rect(cx, ry, wd, ROW, fill=fill, stroke=t["color"][1])
            s = str(val); size = 9.5 if ri == 0 else 10.5
            text(cx + wd / 2, ry + ROW / 2, fit(s, size, wd - 6, ri == 0), size, ri == 0, anchor="c")
            cx += wd
for e in edges:
    pts = [(px * S, py * S) for px, py in e["pts"]]
    d.line(pts, fill="#333333", width=2 * S, joint="curve")
    (ax, ay), (bx, by) = pts[-2], pts[-1]
    dx, dy = bx - ax, by - ay; L = (dx * dx + dy * dy) ** 0.5; ux, uy = dx / L, dy / L
    a = 9 * S
    d.polygon([(bx, by), (bx - ux * a - uy * a * 0.5, by - uy * a + ux * a * 0.5), (bx - ux * a + uy * a * 0.5, by - uy * a - ux * a * 0.5)], fill="#333333")
    if e["label"]:
        lx, ly = e["lab_at"]; w = tw(e["label"], 10) / S + 8
        rect(lx - w / 2, ly - 8, w, 16, fill="white", stroke="white")
        text(lx, ly, e["label"], 10, anchor="c", color="#222222")
for x, y, txt in badges:
    text(x, y, txt, 15, True, color="#b85450", anchor="c")
im.save(OUT_PNG, optimize=True)
print("raqm:", features.check("raqm"), "· PNG", OUT_PNG, im.size)
