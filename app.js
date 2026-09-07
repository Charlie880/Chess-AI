/* Cat Meme Chess — UI, assets, reactions, and a small minimax opponent.
   Rules logic lives in chess-engine.js and stays DOM-free. */

const E = window.ChessEngine;
const $ = (id) => document.getElementById(id);

/* ---------------------------------------------------------------- assets --
   Single in-memory store. Swap these two maps for an IndexedDB-backed object
   and nothing else in the app has to change. No localStorage on purpose:
   this needs to survive sandboxed iframes. */
const assets = {
  // 'w_p' -> data URL, or a relative path for art shipped next to index.html
  pieces: {
    w_p: 'cat-yes-sir.gif',
    b_p: '1000-yard-stare-cat-meme.gif',
    w_r: 'cat-fat-rook.gif',
    b_r: 'cat-fat-rookB.gif',
  },
  reactions: {},  // 'capture' -> { image, audio }
};

/* `object-fit:cover` into a circle throws away whatever isn't near the centre,
   and every source frames its cat differently. One crop anchor per piece; art
   uploaded at runtime falls back to the CSS default. */
const FOCUS = {
  w_p: '50% 30%',
  w_r: '50% 0%',    // tall portrait, cat's head at the very top
  b_r: '64% 50%',   // landscape, head sits right of centre
};

const CAT = {
  w: { k:['😼','Boss Cat'],  q:['😻','Diva Cat'],   r:['📦','Box Fort'],
       b:['🎩','Fancy Cat'], n:['💨','Zoomies'],    p:['🐱','Small Bean'] },
  b: { k:['😾','Shadow Boss'], q:['😹','Chaos Queen'], r:['🗃️','Dark Fort'],
       b:['🕶️','Slick Cat'],  n:['⚡','Night Zoomies'], p:['🐈‍⬛','Tiny Gremlin'] },
};
const NAME = (color, type) => CAT[color][type][1];
const TYPE_NAME = { k:'King', q:'Queen', r:'Rook', b:'Bishop', n:'Knight', p:'Pawn' };
const SLIDE_MS = 300;  // must match --slide in styles.css

const REACTIONS = [
  ['move',      'Move',      'a normal move'],
  ['capture',   'Capture',   'a piece gets taken'],
  ['check',     'Check',     'a king is under fire'],
  ['checkmate', 'Checkmate', 'someone won'],
  ['stalemate', 'Stalemate', 'nobody won'],
  ['sacrifice', 'Sacrifice', 'a piece is thrown away'],
  ['danger',    'In danger', 'a piece just started hanging'],
];
const BLIP = { move:330, capture:180, check:660, checkmate:110, stalemate:220, sacrifice:520, danger:440 };

/* ----------------------------------------------------------------- state -- */
let state = E.initialState();
let selected = null;         // {r,c}
let legal = [];              // legal moves from `selected`
let lastMove = null;
let sidelined = { w:[], b:[] };
let logEntries = [];
let named = null;            // {r,c} whose piece name is pinned open by a tap
let hanging = [];            // squares of the side to move that are hanging
let prevHanging = new Set(); // 'r,c' keys from the previous evaluation
let status = 'playing';
let busy = false;            // blocks input during animations / AI thinking
let pendingPromo = null;

const modeEl = $('mode'), diffEl = $('difficulty');
const humanColor = 'w';      // vs computer, the human is always white
const vsComputer = () => modeEl.value === 'ai';

/* ------------------------------------------------------------- rendering -- */
function pieceHTML(piece, key){
  const slot = key || `${piece.color}_${piece.type}`;
  const url = assets.pieces[slot];
  const [emoji, name] = CAT[piece.color][piece.type];
  const focus = FOCUS[slot] ? ` style="object-position:${FOCUS[slot]}"` : '';
  const inner = url
    ? `<img class="art" src="${url}" alt="${name}"${focus}>`
    : `<span class="glyph">${emoji}</span><span class="cap">${name}</span>`;
  const label = `<span class="label">${TYPE_NAME[piece.type]}</span>`;
  return `<div class="piece ${piece.color}" title="${TYPE_NAME[piece.type]} · ${name}">${inner}${label}</div>`;
}

