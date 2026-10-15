# -*- coding: utf-8 -*-
"""วาดรูปที่ 1 (สถาปัตยกรรม) และรูปที่ 3 (ขั้นตอนตรวจคำตอบ) ของ Full paper CSTI-MJU ครั้งที่ 8

วิธีใช้ (รันจากรากโปรเจกต์):  python scripts/gen_paper_figures.py
เอาต์พุต: docs/01_เอกสารโครงงาน/fullpaper-รูป/รูป1-สถาปัตยกรรม.{drawio,png} และ รูป3-ตรวจคำตอบ.{drawio,png}
  · .drawio = แก้ต่อได้ใน draw.io · .png = ใส่ลงบทความ (build_fullpaper_docx.py ดึงไปเอง)
  · ถ้าแก้ .drawio เองใน draw.io ให้ export PNG ทับไฟล์เดิม และอย่ารันสคริปต์นี้ซ้ำ (สคริปต์จะเขียนทับทั้ง .drawio และ .png)
  · PNG เรนเดอร์ด้วย Microsoft Edge แบบ headless เพื่อให้สระ/วรรณยุกต์ไทยวางถูกที่ (PIL บนเครื่องนี้ไม่มี raqm)
เนื้อหาในรูปต้องตรงกับข้อความหัวข้อ 2.1 และ 2.5 ในร่าง · เส้นทึบ = ทำงานแล้ว · เส้นประ = ส่วนที่ออกแบบไว้
"""
import html, io, os, shutil, subprocess, sys, tempfile, time
import xml.etree.ElementTree as ET

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO, "docs", "01_เอกสารโครงงาน", "fullpaper-รูป")
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
FONT = "Leelawadee UI"
SCALE = 3   # ความละเอียด PNG = 3 เท่าของขนาดผัง
FS = 1.15   # ขยายตัวอักษร: รูปกว้าง 1000 px ถูกย่อเหลือ ~16.9 ซม. ในบทความ → ตัวเล็กสุด ~7 pt

BLUE = ("#eaf1fb", "#4a6fa5"); GREEN = ("#e9f5ea", "#4f8a4f"); ORANGE = ("#fff4e3", "#c27c1a")
PURPLE = ("#f2edf9", "#7a5ca8"); PLAIN = ("#ffffff", "#555555"); DESIGN = ("#ffffff", "#8a8a8a")

def node(id, x, y, w, h, lines, color=PLAIN, dashed=False, shape="box", valign="middle"):
    """lines = [(ข้อความ, ขนาด, ตัวหนา)]"""
    return dict(id=id, x=x, y=y, w=w, h=h, lines=lines, color=color, dashed=dashed, shape=shape, valign=valign)
def edge(id, pts, label=None, dashed=False, both=False, label_at=None):
    """label = [บรรทัด…] วางบนเส้นตรงจุด label_at (พื้นขาว)"""
    return dict(id=id, pts=pts, label=label, dashed=dashed, both=both, label_at=label_at)
def T(s, size=14, bold=False): return (s, size, bold)

