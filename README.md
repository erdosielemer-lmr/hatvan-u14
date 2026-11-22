# FC Hatvan Leány U14 – csapatapp

Telepíthető webapp (PWA) az FC Hatvan leány U14 csapatának fordulóiról: eredmények, gólszerzők, cserék,
összeállítások (jegyzőkönyv), csapatképek, nyilatkozatok, tabella, góllövők.
Az adatok forrása az [MLSZ adatbank](https://adatbank.mlsz.hu/club/67/0/34381/11/335730.html).

## Hogyan frissül?

Semmit nem kell tenni. A GitHub Action (`.github/workflows/frissites.yml`) naponta négyszer letölti az
új eredményeket. Ha változott valami, menti a `data.js`-t, és újra közzéteszi az oldalt. Fotó vagy
nyilatkozat feltöltése után is magától újraépül, pár perc alatt.

Kézi indítás: **Actions → Frissítés és közzététel → Run workflow**.

## Fotók és nyilatkozatok

Lásd: [fotok/README.md](fotok/README.md). Röviden: a képet a megfelelő `fotok/fordulo-XX` mappába kell
feltölteni a GitHub weboldalán (**Add file → Upload files**), a nyilatkozatot pedig egy `nyilatkozat.txt`
fájlba kell írni ugyanott.

## Fájlok

| Fájl | Mit csinál |
|---|---|
| `app.html` | Az app felülete (HTML/CSS/JS) |
| `scrape.mjs` | Letölti az adatokat az MLSZ adatbankból → `data.js` |
| `build.mjs` | Összerakja a kész oldalt → `dist/` (fotókkal, nyilatkozatokkal) |
| `content.js` | Kézi beállítások (kiemelt játékos) |
| `pwa/` | Telepíthetőség: manifest, service worker (offline működés) |
| `android/`, `build-apk.ps1` | Opcionális Android APK (a webapp mellett nem szükséges) |

Helyi kipróbálás: `node scrape.mjs`, `node build.mjs`, `node serve.mjs` → http://localhost:5174

## Új idény

A `scrape.mjs` elején a `SEASON` (bajnokság azonosító) és a `CLUB_ID` értékét kell átírni
az adatbank új idényhez tartozó linkje alapján. Új fordulómappát a `fotok/` alatt kell létrehozni, ha 22-nél több forduló lesz.