function renderBoard(){
  const board = $('board');
  const targets = new Map(legal.map(m => [`${m.toR},${m.toC}`, m]));
  const hangKeys = new Set(hanging.map(h => `${h.r},${h.c}`));
  const checkedKing = (status === 'check' || status === 'checkmate')
    ? E.findKing(state, state.turn) : null;

  let html = '';
  for (let r = 0; r < 8; r++){
    for (let c = 0; c < 8; c++){
      const p = state.board[r][c];
      const key = `${r},${c}`;
      const cls = ['sq', (r + c) % 2 ? 'dark' : 'light'];
      if (selected && selected.r === r && selected.c === c) cls.push('sel');
      if (lastMove && ((lastMove.fromR === r && lastMove.fromC === c) ||
                       (lastMove.toR === r && lastMove.toC === c))) cls.push('last');
      if (checkedKing && checkedKing.r === r && checkedKing.c === c) cls.push('check');
      if (hangKeys.has(key)) cls.push('hang');
      if (named && named.r === r && named.c === c && p) cls.push('named');
      if (targets.has(key) || (p && p.color === state.turn && canPlay())) cls.push('pickable');

      html += `<div class="${cls.join(' ')}" data-r="${r}" data-c="${c}">`;
      if (c === 0) html += `<span class="coord rank">${8 - r}</span>`;
      if (r === 7) html += `<span class="coord file">${'abcdefgh'[c]}</span>`;
      if (p) html += pieceHTML(p);
      if (targets.has(key)){
        const isCapture = !!p || !!targets.get(key).enPassant;
        html += isCapture ? '<div class="ring"></div>' : '<div class="dot"></div>';
      }
      html += '</div>';
    }
  }
  board.innerHTML = html;
}

function renderTrays(){
  for (const color of ['w','b']){
    $('tray-' + color).innerHTML = sidelined[color].map(t => pieceHTML({color, type:t})).join('');
  }
}

function renderStatus(){
  const el = $('status');
  const side = state.turn === 'w' ? 'White' : 'Black';
  const winner = state.turn === 'w' ? 'Black' : 'White';
  el.className = 'status';
  if (status === 'checkmate'){ el.textContent = `Checkmate — ${winner} wins. Nap time.`; el.classList.add('over'); }
  else if (status === 'stalemate'){ el.textContent = 'Stalemate — everyone stares at the wall.'; el.classList.add('over'); }
  else if (status === 'check'){ el.textContent = `${side} in check — ${NAME(state.turn,'k')} is cornered!`; el.classList.add('check'); }
  else if (busy && vsComputer() && state.turn !== humanColor) el.textContent = 'Computer cat is thinking…';
  else el.textContent = `${side} to move`;
}

function renderLog(){
  $('log').innerHTML = logEntries
    .map(e => `<li>${e.text}<span class="san">${e.san}</span></li>`).join('');
  $('log').scrollTop = $('log').scrollHeight;
}

function render(){ renderBoard(); renderTrays(); renderStatus(); }

/* ---------------------------------------------------------------- notation */
const sqName = (r,c) => 'abcdefgh'[c] + (8 - r);

function longAlgebraic(move, piece, captured, resultStatus){
  if (move.castle) return move.castle === 'K' ? 'O-O' : 'O-O-O';
  const letter = piece.type === 'p' ? '' : piece.type.toUpperCase();
  const sep = captured ? 'x' : '-';
  const promo = move.promotion ? '=' + move.promotion.toUpperCase() : '';
  const suffix = resultStatus === 'checkmate' ? '#' : resultStatus === 'check' ? '+' : '';
  return letter + sqName(move.fromR, move.fromC) + sep + sqName(move.toR, move.toC) + promo + suffix;
}

const STROLLS = ['padded over to', 'sauntered to', 'flopped onto', 'crept to', 'claimed'];