# ---------------- รูปที่ 1 สถาปัตยกรรม ----------------
FIG1 = dict(name="รูป1-สถาปัตยกรรม", w=1000, h=590, nodes=[
    node("student", 20, 150, 310, 225, [T("ผู้เรียน", 18, True), T("เบราว์เซอร์บนโทรศัพท์", 14)], BLUE, valign="top"),
    node("local", 42, 234, 266, 116, [T("ในเครื่องของผู้เรียน", 14, True), T("ที่พักคำตอบก่อนส่งขึ้นฐานข้อมูล", 13),
                                      T("ts-fsrs จัดตารางทบทวน", 13)], ("#ffffff", BLUE[1])),
    node("front", 640, 30, 340, 104, [T("ส่วนหน้าบ้าน", 17, True), T("Next.js · React · Tailwind CSS", 14), T("ให้บริการบน Vercel", 13)], GREEN),
    node("back", 640, 200, 340, 168, [T("ส่วนหลังบ้าน", 17, True), T("FastAPI (Python) · ให้บริการบน Render", 13)], ORANGE, valign="top"),
    node("back_design", 656, 270, 308, 82, [T("ออกแบบ: รับคำตอบ · ตรวจด้วยกฎ", 13), T("ปรับค่า BKT · จัดตารางทบทวน", 13)], DESIGN, dashed=True),
    node("db", 640, 440, 340, 112, [T("Supabase", 17, True), T("ฐานข้อมูล PostgreSQL 24 ตาราง", 14), T("ที่เก็บไฟล์เสียง", 14)], PURPLE),
    node("bkt", 20, 452, 310, 88, [T("ออกแบบ: ประมาณค่าพารามิเตอร์ BKT", 14, True), T("ด้วย pyBKT แบบออฟไลน์เป็นรอบ", 13)], DESIGN, dashed=True),
], edges=[
    edge("e_page", [(640, 82), (175, 82), (175, 150)], ["ส่งหน้าเว็บ"], label_at=(410, 82)),
    edge("e_api", [(330, 222), (640, 222)], ["เรียก API (HTTPS)"], label_at=(485, 222)),
    edge("e_direct", [(330, 330), (560, 330), (560, 478), (640, 478)],
         ["supabase-js ภายใต้สิทธิ์ระดับแถว", "อ่านคำศัพท์ หน่วยความรู้ ไฟล์เสียง"], label_at=(445, 330)),
    edge("e_sql", [(810, 368), (810, 440)], ["psycopg"], label_at=(810, 404)),
    edge("e_bkt", [(640, 516), (330, 516)], ["ข้อมูลการตอบ ⇄ พารามิเตอร์"], dashed=True, both=True, label_at=(485, 516)),
], legend=(20, 572))

# ---------------- รูปที่ 3 ขั้นตอนตรวจคำตอบ ----------------
FIG3 = dict(name="รูป3-ตรวจคำตอบ", w=1000, h=520, nodes=[
    node("answer", 15, 40, 135, 64, [T("ผู้เรียนตอบข้อ", 15, True)], BLUE, shape="round"),
    node("check", 185, 40, 165, 64, [T("เทียบคำตอบกับเฉลย", 14), T("ด้วยกฎ", 14)]),
    node("ok", 380, 27, 120, 90, [T("ตอบถูก?", 14, True)], shape="diamond"),
    node("log", 600, 28, 240, 88, [T("บันทึกคำตอบ 1 แถว", 15, True), T("รูปแบบเดียวกับตารางบันทึกคำตอบ", 12)], GREEN),
    node("bkt", 870, 32, 120, 80, [T("ออกแบบ:", 12, True), T("ส่งขึ้นฐานข้อมูล", 12), T("ปรับค่า BKT", 12)], DESIGN, dashed=True),
    node("which", 365, 170, 150, 90, [T("แบบฝึกใด", 14, True)], shape="diamond"),
    node("ear", 150, 290, 240, 82, [T("แบบฝึกแยกเสียง", 14, True), T("เทียบพินอินของคำเป้าหมาย", 13), T("กับคำที่ผู้เรียนเลือก", 13)], ORANGE),
    node("order", 470, 290, 220, 82, [T("แบบฝึกเรียงประโยค", 14, True), T("ใช้หน่วยความรู้ที่ผูกไว้", 13), T("กับประโยคนั้น", 13)], ORANGE),
    node("kc", 150, 410, 540, 92, [T("จัดเข้าหน่วยความรู้ข้อผิดเฉพาะผู้เรียนชาวไทย", 14, True),
                                   T("เช่น TL-TONE-T2AS3 · TL-RETRO-FLAT-MERGE", 13),
                                   T("(ถ้าไม่ตรงหน่วยข้อผิดใด บันทึกเป็นหน่วยความรู้ระดับทักษะ)", 12)], PURPLE),
    node("explain", 730, 410, 180, 92, [T("แสดงคำอธิบาย", 14, True), T("ภาษาไทย", 14, True)], BLUE),
], edges=[
    edge("e1", [(150, 72), (185, 72)]),
    edge("e2", [(350, 72), (380, 72)]),
    edge("e_ok", [(500, 72), (600, 72)], ["ถูก"], label_at=(550, 72)),
    edge("e_bkt", [(840, 72), (870, 72)], dashed=True),
    edge("e_wrong", [(440, 117), (440, 170)], ["ผิด"], label_at=(440, 143)),
    edge("e_ear", [(365, 215), (270, 215), (270, 290)]),
    edge("e_order", [(515, 215), (580, 215), (580, 290)]),
    edge("e_ear_kc", [(270, 372), (270, 410)]),
    edge("e_order_kc", [(580, 372), (580, 410)]),
    edge("e_kc_ex", [(690, 456), (730, 456)]),
    edge("e_ex_log", [(820, 410), (820, 116)]),
], legend=None)

