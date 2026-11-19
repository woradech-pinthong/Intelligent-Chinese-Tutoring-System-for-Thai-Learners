# ตรวจผังฐานข้อมูล (docs/08_สเปค-พัฒนา/ผังฐานข้อมูล.drawio) ทั้งไฟล์ — ไม่แก้ไฟล์
#   A เส้นทุกหน้า: ต้นทาง = คีย์หลัก (ตัวหนา) · ปลายทาง = ช่องตัวเอียง · ชื่อเข้าคู่ · ป้ายเลขตรงหัวเส้น · ไม่ซ้ำ
#   B ตาราง/เส้น หน้าแยก 1–6 ตรงกับหน้าหลัก   C หน้าแนวคิด 7–10 ตรงกับความสัมพันธ์จริงของหน้าหลัก
# ใช้: python -X utf8 scripts/erd/audit_diagram.py "docs/08_สเปค-พัฒนา/ผังฐานข้อมูล.drawio"
import sys, re, html, xml.etree.ElementTree as ET
from collections import defaultdict, Counter
root = ET.parse(sys.argv[1]).getroot()
def txt(v):
    v = html.unescape(v or ''); v = re.sub(r'<[^>]+>', '', v); return re.sub(r'\s+', ' ', v.replace('\xa0', ' ')).strip()
def fs(c):
    m = re.search(r'fontStyle=(\d+)', c.get('style') or ''); return int(m.group(1)) if m else 0
def arrow(st, which):
    m = re.search(which + r'=([A-Za-z]+)', st or ''); return m.group(1) if m else '?'
LBL = {'ERmandOne': '1', 'ERzeroToOne': '0..1', 'ERzeroToMany': '0..N', 'ERoneToMany': '1..N'}
pages = {}
for d in root.findall('diagram'):
    name = d.get('name'); cells = d.find('.//mxGraphModel').findall('.//mxCell'); by_id = {c.get('id'): c for c in cells}
    tables = {}
    for c in cells:
        if c.get('vertex') == '1' and 'swimlane' in (c.get('style') or ''):
            rows = sorted([k for k in cells if k.get('parent') == c.get('id') and k.get('vertex') == '1'], key=lambda k: float(k.find('mxGeometry').get('y', 0)))
            tables[c.get('id')] = dict(name=re.sub(r'^\d+\.\s*', '', txt(c.get('value'))), stub='dashed=1' in (c.get('style') or ''), rows=[(k.get('id'), txt(k.get('value')), fs(k)) for k in rows])
    def owner(cid):
        c = by_id.get(cid)
        while c is not None and c.get('id') not in tables: c = by_id.get(c.get('parent'))
        return c.get('id') if c is not None else None
    edges = []
    for e in cells:
        if e.get('edge') != '1': continue
        labs = {k.get('id')[-2:]: txt(k.get('value')) for k in cells if k.get('parent') == e.get('id')}
        edges.append(dict(id=e.get('id'), s=e.get('source'), t=e.get('target'), so=owner(e.get('source')), to=owner(e.get('target')), sa=arrow(e.get('style'), 'startArrow'), ea=arrow(e.get('style'), 'endArrow'), cs=labs.get('cs'), ct=labs.get('ct'), val=txt(e.get('value'))))
    pages[name] = dict(tables=tables, edges=edges, by_id=by_id, cells=cells)
issues = []
main = pages['ผังอีอาร์']
def rowinfo(pg, rid):
    for t in pg['tables'].values():
        for r in t['rows']:
            if r[0] == rid: return t, r
    return None, None
print("=== A. ตรวจเส้นทุกหน้า (ไม่รวมหน้าแนวคิด) ===")
edge_keys = {}
for name, pg in pages.items():
    if 'แนวคิด' in name: continue
    seen = Counter(); keys = set()
    for e in pg['edges']:
        st, sr = rowinfo(pg, e['s']); tt, tr = rowinfo(pg, e['t'])
        if st is None or tt is None: issues.append(f"[{name}] เส้น {e['id']} ปลายไม่ได้อยู่ที่แถวของตาราง (s={e['s']} t={e['t']})"); continue
        pk = [r for r in st['rows'] if r[2] & 1]
        if not (sr[2] & 1): issues.append(f"[{name}] ต้นทางไม่ใช่คีย์หลัก: {st['name']}.{sr[1]} → {tt['name']}.{tr[1]}")
        if not (tr[2] & 2): issues.append(f"[{name}] ปลายทางไม่ใช่ช่องตัวเอียง: {st['name']}.{sr[1]} → {tt['name']}.{tr[1]}")
        base = pk[0][1] if pk else sr[1]
        ok_name = tr[1].startswith(base) or (base == 'รหัสผู้ใช้' and tr[1] == 'รหัสผู้อนุมัติ') or tr[1] == 'ตัวเลือกที่เลือก'
        if not ok_name: issues.append(f"[{name}] ชื่อไม่เข้าคู่: {st['name']}.{base} → {tt['name']}.{tr[1]}")
        if e['cs'] is not None and LBL.get(e['sa']) != e['cs']: issues.append(f"[{name}] ป้ายต้นทาง '{e['cs']}' ไม่ตรงหัวเส้น {e['sa']}: {st['name']} → {tt['name']}.{tr[1]}")
        if e['ct'] is not None and LBL.get(e['ea']) != e['ct']: issues.append(f"[{name}] ป้ายปลายทาง '{e['ct']}' ไม่ตรงหัวเส้น {e['ea']}: {st['name']} → {tt['name']}.{tr[1]}")
        if e['cs'] is None or e['ct'] is None: issues.append(f"[{name}] เส้นไม่มีป้ายเลข: {st['name']} → {tt['name']}.{tr[1]}")
        k = (st['name'], tt['name'], tr[1]); seen[k] += 1; keys.add((k, e['sa'], e['ea']))
    for k, n in seen.items():
        if n > 1: issues.append(f"[{name}] เส้นซ้ำ {n} เส้น: {k[0]} → {k[1]}.{k[2]}")
    edge_keys[name] = keys
