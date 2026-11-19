# สร้างหน้าแนวคิด 7–10 ของผังฐานข้อมูลใหม่ทั้งหน้า (แก้ไฟล์) จากเส้นของหน้าหลัก "ผังอีอาร์" = ความจริงชุดเดียว
#   ตารางตัวต่อ (LINK) ยุบเป็นเส้น M:N · กลุ่ม ก/ข/ค (HOME) กำหนดในไฟล์นี้ — เพิ่มตารางใหม่ต้องเติมชื่อใน HOME หรือ LINK
# ใช้: python -X utf8 scripts/erd/gen_concept_pages.py "docs/08_สเปค-พัฒนา/ผังฐานข้อมูล.drawio"   (รันหลัง layout_schema_pages.py)
import re, html, sys, xml.etree.ElementTree as ET
from collections import defaultdict
PATH = sys.argv[1]; out = open(PATH, 'rb').read().decode('utf-8')
def txt(v):
    v = html.unescape(v or ''); v = re.sub(r'<[^>]+>', '', v); return re.sub(r'\s+', ' ', v.replace('\xa0', ' ')).strip()
def fnum(v): return str(int(v)) if float(v).is_integer() else str(round(v, 2))
esc = lambda s: html.escape(s, quote=True)
root = ET.fromstring(out)
main = next(d for d in root.findall('diagram') if d.get('name') == 'ผังอีอาร์')
cells = main.find('.//mxGraphModel').findall('.//mxCell'); by_id = {c.get('id'): c for c in cells}
tables = {c.get('id'): re.sub(r'^\d+\.\s*', '', txt(c.get('value'))) for c in cells if c.get('vertex') == '1' and 'swimlane' in (c.get('style') or '')}
def owner(cid):
    c = by_id.get(cid)
    while c is not None and c.get('id') not in tables: c = by_id.get(c.get('parent'))
    return tables.get(c.get('id')) if c is not None else None
LINK = {'คำในประโยค': 'ก', 'ประโยคในข้อสอบ': 'ข', 'บทในข้อสอบ': 'ข', 'หน่วยความรู้ของข้อ': 'ข', 'ข้อในชุด': 'ข'}
HOME = {'ก': ['ระดับ', 'หมวด', 'คำศัพท์', 'ประโยค', 'บทสนทนา', 'บรรทัดบทสนทนา', 'คู่ถาม-ตอบ', 'ด่านพื้นฐานเสียง', 'บทเรียนในด่าน', 'คู่เสียงใกล้'],
        'ข': ['ข้อสอบ', 'ตัวเลือกคำ', 'ตัวเลือกประโยค', 'ชุดข้อสอบ', 'พิมพ์เขียวชุดข้อสอบ', 'หน่วยความรู้', 'จุดผิดคนไทย'],
        'ค': ['ผู้ใช้', 'รอบการทำ', 'คำตอบรายข้อ', 'ทบทวนคำ', 'คนกับคำ', 'คนกับด่าน', 'ความแม่นรายคนรายหน่วยความรู้', 'ประวัติการฝึกโมเดล']}
group_of = {n: g for g, ns in HOME.items() for n in ns}
ents = [n for n in tables.values() if n not in LINK]
assert set(ents) == set(group_of), (set(ents) ^ set(group_of))
pair = {}; link_ends = defaultdict(list)
for e in cells:
    if e.get('edge') != '1': continue
    s, t = owner(e.get('source')), owner(e.get('target')); ea = re.search(r'endArrow=([A-Za-z]+)', e.get('style') or '').group(1)
    if t in LINK:
        if s not in link_ends[t]: link_ends[t].append(s)
    else:
        kind = '11' if ea in ('ERzeroToOne', 'ERmandOne') else '1N'
        if (s, t) not in pair or kind == '1N': pair[(s, t)] = kind
rels = [dict(a=a, b=b, kind=k, label='', page=group_of[b]) for (a, b), k in pair.items()]
for L, ends in link_ends.items():
    assert len(ends) == 2, (L, ends); rels.append(dict(a=ends[0], b=ends[1], kind='MN', label=L, page=LINK[L]))