LEGEND = [("ส่วนที่ทำงานแล้ว", False), ("ส่วนที่ออกแบบไว้", True)]

# ---------------- HTML (สำหรับเรนเดอร์ PNG) ----------------
def esc(s): return html.escape(str(s), quote=True)
def to_html(fig):
    W, H = fig["w"], fig["h"]
    parts = [f'<!doctype html><html><head><meta charset="utf-8"><style>'
             f'html,body{{margin:0;padding:0;background:#fff}}#c{{position:relative;width:{W}px;height:{H}px;overflow:hidden;'
             f'font-family:"{FONT}",sans-serif;color:#1a1a1a}}'
             '.n{position:absolute;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;text-align:center;line-height:1.32;padding:6px 10px}'
             '.lab{position:absolute;transform:translate(-50%,-50%);background:#fff;padding:1px 7px;font-size:15px;line-height:1.3;'
             'text-align:center;white-space:nowrap;color:#222}'
             'svg{position:absolute;left:0;top:0}</style></head><body><div id="c">']
    svg_shapes = []
    for n in fig["nodes"]:
        fill, stroke = n["color"]
        txt = "".join(f'<div style="font-size:{round(s * FS)}px;font-weight:{700 if b else 400}">{esc(t)}</div>' for t, s, b in n["lines"])
        jc = "flex-start" if n["valign"] == "top" else "center"
        if n["shape"] == "diamond":
            x, y, w, h = n["x"], n["y"], n["w"], n["h"]
            svg_shapes.append(f'<polygon points="{x + w / 2},{y} {x + w},{y + h / 2} {x + w / 2},{y + h} {x},{y + h / 2}" '
                              f'fill="{fill}" stroke="{stroke}" stroke-width="2"/>')
            parts.append(f'<div class="n" style="left:{x}px;top:{y}px;width:{w}px;height:{h}px;justify-content:center;z-index:2">{txt}</div>')
            continue
        radius = n["h"] / 2 if n["shape"] == "round" else 8
        border = f'2px {"dashed" if n["dashed"] else "solid"} {stroke}'
        pad = "padding-top:10px;" if n["valign"] == "top" else ""
        parts.append(f'<div class="n" style="left:{n["x"]}px;top:{n["y"]}px;width:{n["w"]}px;height:{n["h"]}px;'
                     f'background:{fill};border:{border};border-radius:{radius}px;justify-content:{jc};{pad}z-index:1">{txt}</div>')
    arrows = []
    for e in fig["edges"]:
        pts = " ".join(f"{x},{y}" for x, y in e["pts"])
        dash = ' stroke-dasharray="7 5"' if e["dashed"] else ""
        start = ' marker-start="url(#a0)"' if e["both"] else ""
        arrows.append(f'<polyline points="{pts}" fill="none" stroke="#333" stroke-width="2"{dash} marker-end="url(#a1)"{start}/>')
        if e["label"]:
            lx, ly = e["label_at"]
            parts.append(f'<div class="lab" style="left:{lx}px;top:{ly}px;z-index:4">{"<br>".join(esc(s) for s in e["label"])}</div>')
    if fig["legend"]:
        lx, ly = fig["legend"]
        for i, (name, dashed) in enumerate(LEGEND):
            x0 = lx + i * 230
            arrows.append(f'<line x1="{x0}" y1="{ly}" x2="{x0 + 44}" y2="{ly}" stroke="#333" stroke-width="2"'
                          f'{" stroke-dasharray=\"7 5\"" if dashed else ""}/>')
            parts.append(f'<div style="position:absolute;left:{x0 + 54}px;top:{ly - 10}px;font-size:15px;line-height:20px;color:#333">{esc(name)}</div>')
    defs = ('<defs><marker id="a1" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="11" markerHeight="11" markerUnits="userSpaceOnUse" orient="auto">'
            '<path d="M0,0 L10,5 L0,10 z" fill="#333"/></marker>'
            '<marker id="a0" viewBox="0 0 10 10" refX="0" refY="5" markerWidth="11" markerHeight="11" markerUnits="userSpaceOnUse" orient="auto">'
            '<path d="M10,0 L0,5 L10,10 z" fill="#333"/></marker></defs>')
    parts.insert(1, f'<svg width="{W}" height="{H}" style="z-index:0">{"".join(svg_shapes)}</svg>')
    parts.append(f'<svg width="{W}" height="{H}" style="z-index:3">{defs}{"".join(arrows)}</svg>')
    parts.append("</div></body></html>")
    return "".join(parts)

