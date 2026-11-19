# ตรวจว่าทุกช่องคีย์นอก (ตัวเอียง) ในผังฐานข้อมูลมีเส้นความสัมพันธ์ — ไม่แก้ไฟล์
# ใช้: python -X utf8 scripts/erd/check_fk_edges.py "docs/08_สเปค-พัฒนา/ผังฐานข้อมูล-32ตาราง.drawio"
import sys, re, html, xml.etree.ElementTree as ET
root = ET.parse(sys.argv[1]).getroot()
def txt(v):
    v = html.unescape(v or ''); v = re.sub(r'<[^>]+>', '', v); return re.sub(r'\s+', ' ', v.replace('\xa0', ' ')).strip()
total_missing = 0
for d in root.findall('diagram'):
    page = d.get('name')
    if 'แนวคิด' in page: continue
    cells = d.find('.//mxGraphModel').findall('.//mxCell'); by_id = {c.get('id'): c for c in cells}
    tables = {c.get('id'): re.sub(r'^\d+\.\s*', '', txt(c.get('value'))) for c in cells if c.get('vertex') == '1' and 'swimlane' in (c.get('style') or '')}
    targets = {c.get('target') for c in cells if c.get('edge') == '1'}
    sources = {c.get('source') for c in cells if c.get('edge') == '1'}
    missing = []
    for c in cells:
        if c.get('vertex') == '1' and c.get('parent') in tables:
            m = re.search(r'fontStyle=(\d+)', c.get('style') or ''); fs = int(m.group(1)) if m else 0
            if fs & 2 and c.get('id') not in targets and c.get('id') not in sources:
                missing.append((tables[c.get('parent')], txt(c.get('value')), c.get('id')))
    if missing:
        print(f"หน้า {page}: ช่องตัวเอียงที่ไม่มีเส้น {len(missing)}")
        for t, r, cid in missing: print(f"   - {t} . {r}   [{cid}]")
    total_missing += len(missing)
print("รวมขาดเส้น:", total_missing)
