# สร้างผัง ER ทุกแบบจาก er-drawio.sql (แหล่งจริงเดียว) — รันซ้ำเมื่อ schema เปลี่ยน
#   ① ER-星航.drawio            (เปิดใน draw.io / ใส่เล่ม)
#   ② ผัง mermaid ใน DATABASE-ER.md §2 (เห็นบน GitHub/Obsidian)
#   ③ (ถอดแล้ว 18 พ.ย. 2026) ER-ฉบับย่อ-星航.drawio ผัง 7 หน้า (`--slim`) — ค้าง 23 ตาราง + หน้าที่ซ้ำกับ ④ → บอลเคาะลบ · ไม่มีโหมด --slim แล้ว
#   ④ ER-เดินตามผู้ใช้-星航.drawio (`--story`) — แผ่นเดียว 7 คอลัมน์เรียงตามที่อาจารย์ไล่ (นัดรอบ 6 · บอลเคาะ 23 ก.ย.)
#      v2 28 ก.ย.: 2 แถว (บน = ก้าวผู้ใช้ · ล่าง = สมอง BKT) + router เดินเส้นในร่อง/ราง ไม่พาดทับกล่อง — บอลสั่ง "วาดตามที่อาจารย์แนะนำ"
#      ตัดคอลัมน์ที่ไม่ใช่ PK/FK/UK ออก → กล่องเตี้ยลงมาก เส้นไม่ก่ายกัน ใช้อธิบาย/ใส่โปสเตอร์ได้
#      ไม่ได้แยกไฟล์ SQL ต่างหาก เพราะจะกลายเป็นแหล่งจริงแหล่งที่สองแล้วขัดกันเองในที่สุด
# เหตุผล: ปัญหาที่กัดทีมมาตลอดคือ "ผังกับ DDL ไม่ตรงกัน" (20 ส.ค. ไล่ตรวจเจอไม่ตรง 6 จุด)
#         ถ้าผังทุกอันสร้างจาก DDL เสมอ ปัญหานี้หมดไปโดยโครงสร้าง ไม่ต้องอาศัยความขยันไล่ตรวจ
# วิธีใช้:  python scripts/gen_er_diagrams.py
import io, re, html, sys

STORY = "--story" in sys.argv        # ผังแผ่นเดียวเรียงตามที่อาจารย์ไล่ (บอลเคาะ 23 ก.ย.) — คีย์อย่างเดียว ไฟล์แยก
if "--slim" in sys.argv:             # โหมด 7 หน้า ถอดแล้ว 18 พ.ย. 2026 (บอลเคาะลบ ER-ฉบับย่อ-星航.drawio) — กันพิมพ์ติดมือแล้วเจนทับผังเต็ม
    print("⚠️ โหมด --slim ถูกถอดแล้ว (18 พ.ย. 2026) — ผังย่อ = `--story` (ER-เดินตามผู้ใช้-星航.drawio)"); sys.exit(1)
SLIM = STORY                         # เหลือแต่หัวตาราง + คีย์ (ใช้กับ --story เท่านั้น)

SQL = "docs/08_สเปค-พัฒนา/er-drawio.sql"
OUT = ("docs/08_สเปค-พัฒนา/ER-เดินตามผู้ใช้-星航.drawio" if STORY
       else "docs/08_สเปค-พัฒนา/ER-星航.drawio")
MD  = "docs/08_สเปค-พัฒนา/DATABASE-ER.md"

LIVE = {"words", "roadmap_state"}          # ชั้น 1 = เขียว · ที่เหลือ = พิมพ์เขียว น้ำเงิน
GREEN = "fillColor=#d5e8d4;strokeColor=#82b366;"

# สีเส้นตาม "ตารางแม่" (ต้นทางของเส้น) — คำถามเวลาเส้นพันกันคือ "เส้นนี้ของใคร" = ของตารางแม่ (บอลขอ 3 ก.ย.)
# เลือกสีให้ต่างกันชัดและไม่ฉูดฉาด · ตารางแม่ที่มีเส้นออกน้อยใช้เทากลาง
EDGE_COLOR = {
    "users": "#1f6f9f",             # น้ำเงิน — ยืม id ไปมากสุด
    "skills": "#b85450",            # แดงอิฐ — แกนวิชาการ
    "sessions": "#d79b00",          # ส้ม
    "words": "#4a7d4a",             # เขียว (ตารางมีจริง)
    "items": "#9673a6",             # ม่วง
    "categories": "#0e8a8a",        # เขียวน้ำทะเล
    "exam_forms": "#a0522d",        # น้ำตาลแดง
    "sentences": "#7a7a2e",         # เขียวมะกอก
    "foundation_stages": "#c2185b", # ชมพูเข้ม
    "bkt_training_runs": "#5c6bc0", # คราม
}
EDGE_DEFAULT = "#93a3b5"

