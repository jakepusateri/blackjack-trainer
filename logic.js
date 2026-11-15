// Blackjack logic: shared by the trainer page and the node simulation test.
const BJ = (() => {
  const SUITS = ['♠', '♥', '♦', '♣'];
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const UPS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const val = (r) => (r === 'A' ? 11 : r === '10' || r === 'J' || r === 'Q' || r === 'K' ? 10 : +r);
  const hilo = (r) => { const v = val(r); return v <= 6 ? 1 : v >= 10 ? -1 : 0; };
  const upLabel = (u) => (u === 11 ? 'A' : String(u));
  const NAMES = { H: 'Hit', S: 'Stand', D: 'Double', P: 'Split', R: 'Surrender' };

  function total(cards) {
    let t = 0, aces = 0;
    for (const c of cards) { t += val(c.r); if (c.r === 'A') aces++; }
    while (t > 21 && aces) { t -= 10; aces--; }
    return { t, soft: aces > 0 };
  }
  const isPair = (cards) => cards.length === 2 && val(cards[0].r) === val(cards[1].r);
  const isBJ = (cards) => cards.length === 2 && total(cards).t === 21;

  // Multi-deck (4-8 decks), double after split allowed. Codes:
  // H hit, S stand, Dh double else hit, Ds double else stand, Rh/Rs/Rp surrender else hit/stand/split, P split.
  function hardCode(t, up, h17) {
    if (t <= 8) return 'H';
    if (t === 9) return up >= 3 && up <= 6 ? 'Dh' : 'H';
    if (t === 10) return up <= 9 ? 'Dh' : 'H';
    if (t === 11) return up <= 10 || h17 ? 'Dh' : 'H';
    if (t === 12) return up >= 4 && up <= 6 ? 'S' : 'H';
    if (t <= 14) return up <= 6 ? 'S' : 'H';
    if (t === 15) return up <= 6 ? 'S' : up === 10 || (up === 11 && h17) ? 'Rh' : 'H';
    if (t === 16) return up <= 6 ? 'S' : up >= 9 ? 'Rh' : 'H';
    if (t === 17) return up === 11 && h17 ? 'Rs' : 'S';
    return 'S';
  }
  function softCode(t, up, h17) {
    if (t <= 12) return 'H';
    if (t <= 14) return up === 5 || up === 6 ? 'Dh' : 'H';
    if (t <= 16) return up >= 4 && up <= 6 ? 'Dh' : 'H';
    if (t === 17) return up >= 3 && up <= 6 ? 'Dh' : 'H';
    if (t === 18) {
      if (up >= 3 && up <= 6) return 'Ds';
      if (up === 2) return h17 ? 'Ds' : 'S';
      return up <= 8 ? 'S' : 'H';
    }
    if (t === 19) return h17 && up === 6 ? 'Ds' : 'S';
    return 'S';
  }
  function pairCode(v, up, h17) {
    if (v === 11) return 'P';
    if (v === 10 || v === 5) return null;
    if (v === 9) return up === 7 || up >= 10 ? null : 'P';
    if (v === 8) return h17 && up === 11 ? 'Rp' : 'P';
    if (v === 7) return up <= 7 ? 'P' : null;
    if (v === 6) return up <= 6 ? 'P' : null;
    if (v === 4) return up === 5 || up === 6 ? 'P' : null;
    return up <= 7 ? 'P' : null; // 2,2 and 3,3
  }

  // Hi-Lo "Illustrious 18" (multi-deck). Play `hi` when true count >= idx, otherwise `lo`.
  const DEVIATIONS = [
    { kind: 'hard', t: 16, up: 10, idx: 0, hi: 'S', lo: 'H' },
    { kind: 'hard', t: 15, up: 10, idx: 4, hi: 'S', lo: 'H' },
    { kind: 'pair', v: 10, up: 5, idx: 5, hi: 'P', lo: 'S' },
    { kind: 'pair', v: 10, up: 6, idx: 4, hi: 'P', lo: 'S' },
    { kind: 'hard', t: 10, up: 10, idx: 4, hi: 'D', lo: 'H' },
    { kind: 'hard', t: 12, up: 3, idx: 2, hi: 'S', lo: 'H' },
    { kind: 'hard', t: 12, up: 2, idx: 3, hi: 'S', lo: 'H' },
    { kind: 'hard', t: 11, up: 11, idx: 1, hi: 'D', lo: 'H', s17only: true },
    { kind: 'hard', t: 9, up: 2, idx: 1, hi: 'D', lo: 'H' },
    { kind: 'hard', t: 10, up: 11, idx: 4, idxH17: 3, hi: 'D', lo: 'H' },
    { kind: 'hard', t: 9, up: 7, idx: 3, hi: 'D', lo: 'H' },
    { kind: 'hard', t: 16, up: 9, idx: 5, hi: 'S', lo: 'H' },
    { kind: 'hard', t: 13, up: 2, idx: -1, hi: 'S', lo: 'H' },
    { kind: 'hard', t: 12, up: 4, idx: 0, hi: 'S', lo: 'H' },
    { kind: 'hard', t: 12, up: 5, idx: -2, hi: 'S', lo: 'H' },
    { kind: 'hard', t: 12, up: 6, idx: -1, hi: 'S', lo: 'H' },
    { kind: 'hard', t: 13, up: 3, idx: -2, hi: 'S', lo: 'H' },
  ];
  const devIndex = (d, rules) => (rules.h17 && d.idxH17 !== undefined ? d.idxH17 : d.idx);
  const fmtTC = (n) => (n > 0 ? '+' + n : String(n));

  // can = {double, split, surr}. tc = true count for deviations, or null for basic strategy only.
  function decide(cards, up, rules, can, tc = null) {
    const { t, soft } = total(cards);
    const pair = isPair(cards) && can.split;
    let code = null, label;
    if (pair) {
      const v = val(cards[0].r);
      code = pairCode(v, up, rules.h17);
      label = 'Pair of ' + (v === 11 ? 'aces' : v === 10 ? 'tens' : v + 's');
    }
    if (!code) {
      code = soft ? softCode(t, up, rules.h17) : hardCode(t, up, rules.h17);
      if (!label) label = (soft ? 'Soft ' : 'Hard ') + t;
    }
    const surr = can.surr && rules.ls;
    let basic;
    switch (code) {
      case 'Dh': basic = can.double ? 'D' : 'H'; break;
      case 'Ds': basic = can.double ? 'D' : 'S'; break;
      case 'Rh': basic = surr ? 'R' : 'H'; break;
      case 'Rs': basic = surr ? 'R' : 'S'; break;
      case 'Rp': basic = surr ? 'R' : 'P'; break;
      default: basic = code;
    }
    let action = basic, dev = null;
    if (tc !== null && basic !== 'R' && basic !== 'P') {
      for (const d of DEVIATIONS) {
        if (d.up !== up || (d.s17only && rules.h17)) continue;
        const hit = d.kind === 'pair' ? pair && val(cards[0].r) === d.v : !soft && t === d.t;
        if (!hit) continue;
        const idx = devIndex(d, rules);
        let a = tc >= idx ? d.hi : d.lo;
        if (a === 'D' && !can.double) a = 'H';
        dev = { idx, hi: d.hi, lo: d.lo };
        action = a;
        break;
      }
    }
    return { action, basic, code, label, dev, soft, t };
  }
  const takeInsurance = (tc) => tc !== null && tc >= 3;
  const rampUnits = (tc) => (tc <= 1 ? 1 : Math.min(8, (tc - 1) * 2));

  function freshDeck(decks) {
    const cards = [];
    for (let d = 0; d < decks; d++) for (const s of SUITS) for (const r of RANKS) cards.push({ r, s });
    return cards;
  }
  function shuffle(a, rnd = Math.random) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  class Shoe {
    constructor(decks, pen = 0.75, rnd = Math.random) { this.decks = decks; this.pen = pen; this.rnd = rnd; this.shuffle(); }
    shuffle() { this.cards = shuffle(freshDeck(this.decks), this.rnd); this.pos = 0; this.rc = 0; this.cut = Math.floor(this.cards.length * this.pen); this.shuffles = (this.shuffles || 0) + 1; }
    draw() { return this.cards[this.pos++]; }
    see(c) { this.rc += hilo(c.r); }
    needsShuffle() { return this.pos >= this.cut; }
    decksLeft() { return (this.cards.length - this.pos) / 52; }
    tc() { return Math.trunc(this.rc / Math.max(0.5, this.decksLeft())); }
  }

  // One round for one player. Phases: insurance -> player -> done.
  class Round {
    constructor(shoe, rules, bet) {
      this.shoe = shoe; this.rules = rules; this.baseBet = bet;
      this.hands = [{ cards: [], bet, done: false }];
      this.dealer = []; this.idx = 0; this.ins = 0; this.holeShown = false; this.dealerBJ = false;
    }
    deal(hidden) { const c = this.shoe.draw(); if (!hidden) this.shoe.see(c); return c; }
    start() {
      const h = this.hands[0];
      h.cards.push(this.deal()); this.dealer.push(this.deal());
      h.cards.push(this.deal()); this.dealer.push(this.deal(true));
      if (val(this.dealer[0].r) === 11) this.phase = 'insurance';
      else this.afterInsurance();
      return this;
    }
    insure(take) { if (this.phase !== 'insurance') return; if (take) this.ins = this.baseBet / 2; this.afterInsurance(); }
    revealHole() { if (!this.holeShown) { this.holeShown = true; this.shoe.see(this.dealer[1]); } }
    afterInsurance() {
      if (val(this.dealer[0].r) >= 10 && isBJ(this.dealer)) { this.dealerBJ = true; return this.finish(); }
      if (isBJ(this.hands[0].cards)) return this.finish();
      this.phase = 'player';
    }
    get hand() { return this.hands[this.idx]; }
    can() {
      const h = this.hand, r = this.rules, two = h.cards.length === 2;
      return {
        double: two && !h.splitAces && (!h.fromSplit || r.das),
        split: two && isPair(h.cards) && this.hands.length < 4 && !h.splitAces,
        surr: !!r.ls && two && this.hands.length === 1,
      };
    }
    act(a) {
      if (this.phase !== 'player') return;
      const h = this.hand, can = this.can();
      if (a === 'D' && !can.double) a = 'H';
      if (a === 'P' && !can.split) return;
      if (a === 'R' && !can.surr) return;
      if (a === 'H') { h.cards.push(this.deal()); const t = total(h.cards).t; if (t >= 21) { h.done = true; h.bust = t > 21; } }
      else if (a === 'S') h.done = true;
      else if (a === 'D') { h.bet *= 2; h.doubled = true; h.cards.push(this.deal()); h.done = true; h.bust = total(h.cards).t > 21; }
      else if (a === 'R') { h.surrendered = true; h.done = true; }
      else if (a === 'P') {
        const aces = h.cards[0].r === 'A';
        const nh = { cards: [h.cards.pop()], bet: h.bet, done: false, fromSplit: true, splitAces: aces };
        h.fromSplit = true; h.splitAces = aces;
        this.hands.splice(this.idx + 1, 0, nh);
        h.cards.push(this.deal());
        if (aces) { nh.cards.push(this.deal()); h.done = nh.done = true; }
        else if (total(h.cards).t === 21) h.done = true;
      }
      this.advance();
    }
    advance() {
      while (this.idx < this.hands.length && this.hands[this.idx].done) {
        this.idx++;
        const n = this.hands[this.idx];
        if (n && n.cards.length === 1) { n.cards.push(this.deal()); if (total(n.cards).t === 21) n.done = true; }
      }
      if (this.idx >= this.hands.length) { this.idx = this.hands.length - 1; this.dealerPlay(); }
    }
    dealerPlay() {
      this.revealHole();
      if (this.hands.some((h) => !h.bust && !h.surrendered)) {
        for (;;) {
          const { t, soft } = total(this.dealer);
          if (t < 17 || (t === 17 && soft && this.rules.h17)) this.dealer.push(this.deal());
          else break;
        }
      }
      this.finish();
    }
    finish() {
      this.revealHole();
      const dt = total(this.dealer).t, pay = this.rules.payout || 1.5;
      let net = 0;
      const natural = this.hands.length === 1 && isBJ(this.hands[0].cards);
      for (const h of this.hands) {
        let r;
        if (this.dealerBJ) r = natural ? 0 : -h.bet;
        else if (h.surrendered) r = -h.bet / 2;
        else if (h.bust) r = -h.bet;
        else if (natural) r = h.bet * pay;
        else { const t = total(h.cards).t; r = dt > 21 || t > dt ? h.bet : t === dt ? 0 : -h.bet; }
        h.result = r; net += r;
      }
      if (this.ins) net += this.dealerBJ ? this.ins * 2 : -this.ins;
      this.net = net; this.phase = 'done';
    }
  }

  return { SUITS, RANKS, UPS, NAMES, DEVIATIONS, val, hilo, upLabel, total, isPair, isBJ, decide, devIndex, fmtTC,
    takeInsurance, rampUnits, freshDeck, shuffle, Shoe, Round };
})();
if (typeof module !== 'undefined') module.exports = BJ;