print(f"จากหน้าหลัก: กล่อง {len(ents)} · ความสัมพันธ์ {len(rels)} (1:N {sum(r['kind']=='1N' for r in rels)} · 1:1 {sum(r['kind']=='11' for r in rels)} · M:N {sum(r['kind']=='MN' for r in rels)})")
BOX_HOME = "rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontSize=13;fontStyle=1;"
BOX_FOR = "rounded=1;whiteSpace=wrap;html=1;dashed=1;fillColor=#f5f5f5;strokeColor=#999999;fontSize=12;fontStyle=1;fontColor=#666666;"
E_GRAY = "endArrow=none;html=1;rounded=1;strokeColor=#888888;fontSize=11;labelBackgroundColor=#ffffff;"
E_MN = "endArrow=none;html=1;rounded=1;strokeColor=#9673a6;strokeWidth=2;fontSize=11;fontColor=#9673a6;labelBackgroundColor=#ffffff;"
LAB = "edgeLabel;html=1;align=center;verticalAlign=middle;resizable=0;points=[];fontSize=11;fontStyle=1;fontColor=#b85450;labelBackgroundColor=#ffffff;"
def build(prefix, title, legend, home, rels_p, off=None, quiet=False):
    names = list(home) + sorted({x for r in rels_p for x in (r['a'], r['b'])} - set(home))
    parents = defaultdict(set)
    for r in rels_p:
        if r['kind'] != 'MN': parents[r['b']].add(r['a'])
    layer = {}
    def Lf(t, seen=()):
        if t in layer: return layer[t]
        if t in seen: return 0
        v = 0 if not parents[t] else 1 + max(Lf(p, seen + (t,)) for p in parents[t]); layer[t] = v; return v
    for n in names: Lf(n)
    cols = defaultdict(list)
    for n in names: cols[layer[n]].append(n)
    K = max(cols) + 1; order = {}
    pref = ['ผู้ใช้', 'ระดับ', 'หน่วยความรู้', 'ด่านพื้นฐานเสียง', 'ประวัติการฝึกโมเดล']
    for k in range(K):
        ts = cols.get(k, [])
        if k == 0: ts.sort(key=lambda t: (pref.index(t) if t in pref else 99, t))
        else: ts.sort(key=lambda t: (sum(order.get(p, 0) for p in parents[t]) / max(1, len(parents[t])), t))
        for i, t in enumerate(ts): order[t] = i
    E = []
    for i, r in enumerate(rels_p):
        a, b = r['a'], r['b']
        if (layer[a], order[a]) > (layer[b], order[b]): a, b = b, a      # เกิดได้เฉพาะ M:N
        la_ = ('M', 'N') if r['kind'] == 'MN' else ('1', '1') if r['kind'] == '11' else ('1', 'N')
        E.append(dict(id=f"{prefix}e{i}", a=a, b=b, kind=r['kind'], label=r['label'], la=la_[0], lb=la_[1], same=layer[a] == layer[b]))
    nR = defaultdict(int); nL = defaultdict(int)
    for e in E:
        nR[e['a']] += 1
        if e['same']: nR[e['b']] += 1
        else: nL[e['b']] += 1
    W = 180; Hh = {n: max(50, 14 * max(nR[n], nL[n]) + 10) for n in names}
    lanes = defaultdict(int)
    for e in sorted(E, key=lambda e: (layer[e['a']], order[e['a']], layer[e['b']], order[e['b']])):
        a, b = layer[e['a']], layer[e['b']]
        if e['same'] or b == a + 1: e['lane'] = (a, lanes[a]); lanes[a] += 1
        else: e['lane'] = (a, lanes[a], b - 1, lanes[b - 1]); lanes[a] += 1; lanes[b - 1] += 1
    longs = [e for e in E if len(e['lane']) == 4]
    CORR = 84
    for i, e in enumerate(sorted(longs, key=lambda e: (layer[e['a']], order[e['a']], layer[e['b']], order[e['b']]))): e['cy'] = CORR + 9 * i
    TOP = CORR + 9 * max(1, len(longs)) + 50
    colx = {}; x = 60
    for k in range(K): colx[k] = x; x += W + 34 + 11 * max(2, lanes[k]) + 40
    pos = {}
    for k in range(K):
        y = TOP + (off or {}).get(k, 0)
        for n in sorted(cols.get(k, []), key=lambda t: order[t]): pos[n] = (colx[k], y, W, Hh[n]); y += Hh[n] + 34
    cy_of = lambda n: pos[n][1] + pos[n][3] / 2
    rightE = defaultdict(list); leftE = defaultdict(list)
    for e in E:
        rightE[e['a']].append((e, 'a'))
        (rightE if e['same'] else leftE)[e['b']].append((e, 'b'))
    def other_y(e, end):
        o = e['b'] if end == 'a' else e['a']
        base = cy_of(o)
        if len(e['lane']) == 4: base = -1e6 + base      # เส้นขึ้นทางเดินบน → เกาะด้านบนของกล่อง
        return base
    for n in names:
        for lst in (rightE[n], leftE[n]):
            lst.sort(key=lambda p: other_y(*p))
            for i, (e, end) in enumerate(lst): e['f' + end] = (i + 0.5) / len(lst)
    gx = lambda g, i: colx[g] + W + 34 + 11 * i
    xml = ['<mxCell id="0" />', '<mxCell id="1" parent="0" />',
           f'<mxCell id="{prefix}title" parent="1" style="text;html=1;fontSize=20;fontStyle=1;align=left;verticalAlign=middle;" value="{esc(title)}" vertex="1"><mxGeometry height="34" width="1600" x="40" as="geometry" /></mxCell>',
           f'<mxCell id="{prefix}legend" parent="1" style="text;html=1;fontSize=13;align=left;verticalAlign=middle;whiteSpace=wrap;" value="{esc(legend)}" vertex="1"><mxGeometry height="26" width="2000" x="40" y="34" as="geometry" /></mxCell>']
    bid = {n: f"{prefix}b{i}" for i, n in enumerate(names)}
    for n in names:
        x, y, w, h = pos[n]
        xml.append(f'<mxCell id="{bid[n]}" parent="1" style="{BOX_HOME if n in home else BOX_FOR}" value="{esc(n)}" vertex="1"><mxGeometry height="{fnum(h)}" width="{fnum(w)}" x="{fnum(x)}" y="{fnum(y)}" as="geometry" /></mxCell>')
    def route(e):
        ax, ay, aw, ah = pos[e['a']]; bx, by, bw, bh = pos[e['b']]
        ya = min(ay + ah - 3, max(ay + 3, ay + ah * e['fa'] + e.get('da', 0))); yb = min(by + bh - 3, max(by + 3, by + bh * e['fb'] + e.get('db', 0)))
        if e['same']:
            g, i_ = e['lane']; pts = [(gx(g, i_), ya), (gx(g, i_), yb)]; end = (bx + bw, yb); entryX = 1
        elif len(e['lane']) == 2:
            g, i_ = e['lane']; pts = [(gx(g, i_), ya), (gx(g, i_), yb)]; end = (bx, yb); entryX = 0
        else:
            g1, i1, g2, i2 = e['lane']; cyv = e['cy']; pts = [(gx(g1, i1), ya), (gx(g1, i1), cyv), (gx(g2, i2), cyv), (gx(g2, i2), yb)]; end = (bx, yb); entryX = 0
        return [(ax + aw, ya)] + pts + [end], pts, entryX, (ya - ay) / ah, (yb - by) / bh
    def hsegs():
        res = []
        for e in E:
            poly = route(e)[0]; hz = [(k, (x1, y1), (x2, y2)) for k, ((x1, y1), (x2, y2)) in enumerate(zip(poly, poly[1:])) if y1 == y2 and x1 != x2]
            for k, a_, b_ in hz: res.append((e, 'a' if k == 0 else 'b' if k == len(poly) - 2 else 'c', a_[1], min(a_[0], b_[0]), max(a_[0], b_[0])))
        return res
    def nconf():
        hsl = hsegs(); c = 0; first = None
        for i_, a_ in enumerate(hsl):
            for b_ in hsl[i_ + 1:]:
                if a_[0] is not b_[0] and abs(a_[2] - b_[2]) < 5 and a_[3] < b_[4] - 1 and b_[3] < a_[4] - 1:
                    c += 1
                    if first is None: first = (a_, b_)
        return c, first
    for _it in range(400):
        c, first = nconf()
        if not c: break
        bestm = None
        for seg in first:
            e_, kind = seg[0], seg[1]; key = 'cy' if kind == 'c' else 'd' + kind; old = e_.get(key, 0)
            for dlt in (5, -5, 9, -9, 14, -14, 20, -20, 27, -27):
                e_[key] = old + dlt; c2 = nconf()[0]
                if bestm is None or c2 < bestm[0]: bestm = (c2, e_, key, old + dlt)
            e_[key] = old
        if bestm[0] >= c: break
        bestm[1][bestm[2]] = bestm[3]
    segs = []
    for e in E:
        poly, pts, entryX, fa_, fb_ = route(e)
        Lt = sum(abs(x2 - x1) + abs(y2 - y1) for (x1, y1), (x2, y2) in zip(poly, poly[1:]))
        st = f"edgeStyle=none;exitX=1;exitY={round(fa_, 4)};exitDx=0;exitDy=0;entryX={entryX};entryY={round(fb_, 4)};entryDx=0;entryDy=0;" + (E_MN if e['kind'] == 'MN' else E_GRAY)
        arr = ''.join(f'<mxPoint x="{fnum(px)}" y="{fnum(py)}" />' for px, py in pts)
        xml.append(f'<mxCell id="{e["id"]}" edge="1" parent="1" source="{bid[e["a"]]}" target="{bid[e["b"]]}" style="{st}" value="{esc(e["label"])}"><mxGeometry relative="1" as="geometry"><Array as="points">{arr}</Array></mxGeometry></mxCell>')
        for suf, val, d in (('_a', e['la'], 14), ('_b', e['lb'], Lt - 14)):
            xr = max(-0.98, min(0.98, -1 + 2 * d / Lt))
            xml.append(f'<mxCell id="{e["id"]}{suf}" connectable="0" parent="{e["id"]}" style="{LAB}" value="{val}" vertex="1"><mxGeometry relative="1" x="{round(xr, 4)}" as="geometry"><mxPoint y="-9" as="offset" /></mxGeometry></mxCell>')
        segs.append((e, poly))
    def hit(poly, box):
        bx, by, bw, bh = box
        for (x1, y1), (x2, y2) in zip(poly, poly[1:]):
            if x1 == x2 and bx < x1 < bx + bw and max(y1, y2) > by and min(y1, y2) < by + bh: return True
            if y1 == y2 and by < y1 < by + bh and max(x1, x2) > bx and min(x1, x2) < bx + bw: return True
        return False
    cross = [(e['a'], e['b'], n) for e, poly in segs for n in names if n not in (e['a'], e['b']) and hit(poly, pos[n])]
    hs = [(e['id'], round(y1, 1), min(x1, x2), max(x1, x2)) for e, poly in segs for (x1, y1), (x2, y2) in zip(poly, poly[1:]) if y1 == y2 and x1 != x2]
    vs = [(e['id'], round(x1, 1), min(y1, y2), max(y1, y2)) for e, poly in segs for (x1, y1), (x2, y2) in zip(poly, poly[1:]) if x1 == x2 and y1 != y2]
    ov = lambda L_: [(a[0], b[0]) for i, a in enumerate(L_) for b in L_[i + 1:] if a[0] != b[0] and abs(a[1] - b[1]) < 3 and a[2] < b[3] - 1 and b[2] < a[3] - 1]
    oh, ovv = ov(hs), ov(vs)
    if not quiet: print(f"[{title[:28]}…] ชั้น {K} · กล่อง {len(names)} (หน้านี้ {len(home)} + จากหน้าอื่น {len(names) - len(home)}) · เส้น {len(E)} | ตัดกล่อง {len(cross)} · แนวนอนทับ {len(oh)} · แนวตั้งทับ {len(ovv)}")
    for c in ([] if quiet else cross[:6]): print("    ตัดกล่อง:", c)
    for c in ([] if quiet else (oh + ovv)[:6]): print("    ทับ:", c)
    return '\n        '.join(xml), len(cross) + len(oh) + len(ovv), K