def edge_legend_cell(cid, parents, x, y, width=1400):
    """ป้ายสี: ตารางแม่ที่มีเส้นออกในหน้านี้ → สีของเส้น"""
    parts = []
    for p in parents:
        c = EDGE_COLOR.get(p, EDGE_DEFAULT)
        parts.append(f'&lt;span style=&quot;color:{c}&quot;&gt;━&lt;/span&gt; {p}')
    txt = "เส้นสี = ออกจากตารางแม่: " + " &amp;nbsp;·&amp;nbsp; ".join(parts)
    return (f'<mxCell id="{cid}" value="{txt}" style="text;html=1;align=left;fontSize=11;fontColor=#555555;whiteSpace=wrap;" '
            f'vertex="1" parent="1"><mxGeometry x="{x}" y="{y}" width="{width}" height="22" as="geometry"/></mxCell>')
BLUE  = "fillColor=#dae8fc;strokeColor=#6c8ebf;"

# ---------- อ่าน SQL ----------
raw = io.open(SQL, encoding="utf-8").read()

tables = []   # (name, [(col, type, tag, note)])
fks = []      # (child, parent, label)
for name, body in re.findall(r"CREATE TABLE (\w+)\s*\((.*?)\n\);", raw, re.S):
    nocom_body = "\n".join(re.sub(r"--.*$", "", l) for l in body.split("\n"))
    pk_multi = set()
    m = re.search(r"PRIMARY KEY \(([^)]*)\)", nocom_body)
    if m:
        pk_multi = {c.strip() for c in m.group(1).split(",")}
    cols = []
    for ln in body.split("\n"):
        note = ""
        if "--" in ln:                       # คอมเมนต์ท้ายบรรทัด → ใช้เป็นคำอธิบายคอลัมน์ในผัง mermaid
            ln, note = ln.split("--", 1)
            note = note.strip()
        ln = ln.strip().rstrip(",")
        if not ln or ln.upper().startswith(("PRIMARY KEY (", "CHECK", "CONSTRAINT", "UNIQUE (")):
            continue
        mm = re.match(r"(\w+)\s+([\w]+(?:\[\])?)", ln)   # ชนิด = โทเคนแรกเท่านั้น
        if not mm:                                        # (ไม่งั้นจะกิน "PRIMARY"/"NOT" ติดมาด้วย)
            continue
        col, typ = mm.group(1), mm.group(2)
        tag = ""
        if "PRIMARY KEY" in ln or col in pk_multi:
            tag = " PK"
        ref = re.search(r"REFERENCES (\w+)\(", ln)
        if ref:
            tag += " FK"
            fks.append((name, ref.group(1), col))
        if re.search(r"\bUNIQUE\b", ln) and " PK" not in tag:
            tag += " UK"
        cols.append((col, typ, tag, note))
    if SLIM:                                   # เหลือแต่คีย์ — ที่เหลือไปดูในฉบับเต็ม
        cols = [c for c in cols if c[2].strip()]
    tables.append((name, cols))