# ---------------- draw.io ----------------
def to_drawio(fig):
    cells = []
    for n in fig["nodes"]:
        fill, stroke = n["color"]
        val = "<br>".join(f'<font style="font-size:{round(s * FS)}px">{"<b>" + esc(t) + "</b>" if b else esc(t)}</font>' for t, s, b in n["lines"])
        shape = {"diamond": "rhombus;", "round": "rounded=1;arcSize=50;", "box": "rounded=1;arcSize=8;"}[n["shape"]]
        style = (f'{shape}whiteSpace=wrap;html=1;fillColor={fill};strokeColor={stroke};strokeWidth=2;fontFamily={FONT};fontSize=14;'
                 f'verticalAlign={"top" if n["valign"] == "top" else "middle"};{"dashed=1;" if n["dashed"] else ""}')
        cells.append(f'<mxCell id="{n["id"]}" value="{esc(val)}" style="{style}" vertex="1" parent="1">'
                     f'<mxGeometry x="{n["x"]}" y="{n["y"]}" width="{n["w"]}" height="{n["h"]}" as="geometry"/></mxCell>')
    for e in fig["edges"]:
        (sx, sy), (tx, ty) = e["pts"][0], e["pts"][-1]
        mids = "".join(f'<mxPoint x="{x}" y="{y}"/>' for x, y in e["pts"][1:-1])
        style = (f'endArrow=block;endFill=1;html=1;rounded=0;strokeWidth=2;strokeColor=#333333;'
                 f'{"startArrow=block;startFill=1;" if e["both"] else ""}{"dashed=1;" if e["dashed"] else ""}')
        cells.append(f'<mxCell id="{e["id"]}" value="" style="{style}" edge="1" parent="1"><mxGeometry relative="1" as="geometry">'
                     f'<mxPoint x="{sx}" y="{sy}" as="sourcePoint"/><mxPoint x="{tx}" y="{ty}" as="targetPoint"/>'
                     f'{"<Array as=\"points\">" + mids + "</Array>" if mids else ""}</mxGeometry></mxCell>')
        if e["label"]:
            lx, ly = e["label_at"]; w = 270 if len(e["label"]) > 1 else 160; h = 20 * len(e["label"])
            cells.append(f'<mxCell id="{e["id"]}_l" value="{esc("<br>".join(esc(s) for s in e["label"]))}" '
                         f'style="text;html=1;align=center;verticalAlign=middle;fontSize=15;fontFamily={FONT};fillColor=#ffffff;strokeColor=none;" '
                         f'vertex="1" parent="1"><mxGeometry x="{lx - w / 2}" y="{ly - h / 2}" width="{w}" height="{h}" as="geometry"/></mxCell>')
    if fig["legend"]:
        lx, ly = fig["legend"]
        for i, (name, dashed) in enumerate(LEGEND):
            x0 = lx + i * 230
            cells.append(f'<mxCell id="lg{i}" value="" style="endArrow=none;html=1;strokeWidth=2;strokeColor=#333333;{"dashed=1;" if dashed else ""}" '
                         f'edge="1" parent="1"><mxGeometry relative="1" as="geometry"><mxPoint x="{x0}" y="{ly}" as="sourcePoint"/>'
                         f'<mxPoint x="{x0 + 44}" y="{ly}" as="targetPoint"/></mxGeometry></mxCell>')
            cells.append(f'<mxCell id="lg{i}_t" value="{esc(name)}" style="text;html=1;align=left;verticalAlign=middle;fontSize=15;fontFamily={FONT};" '
                         f'vertex="1" parent="1"><mxGeometry x="{x0 + 52}" y="{ly - 10}" width="160" height="20" as="geometry"/></mxCell>')
    xml = (f'<mxfile host="app.diagrams.net">\n  <diagram name="{esc(fig["name"])}" id="{esc(fig["name"])}">\n'
           f'    <mxGraphModel grid="1" gridSize="10" guides="1" connect="1" arrows="1" page="1" pageWidth="{fig["w"]}" pageHeight="{fig["h"]}">\n'
           '      <root>\n        <mxCell id="0"/>\n        <mxCell id="1" parent="0"/>\n        ' + "\n        ".join(cells) +
           '\n      </root>\n    </mxGraphModel>\n  </diagram>\n</mxfile>\n')
    ET.fromstring(xml.encode("utf-8"))   # ต้องเป็น XML ที่ถูกต้อง
    return xml

