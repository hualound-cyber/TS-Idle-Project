# CHARACTER DATABASE REPORT (PHASE 1)

**Primary Source:** Source 01 (`data.js`) + Cross-referenced with Source 02 (`characters` tab)  
**Total Characters:** 429 (ID `0`–`428`)  
**Total Evolution Forms:** 1,139 Forms

---

## 1. Schema & Field Mapping

| Field in Source 01 | Required Game Field | Availability | Notes |
| :--- | :--- | :--- | :--- |
| `id` | `Character ID` | **429 / 429 (100%)** | Integer `0`–`428` (Unique Primary Key) |
| `n` | `Character Name TH` | **429 / 429 (100%)** | พบชื่อภาษาไทยซ้ำกัน 3 คู่ (คนละตัวละคร) |
| `a` | `Alt Name TH` | 31 / 429 (7.2%) | ชื่อสะกดอีกแบบในเว็บทางการ (Source 02) |
| *N/A* | `Character Name EN` | **0 / 429 (0%)** | **ไม่มีในต้นทาง** (ต้องระบุเป็น `UNKNOWN` หรือทำ Localization Table ภายหลัง) |
| `sx` | `Gender` | **429 / 429 (100%)** | `m`: 395, `f`: 32, `o`: 2 (ซาละเปา); มี 11 ตัวที่ระบุ `sg: true` (คาดการณ์จากภาพ) |
| `e` | `Element / Type` | **429 / 429 (100%)** | `fire`: 112, `wind`: 111, `earth`: 104, `water`: 102 |
| `l` | `Level` (Base Capture Lv) | **420 / 429 (97.9%)** | ขาด 9 ตัว (ID `420`–`428`) |
| `f[0]` | `Base Form` | **429 / 429 (100%)** | Stats 6 ค่า `[HP, SP, INT, ATK, DEF, AGI]`, `i` (sprite), `k`/`kn` (skills) |
| `f[1]` | `Rebirth Form 1` | **427 / 429 (99.5%)** | ขาดเฉพาะ ID `426`, `427` ที่มีแค่ร่างเดียว |
| `f[2]` | `Rebirth Form 2 (Max)` | **283 / 429 (66.0%)** | อีก 144 ตัวสูงสุดที่จุติ 1, 2 ตัวไม่มีจุติ |
| `ni` | `Original Image Ref` | **419 / 429 (97.7%)** | ภาพชื่อต้นฉบับจาก Screenshot (`n/{id}.webp`), ขาด ID `420`–`428` + 1 ตัว |

---

## 2. Statistical Breakdown

### 2.1 Element Distribution
- 🔥 **Fire (`fire`):** 112 ตัว (26.1%)
- 🍃 **Wind (`wind`):** 111 ตัว (25.9%)
- ⛰️ **Earth (`earth`):** 104 ตัว (24.2%)
- 💧 **Water (`water`):** 102 ตัว (23.8%)

### 2.2 Evolution Tier Distribution
- **3 Forms (Base -> จุติ 1 -> จุติ 2):** 283 ตัว (66.0%)
- **2 Forms (Base -> จุติ 1):** 144 ตัว (33.6%)
- **1 Form (Base Only):** 2 ตัว (0.4%) — ID `426` (`เจียงซวี่`), ID `427` (`ซวินเจี๋ย`)

### 2.3 Gender Distribution
- **Male (`m`):** 395 ตัว (92.1%)
- **Female (`f`):** 32 ตัว (7.5%)
- **Unspecified (`o`):** 2 ตัว (0.5%) — ID `423` (`ซาละเปาเนื้อ`), ID `424` (`ซาละเปาไข่แดง`)

---

## 3. Cross-Reference: Source 01 vs Source 02

- **Source 02** มีตัวละคร **404 ตัว** (1,085 แถว)
- จับคู่ตรงกันด้วยชื่อไทย (`n` หรือ `a`) ได้ **331 ตัว**
- มี **73 ตัว** ใน Source 02 ที่ชื่อสะกดต่างจาก Source 01 (เช่น `กาเซี่ยง` vs `ก่าเซี่ยง`, `ขงหยง` vs `ขงหรง`) และมี **23 ตัว** ใน Source 01 ที่ไม่มีใน Source 02 (`b: 0`)
- มี **32 ตัว (61 ร่าง)** ที่รายการสกิลระหว่าง Source 01 (ภาพหน้าจอ) กับ Source 02 (เว็บทางการ) แตกต่างกัน
- **ข้อสรุป:** ใช้ **Source 01 ID (`0`–`428`) เป็น Canonical Character ID** และเก็บค่าสกิล/ชื่อสะกดของ Source 02 เป็น Metadata เสริมสำหรับตรวจสอบความถูกต้อง