# ---------- ④ โหมด --story: ผังแผ่นเดียว คีย์อย่างเดียว ----------
# (โหมด ③ ผัง 7 หน้า ถอดออก 18 พ.ย. 2026 — โค้ด JOURNEY / render_page / barycenter sweep ลบไปด้วย เพราะไม่มีผังไหนใช้แล้ว)
if STORY:
    by_name = dict(tables)

    SW, CHAN, ROW_GAP, HDR2, ROW_H, TOP2, LEFT = 250, 190, 55, 28, 22, 92, 40

    # ---------- โหมด --story (v2 · 28 ก.ย. บอลสั่ง "วาดตามที่อาจารย์แนะนำ") ----------
    # อาจารย์: รอบ 5 "เหลือแต่หัวกับคีย์ · เส้นพันกันอ่านไม่รู้เรื่อง · เล่าตามที่ผู้ใช้ใช้จริง" · รอบ 6 "แผ่นเดียว ไล่ ①→⑥"
    # แถวบน  = เส้นทางผู้ใช้ ①→⑤ + หลังบ้าน (คอลัมน์ = ก้าว · ④ แยกฝั่งคำ | ฝั่งประโยค)
    # แถวล่าง = ⑥ สมอง (BKT) วางใต้ ②–④ → เส้นแดงจาก skills ชี้ขึ้นสั้น ๆ แทนที่จะลากย้อนข้ามทั้งแผ่น
    # router: ทุกเส้นเดินในร่องว่างระหว่างคอลัมน์ + ราง 2 เส้น (บนสุด / ระหว่างแถว) เลือกทางที่ "ชนกล่อง 0" ก่อน แล้วค่อยสั้นสุด
    #         เส้นไกลอยู่รางบน/ร่องด้านนอก เส้นใกล้อยู่ด้านใน → ลดจุดตัด
    STORY_LAYOUT = [
        # (หัวโซน, คำบรรยาย, แถว, [(ดัชนีคอลัมน์, [ตาราง…]), …])
        ("① สมัครใช้งาน", "โปรไฟล์ 1 แถว · id ถูกยืมไปทุกตารางฝั่งประวัติ (เส้นน้ำเงินวิ่งบนราง)", "A",
         [(0, ["users"])]),
        ("② ทำ pre-test", "ชุดข้อสอบ → สารบัญ → ข้อ → Q-matrix · ผลการทำเก็บที่ sessions (ใคร ชุดไหน pre/post คะแนน)", "A",
         [(1, ["exam_forms", "form_items", "items", "item_skills", "sessions"])]),
        ("③ ตอบทีละข้อ", "1 คำตอบ = 1 แถว ชี้รอบ/ข้อ/คำ/ประโยค/ทักษะ · ห้ามแก้ห้ามลบ", "A",
         [(2, ["attempts"])]),
        ("④ เรียนตามหมวด", "ฝั่งคำ: หมวด → คน×หมวด → คำ → นัดทวน  |  ฝั่งประโยค: ประโยค → ส่วนผสม → คน×ประโยค", "A",
         [(3, ["categories", "category_progress", "words", "review_states"]),
          (4, ["sentences", "sentence_words", "sentence_states"])]),
        ("⑤ ปูพื้นฐานเสียง", "หลักสูตร → บทเรียน / คู่เสียง · สมุดพกรายคน", "A",
         [(5, ["foundation_stages", "foundation_lessons", "minimal_pairs", "foundation_progress"])]),
        ("หลังบ้าน", "เครื่องมือทีม (นอกเรื่องเล่า)", "A",
         [(6, ["approval_transfers", "roadmap_state"])]),
        ("⑥ สมอง (BKT)", "เทรน → ค่ากลางประจำหน่วยความรู้ (skills = KC ~23 ตัว ไม่ใช่ ฟัง/พูด/อ่าน/เขียน) → ความแม่นรายคน · จุดผิดคนไทย", "B",
         [(1, ["bkt_training_runs"]), (2, ["skills"]), (3, ["thai_l1_catalog", "mastery_snapshots"])]),
    ]
    STORY_ZONES = [(h, c, [n for _, ns in cols for n in ns]) for h, c, _r, cols in STORY_LAYOUT]
    _story_names = {n for _, _, ns in STORY_ZONES for n in ns}
    _missing = {n for n, _ in tables} - _story_names
    if STORY and _missing:
        print("⚠️ STORY ยังไม่ครอบตาราง:", _missing); sys.exit(1)

    def render_story_page(title, layout, pid):
        LEFT_S, TOP_A, BUS_TOP, BUS_GAP = 150, 214, 164, 130
        colx = lambda i: LEFT_S + i * (SW + CHAN)
        chx = lambda k: colx(k) - CHAN / 2               # กึ่งกลางร่องซ้ายของคอลัมน์ k
        names = [n for _, _, _, cols in layout for _, ns in cols for n in ns]
        links = [(c, p, col) for c, p, col in fks if c in names and p in names and c != p]
        geo, cells_ = {}, []

        def place(row, y0):
            maxy = y0
            for _h, _c, r, cols in layout:
                if r != row:
                    continue
                for ci, ns in cols:
                    y = y0
                    for name in ns:
                        h = HDR2 + ROW_H * len(by_name[name])
                        geo[name] = [colx(ci), y, SW, h, ci, row]
                        y += h + ROW_GAP
                    maxy = max(maxy, y - ROW_GAP)
            return maxy

        bottom_a = place("A", TOP_A)
        TOP_B = bottom_a + BUS_GAP
        BUS_MID = bottom_a + 22
        bottom_b = place("B", TOP_B)

        for name, (x, y, w, h, ci, row) in geo.items():
            style = ("swimlane;fontStyle=1;align=center;childLayout=stackLayout;horizontal=1;"
                     "startSize=28;horizontalStack=0;resizeParent=1;resizeParentMax=0;"
                     "collapsible=0;rounded=1;arcSize=4;" + (GREEN if name in LIVE else BLUE))
            cells_.append(f'<mxCell id="{pid}_{name}" value="{name}" style="{style}" vertex="1" parent="1">'
                          f'<mxGeometry x="{int(x)}" y="{int(y)}" width="{SW}" height="{h}" as="geometry"/></mxCell>')
            for ri, (col_, typ, tag, _n) in enumerate(by_name[name]):
                label = html.escape(f"{col_} : {typ}{tag}")
                cells_.append(
                    f'<mxCell id="{pid}_{name}_r{ri}" value="{label}" style="text;strokeColor=none;'
                    f'fillColor=none;align=left;verticalAlign=middle;spacingLeft=6;spacingRight=4;'
                    f'overflow=hidden;whiteSpace=wrap;html=1;fontSize=11;{"fontStyle=1;" if tag else ""}" '
                    f'vertex="1" parent="{pid}_{name}">'
                    f'<mxGeometry y="{HDR2 + ROW_H*ri}" width="{SW}" height="{ROW_H}" as="geometry"/></mxCell>')
        for zi, (hdr, cap, row, cols) in enumerate(layout):
            c0, c1 = cols[0][0], cols[-1][0]
            x, wz = colx(c0), (c1 - c0 + 1) * (SW + CHAN) - CHAN
            y = (TOP_A - 140) if row == "A" else (TOP_B - 74)
            cells_.append(
                f'<mxCell id="{pid}_z{zi}" value="&lt;b&gt;{html.escape(hdr)}&lt;/b&gt;&lt;br&gt;'
                f'&lt;span style=&quot;font-size:11px;color:#555&quot;&gt;{html.escape(cap)}&lt;/span&gt;" '
                'style="text;html=1;align=left;verticalAlign=top;fontSize=14;fontColor=#1f6f9f;whiteSpace=wrap;" '
                f'vertex="1" parent="1"><mxGeometry x="{int(x)}" y="{int(y)}" width="{int(wz)}" height="62" as="geometry"/></mxCell>')

        boxes = {n: g[:4] for n, g in geo.items()}

        def hits(a, b, skip):
            xa, xb = sorted((a[0], b[0])); ya, yb = sorted((a[1], b[1]))
            return sum(1 for nm, (bx, by, bw, bh) in boxes.items()
                       if nm not in skip and xa < bx + bw - 1 and xb > bx + 1 and ya < by + bh - 1 and yb > by + 1)

        uniq, seen = [], set()
        for child, parent, _c in links:
            if (child, parent) not in seen:
                seen.add((child, parent)); uniq.append((parent, child))
        side, reach = {}, {}
        for P, C in uniq:
            pc, pr, cc, cr = geo[P][4], geo[P][5], geo[C][4], geo[C][5]
            reach[(P, C)] = abs(cc - pc) + (0.5 if pr != cr else 0)
            if pc == cc and pr != cr:
                side[(P, C)] = ("top", "bottom") if geo[P][1] > geo[C][1] else ("bottom", "top")
            elif pc == cc:
                side[(P, C)] = ("left", "left")
            elif cc > pc:
                side[(P, C)] = ("right", "left")
            else:
                side[(P, C)] = ("left", "right")
        port, groups = {}, {}
        for P, C in uniq:
            es, en = side[(P, C)]
            groups.setdefault((P, es), []).append(((P, C), geo[C][1] + geo[C][4] * 2000))
            groups.setdefault((C, en), []).append(((P, C), geo[P][1] + geo[P][4] * 2000))
        for (box, sd), lst in groups.items():
            lst.sort(key=lambda t: t[1])
            n = len(lst)
            for i, (key, _y) in enumerate(lst):
                port[(key, box)] = 0.5 if n == 1 else 0.22 + 0.56 * i / (n - 1)

        def anchor(box, sd, f):
            x, y, w, h = boxes[box]
            if sd == "left":   return (x, y + f * h, 0.0, f)
            if sd == "right":  return (x + w, y + f * h, 1.0, f)
            if sd == "top":    return (x + f * w, y, f, 0.0)
            return (x + f * w, y + h, f, 1.0)

        # ผ่าน 3: เลือกทางเดินของแต่ละเส้น (ยังไม่เหลื่อมร่อง)
        routed, box_hits = [], 0
        for P, C in uniq:
            es, en = side[(P, C)]
            ax, ay, exX, exY = anchor(P, es, port[((P, C), P)])
            bx_, by_, enX, enY = anchor(C, en, port[((P, C), C)])
            pc, cc = geo[P][4], geo[C][4]
            cands = []
            if es in ("top", "bottom"):
                bx_, enX = ax, (ax - boxes[C][0]) / boxes[C][2]
                cands = [("V", [(ax, ay), (bx_, by_)], [])]
            elif es == "left" and en == "left":                # คอลัมน์เดียวกัน → วนร่องแคบชิดคอลัมน์ (แยกจากร่องทางผ่าน)
                x = colx(pc) - 16
                cands.append(("L", [(ax, ay), (x, ay), (x, by_), (bx_, by_)], [("loop", pc, (1, 2))]))
            else:
                right = cc > pc
                chP = pc + 1 if right else pc
                chC = cc if right else cc + 1
                cands.append(("A", [(ax, ay), (chx(chP), ay), (chx(chP), by_), (bx_, by_)], [("ch", chP, (1, 2))]))
                cands.append(("B", [(ax, ay), (chx(chC), ay), (chx(chC), by_), (bx_, by_)], [("ch", chC, (1, 2))]))
                for bus_name, bus_y in (("top", BUS_TOP), ("mid", BUS_MID)):
                    cands.append((bus_name[0].upper(),
                                  [(ax, ay), (chx(chP), ay), (chx(chP), bus_y), (chx(chC), bus_y), (chx(chC), by_), (bx_, by_)],
                                  [("ch", chP, (1, 2)), ("bus", bus_name, (2, 3)), ("ch", chC, (3, 4))]))
            best = None
            for kind, pts, uses in cands:
                coll = sum(hits(pts[j], pts[j + 1], {P, C}) for j in range(len(pts) - 1))
                length = sum(abs(pts[j][0] - pts[j + 1][0]) + abs(pts[j][1] - pts[j + 1][1]) for j in range(len(pts) - 1))
                score = (coll, 0 if kind in ("A", "B", "V", "L") else 1, length)
                if best is None or score < best[0]:
                    best = (score, kind, pts, uses)
            score, kind, pts, uses = best
            box_hits += score[0]
            routed.append({"key": (P, C), "kind": kind, "pts": [list(p) for p in pts], "uses": uses,
                           "ex": (exX, exY), "en": (enX, enY), "right": cc >= pc})

        # ผ่าน 4: จัดร่อง/ราง — เริ่มจาก "เส้นไกลอยู่นอก/บน" แล้วสลับลำดับข้างเคียงไปเรื่อย ๆ จนจุดตัดรวมไม่ลดอีก
        base = {ri_: [list(p) for p in r["pts"]] for ri_, r in enumerate(routed)}
        usage = {}
        for ri_, r in enumerate(routed):
            for u in r["uses"]:
                usage.setdefault((u[0], u[1]), []).append((ri_, u[2]))
        for (ukind, ukey), lst in usage.items():
            lst.sort(key=lambda t: -reach[routed[t[0]]["key"]])

        def cross(s, t):
            (x1, y1), (x2, y2) = s; (x3, y3), (x4, y4) = t
            v1, v2 = abs(x1 - x2) < 0.5, abs(x3 - x4) < 0.5
            if v1 == v2:
                return False
            if v2:
                (x1, y1), (x2, y2), (x3, y3), (x4, y4) = (x3, y3), (x4, y4), (x1, y1), (x2, y2)
            return min(x3, x4) < x1 < max(x3, x4) and min(y1, y2) < y3 < max(y1, y2)

        def apply_offsets():
            for ri_, r in enumerate(routed):
                r["pts"] = [list(p) for p in base[ri_]]
            for (ukind, ukey), lst in usage.items():
                n = len(lst)
                if ukind == "bus":
                    step = 7
                elif ukind == "loop":
                    step = 9
                else:
                    step = min(11, 80 / max(n - 1, 1))
                for li, (ri_, (i1, i2)) in enumerate(lst):
                    pts = routed[ri_]["pts"]
                    if ukind == "bus":
                        off = step * (li - (n - 1) / 2); pts[i1][1] += off; pts[i2][1] += off
                    elif ukind == "loop":
                        off = -step * li; pts[i1][0] += off; pts[i2][0] += off
                    else:
                        off = step * (li - (n - 1) / 2); pts[i1][0] += off; pts[i2][0] += off

        def total_crossings():
            segs = [[(tuple(r["pts"][j]), tuple(r["pts"][j + 1])) for j in range(len(r["pts"]) - 1)] for r in routed]
            n = 0
            for a in range(len(segs)):
                for b in range(a + 1, len(segs)):
                    for s in segs[a]:
                        for t in segs[b]:
                            if cross(s, t):
                                n += 1
            return n

        apply_offsets(); best_x = total_crossings()
        for _sweep in range(6):
            improved = False
            for key_, lst in usage.items():
                for i_ in range(len(lst) - 1):
                    lst[i_], lst[i_ + 1] = lst[i_ + 1], lst[i_]
                    apply_offsets(); x_ = total_crossings()
                    if x_ < best_x:
                        best_x, improved = x_, True
                    else:
                        lst[i_], lst[i_ + 1] = lst[i_ + 1], lst[i_]
            if not improved:
                break
        apply_offsets()

        edges_, all_segs, box_hits = [], [], 0          # นับใหม่หลังเหลื่อมร่อง (ต้องยังเป็น 0)
        for i, r in enumerate(routed):
            P, C = r["key"]; pts = [tuple(p) for p in r["pts"]]
            box_hits += sum(hits(pts[j], pts[j + 1], {P, C}) for j in range(len(pts) - 1))
            all_segs.append(pts)
            exX, exY = r["ex"]; enX, enY = r["en"]
            style = ("edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;jumpStyle=arc;jumpSize=9;"
                     f"exitX={exX:.3f};exitY={exY:.3f};exitDx=0;exitDy=0;entryX={enX:.3f};entryY={enY:.3f};entryDx=0;entryDy=0;"
                     f"startArrow=ERone;startFill=0;endArrow=ERmany;endFill=0;"
                     f"strokeColor={EDGE_COLOR.get(P, EDGE_DEFAULT)};strokeWidth=1.5;")
            pts_xml = "".join(f'<mxPoint x="{int(round(x))}" y="{int(round(y))}"/>' for x, y in pts[1:-1])
            edges_.append(
                f'<mxCell id="{pid}_e{i}" style="{style}" edge="1" parent="1" '
                f'source="{pid}_{P}" target="{pid}_{C}">'
                f'<mxGeometry relative="1" as="geometry"><Array as="points">{pts_xml}</Array></mxGeometry></mxCell>')

        def cross(s, t):
            (x1, y1), (x2, y2) = s; (x3, y3), (x4, y4) = t
            v1, v2 = abs(x1 - x2) < 0.5, abs(x3 - x4) < 0.5
            if v1 == v2:
                return False
            if v2:
                (x1, y1), (x2, y2), (x3, y3), (x4, y4) = (x3, y3), (x4, y4), (x1, y1), (x2, y2)
            return min(x3, x4) < x1 < max(x3, x4) and min(y1, y2) < y3 < max(y1, y2)
        crossings = 0
        for a in range(len(all_segs)):
            for b in range(a + 1, len(all_segs)):
                for j in range(len(all_segs[a]) - 1):
                    for k in range(len(all_segs[b]) - 1):
                        if cross((all_segs[a][j], all_segs[a][j + 1]), (all_segs[b][k], all_segs[b][k + 1])):
                            crossings += 1

        head = (f'<mxCell id="{pid}_ttl" value="&lt;b&gt;{html.escape(title)}&lt;/b&gt;&amp;nbsp; '
                f'&lt;span style=&quot;color:#777&quot;&gt;{len(names)} ตาราง · {len(edges_)} เส้น · '
                f'เส้นพาดทับกล่อง {box_hits} · จุดตัด {crossings} · เรียงตามที่อาจารย์ไล่ (นัดรอบ 6) · '
                f'สีเส้น = ตารางแม่ · เขียว = มีจริงใน Supabase แล้ว&lt;/span&gt;" '
                'style="text;html=1;align=left;fontSize=15;fontColor=#333333;" vertex="1" parent="1">'
                f'<mxGeometry x="{LEFT_S}" y="18" width="1700" height="30" as="geometry"/></mxCell>')
        parents_here = sorted({p for _c, p, _ in links}, key=lambda p: (p not in EDGE_COLOR, p))
        cells_.append(edge_legend_cell(f"{pid}_lg", parents_here, LEFT_S, 46, 1700))
        ncol = 1 + max(ci for _, _, _, cols in layout for ci, _ in cols)
        w = LEFT_S + ncol * (SW + CHAN) + 40
        body = ('      <root>\n        <mxCell id="0"/>\n        <mxCell id="1" parent="0"/>\n        '
                + head + "\n        " + "\n        ".join(cells_)
                + ("\n        " + "\n        ".join(edges_) if edges_ else "") + "\n      </root>\n")
        page = (f'  <diagram name="{html.escape(title)}" id="{pid}">\n'
                f'    <mxGraphModel dx="1018" dy="686" grid="1" gridSize="10" guides="1" tooltips="1" '
                f'connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="{int(w)}" '
                f'pageHeight="{int(bottom_b)+40}" math="0" shadow="0">\n' + body
                + "    </mxGraphModel>\n  </diagram>\n")
        return page, len(names), len(edges_), box_hits, crossings

    p, nt, ne, bh, cr = render_story_page("ER — เดินตามผู้ใช้ (แผ่นเดียว)", STORY_LAYOUT, "story")
    io.open(OUT, "w", encoding="utf-8").write('<mxfile host="app.diagrams.net">\n' + p + "</mxfile>\n")
    print(f"✅ เขียน {OUT}\n   1 หน้า · {nt} ตาราง · {ne} เส้น · 2 แถว (บน = ก้าวผู้ใช้ · ล่าง = สมอง) · เส้นพาดทับกล่อง {bh} · จุดตัด {cr}")
    sys.exit(0)

