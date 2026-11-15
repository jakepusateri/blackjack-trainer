// Monte Carlo check of the engine + strategy against published house edges.
const BJ = require('../logic.js');
function run(rules, hands, counting) {
  const shoe = new BJ.Shoe(rules.decks, 0.75);
  let won = 0, wagered = 0, n = 0, sq = 0;
  for (let i = 0; i < hands; i++) {
    if (shoe.needsShuffle()) shoe.shuffle();
    const tc = counting ? shoe.tc() : null;
    const bet = counting ? BJ.rampUnits(tc) : 1;
    const r = new BJ.Round(shoe, rules, bet).start();
    if (r.phase === 'insurance') r.insure(BJ.takeInsurance(tc));
    while (r.phase === 'player') {
      const tcNow = counting ? shoe.tc() : null;
      r.act(BJ.decide(r.hand.cards, BJ.val(r.dealer[0].r), rules, r.can(), tcNow).action);
    }
    won += r.net; wagered += bet; n++; sq += r.net * r.net;
  }
  const sd = Math.sqrt(sq / n - (won / n) ** 2);
  return { perHand: won / n, perUnitBet: won / wagered, se: sd / Math.sqrt(n) };
}
const N = +process.argv[2] || 2e6;
const base = { decks: 6, das: true, ls: true, payout: 1.5 };
const cases = [
  ['6D S17 DAS LS 3:2 (published ~0.29% no RSA)', { ...base, h17: false }, false],
  ['6D H17 DAS LS 3:2 (published ~0.50% no RSA)', { ...base, h17: true }, false],
  ['8D H17 DAS LS 3:2 (published ~0.53% no RSA)', { ...base, decks: 8, h17: true }, false],
  ['6D S17 DAS LS 6:5 (published ~1.65%)', { ...base, h17: false, payout: 1.2 }, false],
  ['6D S17 DAS LS, Hi-Lo 1-8 ramp + I18', { ...base, h17: false }, true],
];
for (const [name, rules, counting] of cases) {
  const t0 = Date.now();
  const r = run(rules, N, counting);
  console.log(`${name}: return per unit bet ${(r.perUnitBet * 100).toFixed(3)}%  per hand ${r.perHand.toFixed(4)} units  (±${(r.se * 100 * 2).toFixed(3)}% 2SE per hand)  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
