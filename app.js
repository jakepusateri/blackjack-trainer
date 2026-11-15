(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const { NAMES, UPS } = BJ;
  const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const money = (n) => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const fmt = BJ.fmtTC;

  const PRESETS = {
    s17: { name: '6 decks · dealer stands soft 17 · DAS · surrender', where: 'The 3:2 game at Park MGM, Aria, Bellagio, Cosmo, MGM Grand ($50-$200+ minimums)', decks: 6, h17: false, das: true, ls: true },
    h17: { name: '6 decks · dealer hits soft 17 · DAS · surrender', where: 'Lower-limit 3:2 tables: MGM Grand ($25+), Aria/Bellagio, Excalibur, Luxor', decks: 6, h17: true, das: true, ls: true },
    h17_8: { name: '8 decks · dealer hits soft 17 · DAS · surrender', where: 'Cheapest 3:2 shoes nearby: Luxor, NYNY, Cosmo, Mandalay ($25-$50)', decks: 8, h17: true, das: true, ls: true },
  };

  const DEFAULTS = {
    preset: 's17', payout: '1.5',
    drill: { n: 0, ok: 0, streak: 0, best: 0, miss: {}, type: {} },
    cnt: { n: 0, ok: 0, best: null },
    tq: { n: 0, ok: 0 },
    tbl: { bank: 5000, hands: 0, net: 0, dec: 0, decOk: 0, quizN: 0, quizOk: 0, counting: false, show: false, quiz: '5', unit: '25', units: 1 },
  };
  let S;
  try { S = JSON.parse(localStorage.getItem('bjtrainer') || 'null'); } catch { S = null; }
  S = Object.assign(structuredClone(DEFAULTS), S || {});
  for (const k of ['drill', 'cnt', 'tq', 'tbl']) S[k] = Object.assign(structuredClone(DEFAULTS[k]), S[k]);
  const save = () => { try { localStorage.setItem('bjtrainer', JSON.stringify(S)); } catch {} };
  const R = () => ({ ...PRESETS[S.preset], payout: +S.payout });

  // ---------- shared UI helpers ----------
  function cardEl(c, cls = '') {
    const d = document.createElement('div');
    d.className = 'card ' + cls;
    if (!c) { d.classList.add('back'); return d; }
    if (c.s === '♥' || c.s === '♦') d.classList.add('red');
    d.innerHTML = `<span class="cr">${c.r}</span><span class="cs">${c.s}</span>`;
    return d;
  }
  const cardOfValue = (v) => ({ r: v === 11 ? 'A' : v === 10 ? pick(['10', 'J', 'Q', 'K']) : String(v), s: pick(BJ.SUITS) });
  const randCard = () => ({ r: pick(BJ.RANKS), s: pick(BJ.SUITS) });
  function hardHand(t) {
    for (let i = 0; i < 100; i++) { const a = randInt(2, 10), b = t - a; if (b >= 2 && b <= 10 && a !== b) return [cardOfValue(a), cardOfValue(b)]; }
    const a = Math.floor(t / 2); return [cardOfValue(a), cardOfValue(t - a)];
  }
  function stepper(el, min, max, init = 0) {
    let v = init;
    el.innerHTML = '';
    const mk = (txt, d) => { const b = document.createElement('button'); b.textContent = txt; b.onclick = () => set(v + d); return b; };
    const out = document.createElement('div'); out.className = 'v';
    el.append(mk('−5', -5), mk('−1', -1), out, mk('+1', 1), mk('+5', 5));
    const set = (n) => { v = Math.max(min, Math.min(max, n)); out.textContent = min < 0 ? fmt(v) : v; if (api.onchange) api.onchange(v); };
    const api = { get: () => v, set };
    set(init);
    return api;
  }
  function chartRow(cards, rules, can, curUp) {
    let h = '<div class="rowchart">' + UPS.map((u) => `<div class="hd">${BJ.upLabel(u)}</div>`).join('');
    for (const u of UPS) {
      const a = BJ.decide(cards, u, rules, can, null).action;
      h += `<div class="c-${a}${u === curUp ? ' cur' : ''}">${a === 'P' ? 'Sp' : a === 'R' ? 'Sur' : a}</div>`;
    }
    return h + '</div>';
  }
  function devNote(res) {
    if (!res.dev) return '';
    return `<div class="small muted">Count play: ${NAMES[res.dev.hi]} at true count ${fmt(res.dev.idx)} or higher, otherwise ${NAMES[res.dev.lo]}. Basic strategy says ${NAMES[res.basic]}.</div>`;
  }

  // ---------- rules + tabs ----------
  const presetSel = $('#preset');
  presetSel.innerHTML = Object.entries(PRESETS).map(([k, p]) => `<option value="${k}">${p.name}</option>`).join('');
  presetSel.value = S.preset; $('#payout').value = S.payout;
  function onRules() {
    S.preset = presetSel.value; S.payout = $('#payout').value; save();
    $('#where').textContent = PRESETS[S.preset].where + (S.payout === '1.2' ? ' · 6:5 costs you about 1.4% more. Avoid it.' : '');
    renderChart(); table.newShoe(false); drill.next();
  }
  presetSel.onchange = onRules; $('#payout').onchange = onRules;
  $$('.tabs button').forEach((b) => (b.onclick = () => {
    $$('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
    $$('.tab').forEach((t) => t.classList.toggle('on', t.id === 'tab-' + b.dataset.tab));
    current = b.dataset.tab;
  }));
  let current = 'drill';

  // ---------- strategy drill ----------
  const drill = (() => {
    let hand = null, answered = false, timer = null;
    function next() {
      clearTimeout(timer);
      const rules = R(), devOn = $('#drDev').checked, mode = $('#drMode').value;
      let cards, up, tc = devOn ? randInt(-3, 6) : null;
      if (devOn && mode === 'tough' && Math.random() < 0.45) {
        const d = pick(BJ.DEVIATIONS.filter((x) => !(x.s17only && rules.h17)));
        up = cardOfValue(d.up);
        cards = d.kind === 'pair' ? [cardOfValue(10), cardOfValue(10)] : hardHand(d.t);
        const idx = BJ.devIndex(d, rules); tc = randInt(idx - 2, idx + 2);
      } else if (mode === 'tough') {
        const cat = pick(['hard', 'hard', 'soft', 'pair']);
        if (cat === 'hard') cards = hardHand(randInt(9, 16));
        else if (cat === 'soft') cards = [cardOfValue(11), cardOfValue(randInt(2, 9))];
        else { const v = randInt(2, 11); cards = [cardOfValue(v), cardOfValue(v)]; }
        up = cardOfValue(pick(UPS));
      } else {
        do { cards = [randCard(), randCard()]; } while (BJ.isBJ(cards));
        up = randCard();
      }
      hand = { cards, up, tc }; answered = false;
      $('#drDealer').replaceChildren(cardEl(up), cardEl(null));
      $('#drPlayer').replaceChildren(...cards.map((c) => cardEl(c)));
      const { t, soft } = BJ.total(cards);
      $('#drLabel').textContent = BJ.isPair(cards) ? `pair · ${soft ? 'soft' : ''} ${t}` : `${soft ? 'soft' : 'hard'} ${t}`;
      $('#drTC').textContent = tc === null ? '' : `True count ${fmt(tc)}`;
      $('#drFeedback').innerHTML = ''; $('#drRow').innerHTML = '';
      $('#drNext').classList.add('hidden');
      $$('#drActions button').forEach((b) => {
        b.disabled = (b.dataset.a === 'P' && !BJ.isPair(cards)) || (b.dataset.a === 'R' && !rules.ls);
        b.classList.remove('picked');
      });
    }
    function answer(a) {
      if (answered || !hand) return;
      const rules = R(), upv = BJ.val(hand.up.r);
      const can = { double: true, split: BJ.isPair(hand.cards), surr: rules.ls };
      if (a === 'P' && !can.split) return;
      answered = true;
      const res = BJ.decide(hand.cards, upv, rules, can, hand.tc);
      const ok = a === res.action, d = S.drill;
      const type = BJ.isPair(hand.cards) ? 'pairs' : res.soft ? 'soft' : 'hard';
      d.n++; d.type[type] = d.type[type] || [0, 0]; d.type[type][1]++;
      const key = `${res.label} vs ${BJ.upLabel(upv)}${hand.tc !== null && res.dev ? ' (count play)' : ''}`;
      if (ok) { d.ok++; d.streak++; d.best = Math.max(d.best, d.streak); d.type[type][0]++; }
      else { d.streak = 0; d.miss[key] = (d.miss[key] || 0) + 1; }
      save();
      $('#drFeedback').innerHTML = (ok ? '<span class="ok">✓ Correct.</span> ' : `<span class="no">✗ You picked ${NAMES[a]}.</span> `) +
        `${res.label} vs ${BJ.upLabel(upv)}: <b>${NAMES[res.action]}</b>` + devNote(res);
      $('#drRow').innerHTML = `<div class="small muted">Basic strategy for ${res.label} against each dealer card:</div>` + chartRow(hand.cards, rules, can, upv);
      renderStats();
      if (ok) timer = setTimeout(next, res.dev ? 1800 : 900);
      else $('#drNext').classList.remove('hidden');
    }
    function renderStats() {
      const d = S.drill, pct = (a, b) => (b ? Math.round((100 * a) / b) + '%' : '-');
      $('#drStats').innerHTML = `<span>Accuracy <b>${pct(d.ok, d.n)}</b> (${d.ok}/${d.n})</span><span>Streak <b>${d.streak}</b></span><span>Best <b>${d.best}</b></span>` +
        Object.entries(d.type).map(([k, [a, b]]) => `<span>${k} <b>${pct(a, b)}</b></span>`).join('');
      const miss = Object.entries(d.miss).sort((a, b) => b[1] - a[1]).slice(0, 6);
      $('#drMissed').innerHTML = miss.length ? '<div class="lbl">Most missed</div><ul>' + miss.map(([k, n]) => `<li>${k}: ${n}×</li>`).join('') + '</ul>' : '';
    }
    $$('#drActions button').forEach((b) => (b.onclick = () => answer(b.dataset.a)));
    $('#drNext').onclick = next;
    $('#drMode').onchange = next; $('#drDev').onchange = next;
    $('#drReset').onclick = () => { if (confirm('Reset strategy stats?')) { S.drill = structuredClone(DEFAULTS.drill); save(); renderStats(); } };
    renderStats();
    return { next, answer, isAnswered: () => answered };
  })();

  // ---------- count drill ----------
  const count = (() => {
    let mode = 'flash', seq = [], timer = null, i = 0, t0 = 0, removed = null, running = false, elapsed = 0;
    const step = stepper($('#cStep'), -30, 30, 0);
    $$('.seg button').forEach((b) => (b.onclick = () => {
      if (running) stop();
      mode = b.dataset.cmode;
      $$('.seg button').forEach((x) => x.classList.toggle('on', x === b));
      $('#cFlashOpts').classList.toggle('hidden', mode !== 'flash');
      $('#cDeckHelp').classList.toggle('hidden', mode !== 'deck');
      reset();
    }));
    function reset() {
      $('#cStage').innerHTML = '<div class="muted">2-6 = +1 · 7-9 = 0 · 10-A = −1</div>';
      $('#cAsk').classList.add('hidden'); $('#cResult').innerHTML = ''; $('#cStrip').innerHTML = '';
      $('#cTimer').classList.add('hidden'); $('#cNextCard').classList.add('hidden'); $('#cStart').classList.remove('hidden');
    }
    function stop() { clearInterval(timer); running = false; }
    function show(cards) { $('#cStage').replaceChildren(...cards.map((c) => cardEl(c, 'big'))); }
    function start() {
      reset(); running = true; i = 0; step.set(0);
      $('#cStart').classList.add('hidden');
      const deck = BJ.shuffle(BJ.freshDeck(1));
      if (mode === 'flash') {
        const n = +$('#cfN').value, per = +$('#cfPer').value, speed = +$('#cfSpeed').value * (per > 1 ? 1.4 : 1);
        seq = deck.slice(0, n);
        const tick = () => {
          if (i >= seq.length) { stop(); $('#cStage').innerHTML = '<div class="muted">Done</div>'; ask(); return; }
          show(seq.slice(i, i + per)); i += per;
        };
        tick(); timer = setInterval(tick, speed);
      } else {
        removed = deck.pop(); seq = deck;
        t0 = performance.now(); $('#cTimer').classList.remove('hidden'); $('#cNextCard').classList.remove('hidden');
        show([seq[0]]); i = 1;
        timer = setInterval(() => ($('#cTimer').textContent = ((performance.now() - t0) / 1000).toFixed(1) + 's'), 100);
      }
    }
    function nextCard() {
      if (!running || mode !== 'deck') return;
      if (i >= seq.length) {
        elapsed = (performance.now() - t0) / 1000; stop();
        $('#cTimer').textContent = elapsed.toFixed(1) + 's'; $('#cNextCard').classList.add('hidden');
        $('#cStage').innerHTML = '<div class="muted">Deck done</div>'; ask(); return;
      }
      show([seq[i]]); i++;
      $('#cTimer').textContent = ((performance.now() - t0) / 1000).toFixed(1) + 's';
    }
    function ask() { $('#cAsk').classList.remove('hidden'); }
    function submit() {
      const rc = seq.reduce((s, c) => s + BJ.hilo(c.r), 0), you = step.get(), ok = you === rc, c = S.cnt;
      c.n++; if (ok) c.ok++;
      let extra = '';
      if (mode === 'deck') {
        extra = ` Removed card: <b>${removed.r}${removed.s}</b> (${fmt(BJ.hilo(removed.r))}). Time ${elapsed.toFixed(1)}s.`;
        if (ok && (c.best === null || elapsed < c.best)) { c.best = elapsed; extra += ' New best.'; }
      }
      save();
      $('#cResult').innerHTML = (ok ? '<span class="ok">✓ Correct:</span> ' : `<span class="no">✗ You said ${fmt(you)}.</span> `) + `Running count was <b>${fmt(rc)}</b>.` + extra;
      $('#cAsk').classList.add('hidden'); $('#cStart').classList.remove('hidden'); $('#cStart').textContent = 'Again';
      let run = 0;
      $('#cStrip').innerHTML = seq.map((cd) => { run += BJ.hilo(cd.r); return `<div class="w">${cardEl(cd, 'small').outerHTML}${fmt(run)}</div>`; }).join('');
      renderStats();
    }
    function renderStats() {
      const c = S.cnt;
      $('#cStats').innerHTML = `<span>Correct <b>${c.ok}/${c.n}</b></span><span>Best deck time <b>${c.best === null ? '-' : c.best.toFixed(1) + 's'}</b></span>`;
    }
    $('#cStart').onclick = start; $('#cNextCard').onclick = nextCard; $('#cStage').onclick = nextCard; $('#cSubmit').onclick = submit;
    renderStats();
    return { nextCard, active: () => running && mode === 'deck' };
  })();

  // ---------- true count drill ----------
  const tq = (() => {
    let q = null;
    const step = stepper($('#tqStep'), -15, 15, 0);
    function next() {
      const decks = R().decks, left = randInt(1, decks * 2 - 1) / 2;
      const rc = Math.round((Math.random() * 7 - 1.5) * left) || 1;
      q = { rc, left, decks };
      $('#tqRC').textContent = fmt(rc);
      $('#tqTray').style.height = ((decks - left) / decks) * 100 + '%';
      $('#tqTrayLbl').textContent = `${decks - left} of ${decks} decks dealt`;
      $('#tqLeft').textContent = `${decks}-deck shoe. Estimate the decks left from the tray, then divide.`;
      $('#tqResult').innerHTML = ''; $('#tqNext').classList.add('hidden'); $('#tqSubmit').disabled = false; step.set(0);
    }
    function submit() {
      const x = q.rc / q.left, ok = [Math.trunc(x), Math.round(x), Math.floor(x)].includes(step.get());
      S.tq.n++; if (ok) S.tq.ok++; save();
      const tc = Math.trunc(x);
      $('#tqResult').innerHTML = (ok ? '<span class="ok">✓ Correct.</span> ' : `<span class="no">✗ You said ${fmt(step.get())}.</span> `) +
        `${fmt(q.rc)} ÷ ${q.left} decks left = ${x.toFixed(2)}, so true count <b>${fmt(tc)}</b>` + (Math.round(x) !== tc ? ` (${fmt(Math.round(x))} if you round)` : '') +
        `. Bet ramp: <b>${BJ.rampUnits(tc)} unit${BJ.rampUnits(tc) > 1 ? 's' : ''}</b>${tc >= 3 ? ', and take insurance' : ''}.`;
      $('#tqSubmit').disabled = true; $('#tqNext').classList.remove('hidden');
      $('#tqStats').innerHTML = `<span>Correct <b>${S.tq.ok}/${S.tq.n}</b></span>`;
    }
    $('#tqSubmit').onclick = submit; $('#tqNext').onclick = next;
    $('#tqStats').innerHTML = `<span>Correct <b>${S.tq.ok}/${S.tq.n}</b></span>`;
    return { next };
  })();

  // ---------- table sim ----------
  const table = (() => {
    const T = S.tbl;
    let shoe, round = null, quizDue = false, mistakes = [], note = '';
    const bet = stepper($('#tBetStep'), 1, 16, T.units || 1);
    const qz = stepper($('#tqzStep'), -40, 40, 0);
    bet.onchange = (v) => { T.units = v; save(); renderCount(); };
    $('#tCounting').checked = T.counting; $('#tShow').checked = T.show; $('#tQuiz').value = T.quiz; $('#tUnit').value = T.unit;
    $('#tCounting').onchange = (e) => { T.counting = e.target.checked; save(); };
    $('#tShow').onchange = (e) => { T.show = e.target.checked; save(); renderCount(); };
    $('#tQuiz').onchange = (e) => { T.quiz = e.target.value; save(); };
    $('#tUnit').onchange = (e) => { T.unit = e.target.value; save(); };

    function newShoe(announce = true) { shoe = new BJ.Shoe(R().decks, 0.75); round = null; render(); if (announce) msg('New shoe shuffled.'); }
    function msg(h) { $('#tMsg').innerHTML = h; }
    function renderCount() {
      const el = $('#tCount');
      el.classList.toggle('hidden', !T.show);
      if (!T.show || !shoe) return;
      const tc = shoe.tc();
      el.innerHTML = `<span>Running <b>${fmt(shoe.rc)}</b></span><span>Decks left <b>${shoe.decksLeft().toFixed(1)}</b></span><span>True <b>${fmt(tc)}</b></span><span>Ramp bet <b>${BJ.rampUnits(tc)}u</b></span>`;
    }
    function renderStats() {
      const pct = (a, b) => (b ? Math.round((100 * a) / b) + '%' : '-');
      $('#tStats').innerHTML = `<span>Bankroll <b>${money(T.bank)}</b></span><span>Hands <b>${T.hands}</b></span><span>Net <b>${money(T.net)}</b></span>` +
        `<span>Decisions <b>${pct(T.decOk, T.dec)}</b></span>` + (T.quizN ? `<span>Count quiz <b>${T.quizOk}/${T.quizN}</b></span>` : '');
    }
    function render() {
      renderStats(); renderCount();
      const r = round, phase = r ? r.phase : 'idle';
      $('#tDealer').replaceChildren(...(r ? r.dealer.map((c, i) => cardEl(i === 1 && !r.holeShown ? null : c)) : []));
      if (r) { const dt = r.holeShown ? BJ.total(r.dealer) : BJ.total([r.dealer[0]]); $('#tDTotal').textContent = r.holeShown ? `${dt.t > 21 ? 'bust (' + dt.t + ')' : dt.t}` : `showing ${BJ.upLabel(BJ.val(r.dealer[0].r))}`; }
      else $('#tDTotal').textContent = '';
      $('#tHands').replaceChildren(...(r ? r.hands.map((h, i) => {
        const d = document.createElement('div');
        d.className = 'hand' + (phase === 'player' && i === r.idx ? ' active' : '');
        const cs = document.createElement('div'); cs.className = 'cards'; cs.append(...h.cards.map((c) => cardEl(c)));
        const { t, soft } = BJ.total(h.cards);
        let res = '';
        if (h.result !== undefined) {
          const word = h.surrendered ? 'Surrendered' : h.bust ? 'Bust' : r.dealerBJ && h.result < 0 ? 'Dealer BJ' : h.result > 0 && r.hands.length === 1 && BJ.isBJ(h.cards) ? 'Blackjack' : h.result > 0 ? 'Win' : h.result < 0 ? 'Lose' : 'Push';
          res = `<div class="res ${h.result > 0 ? 'win' : h.result < 0 ? 'lose' : ''}">${word} ${h.result ? money(h.result) : ''}</div>`;
        }
        d.append(cs);
        d.insertAdjacentHTML('beforeend', `<div class="meta">${soft && t < 21 ? 'soft ' : ''}${t} · bet ${money(h.bet)}${h.doubled ? ' (doubled)' : ''}</div>${res}`);
        return d;
      }) : []));
      const can = phase === 'player' ? r.can() : {};
      $$('#tActions button').forEach((b) => {
        const a = b.dataset.a;
        b.disabled = phase !== 'player' || (a === 'D' && !can.double) || (a === 'P' && !can.split) || (a === 'R' && !can.surr);
      });
      $('#tActions').classList.toggle('hidden', phase === 'insurance');
      $('#tIns').classList.toggle('hidden', phase !== 'insurance');
      const betting = phase === 'idle' || phase === 'done';
      $('#tDeal').disabled = !betting || quizDue;
      $('#tBetRow').style.opacity = betting ? 1 : 0.4;
      $('#tQuizBox').classList.toggle('hidden', !quizDue);
      $('#tMistakes').innerHTML = mistakes.length ? '<div class="lbl">Recent mistakes</div><ul>' + mistakes.slice(0, 8).map((m) => `<li>${m}</li>`).join('') + '</ul>' : '';
    }
    function grade(ok, text) {
      T.dec++; if (ok) T.decOk++; save();
      if (!ok) { mistakes.unshift(text); note = `<span class="no">✗</span> ${text}`; }
    }
    function deal() {
      if (round && round.phase !== 'done' && round.phase !== undefined) return;
      if (quizDue) return;
      const rules = R(), units = bet.get(), b = units * +T.unit;
      note = '';
      if (shoe.needsShuffle()) { shoe.shuffle(); note = 'Cut card reached, so the shoe was shuffled. Count starts at 0. '; }
      if (T.counting) {
        const tc = shoe.tc(), want = BJ.rampUnits(tc);
        const ok = units === want;
        T.dec++; if (ok) T.decOk++;
        if (!ok) { const t = `Bet at true count ${fmt(tc)}: ramp says ${want} unit${want > 1 ? 's' : ''}, you bet ${units}.`; mistakes.unshift(t); note += `<span class="no">✗</span> ${t} `; }
      }
      round = new BJ.Round(shoe, rules, b).start();
      after();
    }
    function act(a) {
      if (!round || round.phase !== 'player') return;
      const rules = R(), can = round.can();
      if ((a === 'D' && !can.double) || (a === 'P' && !can.split) || (a === 'R' && !can.surr)) return;
      const tc = T.counting ? shoe.tc() : null, upv = BJ.val(round.dealer[0].r);
      const res = BJ.decide(round.hand.cards, upv, rules, can, tc);
      const ok = a === res.action;
      note = '';
      grade(ok, `${res.label} vs ${BJ.upLabel(upv)}${tc !== null ? ` (true count ${fmt(tc)})` : ''}: you chose ${NAMES[a]}, correct is ${NAMES[res.action]}${res.dev && res.action !== res.basic ? ' (count play)' : ''}.`);
      if (ok) note = `<span class="ok">✓</span> ${NAMES[a]}`;
      round.act(a);
      after();
    }
    function insure(take) {
      if (!round || round.phase !== 'insurance') return;
      const tc = T.counting ? shoe.tc() : null, want = BJ.takeInsurance(tc);
      note = '';
      grade(take === want, `Insurance${tc !== null ? ` at true count ${fmt(tc)}` : ''}: correct is ${want ? 'take it (true count +3 or higher)' : 'no insurance'}.`);
      round.insure(take);
      after();
    }
    function after() {
      if (round.phase === 'done') {
        T.bank += round.net; T.net += round.net; T.hands++;
        const q = +T.quiz;
        if (q && T.hands % q === 0) { quizDue = true; qz.set(0); }
        save();
        const dt = BJ.total(round.dealer).t;
        note += ` Dealer ${round.dealerBJ ? 'has blackjack' : dt > 21 ? 'busts' : 'has ' + dt}. Hand ${round.net > 0 ? 'won' : round.net < 0 ? 'lost' : 'pushed'} ${round.net ? money(Math.abs(round.net)) : ''}.`;
        if (round.phase === 'done' && shoe.needsShuffle()) note += ' The cut card came out, so the shoe will be shuffled.';
      }
      msg(note); render();
    }
    function submitQuiz() {
      const you = qz.get(), ok = you === shoe.rc;
      T.quizN++; if (ok) T.quizOk++; save();
      if (!ok) mistakes.unshift(`Count quiz: you said ${fmt(you)}, running count was ${fmt(shoe.rc)}.`);
      quizDue = false;
      msg((ok ? '<span class="ok">✓ Count is right:</span> ' : `<span class="no">✗ You said ${fmt(you)}.</span> `) + `Running count ${fmt(shoe.rc)}, ${shoe.decksLeft().toFixed(1)} decks left, so true count ${fmt(shoe.tc())}. Ramp bet: ${BJ.rampUnits(shoe.tc())} units.`);
      render();
    }
    $$('#tActions button').forEach((b) => (b.onclick = () => act(b.dataset.a)));
    $$('#tIns button').forEach((b) => (b.onclick = () => insure(b.dataset.ins === '1')));
    $('#tDeal').onclick = deal; $('#tqzSubmit').onclick = submitQuiz;
    $('#tReset').onclick = () => {
      if (!confirm('Reset bankroll and stats, and start a new shoe?')) return;
      Object.assign(T, { bank: 5000, hands: 0, net: 0, dec: 0, decOk: 0, quizN: 0, quizOk: 0 }); mistakes = []; quizDue = false; save(); newShoe(); msg('');
    };
    return { newShoe, act, deal, insure, phase: () => (round ? round.phase : 'idle'), quizDue: () => quizDue };
  })();

  // ---------- chart ----------
  function renderChart() {
    const rules = R(), can = { double: true, split: true, surr: rules.ls };
    const sym = { H: 'H', S: 'S', Dh: 'D', Ds: 'Ds', Rh: 'R', Rs: 'Rs', Rp: 'Rp', P: 'P' };
    const head = '<tr><th></th>' + UPS.map((u) => `<th>${BJ.upLabel(u)}</th>`).join('') + '</tr>';
    const row = (label, cards) => '<tr><th>' + label + '</th>' + UPS.map((u) => { const c = BJ.decide(cards, u, rules, can, null).code; return `<td class="c-${sym[c]}">${sym[c]}</td>`; }).join('') + '</tr>';
    const c = (v) => ({ r: v === 11 ? 'A' : String(v), s: '♠' });
    let h = '<h2>Hard totals</h2><table class="ch">' + head + row('5-8', [c(3), c(5)]);
    for (let t = 9; t <= 17; t++) h += row(String(t), [c(t - 10 >= 2 ? t - 10 : 2), c(t - 10 >= 2 ? 10 : t - 2)]);
    h += row('18+', [c(10), c(8)]) + '</table>';
    h += '<h2>Soft totals</h2><table class="ch">' + head;
    for (let x = 2; x <= 9; x++) h += row(`A,${x}`, [c(11), c(x)]);
    h += '</table><h2>Pairs</h2><table class="ch">' + head;
    for (const v of [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]) h += row(v === 11 ? 'A,A' : v === 10 ? '10,10' : `${v},${v}`, [c(v), c(v)]);
    h += '</table><p class="small muted">H hit · S stand · D double (hit if you can\'t) · Ds double (stand if you can\'t) · P split · R surrender (hit if you can\'t) · Rs surrender (stand if you can\'t) · Rp surrender (split if you can\'t). No insurance without the count.</p>';
    h += '<h2>Hi-Lo count</h2><table class="list"><tr><td>2 3 4 5 6</td><td><b>+1</b></td></tr><tr><td>7 8 9</td><td><b>0</b></td></tr><tr><td>10 J Q K A</td><td><b>−1</b></td></tr></table>';
    h += '<p class="small">True count = running count ÷ decks left in the shoe (read the discard tray). Each +1 of true count is worth about +0.5% to you.</p>';
    h += '<h2>Bet ramp (units)</h2><table class="list"><tr><th>True count</th><td>≤ +1</td><td>+2</td><td>+3</td><td>+4</td><td>+5+</td></tr><tr><th>Bet</th><td>1</td><td>2</td><td>4</td><td>6</td><td>8</td></tr></table>';
    h += '<h2>Count plays (Illustrious 18)</h2><table class="list"><tr><th>Hand</th><th>Play</th></tr><tr><td>Insurance</td><td>Take at +3 or higher</td></tr>';
    for (const d of BJ.DEVIATIONS) {
      if (d.s17only && rules.h17) continue;
      const hand = d.kind === 'pair' ? '10,10' : String(d.t), idx = BJ.devIndex(d, rules);
      h += `<tr><td>${hand} vs ${BJ.upLabel(d.up)}</td><td>${NAMES[d.hi]} at ${fmt(idx)} or higher, otherwise ${NAMES[d.lo]}</td></tr>`;
    }
    h += '</table><p class="small muted">Count plays apply after the surrender decision: if basic strategy says surrender and you can, surrender.</p>';
    h += `<h2>3:2 tables near Park MGM</h2><p class="small muted">From the Wizard of Vegas survey (data from January 2025). Limits rise a lot on F1 weekend, so check the placard.</p><table class="list">
      <tr><th>Casino</th><th>Game</th><th>Min</th></tr>
      <tr><td>Park MGM</td><td>6D S17 DAS LS</td><td>$100</td></tr>
      <tr><td>Park MGM</td><td>2D S17 (no mid-shoe entry)</td><td>$100</td></tr>
      <tr><td>MGM Grand</td><td>6D H17 DAS LS</td><td>$25</td></tr>
      <tr><td>MGM Grand</td><td>6D S17 DAS LS</td><td>$50</td></tr>
      <tr><td>Aria</td><td>6D S17 / H17 DAS LS</td><td>$100</td></tr>
      <tr><td>Cosmopolitan</td><td>8D H17 DAS LS</td><td>$50</td></tr>
      <tr><td>New York-New York</td><td>8D H17 DAS LS</td><td>$50</td></tr>
      <tr><td>Excalibur</td><td>6D H17 DAS LS</td><td>$50</td></tr>
      <tr><td>Luxor</td><td>8D H17 DAS LS</td><td>$25</td></tr>
      <tr><td>Mandalay Bay</td><td>8D H17 DAS</td><td>$25</td></tr>
    </table>`;
    $('#chRules').textContent = `Chart for: ${PRESETS[S.preset].name}.`;
    $('#chart').innerHTML = h;
  }

  // ---------- keyboard ----------
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'SELECT' || e.metaKey || e.ctrlKey) return;
    const k = e.key.toLowerCase(), map = { h: 'H', s: 'S', d: 'D', p: 'P', r: 'R' };
    if (current === 'drill') { if (map[k]) drill.answer(map[k]); else if ((k === ' ' || k === 'enter') && drill.isAnswered()) { e.preventDefault(); drill.next(); } }
    if (current === 'count' && count.active() && (k === ' ' || k === 'arrowright')) { e.preventDefault(); count.nextCard(); }
    if (current === 'table') {
      if (map[k]) table.act(map[k]);
      else if (k === ' ' || k === 'enter') { e.preventDefault(); table.deal(); }
    }
  });

  // ---------- offline ----------
  const off = $('#offline');
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('sw.js').then(
      () => navigator.serviceWorker.ready.then(() => (off.textContent = 'Works offline')),
      () => (off.textContent = 'Online only'));
  } else off.textContent = 'Online only';

  onRules(); tq.next();
})();