# ---------- จัดวางเป็นโซน ----------
COLUMNS = [
    ("โซน 1 · เนื้อหา (คำ/หมวด)",       ["categories", "words", "sentence_words"]),
    ("โซน 2 · เนื้อหา (ประโยค/โมดูล 0)", ["sentences", "foundation_stages", "foundation_lessons",
                                          "minimal_pairs"]),
    ("โซน 3 · ทักษะ + โมเดล",            ["skills", "bkt_training_runs", "thai_l1_catalog"]),
    ("โซน 4 · คลังข้อสอบ",               ["exam_forms", "form_items", "items", "item_skills"]),
    ("โซน 5 · ผู้เรียน + การตอบ",        ["users", "sessions", "attempts"]),
    ("โซน 6 · ผลและระบบ",                ["review_states", "sentence_states", "category_progress",
                                          "mastery_snapshots", "foundation_progress",
                                          "approval_transfers", "roadmap_state"]),
]
placed = {t for _, ts in COLUMNS for t in ts}
missing = {n for n, _ in tables} - placed
if missing:
    print("⚠️ ตารางที่ยังไม่ได้จัดโซน:", missing); sys.exit(1)

W, GAP_X, GAP_Y, TOP, HDR = 270, 320, 45, 110, 28
by_name = dict(tables)

