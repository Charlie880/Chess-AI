// Run: node engine.test.js
const assert = require('assert');
const E = require('./chess-engine.js');

function perft(state, depth){
  if (depth === 0) return 1;
  let n = 0;
  for (const m of E.allLegalMoves(state, state.turn)) n += perft(E.applyMove(state, m), depth-1);
  return n;
}

const EXPECTED = [1, 20, 400, 8902, 197281];
EXPECTED.forEach((want, d) => {
  const got = perft(E.initialState(), d);
  assert.strictEqual(got, want, `perft(${d}) = ${got}, want ${want}`);
  console.log(`perft(${d}) = ${got} ok`);
});

// Sparse position builder: pieces given as {'e1':'wk', 'd5':'wq', ...}
function pos(pieces, turn){
  const s = E.initialState();
  s.board = Array.from({length:8}, ()=>Array(8).fill(null));
  s.castling = {wK:false,wQ:false,bK:false,bQ:false};
  s.turn = turn;
  for (const [sq, code] of Object.entries(pieces)){
    const c = sq.charCodeAt(0) - 97;
    const r = 8 - Number(sq[1]);
    s.board[r][c] = {color: code[0], type: code[1]};
  }
  return s;
}
const sq = (name) => ({r: 8 - Number(name[1]), c: name.charCodeAt(0) - 97});

// hanging: white queen on d5 attacked by the c6 pawn, defended by nobody
{
  const s = pos({e1:'wk', e8:'bk', d5:'wq', c6:'bp'}, 'w');
  const hang = E.hangingPieces(s, 'w').map(h => `${h.r},${h.c}`);
  const d5 = sq('d5');
  assert.ok(hang.includes(`${d5.r},${d5.c}`), 'queen on d5 should be hanging: ' + hang);
  // the c6 pawn is hanging right back; the kings never count
  const black = E.hangingPieces(s, 'b');
  assert.strictEqual(black.length, 1, 'only c6 hangs for black');
  assert.strictEqual(black[0].type, 'p');
}

// sacrifice: queen takes a pawn that is defended
{
  const s = pos({e1:'wk', e8:'bk', d5:'wq', c6:'bp', b7:'bp'}, 'w');
  const move = {fromR:3, fromC:3, toR:2, toC:2, capture:true};
  assert.ok(E.isSacrifice(E.applyMove(s, move), move, 'p'), 'Qxc6 should read as a sacrifice');
}
// ...but taking a free pawn is not
{
  const s = pos({e1:'wk', e8:'bk', d5:'wq', c6:'bp'}, 'w');
  const move = {fromR:3, fromC:3, toR:2, toC:2, capture:true};
  assert.ok(!E.isSacrifice(E.applyMove(s, move), move, 'p'), 'free pawn is not a sacrifice');
}

console.log('all ok');
