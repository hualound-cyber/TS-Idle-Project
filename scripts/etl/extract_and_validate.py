#!/usr/bin/env python3
"""
Phase 1 -> Phase 5 ETL & Validation Script
Normalizes Source 01 & Source 02 snapshots into deterministic seed JSONs:
  - data/seed/skills.json (149 skills, skill_id 1..149)
  - data/seed/characters.json (429 characters, 1,139 evolution forms)
  - data/seed/asset_manifest.json (versioned original placeholder + source refs)
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / 'data' / 'raw'
SEED = ROOT / 'data' / 'seed'


def load_s1():
    d_txt = (RAW / 'source1_data.js').read_text(encoding='utf-8')
    ts_data = json.loads(re.search(r'window\.TS_DATA\s*=\s*(\[.*\])\s*;?\s*$', d_txt, re.S).group(1))
    s_txt = (RAW / 'source1_skills_info.js').read_text(encoding='utf-8')

    def extract_obj(name):
        return json.loads(re.search(rf'window\.{name}\s*=\s*(\{{.*?\}})\s*;', s_txt, re.S).group(1))

    return ts_data, extract_obj('TS_SKILLS'), extract_obj('TS_SKMAP'), extract_obj('TS_SKICON')


def normalize_skill_category(raw_cat: str) -> str:
    cat = (raw_cat or '').strip()
    if cat == 'ก่อนกวน':
        return 'ก่อกวน'
    if not cat:
        return 'UNKNOWN'
    return cat


def determine_rarity(max_forms: int, max_total_stat: int, base_level) -> str:
    # Deterministic rarity tier based on evolution potential & total stats (p95=442, p80=391, p50=338)
    if max_forms >= 3 and max_total_stat >= 440:
        return 'SSR'
    if max_forms >= 3 and max_total_stat >= 385:
        return 'SR'
    if max_forms >= 2 and max_total_stat >= 320:
        return 'R'
    return 'N'


def main():
    SEED.mkdir(parents=True, exist_ok=True)
    ts_data, ts_skills, ts_skmap, ts_skicon = load_s1()

    # 1. Build deterministic skills.json (sorted by Thai name)
    sorted_skill_names = sorted(ts_skills.keys())
    skill_name_to_id = {}
    skills_out = []
    for idx, name in enumerate(sorted_skill_names, start=1):
        info = ts_skills[name]
        skill_name_to_id[name] = idx
        cat_th = normalize_skill_category(info.get('t', ''))
        cat_en_map = {
            'โจมตี': 'ATTACK',
            'สนับสนุน': 'SUPPORT',
            'ก่อกวน': 'DISRUPT',
            'UNKNOWN': 'UNKNOWN',
        }
        skills_out.append({
            'skill_id': idx,
            'name_th': name,
            'name_en': None,  # Not provided in sources
            'element': info.get('e', 'none'),
            'category_th': cat_th,
            'category': cat_en_map.get(cat_th, 'UNKNOWN'),
            'sp_cost': info.get('sp'),  # None if missing in source (8 skills)
            'target_desc_th': info.get('tg') or 'UNKNOWN',
            'is_combo': bool(info.get('cb', False)),
            'is_spirit': bool(info.get('psy', False)),
            'description_th': info.get('d') or 'UNKNOWN',
            'original_icon_ref': ts_skicon.get(name),
            'asset_key': f'skill_{idx:03d}',
        })

    # 2. Build characters.json (ID 0..428)
    characters_out = []
    total_forms = 0
    for c in sorted(ts_data, key=lambda x: x['id']):
        cid = c['id']
        forms_out = []
        max_total = 0
        for fi, f in enumerate(c['f']):
            total_forms += 1
            s = f['s']  # [HP, SP, INT, ATK, DEF, AGI]
            stat_sum = sum(s)
            if stat_sum > max_total:
                max_total = stat_sum

            # Resolve skills using canonical Source 01 mapping (and web list w if present)
            skill_ids = []
            if f.get('kn'):
                for sn in f['kn']:
                    sid = skill_name_to_id.get(sn)
                    if sid and sid not in skill_ids:
                        skill_ids.append(sid)
            else:
                for k in f.get('k', []):
                    sn = ts_skmap.get(f's{k}')
                    if sn and sn in skill_name_to_id:
                        sid = skill_name_to_id[sn]
                        if sid not in skill_ids:
                            skill_ids.append(sid)
                if f.get('x') is not None:
                    sn = ts_skmap.get(f"x{f['x']}")
                    if sn and sn in skill_name_to_id:
                        sid = skill_name_to_id[sn]
                        if sid not in skill_ids:
                            skill_ids.append(sid)

            web_skill_ids = []
            for wn in (f.get('w') or []):
                sid = skill_name_to_id.get(wn)
                if sid and sid not in web_skill_ids:
                    web_skill_ids.append(sid)

            forms_out.append({
                'evolution_stage': fi,  # 0=Base, 1=Rebirth 1, 2=Rebirth 2
                'form_name_th': ['ร่างปกติ', 'จุติ 1', 'จุติ 2'][fi] if fi < 3 else f'ร่าง {fi}',
                'base_hp': s[0],
                'base_sp': s[1],
                'base_int': s[2],
                'base_atk': s[3],
                'base_def': s[4],
                'base_agi': s[5],
                'total_power': stat_sum,
                'skill_ids': skill_ids,
                'web_skill_ids': web_skill_ids if web_skill_ids else None,
                'original_sprite_ref': f.get('i'),
                'asset_key': f'char_{cid:03d}_f{fi}',
            })

        rarity = determine_rarity(len(forms_out), max_total, c.get('l'))
        characters_out.append({
            'character_id': cid,
            'name_th': c['n'],
            'alt_name_th': c.get('a'),
            'name_en': None,  # Not provided in sources
            'element': c['e'],
            'gender': c.get('sx', 'o'),
            'gender_estimated': bool(c.get('sg', False)),
            'capture_level': c.get('l'),  # None for IDs 420..428
            'max_evolution_stage': len(forms_out) - 1,
            'rarity': rarity,
            'in_official_web': bool(c.get('b', 0)),
            'original_nameplate_ref': c.get('ni'),
            'evolutions': forms_out,
        })

    # 3. Asset Manifest
    manifest = {
        'version': '1.0.0',
        'asset_policy': 'original_procedural_svg_with_source_ref',
        'characters_count': len(characters_out),
        'forms_count': total_forms,
        'skills_count': len(skills_out),
        'characters': {
            str(ch['character_id']): {
                'element': ch['element'],
                'rarity': ch['rarity'],
                'forms': {
                    str(ev['evolution_stage']): {
                        'asset_key': ev['asset_key'],
                        'original_ref': ev['original_sprite_ref'],
                    }
                    for ev in ch['evolutions']
                },
            }
            for ch in characters_out
        },
        'skills': {
            str(sk['skill_id']): {
                'asset_key': sk['asset_key'],
                'element': sk['element'],
                'category': sk['category'],
                'original_ref': sk['original_icon_ref'],
            }
            for sk in skills_out
        },
    }

    (SEED / 'skills.json').write_text(json.dumps(skills_out, ensure_ascii=False, indent=2), encoding='utf-8')
    (SEED / 'characters.json').write_text(json.dumps(characters_out, ensure_ascii=False, indent=2), encoding='utf-8')
    (SEED / 'asset_manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')

    # Validation Assertions
    assert len(characters_out) == 429, f'Expected 429 characters, got {len(characters_out)}'
    assert total_forms == 1139, f'Expected 1139 forms, got {total_forms}'
    assert len(skills_out) == 149, f'Expected 149 skills, got {len(skills_out)}'
    assert len({c['character_id'] for c in characters_out}) == 429, 'Duplicate character IDs!'
    assert len({s['skill_id'] for s in skills_out}) == 149, 'Duplicate skill IDs!'
    for c in characters_out:
        for ev in c['evolutions']:
            for sid in ev['skill_ids']:
                assert 1 <= sid <= 149, f'Invalid skill_id {sid}'

    rarity_counts = {}
    for c in characters_out:
        rarity_counts[c['rarity']] = rarity_counts.get(c['rarity'], 0) + 1

    print(f'ETL SUCCESS: {len(characters_out)} characters, {total_forms} forms, {len(skills_out)} skills')
    print(f'Rarity distribution: {rarity_counts}')


if __name__ == '__main__':
    main()