function memeLine(move, piece, captured, resultStatus){
  const me = NAME(piece.color, piece.type);
  let text;
  if (move.castle) text = `${me} hid behind the box fort`;
  else if (captured) text = `${me} yeeted the ${NAME(captured.color, captured.type)}`;
  else if (move.promotion) text = `${me} leveled up into ${NAME(piece.color, move.promotion)}`;
  else text = `${me} ${STROLLS[(move.toR * 8 + move.toC) % STROLLS.length]} ${sqName(move.toR, move.toC)}`;
  if (resultStatus === 'checkmate') text += ' — and that is checkmate';
  else if (resultStatus === 'stalemate') text += ' — and nobody can move. awkward';
  else if (resultStatus === 'check') text += ', cornering the king';
  return text;
}

/* ------------------------------------------------------------------ sound -- */
let audioCtx = null;
function blip(key){
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    const t = audioCtx.currentTime;
    osc.type = key === 'capture' ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime(BLIP[key] || 330, t);
    osc.frequency.exponentialRampToValueAtTime((BLIP[key] || 330) * (key === 'checkmate' ? 0.5 : 1.6), t + 0.18);
    gain.gain.setValueAtTime(0.16, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t); osc.stop(t + 0.24);
  } catch { /* audio is flavour, never block the game on it */ }
}

/* -------------------------------------------------------------- reactions -- */
const queue = [];
let showing = false;

function fireReaction(key){ queue.push(key); if (!showing) nextReaction(); }

function nextReaction(){
  const key = queue.shift();
  if (!key){ showing = false; return; }
  showing = true;
  const slot = assets.reactions[key] || {};

  if (slot.audio){
    const a = new Audio(slot.audio);
    a.play().catch(() => blip(key));
  } else blip(key);

  if (!slot.image){ setTimeout(nextReaction, 260); return; }

  const overlay = $('overlay');
  const label = REACTIONS.find(r => r[0] === key)[1];
  overlay.innerHTML = `<img src="${slot.image}" alt="${label}"><div class="caption">${label}</div>`;
  overlay.hidden = false;
  const done = () => {
    clearTimeout(timer);
    overlay.hidden = true;
    overlay.onclick = null;
    nextReaction();
  };
  const timer = setTimeout(done, 2000);
  overlay.onclick = done;
}

/* ----------------------------------------------------------------- moving -- */
function canPlay(){
  if (busy || status === 'checkmate' || status === 'stalemate') return false;
  return !(vsComputer() && state.turn !== humanColor);
}

function squareRect(r, c){
  const el = document.querySelector(`.sq[data-r="${r}"][data-c="${c}"]`);
  return el ? el.getBoundingClientRect() : null;
}

// Capture exit-beat: fly a copy of the doomed piece off to its tray.
function flyToTray(piece, rect){
  if (!rect){ sidelined[piece.color].push(piece.type); renderTrays(); return; }
  const ghost = document.createElement('div');
  ghost.className = 'ghost';
  ghost.style.cssText = `left:${rect.left}px; top:${rect.top}px; width:${rect.width}px; height:${rect.height}px`;
  ghost.innerHTML = pieceHTML(piece);
  document.body.appendChild(ghost);

  const tray = $('tray-' + piece.color).getBoundingClientRect();
  void ghost.offsetWidth;
  const dx = tray.left + 20 - rect.left;
  const dy = tray.top + tray.height / 2 - rect.top - rect.height / 2;
  ghost.style.transform = `translate(${dx}px, ${dy}px) scale(.42) rotate(22deg)`;
  ghost.style.opacity = '.15';
  setTimeout(() => {
    ghost.remove();
    sidelined[piece.color].push(piece.type);
    renderTrays();
  }, 600);
}

