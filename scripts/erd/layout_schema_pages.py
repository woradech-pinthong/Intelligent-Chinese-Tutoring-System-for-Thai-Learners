# จัดวางหน้าตารางของผังฐานข้อมูลใหม่ (แก้ไฟล์): ตารางเรียงเป็นชั้นซ้าย→ขวาตามการอ้างอิง · เส้นเดินเฉพาะช่องว่างระหว่างชั้น + ทางเดินด้านบน
#   · เส้นเริ่มที่แถวคีย์หลัก · ป้ายเลขติดปลายเส้น · ตรวจเรขาคณิต (ไม่ตัดกล่อง/ไม่ทับกัน) แล้วพิมพ์ผล
# ใช้: python -X utf8 scripts/erd/layout_schema_pages.py "<ไฟล์.drawio>" "ผังอีอาร์" "1 ผู้ใช้และความคืบหน้า" "2 หลักสูตรและเนื้อหา" "3 พื้นฐานเสียง" "4 ข้อสอบ" "5 การทำแบบฝึกและสอบ" "6 วัดความแม่น"
# ⚠️ ปิดแท็บ draw.io ที่ยังไม่บันทึกก่อนรัน · รันหลังเพิ่ม/ลบแถวหรือเส้นทุกครั้ง
import re, html, sys, xml.etree.ElementTree as ET
from collections import defaultdict
PATH = sys.argv[1]; PAGES = sys.argv[2:]
out = open(PATH, 'rb').read().decode('utf-8')
def txt(v):
    v = html.unescape(v or ''); v = re.sub(r'<[^>]+>', '', v); return re.sub(r'\s+', ' ', v.replace('\xa0', ' ')).strip()
def fnum(v): return str(int(v)) if float(v).is_integer() else str(round(v, 2))
def cell_tag(cid):
    m = re.search(r'<mxCell\b[^>]*\bid="' + re.escape(cid) + r'"[^>]*>', out); assert m, cid; return m
def set_attr(cid, attr, value):
    global out
    m = cell_tag(cid); tag = m.group(0)
    new = re.sub(r'\b' + attr + r'="[^"]*"', attr + '="' + value + '"', tag, count=1) if re.search(r'\b' + attr + r'="', tag) else tag[:-1] + f' {attr}="{value}">'
    out = out[:m.start()] + new + out[m.end():]
def set_style(cid, fn):
    global out
    m = re.search(r'(<mxCell\b[^>]*\bid="' + re.escape(cid) + r'"[^>]*\bstyle=")([^"]*)(")', out); assert m, cid
    out = out[:m.start(2)] + html.escape(fn(html.unescape(m.group(2))), quote=True) + out[m.end(2):]
GEOM = r'(<mxGeometry\b[^>]*?/>|<mxGeometry\b[^>]*>.*?</mxGeometry>)'
def replace_geom(cid, new_xml):
    global out
    pat = re.compile(r'(<mxCell\b[^>]*\bid="' + re.escape(cid) + r'"[^>]*>\s*)' + GEOM, re.S); m = pat.search(out); assert m, cid
    out = out[:m.start(2)] + new_xml + out[m.end(2):]
def set_xy(cid, x, y):
    global out
    pat = re.compile(r'(<mxCell\b[^>]*\bid="' + re.escape(cid) + r'"[^>]*>\s*<mxGeometry\b)([^>]*?)(\s*/?>)'); m = pat.search(out); a = m.group(2)
    a = re.sub(r'\bx="[\d.\-]+"', f'x="{fnum(x)}"', a) if re.search(r'\bx="', a) else a + f' x="{fnum(x)}"'
    a = re.sub(r'\by="[\d.\-]+"', f'y="{fnum(y)}"', a) if re.search(r'\by="', a) else a + f' y="{fnum(y)}"'
    out = out[:m.start(2)] + a + out[m.end(2):]
