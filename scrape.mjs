// FC Hatvan – Leány U14 adatgyűjtő az MLSZ adatbankból.
// Futtatás:  node scrape.mjs        → frissíti a data.js fájlt
// A fotók és nyilatkozatok a content.js-ben vannak, azokat ez a szkript nem írja felül.

import { writeFile, readFile } from 'node:fs/promises';

const BASE = 'https://adatbank.mlsz.hu';
const SEASON = '67/0/34381';          // bajnokság azonosító (Leány Reg. HNP U-14 ÉK csoport)
const CLUB_ID = '335730';             // FC HATVAN
const TEAM = 'FC HATVAN';

const LOGOS = {
  'FC HATVAN': 'hatvan.jpg', 'BVSC - ZUGLÓ': 'bvsc.png', 'DVSC-DEAC': 'dvsc.png', 'DVTK': 'dvtk.png',
  'EGER SE': 'eger.jpg', 'GÖDÖLLŐI SK': 'godollo.png', 'KISTIGRISEK USE': 'kistigrisek.png',
  'KOLORCITY KAZINBARCIKA SC': 'kazincbarcika.png', 'MEZŐKÖVESD ZSÓRY FC KFT.': 'mezokovesd.png',
  'NYÍREGYHÁZA SPARTACUS FC': 'nyiregyhaza.gif', 'UTE': 'ute.jpg', 'VÁRDA SPORT EGYESÜLET KISVÁRDA': 'kisvarda.png',
};