print("=== B. ตารางเดียวกันข้ามหน้า + เส้นข้ามหน้า ===")
main_tabs = {t['name']: t for t in main['tables'].values()}
main_keys = edge_keys['ผังอีอาร์']; main_k3 = {k[0]: k for k in main_keys}
covered = set(); full_on = defaultdict(list)
for name, pg in pages.items():
    if 'แนวคิด' in name or name == 'ผังอีอาร์': continue
    for t in pg['tables'].values():
        if t['name'] not in main_tabs: issues.append(f"[{name}] มีตารางที่หน้าหลักไม่มี: {t['name']}"); continue
        mt = main_tabs[t['name']]
        if t['stub']:
            pkm = [r[1] for r in mt['rows'] if r[2] & 1]
            if not all(r[1] in [x[1] for x in mt['rows']] for r in t['rows']): issues.append(f"[{name}] กล่องย่อ {t['name']} มีแถวที่หน้าหลักไม่มี: {[r[1] for r in t['rows']]}")
        else:
            full_on[t['name']].append(name)
            a = [(r[1], r[2]) for r in t['rows']]; b = [(r[1], r[2]) for r in mt['rows']]
            if a != b: issues.append(f"[{name}] ตาราง {t['name']} ไม่ตรงหน้าหลัก: หน้านี้ {a} | หลัก {b}")
    for k in edge_keys[name]:
        if k[0] not in main_k3: issues.append(f"[{name}] เส้นที่หน้าหลักไม่มี: {k[0][0]} → {k[0][1]}.{k[0][2]}")
        elif main_k3[k[0]] != k: issues.append(f"[{name}] หัวเส้นไม่ตรงหน้าหลัก: {k[0][0]} → {k[0][1]}.{k[0][2]} หน้านี้ {k[1]}/{k[2]} หลัก {main_k3[k[0]][1]}/{main_k3[k[0]][2]}")
        covered.add(k[0])
for k in main_keys:
    if k[0] not in covered and full_on.get(k[0][1]): issues.append(f"[หน้า {full_on[k[0][1]]}] ขาดเส้นที่หน้าหลักมี: {k[0][0]} → {k[0][1]}.{k[0][2]}")
nofull = [n for n in main_tabs if n not in full_on]
print("ตารางที่ไม่มีหน้าแยกแสดงเต็ม:", nofull)
nopk = [t['name'] for t in main['tables'].values() if not any(r[2] & 1 for r in t['rows'])]
print("ตารางที่ไม่มีคีย์หลัก (ตัวหนา):", nopk)
print("=== C. หน้าแนวคิด เทียบของจริง ===")
LINK = {'คำในประโยค', 'คำในข้อสอบ', 'ประโยคในข้อสอบ', 'บทในข้อสอบ', 'หน่วยความรู้ของข้อ', 'ข้อในชุด', 'จุดผิดของคำตอบ'}
real_boxes = set(main_tabs) - LINK
real_rel = set()
for k in main_keys:
    (s, t, r), sa, ea = k
    if t in LINK: continue
    real_rel.add(frozenset([s, t]) if s != t else frozenset([s]))
for L in LINK:
    ends = sorted({k[0][0] for k in main_keys if k[0][1] == L})
    if len(ends) == 2: real_rel.add(frozenset(ends))
for name, pg in pages.items():
    if 'แนวคิด' not in name: continue
    boxes = {c.get('id'): txt(c.get('value')) for c in pg['cells'] if c.get('vertex') == '1' and c.get('parent') == '1' and 'edgeLabel' not in (c.get('style') or '') and 'text;' not in (c.get('style') or '')[:6]}
    names = set(boxes.values())
    rel = set()
    for e in pg['edges']:
        a, b = boxes.get(e['s']), boxes.get(e['t'])
        if a and b: rel.add(frozenset([a, b]))
    if name.startswith('7'):
        print(f"[{name}] กล่อง {len(names)} (ของจริงควร {len(real_boxes)}) · เส้น {len(rel)} (ของจริง {len(real_rel)})")
        print("   กล่องที่ขาด:", sorted(real_boxes - names)); print("   กล่องเกิน:", sorted(names - real_boxes - {''}))
        print("   ความสัมพันธ์ที่ขาด:", sorted(' — '.join(sorted(x)) for x in real_rel - rel))
        print("   ความสัมพันธ์เกิน (ไม่มีจริงแล้ว):", sorted(' — '.join(sorted(x)) for x in rel - real_rel))
    else:
        extra = sorted(' — '.join(sorted(x)) for x in rel - real_rel)
        print(f"[{name}] กล่อง {len(names)} · เส้น {len(rel)} · เส้นที่ไม่มีจริงแล้ว {len(extra)}: {extra}")
print("=== สรุปปัญหา", len(issues), "ข้อ ===")
for i in issues: print(" -", i)
