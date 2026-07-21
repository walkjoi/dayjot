# Bundled fonts

Every file here ships inside the app bundle; nothing is fetched at runtime.
All families are licensed under the [SIL Open Font License 1.1](https://openfontlicense.org),
which permits bundling and redistribution inside this MIT-licensed app. The
fonts themselves remain under the OFL, not MIT.

| Family | Files | Version | Source | Role |
| --- | --- | --- | --- | --- |
| Inter | `InterVariable*.woff2` | 4.0 | [rsms/inter](https://github.com/rsms/inter) | The interface font (`--font-sans`) |
| LXGW WenKai Screen 霞鹜文楷 | `LXGWWenKaiScreen.woff2` | 1.522 | [lxgw/LxgwWenkai-Screen](https://github.com/lxgw/LxgwWenkai-Screen) | Note font (default): screen-tuned kaiti, one face for Latin + CJK |
| Noto Serif SC 思源宋体 | `NotoSerifSC-VF.woff2` (wght 200–900) | 2.003 | [google/fonts](https://github.com/google/fonts/tree/main/ofl/notoserifsc) | Note font: Source Han Serif in Google's variable build |
| Literata | `Literata-VF.woff2`, `Literata-Italic-VF.woff2` (opsz 7–72, wght 200–900) | 3.103 | [googlefonts/literata](https://github.com/googlefonts/literata) | Note font (Latin only): long-form reading serif; CJK falls back to the system font |
| iA Writer Quattro S | `iAWriterQuattroS-*.woff2` | 2.000 | [iaolo/iA-Fonts](https://github.com/iaolo/iA-Fonts) | Note font (Latin only): humanist duospace; CJK falls back to the system font |

The woff2 files are straight `fonttools ttLib.woff2 compress` conversions of
the upstream TTFs — no subsetting, so CJK coverage stays complete (names and
rare characters in a journal must not fall out of the font).