cells, edges = [], []
max_y = 0
for ci, (zone, names) in enumerate(COLUMNS):
    x = 40 + ci * GAP_X
    cells.append(
        f'<mxCell id="z{ci}" value="{html.escape(zone)}" style="text;html=1;align=center;fontSize=13;'
        f'fontStyle=1;fontColor=#555555;" vertex="1" parent="1">'
        f'<mxGeometry x="{x}" y="60" width="{W}" height="30" as="geometry"/></mxCell>'
    )
    y = TOP
    for name in names:
        cols = by_name[name]
        h = HDR + 22 * len(cols)
        style = "swimlane;fontStyle=1;align=center;childLayout=stackLayout;horizontal=1;startSize=28;" \
                "horizontalStack=0;resizeParent=1;resizeParentMax=0;collapsible=0;rounded=1;arcSize=4;" \
                + (GREEN if name in LIVE else BLUE)
        cells.append(
            f'<mxCell id="t_{name}" value="{name}" style="{style}" vertex="1" parent="1">'
            f'<mxGeometry x="{x}" y="{y}" width="{W}" height="{h}" as="geometry"/></mxCell>'
        )
        for ri, (col, typ, tag, _note) in enumerate(cols):
            label = html.escape(f"{col} : {typ}{tag}")
            bold = "fontStyle=1;" if tag else ""
            cells.append(
                f'<mxCell id="t_{name}_r{ri}" value="{label}" style="text;strokeColor=none;fillColor=none;'
                f'align=left;verticalAlign=middle;spacingLeft=6;spacingRight=4;overflow=hidden;'
                f'portConstraint=eastwest;whiteSpace=wrap;html=1;fontSize=11;{bold}" vertex="1" parent="t_{name}">'
                f'<mxGeometry y="{HDR + 22*ri}" width="{W}" height="22" as="geometry"/></mxCell>'
            )
        y += h + GAP_Y
        max_y = max(max_y, y)