// Slide the mover to its destination before anything else happens. The board is
// already repainted underneath, so the real destination piece stays hidden until
// the ghost lands on it — and the reaction GIF/sound only fires after that.
function slideTo(piece, fromRect, toRect, move, after){
  if (!fromRect || !toRect){ after(); return; }
  const dest = document.querySelector(`.sq[data-r="${move.toR}"][data-c="${move.toC}"] .piece`);
  if (dest) dest.style.visibility = 'hidden';

  const ghost = document.createElement('div');
  ghost.className = 'ghost slide';
  ghost.style.cssText =
    `left:${fromRect.left}px; top:${fromRect.top}px; width:${fromRect.width}px; height:${fromRect.height}px`;
  ghost.innerHTML = pieceHTML(piece);
  document.body.appendChild(ghost);

  void ghost.offsetWidth;   // flush the start position; rAF is unreliable in background tabs
  ghost.style.transform =
    `translate(${toRect.left - fromRect.left}px, ${toRect.top - fromRect.top}px)`;
  setTimeout(() => {
    ghost.remove();
    if (dest) dest.style.visibility = '';
    after();
  }, SLIDE_MS);
}

function doMove(move){
  const piece = state.board[move.fromR][move.fromC];
  const captured = move.enPassant
    ? state.board[move.fromR][move.toC]
    : state.board[move.toR][move.toC];
  const capturedRect = captured
    ? squareRect(move.enPassant ? move.fromR : move.toR, move.toC)
    : null;
  const fromRect = squareRect(move.fromR, move.fromC);
  const toRect = squareRect(move.toR, move.toC);

  const before = state;
  state = E.applyMove(before, move);
  lastMove = move;
  selected = null; legal = []; named = null;

  status = E.gameStatus(state);
  const sacrifice = E.isSacrifice(state, move, captured && captured.type);

  hanging = E.hangingPieces(state, state.turn);
  const hangKeys = new Set(hanging.map(h => `${h.r},${h.c}`));
  const newlyHanging = [...hangKeys].some(k => !prevHanging.has(k));
  prevHanging = hangKeys;

  logEntries.push({
    text: memeLine(move, piece, captured, status),
    san: longAlgebraic(move, piece, captured, status),
  });

  render();
  renderLog();

  // One base beat plus at most one "special" so overlays never stack up.
  const special = status === 'checkmate' ? 'checkmate'
    : status === 'stalemate' ? 'stalemate'
    : sacrifice ? 'sacrifice'
    : status === 'check' ? 'check'
    : newlyHanging ? 'danger'
    : null;

  busy = true;                       // no input while the piece is in flight
  slideTo(piece, fromRect, toRect, move, () => {
    busy = false;
    if (captured) flyToTray(captured, capturedRect);
    fireReaction(captured ? 'capture' : 'move');
    if (special) fireReaction(special);

    if (vsComputer() && state.turn !== humanColor && status !== 'checkmate' && status !== 'stalemate'){
      busy = true;
      setTimeout(computerMove, 420);
    }
    renderStatus();
  });
}

/* ------------------------------------------------------------------- input -- */
$('board').addEventListener('click', (ev) => {
  const cell = ev.target.closest('.sq');
  if (!cell || !canPlay()) return;
  const r = +cell.dataset.r, c = +cell.dataset.c;

  const matches = legal.filter(m => m.toR === r && m.toC === c);
  if (matches.length){
    if (matches.length > 1 && matches[0].promotion) askPromotion(matches);
    else doMove(matches[0]);
    return;
  }

  const piece = state.board[r][c];
  named = piece ? { r, c } : null;   // tapping any piece names it, own or not
  if (piece && piece.color === state.turn){
    selected = { r, c };
    legal = E.legalMovesForSquare(state, r, c);
  } else {
    selected = null; legal = [];
  }
  renderBoard();
});

function askPromotion(moves){
  pendingPromo = moves;
  const color = state.turn;
  $('promo-choices').innerHTML = ['q','r','b','n']
    .map(t => `<button data-promo="${t}">${pieceHTML({color, type:t})}</button>`).join('');
  $('promo').hidden = false;
}