def layout(page):
    global out
    root = ET.fromstring(out); diag = next(d for d in root.findall('diagram') if d.get('name') == page)
    cells = diag.find('.//mxGraphModel').findall('.//mxCell'); by_id = {c.get('id'): c for c in cells}
    tables = {c.get('id'): c for c in cells if c.get('vertex') == '1' and 'swimlane' in (c.get('style') or '')}
    rows = defaultdict(list)
    for c in cells:
        if c.get('vertex') == '1' and c.get('parent') in tables:
            g = c.find('mxGeometry'); m = re.search(r'fontStyle=(\d+)', c.get('style') or '')
            rows[c.get('parent')].append((c.get('id'), float(g.get('y', 0)), float(g.get('height', 24)), txt(c.get('value')), int(m.group(1)) if m else 0))
    for t in rows: rows[t].sort(key=lambda r: r[1])
    def owner(cid):
        c = by_id.get(cid)
        while c is not None and c.get('id') not in tables: c = by_id.get(c.get('parent'))
        return c.get('id') if c is not None else None
    edges = []
    for e in cells:
        if e.get('edge') != '1': continue
        so, to = owner(e.get('source')), owner(e.get('target'))
        assert so and to and so != to, (page, e.get('id'))
        edges.append((e.get('id'), e.get('source'), e.get('target'), so, to))
    W = {t: float(tables[t].find('mxGeometry').get('width', 230)) for t in tables}
    H = {t: float(tables[t].find('mxGeometry').get('height', 100)) for t in tables}
    parents = defaultdict(set)
    for _, s, t, so, to in edges: parents[to].add(so)
    layer = {}
    def L(t, seen=()):
        if t in layer: return layer[t]
        if t in seen: return 0
        v = 0 if not parents[t] else 1 + max(L(p, seen + (t,)) for p in parents[t]); layer[t] = v; return v
    for t in tables: L(t)
    cols = defaultdict(list)
    for t, k in layer.items(): cols[k].append(t)
    K = max(cols) + 1; order = {}
    name = lambda t: re.sub(r'^\d+\.\s*', '', txt(tables[t].get('value')))
    for k in range(K):
        ts = cols[k]
        if k == 0:
            pref = ['ผู้ใช้', 'ระดับ', 'หน่วยความรู้', 'ด่านพื้นฐานเสียง', 'ประวัติการฝึกโมเดล']
            ts.sort(key=lambda t: (next((i for i, p in enumerate(pref) if p == name(t)), 99), name(t)))
        else:
            ts.sort(key=lambda t: (sum(order.get(p, 0) for p in parents[t]) / max(1, len(parents[t])), name(t)))
        for i, t in enumerate(ts): order[t] = i
    lanes = defaultdict(int); lane_of = {}
    for eid, s, t, so, to in sorted(edges, key=lambda e: (layer[e[3]], order[e[3]], layer[e[4]], order[e[4]])):
        a, b = layer[so], layer[to]
        if b == a + 1: lane_of[eid] = (a, lanes[a]); lanes[a] += 1
        else: lane_of[eid] = (a, lanes[a], b - 1, lanes[b - 1]); lanes[a] += 1; lanes[b - 1] += 1
    VGAP = 50; LANE = 12; FAN = 7
    by_src = defaultdict(list)
    for e in edges: by_src[e[3]].append(e)
    colW = {k: max(W[t] for t in cols[k]) for k in range(K)}
    lane0 = {k: 20 + FAN * max([len(by_src[t]) for t in cols[k]] + [1]) + 24 for k in range(K)}
    long_edges = [e for e in edges if layer[e[4]] - layer[e[3]] > 1]
    CORR_TOP = 84; corridor_y = {}
    for i, e in enumerate(sorted(long_edges, key=lambda e: (layer[e[3]], order[e[3]], layer[e[4]], order[e[4]]))): corridor_y[e[0]] = CORR_TOP + 10 * i
    TABLE_TOP = CORR_TOP + 10 * max(1, len(long_edges)) + 56
    colx = {}; x = 60
    for k in range(K): colx[k] = x; x += colW[k] + lane0[k] + LANE * max(2, lanes[k]) + 44
    pos = {}
    for k in range(K):
        y = TABLE_TOP
        for t in sorted(cols[k], key=lambda t: order[t]): pos[t] = (colx[k], y, W[t], H[t]); y += H[t] + VGAP
    for t, (x, y, w, h) in pos.items(): set_xy(t, x, y)
    def row_y(rid):
        t = owner(rid)
        for cid, ry, rh, lab, fs in rows[t]:
            if cid == rid: return pos[t][1] + ry + rh / 2
        raise KeyError(rid)
    def src_row(so, tgt_label):
        bold = [r for r in rows[so] if r[4] & 1] or rows[so][:1]
        best = max(bold, key=lambda r: len(r[3]) if tgt_label.startswith(r[3]) else -1)
        return best[0] if tgt_label.startswith(best[3]) else bold[0][0]
    label_of = {r[0]: r[3] for t in rows for r in rows[t]}
    gx = lambda g, i: colx[g] + colW[g] + lane0[g] + LANE * i
    # ลำดับออก: เรียงตามปลายทาง · y ของช่วงวิ่งออก ไม่ซ้ำกันในช่องว่างเดียวกัน และไม่ชนช่วงวิ่งเข้า
    entry_ys = defaultdict(set)
    for eid, s, t, so, to in edges: entry_ys[layer[to] - 1].add(round(row_y(t)))
    exit_y = {}; srow = {}
    for k in range(K):
        last = -1e9
        for so in sorted(cols[k], key=lambda t: order[t]):
            es = sorted(by_src[so], key=lambda e: (row_y(e[2]), layer[e[4]]))
            by_src[so] = es
            if not es: continue
            x0, y0, w0, h0 = pos[so]; n = len(es); step = max(6.0, min(16.0, (h0 - 40) / n)); start = max(y0 + 34, y0 + h0 / 2 - step * (n - 1) / 2) if n * step <= h0 - 20 else y0 + 34
            for i, e in enumerate(es):
                srow[e[0]] = src_row(so, label_of[e[2]])
                yv = max(start + i * step, last + 6)
                while any(abs(yv - ey) < 4 for ey in entry_ys[k]): yv += 2
                if n == 1: yv_single = row_y(srow[e[0]]); yv = yv_single if yv_single > last + 6 and not any(abs(yv_single - ey) < 4 for ey in entry_ys[k]) else yv
                exit_y[e[0]] = yv; last = yv
    segs = []
    for eid, s, t, so, to in edges:
        pk = srow[eid]; pk_y = row_y(pk); sy = exit_y[eid]; ty = row_y(t)
        sx_real = pos[so][0] + W[so]; col_right = colx[layer[so]] + colW[layer[so]]; tx0 = pos[to][0]
        k_in = [e[0] for e in by_src[so]].index(eid); fan_x = col_right + 12 + FAN * k_in
        head = [] if abs(sy - pk_y) < 0.5 else [(fan_x, pk_y), (fan_x, sy)]
        info = lane_of[eid]
        if len(info) == 2: g, i = info; pts = head + [(gx(g, i), sy), (gx(g, i), ty)]
        else: g1, i1, g2, i2 = info; cy = corridor_y[eid]; pts = head + [(gx(g1, i1), sy), (gx(g1, i1), cy), (gx(g2, i2), cy), (gx(g2, i2), ty)]
        poly = [(sx_real, pk_y)] + pts + [(tx0, ty)]
        set_attr(eid, 'source', pk); 
        def st(sv):
            sv = re.sub(r'edgeStyle=[^;]*;?', '', sv); sv = re.sub(r'(exitX|exitY|exitDx|exitDy|entryX|entryY|entryDx|entryDy)=[^;]*;?', '', sv)
            return re.sub(r';;+', ';', 'edgeStyle=none;' + sv.strip(';') + ';exitX=1;exitY=0.5;exitDx=0;exitDy=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;')
        set_style(eid, st)
        arr = ''.join(f'<mxPoint x="{fnum(px)}" y="{fnum(py)}" />' for px, py in pts)
        replace_geom(eid, '<mxGeometry relative="1" as="geometry"><Array as="points">' + arr + '</Array></mxGeometry>')
        # ป้ายเลข: วางห่างปลายเส้นตามระยะจริง
        Ltot = sum(abs(x2 - x1) + abs(y2 - y1) for (x1, y1), (x2, y2) in zip(poly, poly[1:]))
        d_a = (abs(fan_x - sx_real) + abs(sy - pk_y) + 18) if head else 22
        d_b = 24
        for suf, d in (('_cs', d_a), ('_ct', Ltot - d_b)):
            lid = eid + suf
            if re.search(r'<mxCell\b[^>]*\bid="' + re.escape(lid) + r'"', out):
                xr = max(-0.98, min(0.98, -1 + 2 * d / Ltot))
                replace_geom(lid, f'<mxGeometry relative="1" x="{round(xr, 4)}" as="geometry"><mxPoint y="-10" as="offset" /></mxGeometry>')
        segs.append((eid, so, to, poly))
    # ข้อความเดี่ยว (ชื่อหน้า/คำอธิบาย) → มุมซ้ายบน · ป้ายกลุ่มเก่า ลบ
    texts = [c for c in cells if c.get('vertex') == '1' and c.get('parent') == '1' and c.get('id') not in tables and 'edgeLabel' not in (c.get('style') or '')]
    texts.sort(key=lambda c: float(c.find('mxGeometry').get('y', 0)))
    ty_ = 14
    for c in texts:
        if txt(c.get('value')).startswith('กลุ่ม '):
            out = re.sub(r'[ \t]*<mxCell\b[^>]*\bid="' + re.escape(c.get('id')) + r'"[^>]*>.*?</mxCell>[ \t]*\r?\n', '', out, count=1, flags=re.S); continue
        set_xy(c.get('id'), 60, ty_); ty_ += float(c.find('mxGeometry').get('height', 26)) + 2
    # ---- ตรวจ ----
    def hit(poly, box):
        bx, by, bw, bh = box
        for (x1, y1), (x2, y2) in zip(poly, poly[1:]):
            if x1 == x2 and bx < x1 < bx + bw and max(y1, y2) > by and min(y1, y2) < by + bh: return True
            if y1 == y2 and by < y1 < by + bh and max(x1, x2) > bx and min(x1, x2) < bx + bw: return True
        return False
    cross = [(eid, name(so), name(to), name(t)) for eid, so, to, poly in segs for t, box in pos.items() if t not in (so, to) and hit(poly, box)]
    own = [(eid, name(so), name(to)) for eid, so, to, poly in segs if hit(poly[1:], pos[so]) or hit(poly[:-1], pos[to])]
    hs = [(eid, round(y1), min(x1, x2), max(x1, x2)) for eid, so, to, poly in segs for (x1, y1), (x2, y2) in zip(poly, poly[1:]) if y1 == y2 and x1 != x2]
    vs = [(eid, round(x1), min(y1, y2), max(y1, y2)) for eid, so, to, poly in segs for (x1, y1), (x2, y2) in zip(poly, poly[1:]) if x1 == x2 and y1 != y2]
    src_of = {eid: so for eid, so, to, poly in segs}
    def overl(a, b): return a[0] != b[0] and abs(a[1] - b[1]) < 3 and a[2] < b[3] - 1 and b[2] < a[3] - 1
    ov_h = [(a[0], b[0]) for i, a in enumerate(hs) for b in hs[i + 1:] if overl(a, b) and src_of[a[0]] != src_of[b[0]]]
    ov_trunk = sum(1 for i, a in enumerate(hs) for b in hs[i + 1:] if overl(a, b) and src_of[a[0]] == src_of[b[0]])
    ov_v = [(a[0], b[0]) for i, a in enumerate(vs) for b in vs[i + 1:] if overl(a, b)]
    print(f"[{page}] ชั้น {K} · ตาราง {len(tables)} · เส้น {len(edges)} (ข้ามชั้น {len(long_edges)}) | ตัดกล่องอื่น {len(cross)} · ตัดกล่องตัวเอง {len(own)} · แนวนอนทับ (ต่างต้นทาง) {len(ov_h)} · แนวตั้งทับ {len(ov_v)} · โคนร่วมจากคีย์เดียวกัน {ov_trunk}")
    for c_ in cross[:8]: print("    ตัดกล่อง:", c_)
    for c_ in own[:8]: print("    ตัดกล่องตัวเอง:", c_)
    for c_ in (ov_h + ov_v)[:8]: print("    ทับ:", c_)
    return len(cross) + len(own) + len(ov_h) + len(ov_v)
ids = re.findall(r'<mxCell\b[^>]*\bid="([^"]+)"', out); dup = {i for i in ids if ids.count(i) > 1} - {'0', '1'}
assert not dup, ("id ซ้ำข้ามหน้า", list(dup)[:10])
bad = sum(layout(p) for p in PAGES)
ET.fromstring(out)
open(PATH, 'wb').write(out.encode('utf-8')); print("saved · ปัญหาเรขาคณิตรวม", bad)
