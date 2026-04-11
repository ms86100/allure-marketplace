

## Expand Theme Presets: Add 80+ Missing Indian State & Regional Festivals

### Current State
- **199 presets** exist in `banner_theme_presets` (lines 4-202 of seed migration)
- Coverage is strong for major national festivals, item categories, seasonal/sale themes, and regional cuisines
- **Missing**: ~80 state-specific, regional, tribal, and cultural festivals from the user's comprehensive list

### What's Missing (Grouped)

**South India (15)**
Mysuru Dasara, Thrissur Pooram, Vallamkali (Boat Race), Karaga, Mahamastakabhisheka, Hampi Utsav, Natyanjali Festival, Sammakka Saralamma Jatara, Konark Dance Festival, Narali Purnima, Banganga Festival, Deccan Festival, Visakha Utsav

**North India (12)**
Kumbh Mela, Ramlila, Ganga Mahotsav, Ganga Dussehra, Nanda Devi Raj Jat, Kullu Dussehra, Hola Mohalla, Gangaur, Pushkar Camel Fair, Desert Festival (Jaisalmer), Mewar Festival, Qutub Festival

**East & Northeast India (25)**
Kali Puja, Poush Mela, Bastar Dussehra, Sarhul, Karam Utsav, Tusu Parab, Bihula, Rajgir Mahotsav, Yaoshang, Cheiraoba, Ningol Chakouba, Nongkrem Dance, Shad Suk Mynsiem, Mim Kut, Pawl Kut, Moatsu Mong, Sekrenyi, Tuluni, Kharchi Puja, Garia Puja, Buisu, Baishagu, Dehing Patkai, Reh, Boori Boot, Myoko, Dree, Mopin, Solang

**West India (8)**
Goa Carnival, Shigmo, Rann Utsav, Uttarayan, Bhagoria Haat, Sunburn Festival

**Himalayan & UT (12)**
Hemis (exists), Dosmoche, Sindhu Darshan, Ladakh Harvest, Pang Lhabsol, Tihar, Halda, Sazo, Bahu Mela, Har Navami, Rose Festival, Island Tourism Festival, Phool Walon Ki Sair, Subhash Mela

**Other Religious/Cultural (5)**
Maghi Purnima, Gugga Naumi, Rohini, Lokrang Festival, Khajuraho Dance Festival, Tansen Music Festival, Bastille Day (Puducherry)

### Plan

**Single migration file** that INSERTs ~85 new presets into `banner_theme_presets`. Each preset follows the exact same structure as existing ones:
- `preset_key` (snake_case, unique)
- `label`, `icon_emoji`
- `colors` JSON with gradient + bg
- `animation_defaults` JSON with type + intensity (using the 65 animation types now available)
- `suggested_sections` JSON array with 4 relevant product categories
- `is_active = true`

Uses `INSERT ... ON CONFLICT (preset_key) DO NOTHING` to be idempotent — won't duplicate if run twice.

**No frontend changes needed** — the admin preset picker already loads all presets from DB dynamically.

### Result
- **~280 total presets** covering every festival from the user's list
- Every Indian state and UT represented
- Tribal, harvest, cultural, and regional festivals all included
- Fully searchable via the enhanced preset search (label + suggested_sections)

### Files Changed
| File | Change |
|------|--------|
| New migration SQL | INSERT ~85 new regional/state festival presets |