$('promo-choices').addEventListener('click', (ev) => {
  const btn = ev.target.closest('button');
  if (!btn || !pendingPromo) return;
  const move = pendingPromo.find(m => m.promotion === btn.dataset.promo);
  pendingPromo = null;
  $('promo').hidden = true;
  doMove(move);
});

/* --------------------------------------------------------------- computer -- */
const CENTER = [
  [0,0,0,0,0,0,0,0],
  [0,1,1,1,1,1,1,0],
  [0,1,2,2,2,2,1,0],
  [0,1,2,3,3,2,1,0],
  [0,1,2,3,3,2,1,0],
  [0,1,2,2,2,2,1,0],
  [0,1,1,1,1,1,1,0],
  [0,0,0,0,0,0,0,0],
];

function evaluate(state, color){
  let score = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++){
    const p = state.board[r][c];
    if (!p) continue;
    const sign = p.color === color ? 1 : -1;
    score += sign * (E.PIECE_VALUE[p.type] * 100 + CENTER[r][c] * 4);
    // Mobility from pseudo-legal counts: cheap, and close enough for flavour.
    score += sign * E.pseudoMoves(state, r, c).length * 2;
  }
  return score;
}

function orderedMoves(state, color){
  return E.allLegalMoves(state, color).sort((a, b) => score(b) - score(a));
  function score(m){
    const victim = state.board[m.toR][m.toC];
    const mover = state.board[m.fromR][m.fromC];
    let s = victim ? E.PIECE_VALUE[victim.type] * 10 - E.PIECE_VALUE[mover.type] : 0;
    if (m.promotion === 'q') s += 80;
    return s;
  }
}

