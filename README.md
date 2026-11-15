# Blackjack Trainer

Offline basic strategy and Hi-Lo card counting drills. Open it in Safari and use **Share > Add to Home Screen**, and it then works without a connection.

Live: https://jakepusateri.github.io/blackjack-trainer/

- **Strategy**: flashcard hands vs a dealer upcard, graded against the chart for the chosen rules; optional Illustrious 18 count plays.
- **Count**: flash cards at casino speed, or a timed deck countdown with one card removed.
- **True count**: running count + discard tray, convert to true count and bet.
- **Table**: a full 6/8-deck shoe with splits, doubles, surrender and insurance; grades every decision and bet, and quizzes the running count.
- **Chart**: the strategy chart, index plays, bet ramp and nearby table conditions.

Plain static files, no build. `logic.js` holds all game rules and strategy; `node test/sim.js 20000000` plays millions of hands to check the engine against published house edges.

Changing any cached file: bump `CACHE` in `sw.js`.