def replace_root(name, inner):
    global out
    pat = re.compile(r'(<diagram\b[^>]*\bname="' + re.escape(esc(name)) + r'"[^>]*>.*?<root>)(.*?)(</root>)', re.S)
    m = pat.search(out); assert m, name
    out = out[:m.start(2)] + '\n        ' + inner + '\n      ' + out[m.end(2):]
pg = {d.get('name'): d for d in root.findall('diagram')}
def texts(name):
    cs = pg[name].find('.//mxGraphModel').findall('.//mxCell')
    t = [c for c in cs if (c.get('style') or '').startswith('text;') and c.get('parent') == '1']
    t.sort(key=lambda c: float(c.find('mxGeometry').get('y', 0))); return txt(t[0].get('value')), txt(t[1].get('value'))
bad = 0
n7 = '7 ผังแนวคิด (1:1 · 1:N · M:N)'; t, l = texts(n7); inner, b, _ = build('c7_', t, l, ents, rels); replace_root(n7, inner); bad += b
for name, g, pre in (('8 แนวคิด ก. เนื้อหา', 'ก', 'c8_'), ('9 แนวคิด ข. ข้อสอบ', 'ข', 'c9_'), ('10 แนวคิด ค. ผู้เรียน', 'ค', 'c10_')):
    t, l = texts(name); inner, b, _ = build(pre, t, l, HOME[g], [r for r in rels if r['page'] == g]); replace_root(name, inner); bad += b
ET.fromstring(out)
ids = re.findall(r'<mxCell\b[^>]*\bid="([^"]+)"', out); dup = {i for i in ids if ids.count(i) > 1} - {'0', '1'}
assert not dup, list(dup)[:10]
open(PATH, 'wb').write(out.encode('utf-8')); print("saved · ปัญหาเรขาคณิตรวม", bad)