seen = set()
for i, (child, parent, _c) in enumerate(fks):
    if (child, parent) in seen:      # FK ซ้ำคู่เดิม (เช่น approval_transfers → users 2 เส้น) วาดเส้นเดียว
        continue
    seen.add((child, parent))
    edges.append(
        f'<mxCell id="e{i}" style="edgeStyle=entityRelationEdgeStyle;rounded=0;html=1;'
        f'startArrow=ERone;startFill=0;endArrow=ERmany;endFill=0;strokeColor={EDGE_COLOR.get(parent, EDGE_DEFAULT)};strokeWidth=1.5;" '
        f'edge="1" parent="1" source="t_{parent}" target="t_{child}"><mxGeometry relative="1" as="geometry"/></mxCell>'
    )

legend = (
    '<mxCell id="legend" value="&lt;b&gt;ER — 星航&lt;/b&gt;&amp;nbsp; '
    '&lt;span style=&quot;color:#82b366&quot;&gt;■&lt;/span&gt; เขียว = มีจริงใน Supabase วันนี้ &amp;nbsp; '
    '&lt;span style=&quot;color:#6c8ebf&quot;&gt;■&lt;/span&gt; น้ำเงิน = พิมพ์เขียว (m7-1 เป็นต้นไป) &amp;nbsp;·&amp;nbsp; '
    'สร้างอัตโนมัติจาก er-drawio.sql — แก้ schema ที่ไฟล์ SQL แล้ว generate ใหม่" '
    'style="text;html=1;align=left;fontSize=14;fontColor=#333333;" vertex="1" parent="1">'
    '<mxGeometry x="40" y="16" width="1700" height="30" as="geometry"/></mxCell>'
)