const ent = s => s.replace(/&nbsp;/g, ' ').replace(/&apos;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const clean = s => ent((s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const get = async url => { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.text(); };
const between = (h, a, b, from = 0) => { const i = h.indexOf(a, from); if (i < 0) return ''; const j = h.indexOf(b, i + a.length); return h.slice(i, j < 0 ? undefined : j); };

function parseLineup(block) {
  const out = { players: [], subs: [], coach: '' };
  const [main, rest = ''] = block.split('match_table_subhead">CSERÉK');
  const [subs, coachPart = ''] = rest.split('VEZETŐEDZŐ');
  const rows = h => [...h.matchAll(/<tr class="template-tr-selectable">([\s\S]*?)<\/tr>/g)].map(m => {
    const num = clean((m[1].match(/class="playerNum">([^<]*)</) || [])[1]);
    const name = clean((m[1].match(/match_players_name">\s*<a[^>]*title="([^"]*)"/) || [])[1]);
    return { n: num, name };
  }).filter(p => p.name);
  out.players = rows(main); out.subs = rows(subs);
  out.coach = clean((coachPart.match(/class="match_table_coach">([\s\S]*?)<\/td>/) || [])[1]);
  return out;
}

function parseMatch(h) {
  const h2 = [...h.matchAll(/<h2 class="pointer">([^<]*)<\/h2>/g)].map(m => clean(m[1]));
  const home = clean((h.match(/class="homeTeam[^>]*>([^<]*)</) || [])[1]) || h2[0] || '';
  const away = clean((h.match(/class="guestTeam[^>]*>([^<]*)</) || [])[1]) || h2[1] || '';
  const res = between(h, 'class="match-result"', '</div>');
  const sc = clean((res.match(/<span>([^<]*)<\/span>/) || [])[1]).match(/(\d+)\s*-\s*(\d+)/);
  const dateBlock = between(h, 'class="match_data_date"', 'right-datas');
  const dt = clean(dateBlock).match(/(\d{4}\.\d{2}\.\d{2}) - (\d{2}:\d{2})/);
  const venue = clean((dateBlock.match(/<\/p>\s*<p>([^<]*)<\/p>/) || [])[1]);
  const ref = clean((between(h, 'Játékvezető</div>', '</div>', 0).match(/datas">([\s\S]*)/) || [])[1]);
  // Események az idővonalból: felső sor (top 2x px) = hazai, alsó (top 5x px) = vendég
  const events = [...h.matchAll(/top:\s*(\d+)px;">\s*<img src="[^"]*event_([a-z_]+)\.png" title="([^"]*)"/g)].map(m => {
    const side = +m[1] < 40 ? 'h' : 'a';
    const t = clean(m[3]);
    const min = parseInt(t, 10);
    let type = m[2], name = t.replace(/^\d+'\+?\d*'?,?\s*/, '');
    let ev = { side, type, min, text: name };
    const sw = name.match(/Le:\s*(.*?)\s*Be:\s*(.*)$/);
    if (sw) ev = { side, type: 'swap', min, out: sw[1], in: sw[2] };
    else ev.name = name.replace(/^(Gól|Öngól|Büntetőből gól|Sárga lap|Piros lap|[^ ]+ lap)\s*/i, '').trim();
    return ev;
  }).sort((a, b) => a.min - b.min);
  const lb = between(h, 'class="left_team rankings2-row"', 'id="right_team"');
  const rb = between(h, 'id="right_team"', 'class="team_tabella"');
  return {
    home, away,
    hs: sc ? +sc[1] : null, as: sc ? +sc[2] : null,
    date: dt ? dt[1] : '', time: dt ? dt[2] : '', venue, ref,
    events, lh: parseLineup(lb), la: parseLineup(rb),
  };
}

function parseTable(h) {
  const panel = between(h, 'id="tabella_panel"', '</table>');
  return [...panel.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(m => [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(c => clean(c[1])))
    .filter(r => r.length > 10 && /^\d+$/.test(r[0]))
    .map(r => { const c = r.filter(x => x !== ''); return { pos: +c[0], team: c[1], m: +c[2], w: +c[3], d: +c[4], l: +c[5], gf: +c[6], ga: +c[7], gd: +c[8], pts: +c[9] }; });
}

function parseScorers(h) {
  const box = between(h, 'Góllövő lista', 'Sárga lapok', h.indexOf('Sorsolás'));
  const all = between(h, 'Góllövő lista', 'FŐSZPONZORAINK', h.lastIndexOf('Játékoskeret'));
  return [...clean(all).matchAll(/\d+\s+([A-ZÁÉÍÓÖŐÚÜŰ][A-ZÁÉÍÓÖŐÚÜŰ\- ]+?)\s+FC HATVAN\s+(\d+)/g)].map(m => ({ name: m[1].trim(), goals: +m[2] }));
}

// A klub oldalán minden meccs egy <div class="schedule" rel="ID"> blokk; a klub-linkekben ott a forduló száma.
const club1 = await get(`${BASE}/club/${SEASON}/1/${CLUB_ID}.html`);
const fixtures = new Map();
for (const b of club1.split('<div class="schedule ').slice(1)) {
  const block = b.slice(0, b.indexOf('team_sorsolas_arena') + 400);
  if (!block.includes(`/${CLUB_ID}.html`)) continue;
  const id = (block.match(/rel="(\d+)"/) || [])[1];
  const round = +(block.match(new RegExp(`/club/${SEASON}/(\\d+)/`)) || [])[1];
  if (!id || !round || fixtures.has(id)) continue;
  const titles = [...block.matchAll(/class="(home|away)_team"><a[^>]*title="([^"]*)"/g)].map(m => clean(m[2]));
  fixtures.set(id, {
    id, round, hasPage: block.includes(`/match/${SEASON}/${round}/${id}.html`),
    home: titles[0], away: titles[1],
    date: clean((block.match(/team_sorsolas_date">([\s\S]*?)<\/div>/) || [])[1]).replace(/<[^>]+>/g, ''),
    venue: clean((block.match(/team_sorsolas_arena">([\s\S]*?)<\/div>/) || [])[1]),
  });
}
if (!fixtures.size) throw new Error('Nem találtam Hatvan-meccseket a klub oldalán – változott az adatbank szerkezete?');

const matches = [];
for (const f of [...fixtures.values()].sort((a, b) => a.round - b.round)) {
  const url = `${BASE}/match/${SEASON}/${f.round}/${f.id}.html`;
  let m;
  if (f.hasPage) m = parseMatch(await get(url));
  else {               // még nincs meccsoldal (pl. tavaszi forduló): az alapadatok a sorsolásból
    const d = f.date.match(/(\d{4})\. (\d{2})\. (\d{2})\.\s*(\d{2}:\d{2})?/);
    m = { home: f.home, away: f.away, hs: null, as: null, date: d ? `${d[1]}.${d[2]}.${d[3]}` : '', time: d?.[4] || '',
          venue: f.venue, ref: '', events: [], lh: { players: [], subs: [], coach: '' }, la: { players: [], subs: [], coach: '' } };
  }
  matches.push({ round: f.round, id: f.id, url, ...m });
  process.stdout.write(`${f.round}. ${m.home} ${m.hs ?? '-'}:${m.as ?? '-'} ${m.away}\n`);
}
const lastPlayed = Math.max(1, ...matches.filter(m => m.hs != null).map(m => m.round));
const club = await get(`${BASE}/club/${SEASON}/${lastPlayed}/${CLUB_ID}.html`);
const table = parseTable(club);
const scorers = parseScorers(club);
if (!table.length) throw new Error('Üres tabella – nem írom felül a data.js-t');

const data = {
  updated: new Date().toISOString(),
  league: 'MLSZ Leány Regionális HNP U-14 Észak-Keleti csoport',
  leagueUrl: `${BASE}/league/${SEASON}/${lastPlayed}.html`,
  team: TEAM, logos: LOGOS, table, scorers, matches,
};
const file = new URL('./data.js', import.meta.url);
const strip = d => JSON.stringify({ ...d, updated: undefined });
let old = null;
try { const w = {}; new Function('window', await readFile(file, 'utf8'))(w); old = w.HATVAN_DATA; } catch { /* még nincs data.js */ }
if (old && strip(old) === strip(data)) {
  console.log(`\nNincs változás (${matches.length} meccs) – a data.js marad.`);
} else {
  await writeFile(file, `// Automatikusan generálva: node scrape.mjs  (${data.updated})\nwindow.HATVAN_DATA = ${JSON.stringify(data, null, 1)};\n`, 'utf8');
  console.log(`\nKész: ${matches.length} meccs, ${table.length} csapat a tabellán, ${scorers.length} góllövő → data.js frissítve`);
}
