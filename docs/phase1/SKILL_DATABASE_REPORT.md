# SKILL DATABASE REPORT (PHASE 1)

**Sources:** Source 01 (`skills_info.js`) & Source 02 (`skills` tab)  
**Total Unique Skills:** 149 Skills (100% Match between Source 01 and Source 02)

---

## 1. Schema & Completeness

| Field | Availability | Range / Values |
| :--- | :--- | :--- |
| **Skill Name (`name`)** | 149 / 149 (100%) | ใช้เป็น Key หลักในต้นทาง (ควรแปลงเป็น Numeric/Slug `skill_id` ใน DB ของเรา) |
| **Skill Icon (`TS_SKICON`)** | 149 / 149 (100%) | 120 Local WebP (`s/1..99`, `x/1..21`) + 29 External PNG จาก Source 02 |
| **Element (`e`)** | 149 / 149 (100%) | `fire` (30), `earth` (30), `wind` (24), `water` (24), `psy` (7), `none` (34) |
| **Category (`t`)** | 142 / 149 (95.3%) | `โจมตี` (99), `สนับสนุน` (32), `ก่อกวน` (5), `ก่อนกวน` (6 - *Typo*), `""` (7 - *UNKNOWN*) |
| **SP Cost (`sp`)** | 141 / 149 (94.6%) | `8` – `120` (มี 8 สกิลที่ `sp: null` -> *UNKNOWN*) |
| **Target (`tg`)** | 149 / 149 (100%) | ข้อความอธิบายเป้าหมาย เช่น `โจมตี 1 เป้า`, `โจมตีทั้งแถว`, `ฟื้นฟู 1 เป้า` |
| **Combo Flag (`cb`)** | 149 / 149 (100%) | `true`: 42 สกิล, `false`: 107 สกิล |
| **Soul/Spirit Flag (`psy`)** | 149 / 149 (100%) | `true`: 42 สกิล (สกิลจิต), `false`: 107 สกิล |
| **Description (`d`)** | 149 / 149 (100%) | คำอธิบายเชิงบรรยาย (Flavor/Effect Text) **ไม่มีสูตร Multiplier ตัวเลขในต้นทาง** |

---

## 2. Character-to-Skill Mapping Validation

- **Normal Skill Icon IDs (`s*`):** ใช้งานจริง 99 IDs -> จับคู่ชื่อใน `TS_SKMAP` ได้ **99 / 99 (100%)**
- **Extra/Spirit Skill Icon IDs (`x*`):** ใช้งานจริง 21 IDs -> จับคู่ชื่อใน `TS_SKMAP` ได้ **21 / 21 (100%)**
- **Unresolved Skill References:** **0 รายการ** (ทุกชื่อสกิลที่อ้างถึงใน `TS_DATA` มีข้อมูลอยู่ใน `TS_SKILLS` ครบทั้ง 149 สกิล)
- **Forms without Skills:** พบ **2 ร่าง** คือ `423` (ซาละเปาเนื้อ ร่าง 0) และ `424` (ซาละเปาไข่แดง ร่าง 0) ซึ่งเป็นตัวละคร Mascot พิเศษ

---

## 3. Data Gaps Requiring Game Design Configuration (UNKNOWN in Source)

ตามกฎ **ห้ามคาดเดาความสามารถของสกิล**:
1. ต้นทางไม่มีค่า **Damage Multiplier (%)**, **Hit Count**, **Status Effect Duration (Turns)**, **Heal Scaling**, หรือ **Cooldown** มีเพียงข้อความบรรยายและ Target (1 เป้า / แถว / ทั้งหมด)
2. สกิล 7 รายการที่มี `t: ""` และ 8 รายการที่มี `sp: null` จะถูกตั้งสถานะใน Import Manifest เป็น `UNKNOWN` และกำหนดค่าสมดุลผ่าน `skill_effects` Configuration Table ใน Phase 2 (Game Design) โดยแยกจากข้อมูลดิบของต้นทางอย่างชัดเจน