full_parents = sorted({p for _c, p, _ in fks}, key=lambda p: (p not in EDGE_COLOR, p))
legend += "\n        " + edge_legend_cell("legend_edges", full_parents, 40, 46, 1700)

xml = (
    '<mxfile host="app.diagrams.net">\n'
    '  <diagram name="ER-星航" id="er-xinghang">\n'
    f'    <mxGraphModel dx="1018" dy="686" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" '
    f'arrows="1" fold="1" page="1" pageScale="1" pageWidth="{40 + len(COLUMNS)*GAP_X + 60}" '
    f'pageHeight="{int(max_y) + 60}" math="0" shadow="0">\n'
    '      <root>\n        <mxCell id="0"/>\n        <mxCell id="1" parent="0"/>\n        '
    + legend + "\n        "
    + "\n        ".join(cells) + "\n        "
    + "\n        ".join(edges)
    + "\n      </root>\n    </mxGraphModel>\n  </diagram>\n</mxfile>\n"
)

io.open(OUT, "w", encoding="utf-8").write(xml)
print(f"✅ เขียน {OUT}")
print(f"   ตาราง {len(tables)} · เส้นความสัมพันธ์ {len(edges)} · แถวคอลัมน์ {sum(len(c) for _,c in tables)}")
print(f"   หน้ากระดาษ {40 + len(COLUMNS)*GAP_X + 60} x {int(max_y)+60}")

