# SOURCE DATA AUDIT REPORT (PHASE 1)

**Project:** TS Legends — Idle RPG  
**Audit Date:** 2026-11-25  
**Status:** Verified (Read-Only Public Inspection)

---

## 1. Executive Summary

การตรวจสอบข้อมูลต้นทางทั้ง 2 แหล่งเสร็จสมบูรณ์ด้วยวิธีการเข้าถึงแบบ Public Read-Only โดยไม่แตะต้องระบบส่วนตัวหรือข้อมูลที่จำกัดสิทธิ์ใดๆ ทั้งสองแหล่งมีโครงสร้างข้อมูลที่เปิดเผยต่อสาธารณะในรูปแบบ Static JS, Google Sheets Visualization API (`gviz`), และ WordPress REST API

| Metric | Source 01 (TS General Database) | Source 02 (TS Online Classic Official Guide) |
| :--- | :--- | :--- |
| **URL** | `https://coruscating-basbousa-fa686e.netlify.app/` | `https://tsonlineclassic.com/th-th/ts-guide/index.html` |
| **Hosting / Tech** | Netlify Edge (Static HTML + Vanilla JS) | Cloudflare + WordPress + Google Sheets (`gviz`) |
| **Data Format** | `data.js` (`window.TS_DATA`), `skills_info.js` (`TS_SKILLS`, `TS_SKMAP`, `TS_SKICON`) | Google Sheet `13rAVlXAmH550Llpmp_UOK3B0M_h20XA0PeAelLRHmXs` (`characters`, `skills`, `npc`), WP REST API (`quests`) |
| **Characters** | **429 ตัว** (ID `0`–`428`, รวม **1,139 ร่าง**) | **404 ตัว** (1,085 แถวข้อมูลจริง + 3 แถวว่าง) |
| **Skills** | **149 สกิล** (ข้อมูลตรงกับ Source 02 100%) | **149 สกิล** |
| **Quests** | ไม่มี | **52 เควส** (WP REST API `categories=55`) |
| **NPCs / Monsters** | ไม่มี | **12 ตัวอย่าง** (แท็บ `npc`, โมดูลสถานะ `hidden`) |
| **Image Assets** | **1,678 ไฟล์ WebP** (4.16 MB รวมทั้งหมด, HTTP 200 100%) | PNG ใน `wp-content/uploads/2026/10/` (128×128 / 64×64) |

---

## 2. Source 01 Inspection (`coruscating-basbousa-fa686e.netlify.app`)

### 2.1 Architecture & Storage
- **Frontend:** Single-file `index.html` (54 KB) ใช้ Vanilla JS + CSS
- **Character Data:** `data.js` (171 KB) เก็บ JSON Array ใน `window.TS_DATA`
- **Skill Data:** `skills_info.js` (33 KB) เก็บ 3 Objects:
  - `window.TS_SKILLS`: รายละเอียดสกิล 149 รายการ (`e`, `t`, `sp`, `tg`, `cb`, `psy`, `d`, `src`)
  - `window.TS_SKMAP`: ตารางจับคู่ Icon ID (`s1`..`s99`, `x1`..`x21`) -> ชื่อสกิล (120 รายการ)
  - `window.TS_SKICON`: ตารางจับคู่ชื่อสกิล -> path/URL ไอคอน (149 รายการ)
- **Offline Storage:** ใช้ `localStorage` สำหรับเก็บ `ts_mode`, `ts_view`, และ `ts_favs` เท่านั้น (ไม่มี IndexedDB)
- **Search & Filter Logic:** Normalize ภาษาไทยโดยตัดสระบน/ล่างและวรรณยุกต์ (`/[ัิ-ฺ็-๎]/g`), กรองตามธาตุ (`fire`, `wind`, `water`, `earth`), เพศ (`m`, `f`), ร่างจุติ (`0`, `1`, `2`), ช่วงเลเวล, สกิลจิต, และความต่างระหว่างเวอร์ชัน (`diffOnly`)

