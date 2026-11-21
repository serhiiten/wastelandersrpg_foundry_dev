# Звуки подій (V4): походження кожного файлу

Звуки грає `module/helpers/sfx.mjs` (каналом інтерфейсу Foundry, гучність — повзунок Interface на вкладці Playlists; вимикає налаштування клієнта «Звуки подій»). Рішення: `docs/decisions/battle.md`, розділ «Event sounds (V4)» у робочій теці проєкту. Кожен файл має ліцензію CC0 (Creative Commons Zero, https://creativecommons.org/publicdomain/zero/1.0/). Тексти ліцензій пакетів лежать поруч: `LICENSE-kenney-*.txt`.

| Файл | Подія | Джерело | Автор | Ліцензія | Посилання | Отримано |
|---|---|---|---|---|---|---|
| `bong_001.ogg` | нове коло дій («Почалося коло дій») | Kenney «Interface Sounds» 1.0 (11-02-2020), `Audio/bong_001.ogg`, без змін | Kenney (www.kenney.nl) | CC0 | https://kenney.nl/assets/interface-sounds | 2026-11-21, архів 834 536 байт |
| `glass_004.ogg` | витрачено жетон Долі | те саме, `Audio/glass_004.ogg` | Kenney | CC0 | https://kenney.nl/assets/interface-sounds | 2026-11-21 |
| `confirmation_004.ogg` | критичний успіх перевірки | те саме, `Audio/confirmation_004.ogg` | Kenney | CC0 | https://kenney.nl/assets/interface-sounds | 2026-11-21 |
| `minimize_006.ogg` | хтось вибуває (картка шкоди з «вибуває») | те саме, `Audio/minimize_006.ogg` | Kenney | CC0 | https://kenney.nl/assets/interface-sounds | 2026-11-21 |
| `chips-collide-3.ogg` | Кришки (картка торгівлі каравану) | Kenney «Casino Audio» 1.1, `Audio/chips-collide-3.ogg`, без змін | Kenney Vleugels (Kenney.nl) | CC0 | https://kenney.nl/assets/casino-audio | 2026-11-21, архів 876 839 байт |
| `geiger.wav` | шкода радіацією (лічильник Гейгера) | синтезовано скриптом `tools/make-geiger.mjs` (випадкові клацання, фіксоване зерно) | проєкт «Пустельники» | CC0 | — | 2026-11-21 |

Замінити звук: поклади новий файл сюди, допиши рядок у цю таблицю (джерело, автор, ліцензія лише CC0, посилання) і зміни назву в `SFX` у `module/helpers/sfx.mjs`.
