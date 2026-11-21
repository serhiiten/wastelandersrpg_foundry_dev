# Fonts of the system

Loaded by `css/pust-fonts.css` (listed first in `system.json`); no font comes from the internet (V7, author, 2026-11-21).

| Font | Used for | Licence | Source |
|---|---|---|---|
| Roboto Condensed (variable, weights 400–800) | labels, buttons, headings (`--pu-f-label`) | SIL Open Font License 1.1, `OFL-RobotoCondensed.txt` | Google Fonts (fonts.gstatic.com), project https://github.com/googlefonts/roboto-classic |
| Ubuntu Mono 400, 700, 400 italic | text, fields, numbers (`--pu-f-text`, `--pu-f-num`) | Ubuntu Font Licence 1.0, `UFL-UbuntuMono.txt` | Google Fonts (fonts.gstatic.com), project https://design.ubuntu.com/font |
| Handjet (variable, weights 400–700) | terminal screens, tours (`--pu-f-screen`) | SIL Open Font License 1.1, `OFL-Handjet.txt` | Google Fonts (fonts.gstatic.com), project https://github.com/rosettatype/Handjet |

Files: the `cyrillic` and `latin` subsets of each face as Google Fonts serves them (woff2), fetched 2026-11-21 with the `@font-face` rules copied from Google's CSS (`unicode-range` kept). Licence texts from https://github.com/google/fonts (`ofl/robotocondensed`, `ofl/handjet`, `ufl/ubuntumono`).

The handwritten Marck Script is no longer used (V5, author, 2026-11-21). `fonts/Overseer.ttf` is the stable system's old font, declared in `css/wastelanders.css` and used nowhere.