### 2.2 Key Discrepancy Found
- หน้าเว็บระบุว่า "รวมขุนพล 420 ตัว" และ "ข้อมูลจากภาพหน้าจอ 107 ไฟล์" แต่ใน `data.js` จริงมี **429 ตัว** (ID `0`–`428`)
- ID `420`–`428` (9 ตัว) เป็นข้อมูลที่เพิ่มเข้ามาภายหลังจากเว็บทางการ (`b: 1`) จึง **ไม่มีข้อมูลเลเวล (`l: null`)** และ **ไม่มีภาพชื่อต้นฉบับ (`ni`)**

---

## 3. Source 02 Inspection (`tsonlineclassic.com/th-th/ts-guide/`)

### 3.1 Architecture & Storage
- **Frontend:** Modular Vanilla JS + Bootstrap 5.3.3 ภายใต้ Namespace `window.GG` (`core/gg.js`, `core/gsheet.js`, `modules/characters/`, `modules/skills/`, `modules/quests/`)
- **Data Backend:**
  - `api/sheet.php` (PHP snapshot รายวัน) ป้องกัน cross-domain (`{"status":"error","message":"ใช้ได้เฉพาะหน้าเว็บของโดเมนนี้"}`)
  - **Fallback Public Endpoint:** Google Sheets `gviz/tq` (แชร์แบบ Public Read-Only) ดึงได้โดยตรงจาก Google Sheet ID `13rAVlXAmH550Llpmp_UOK3B0M_h20XA0PeAelLRHmXs`
    - Tab `characters`: 1,088 rows (1,085 valid + 3 blank rows)
    - Tab `skills`: 149 rows
    - Tab `npc`: 12 rows (โมดูล `npc` ถูกตั้งค่า `status: 'hidden'`)
- **Quest Backend:** WordPress REST API (`https://tsonlineclassic.com/th-th/index.php/wp-json/wp/v2/posts?categories=55`) มีทั้งหมด **52 เควส**

---

## 4. Licensing, Legal & Usage Assessment

1. **Data Facts (Stats, Elements, Evolution Tiers):** ค่าตัวเลขและโครงสร้างความสัมพันธ์สามารถนำมาอ้างอิงและปรับสมดุลในระบบ Data-Driven ของเกมเราได้
2. **Visual Assets (Sprites & Icons):** ภาพขุนพลและไอคอนสกิลบน Source 01 และ Source 02 เป็นทรัพย์สินทางปัญญาของ **Chinese Gamer / Asphere Innovations** (ตาม Copyright Footer ของ Source 02)
   - **คำแนะนำทางวิศวกรรมและลิขสิทธิ์:** ในระยะ Prototype / Internal Dev สามารถอ้างอิง Metadata และ Placeholder เชิงโครงสร้างได้ แต่สำหรับ **Production Release** ของ *TS Legends — Idle RPG* (Original Game Implementation) ต้องใช้ **Original Art Assets / Licensed Assets** หรือระบบ Procedural/Original Placeholder Sprite ที่ออกแบบใหม่ทั้งหมด เพื่อหลีกเลี่ยงปัญหาลิขสิทธิ์และให้ตรงกับแนวทาง Original UI/UX ใน Phase 0 และ Phase 3
3. **Missing Data Policy:**
   - **ชื่อภาษาอังกฤษ (`Character Name EN`):** ไม่มีในทั้ง Source 01 และ Source 02 -> ระบุเป็น `UNKNOWN / NOT_PROVIDED` ใน Manifest เพื่อรอการแปล/ตั้งชื่ออย่างเป็นทางการ
   - **ระบบมอนสเตอร์ / ดันเจี้ยน / อุปกรณ์:** Source 02 มี `npc` เพียง 12 ตัว ไม่มีข้อมูล World Map / Dungeon / Equipment -> ต้องออกแบบเป็น Original Game Data Table ใน Phase 2 (ไม่แอบอ้างว่ามาจาก Source)