# ---------------- ตรวจผัง: กล่องทับกัน / ลูกศรทะลุกล่อง ----------------
def check(fig):
    inside_ok = {("student", "local"), ("back", "back_design")}
    ns = {n["id"]: n for n in fig["nodes"]}; bad = []
    ids = list(ns)
    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            a, b = ns[ids[i]], ns[ids[j]]
            if (a["id"], b["id"]) in inside_ok: continue
            if a["x"] < b["x"] + b["w"] and b["x"] < a["x"] + a["w"] and a["y"] < b["y"] + b["h"] and b["y"] < a["y"] + a["h"]:
                bad.append(f'ทับกัน {a["id"]}/{b["id"]}')
    for e in fig["edges"]:
        for p, q in zip(e["pts"], e["pts"][1:]):
            for t in (0.2, 0.4, 0.6, 0.8):
                px, py = p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t
                for n in fig["nodes"]:
                    if n["x"] + 1 < px < n["x"] + n["w"] - 1 and n["y"] + 1 < py < n["y"] + n["h"] - 1:
                        bad.append(f'ลูกศร {e["id"]} ทะลุ {n["id"]}')
    return sorted(set(bad))

def render_png(html_text, w, h, out_png):
    tmp = tempfile.mkdtemp(prefix="fig-")
    page = os.path.join(tmp, "fig.html")
    io.open(page, "w", encoding="utf-8").write(html_text)
    shot = os.path.join(tmp, "shot.png")   # Edge เขียนพาธภาษาไทยไม่ได้ → เขียนในโฟลเดอร์ชั่วคราวก่อนแล้วค่อยคัดลอก
    subprocess.run([EDGE, "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--user-data-dir={os.path.join(tmp, 'prof')}",
                    f"--force-device-scale-factor={SCALE}", f"--window-size={w},{h}", f"--screenshot={shot}",
                    "file:///" + page.replace("\\", "/")], check=True, capture_output=True, timeout=120)
    for _ in range(120):                  # msedge.exe คืนค่าก่อนเขียนไฟล์เสร็จ → รอจนไฟล์นิ่ง
        if os.path.exists(shot) and os.path.getsize(shot) > 0:
            size = os.path.getsize(shot); time.sleep(0.5)
            if os.path.getsize(shot) == size: break
        time.sleep(0.5)
    else:
        raise SystemExit("Edge ไม่ได้สร้าง PNG")
    shutil.copyfile(shot, out_png)

if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    os.makedirs(OUT, exist_ok=True)
    for fig in (FIG1, FIG3):
        problems = check(fig)
        io.open(os.path.join(OUT, fig["name"] + ".drawio"), "w", encoding="utf-8", newline="\n").write(to_drawio(fig))
        png = os.path.join(OUT, fig["name"] + ".png")
        render_png(to_html(fig), fig["w"], fig["h"], png)
        print(fig["name"], "· ตรวจผัง:", problems or "ไม่มีปัญหา", "· PNG", os.path.getsize(png), "bytes")
