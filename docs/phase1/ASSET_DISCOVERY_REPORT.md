# ASSET DISCOVERY REPORT (PHASE 1)

**Verification Date:** 2026-11-25  
**Scope:** Source 01 (`coruscating-basbousa-fa686e.netlify.app`) & Source 02 (`tsonlineclassic.com`)

---

## 1. Source 01 Asset Inventory (1,678 Files Verified)

ระบบได้ทดสอบการเข้าถึงไฟล์รูปภาพทั้งหมด **1,678 ไฟล์** ผ่าน HTTP `HEAD` (IPv4 Keep-Alive):
- **Result:** **1,678 / 1,678 (100%) HTTP 200 OK**
- **Format:** 100% `image/webp`
- **Total Size:** **4.16 MB** (น้ำหนักเบามาก เหมาะกับการโหลดบนเว็บ/มือถือ)

| Asset Category | Path Pattern | Count | Sample Dimensions | Color Mode | Notes |
| :--- | :--- | :---: | :--- | :--- | :--- |
| **Character Sprites** | `sp/{id}_{form}.webp` | **1,139** | ~129 × 131 px | RGBA (Transparent) | ครบทุกตัวและทุกร่าง (429 ตัว, 1,139 ร่าง) |
| **Nameplate Images** | `n/{id}.webp` | **419** | ~83 × 13 px | RGBA (Transparent) | ขาด ID `420`–`428` และ 1 ตัว |
| **Normal Skill Icons** | `s/{1..99}.webp` | **99** | ~43 × 43 px | RGB | ครบตาม `TS_SKMAP` |
| **Spirit Skill Icons** | `x/{1..21}.webp` | **21** | ~43 × 43 px | RGB / RGBA | ครบตาม `TS_SKMAP` |

> **หมายเหตุเรื่อง "ภาพหน้าจอต้นฉบับ 107 ไฟล์":** ข้อความใน Footer ของ Source 01 (`ข้อมูลจากภาพหน้าจอ 107 ไฟล์`) หมายถึงภาพหน้าจอเกมที่ผู้จัดทำเว็บไซต์ใช้ OCR/ตัดภาพเพื่อสร้างเป็นไฟล์ `sp/`, `n/`, `s/`, `x/` ทั้ง 1,678 ไฟล์นี้ ไม่ได้เปิดเผยไฟล์ภาพหน้าจอดิบ 107 ไฟล์บนเซิร์ฟเวอร์สาธารณะ

---

## 2. Source 02 Asset Inventory (Sample Verified)

- **Character Portraits:** PNG ใน `wp-content/uploads/2026/10/{thai_name}.png` — ทดสอบ `โจโฉ.png`: `128 × 128 px`, RGBA, 4.8 KB
- **Skill Icons:** PNG ใน `wp-content/uploads/2026/10/{skill_name}.png` — ทดสอบ `กระบี่ไฟบิน.png`: `64 × 64 px`, RGBA, 9.9 KB
- **Element Icons:** `assets/img/theme/element/{earth,water,wind,fire}.png` (20×20 / Static Theme)

---

## 3. Copyright & Production Asset Strategy

1. **สิทธิ์การใช้งาน:** ภาพ Sprite และ Skill Icon ต้นฉบับเป็นลิขสิทธิ์ของ Chinese Gamer / Asphere Innovations
2. **แนวทางสำหรับ TS Legends — Idle RPG:**
   - **Original Assets & Placeholders:** ในโปรเจกต์เกมจริง เราจะสร้าง **Original Placeholder & Procedural/Vector SVG/Canvas Assets** (หรือ Original Pixel/2D Sprites ที่สร้างขึ้นใหม่) และจัดทำ `asset_manifest.json` ที่ผูก `Character ID (0..428)` และ `Skill ID (1..149)` เข้ากับ Asset Hash/Versioned Path
   - **Reference Mapping:** เก็บ `original_image_ref` (path อ้างอิงต้นทาง) ไว้ใน Metadata สำหรับการเปรียบเทียบภายในเท่านั้น ไม่นำภาพมีลิขสิทธิ์มา Deploy ใน Production Client