# ---------- ② ผัง mermaid ใน DATABASE-ER.md §2 ----------
LAYER1 = {"words", "roadmap_state"}      # ผังชั้น 1 เขียนมือไว้แล้ว — สคริปต์นี้แตะเฉพาะผังชั้น 2

def mm_type(t):
    return t.replace("[]", "_arr").replace(" ", "_")

def mm_note(n, limit=64):
    n = re.sub(r'["\n]', "", n).strip()
    n = re.sub(r"\s+", " ", n)
    if len(n) <= limit:
        return n
    cut = n[:limit]
    sp = cut.rfind(" ")                    # ตัดที่ช่องว่าง ไม่ตัดกลางคำ
    return (cut[:sp] if sp > limit * 0.6 else cut).rstrip(" ·-—") + "…"

lines = ["erDiagram"]
pair_seen = set()
for child, parent, colname in fks:
    if (parent, child) in pair_seen:
        continue
    pair_seen.add((parent, child))
    lines.append(f"    {parent.upper()} ||--o{{ {child.upper()} : {colname}")
for name, cols in tables:
    if name in LAYER1 and name != "words":   # words ต้องมีกล่องในผังชั้น 2 ด้วย (มีเส้นชี้เข้า)
        continue
    lines.append(f"    {name.upper()} {{")
    for col, typ, tag, note in cols:
        tag = tag.strip()
        note = mm_note(note)
        parts = [mm_type(typ), col] + ([tag] if tag else []) + ([f'"{note}"'] if note else [])
        lines.append("        " + " ".join(parts))
    lines.append("    }")
mermaid = "```mermaid\n" + "\n".join(lines) + "\n```"

md = io.open(MD, encoding="utf-8").read()
blocks = list(re.finditer(r"```mermaid.*?```", md, re.S))
if len(blocks) < 2:
    print("⚠️ ไม่พบผัง mermaid ชั้น 2 ใน DATABASE-ER.md — ข้ามการอัปเดต"); sys.exit(1)
b = blocks[1]
io.open(MD, "w", encoding="utf-8").write(md[:b.start()] + mermaid + md[b.end():])
print(f"✅ อัปเดตผัง mermaid ใน {MD}")
print(f"   กล่อง {len(lines and [l for l in lines if l.endswith(' {')])} · เส้น {len(pair_seen)}")
