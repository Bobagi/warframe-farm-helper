<div align="center">

# Warframe Farm Helper

### Where to farm anything in Warframe, without opening five tabs.

**[⮞ Open the site: warframe.bobagi.space](https://warframe.bobagi.space)**

English · Português · Español · Русский · 简体中文

</div>

![The home page, with the search bar on top, the world cycles and the list of what you can farm right now](docs/screenshots/home.png)

## The problem

You want the Braton Prime. Here we go: one tab to find which relics drop each part, another to
check whether those relics still drop or went into the vault, another to see if there is a fissure
of the right tier open right now, and one more for the platinum price. By the time you put it all
together you forgot what you were doing.

This site answers all of that in one search.

## Type what you want

An item, a part, a relic, a resource, a game mechanic or a Nightwave act. Search is fuzzy, ignores
accents, and takes English and Portuguese mixed together.

![Search suggesting Braton Prime and its parts while you type](docs/screenshots/busca.png)

## And it gives you the whole path

Not a raw drop table. The answer in the order you are going to do it: where the blueprint comes
from, what the foundry costs, and what to farm first.

![Braton Prime page showing how to get it, the crafting cost and the mastery requirement](docs/screenshots/passo-a-passo.png)

![Numbered step by step telling which relic to farm for each part and where that relic drops](docs/screenshots/steps.png)

## Available or vaulted, no guessing

This is the part that hurts. Each component lists the relics that **still drop** at the top, with
intact and radiant chances and how many fissures of that tier are open right now. Vaulted ones are
kept separate, and the ones that came back through Prime Resurgence are tagged **at Varzia**,
because those you can get today, with Aya.

![Relic table separating available relics from vaulted ones, with the ones on sale at Varzia tagged](docs/screenshots/reliquias.png)

## The live state of the game

The fissures open this minute with a countdown, split into normal, Steel Path and Railjack. The
Cetus, Vallis, Deimos, Duviri and Zariman cycles sit at the top of every page, next to Baro.

![List of active Void Fissures with time remaining](docs/screenshots/fissuras.png)

## Nightwave, act by act

This week's acts, each one with a guide on how to do it. Including the ones nobody explains
properly: destroying a Crewship with the Forward Artillery, the Duviri enigmas, the Necramech vault
guardians.

![This week's Nightwave acts, each with its matching guide](docs/screenshots/nightwave.png)

## It fits on a phone

Which is where you will actually look at it, with the game running on the other screen.

<div align="center">
  <img src="docs/screenshots/mobile.png" alt="The site on a phone, showing a resource page" width="330">
</div>

## Five languages, and the Chinese one is real

Switch with the flag at the top. Anyone opening the site from CN, TW, HK, MO or SG lands on Chinese
already.

In Chinese the names come from the official CN client naming, not from machine translation: the
site says 突变原聚合物, not "Mutagen Mass". Search works in Chinese too, the articles are
translated, and the typography was adjusted for CJK.

![The same item page in Chinese, with names, step by step and relics translated](docs/screenshots/chines.png)

## Also in there

- **Mechanics FAQ**: what to do with weapons you no longer use, when to spend Forma and potatoes,
  how to get platinum without paying, what Steel Path is, ducats and Baro, and a dozen more.
- **Where to farm resources**, not just prime parts: Neurodes, Vainthorn, Archon Shards, syndicate
  currencies.
- **Clan Dojo research**: which lab, how much it costs and which materials, for everything the clan
  can research.
- **Platinum price** from warframe.market on the item page, so you can decide between farming and
  buying.
- Works with **no account, no login and no tracking cookies**.

## Where the data comes from

- **Items and drops**: [WFCD/warframe-items](https://github.com/WFCD/warframe-items), which packages
  Digital Extremes' official drop tables. Re-ingested daily.
- **Clan research, vendors and Market prices**: the official wiki data modules.
- **Live game state** (fissures, Nightwave, Baro, cycles, Varzia):
  [warframestat.us](https://api.warframestat.us), queried on every request.
- **Trading prices**: [warframe.market](https://warframe.market).

## Found something wrong?

A drop that changed, an odd translation, an item missing from search:
[open an issue](https://github.com/Bobagi/warframe-farm-helper/issues). Chinese support got added
that way.

## For developers

How to run it, update the data and deploy: **[docs/DEV.md](docs/DEV.md)**.

Node 22, Express, SQLite and a vanilla front end with no framework. The whole thing runs in one
container.

## License and disclaimer

MIT, see [LICENSE](LICENSE).

Unofficial fan site, not affiliated with Digital Extremes. Warframe and the Warframe logo are
trademarks of Digital Extremes Ltd.