// ponytail: plain negamax on cloned states, runs on the main thread. Fine at
// 2-3 ply; if depth ever goes past 3, move it into a Web Worker.
function negamax(state, depth, alpha, beta, color){
  if (depth === 0) return evaluate(state, color);
  const moves = orderedMoves(state, color);
  if (!moves.length) return E.isInCheck(state, color) ? -1e6 - depth : 0;
  let best = -Infinity;
  for (const m of moves){
    const value = -negamax(E.applyMove(state, m), depth - 1, -beta, -alpha, E.opp(color));
    if (value > best) best = value;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

function computerMove(){
  const color = state.turn;
  const depth = +diffEl.value;
  const moves = orderedMoves(state, color);
  let best = moves[0], bestValue = -Infinity;
  for (const m of moves){
    const value = -negamax(E.applyMove(state, m), depth - 1, -Infinity, -bestValue, E.opp(color));
    if (value > bestValue){ bestValue = value; best = m; }
  }
  busy = false;
  if (best) doMove(best);
  else render();
}

/* --------------------------------------------------------- asset controls -- */
function readAsDataURL(file, cb){
  const reader = new FileReader();
  reader.onload = () => cb(reader.result);
  reader.readAsDataURL(file);
}

function buildPieceSlots(){
  const wrap = $('piece-slots');
  wrap.innerHTML = '';
  for (const color of ['w','b']) for (const type of ['k','q','r','b','n','p']){
    const key = `${color}_${type}`;
    const [emoji, name] = CAT[color][type];
    const slot = document.createElement('div');
    slot.className = 'slot';
    slot.innerHTML = `
      <div class="thumb" id="thumb-${key}">${emoji}</div>
      <div>
        <div class="name">${color === 'w' ? 'White' : 'Black'} ${type.toUpperCase()} · ${name}</div>
        <div class="row">
          <input type="file" accept="image/*" data-key="${key}">
          <button class="btn small" data-clear="${key}" hidden>remove</button>
        </div>
      </div>`;
    wrap.appendChild(slot);
  }
  Object.keys(assets.pieces).forEach(k => refreshPieceSlot(k)); // preloaded art

  wrap.addEventListener('change', (ev) => {
    const input = ev.target;
    if (!input.dataset.key || !input.files[0]) return;
    readAsDataURL(input.files[0], (url) => {
      assets.pieces[input.dataset.key] = url;
      refreshPieceSlot(input.dataset.key);
      render();
    });
  });

  wrap.addEventListener('click', (ev) => {
    const key = ev.target.dataset && ev.target.dataset.clear;
    if (!key) return;
    delete assets.pieces[key];
    const input = wrap.querySelector(`input[data-key="${key}"]`);
    if (input) input.value = '';
    refreshPieceSlot(key);
    render();
  });
}

function refreshPieceSlot(key){
  const url = assets.pieces[key];
  const [color, type] = key.split('_');
  $('thumb-' + key).innerHTML = url ? `<img src="${url}" alt="">` : CAT[color][type][0];
  const btn = $('piece-slots').querySelector(`button[data-clear="${key}"]`);
  if (btn) btn.hidden = !url;
}

function buildReactionSlots(){
  const wrap = $('reaction-slots');
  wrap.innerHTML = '';
  for (const [key, label, blurb] of REACTIONS){
    assets.reactions[key] = assets.reactions[key] || { image:null, audio:null };
    const slot = document.createElement('div');
    slot.className = 'slot';
    slot.innerHTML = `
      <div class="thumb" id="thumb-r-${key}">🎬</div>
      <div>
        <div class="name">${label}</div>
        <div class="hint" style="margin:2px 0">${blurb}</div>
        <div class="row">
          <span class="tag">GIF</span>
          <input type="file" accept="image/*" data-key="${key}" data-kind="image">
          <button class="btn small" data-clear="${key}" data-kind="image" hidden>x</button>
        </div>
        <div class="row">
          <span class="tag">Sound</span>
          <input type="file" accept="audio/*" data-key="${key}" data-kind="audio">
          <button class="btn small" data-preview="${key}" hidden>▶</button>
          <button class="btn small" data-clear="${key}" data-kind="audio" hidden>x</button>
        </div>
      </div>`;
    wrap.appendChild(slot);
  }

  wrap.addEventListener('change', (ev) => {
    const input = ev.target;
    if (!input.dataset.key || !input.files[0]) return;
    readAsDataURL(input.files[0], (url) => {
      assets.reactions[input.dataset.key][input.dataset.kind] = url;
      refreshReactionSlot(input.dataset.key);
    });
  });

  wrap.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button');
    if (!btn) return;
    if (btn.dataset.preview){
      const audio = assets.reactions[btn.dataset.preview].audio;
      if (audio) new Audio(audio).play().catch(() => {});
      return;
    }
    const key = btn.dataset.clear;
    if (!key) return;
    assets.reactions[key][btn.dataset.kind] = null;
    const input = wrap.querySelector(`input[data-key="${key}"][data-kind="${btn.dataset.kind}"]`);
    if (input) input.value = '';
    refreshReactionSlot(key);
  });
}

function refreshReactionSlot(key){
  const slot = assets.reactions[key];
  $('thumb-r-' + key).innerHTML = slot.image ? `<img src="${slot.image}" alt="">` : '🎬';
  const wrap = $('reaction-slots');
  wrap.querySelector(`button[data-clear="${key}"][data-kind="image"]`).hidden = !slot.image;
  wrap.querySelector(`button[data-clear="${key}"][data-kind="audio"]`).hidden = !slot.audio;
  wrap.querySelector(`button[data-preview="${key}"]`).hidden = !slot.audio;
}

/* ------------------------------------------------------------------- setup -- */
function newGame(){
  state = E.initialState();
  selected = null; legal = []; lastMove = null; named = null;
  sidelined = { w:[], b:[] };
  logEntries = [];
  hanging = []; prevHanging = new Set();
  status = 'playing';
  busy = false; pendingPromo = null;
  queue.length = 0;
  showing = false;
  $('promo').hidden = true;
  $('overlay').hidden = true;
  $('overlay').onclick = null;
  render();
  renderLog();
}

modeEl.addEventListener('change', () => {
  $('difficulty-wrap').hidden = !vsComputer();
  newGame();
});
diffEl.addEventListener('change', newGame);
$('newgame').addEventListener('click', newGame);

buildPieceSlots();
buildReactionSlots();
newGame();
