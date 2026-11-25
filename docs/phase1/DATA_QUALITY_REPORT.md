# DATA QUALITY REPORT (PHASE 1)

**Validation Scope:** 429 Characters (1,139 Forms), 149 Skills, 1,678 Asset URLs

---

## 1. Automated Validation Checklist

| Check | Result | Severity | Details & Resolution |
| :--- | :---: | :---: | :--- |
| **Duplicate Character ID** | **PASS (0)** | - | ID `0`–`428` ไม่ซ้ำกันเลย |
| **Duplicate Character Name TH** | **WARN (3 pairs)** | Medium | `จางจี้` (ID 36, 160), `หยางหง` (ID 170, 266), `หลี่ซู่` (ID 359, 428) -> **ต้องใช้ `id` เป็น Primary Key เสมอ ห้ามใช้ชื่อไทยเป็น Key** |
| **Missing Character Name TH** | **PASS (0)** | - | ครบทั้ง 429 ตัว |
| **Missing Character Name EN** | **MISSING (429)** | High | ไม่มีในทั้ง 2 แหล่ง -> ตั้งค่าเป็น `null` / `UNKNOWN` ใน Raw Import ห้ามเดาชื่อ |
| **Missing Character Level (`l`)** | **WARN (9)** | Medium | ID `420`–`428` มีค่า `l: null` -> ต้องกำหนด Default หรือ Config Level Requirement ใน Phase 2 |
| **Missing Sprite Path (`f[].i`)** | **PASS (0)** | - | ครบทั้ง 1,139 ร่าง และ HTTP 200 100% |
| **Unmapped Skill Icon (`s*`/`x*`)** | **PASS (0)** | - | 120 / 120 ไอคอนจับคู่ชื่อสกิลได้ครบ |
| **Missing Skill Definition** | **PASS (0)** | - | ทุกสกิลที่ตัวละครใช้อยู่ใน `TS_SKILLS` (149/149) |
| **Skill Type Typo (`ก่อนกวน`)** | **WARN (6)** | Low | สกิล 6 รายการสะกด `ก่อนกวน` แทน `ก่อกวน` -> Normalize ใน ETL Script |
| **Missing Skill Type / SP** | **WARN (7 / 8)** | Medium | 7 สกิลไม่มี Category (`""`), 8 สกิลไม่มี `sp` -> ระบุ `UNKNOWN` รอ Config |
| **Non-Monotonic Evolution Stats** | **PASS (0)** | - | ค่าพลังรวม (`sum(s)`) ของร่างจุติ 1 และ 2 สูงกว่าร่างก่อนหน้าเสมอ 100% |
| **Forms without Skills** | **INFO (2)** | Low | ID `423`, `424` (ซาละเปา ร่าง 0) ไม่มีสกิล -> ถูกต้องตามต้นทาง |
| **S1 vs S2 Skill Differences** | **INFO (32 chars)** | Low | 32 ตัวละคร (61 ร่าง) มีสกิลต่างกันระหว่างภาพหน้าจอกับเว็บทางการ -> ยึด Source 02 สำหรับตัวที่มี `b: 1` หรือระบุใน Config |
| **Blank Rows in Source 02 Sheet** | **INFO (3 rows)** | Low | แถวว่าง 3 แถวท้าย Google Sheet -> กรองออกอัตโนมัติใน ETL |

---

## 2. ETL & Normalization Rules for Phase 5 (Database Seeding)

1. **Primary Key Policy:** ใช้ `character_id` (`0`–`428`) จาก Source 01 เป็น Canonical ID, และสร้าง `skill_id` (`1`–`149`) แบบ Deterministic Sort ตามชื่อสกิลภาษาไทย
2. **Text Normalization:** แก้คำผิด `ก่อนกวน` -> `ก่อกวน` ในขั้นตอน ETL พร้อมบันทึก Audit Log
3. **No Hallucinated Data:** ฟิลด์ที่ขาด (`name_en`, `level` ของ ID `420`–`428`, `sp` ของ 8 สกิล) ให้คงค่า `NULL` ในตาราง `characters` / `skills` และใช้ตาราง `game_configurations` หรือ `skill_effects` กำหนดค่าสมดุลเกมแยกต่างหาก
