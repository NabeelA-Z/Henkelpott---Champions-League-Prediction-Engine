---
version: 1
slug: "app-src-app-tsx"
primary_target: "app/src/App.tsx"
related_targets: ["app/src/pages/Dashboard.tsx","app/src/styles.css"]
---

## Scope

Whole Henkelpott web app (every route: Dashboard, Predict, Match Center, Live Bracket, Stats, Methodology, About). Visitor mode: Operate (Read for Methodology/About). Fans on phones on matchday nights and on desktop for longer sessions. Every feature, URL contract and copy fact is kept. Must not feel like a betting site. The user pinned the world: "a travel theme: European tour. The site should feature European landmarks, airline tickets for the matches."

## Direction contract

THESIS: Your season is a passport. The app refuses the dark stats-dashboard of cards and neon. It is a navy passport cover for the shell, silver-tinted visa pages for the work, an airline ticket for every match, and rubber entry stamps for every round a club survives.

OWN-WORLD: The shell is navy passport cloth (#0C1A45) with silver foil text. Pages are cool silver paper (#EEF1F5) with a faint guilloche and one hairline grid. Landmarks are real photographs printed as navy duotone ink plates. Tickets are white stock with a dashed perforation and a stub. Stamps are 3px navy outlines set at a slight rotation; eliminated is a red (#B3263A) stamp. Type is Archivo only: condensed 900 caps for display, normal width for UI, tabular figures. Kit colours appear only inside badges.

STORY: Fans see who is favourite to reach Madrid and trust why (the backtest sits beside the claim). Then they follow any club's route stamp by stamp, open each match as a ticket, and build their own passport in Predict.

FIRST VIEWPORT: A navy header bar holds the brand, nav, runs select, as-of switch and primary Run. Below it, an open passport spread. On the left page are the Madrid final's landmark plate, "Favourite to arrive", the club name in condensed caps and its title odds as a large foil figure. On the right page, that club's entry stamps by round, plus one red stamp for its chance of going out early. Under the spread is a row of next-match tickets. Primary action: Run simulation in the header.

FORM: Passport Tour, position 4 on the ordered list (user-pinned travel world with an assigned carrier). seed:5dc82063fd92685c. Signature move: when a run lands, the stamps press in (scale, rotation and blur settle to sharp, staggered). The followed club's route is the only cobalt (#2346C8) line.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- The landmark photos come from Wikimedia Commons, with credits on the About page.
