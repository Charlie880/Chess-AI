// Chess engine core — pure logic, no UI. Board: row0 = rank8 (top), row7 = rank1 (bottom).
// White starts row6/7, moves toward row0. Black starts row0/1, moves toward row7.

function initialState() {
  const back = ['r','n','b','q','k','b','n','r'];
  const board = Array.from({length:8}, ()=>Array(8).fill(null));
  for (let c=0;c<8;c++){
    board[0][c] = {type:back[c], color:'b'};
    board[1][c] = {type:'p', color:'b'};
    board[6][c] = {type:'p', color:'w'};
    board[7][c] = {type:back[c], color:'w'};
  }
  return {
    board,
    turn:'w',
    castling:{wK:true,wQ:true,bK:true,bQ:true},
    enPassant:null, // {r,c} square that can be captured onto
    halfmove:0,
    fullmove:1,
  };
}

function cloneState(s){
  return {
    board: s.board.map(row=>row.map(cell=>cell?{...cell}:null)),
    turn: s.turn,
    castling: {...s.castling},
    enPassant: s.enPassant ? {...s.enPassant} : null,
    halfmove: s.halfmove,
    fullmove: s.fullmove,
  };
}

function inB(r,c){ return r>=0 && r<8 && c>=0 && c<8; }
function opp(color){ return color==='w'?'b':'w'; }

const SLIDE_DIRS = {
  b: [[-1,-1],[-1,1],[1,-1],[1,1]],
  r: [[-1,0],[1,0],[0,-1],[0,1]],
  q: [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]],
};
const KNIGHT_OFFS = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
const KING_OFFS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];

const PIECE_VALUE = { p:1, n:3, b:3, r:5, q:9, k:0 };

// Pseudo-legal moves for one square, ignoring self-check. Includes special flags.
function pseudoMoves(state, r, c){
  const board = state.board;
  const piece = board[r][c];
  if (!piece) return [];
  const moves = [];
  const color = piece.color;

  if (piece.type === 'p'){
    const dir = color==='w' ? -1 : 1;
    const startRow = color==='w' ? 6 : 1;
    const promoRow = color==='w' ? 0 : 7;
    const oneR = r+dir;
    if (inB(oneR,c) && !board[oneR][c]){
      if (oneR===promoRow){
        for (const promo of ['q','r','b','n']) moves.push({fromR:r,fromC:c,toR:oneR,toC:c,promotion:promo});
      } else {
        moves.push({fromR:r,fromC:c,toR:oneR,toC:c});
        const twoR = r+2*dir;
        if (r===startRow && !board[twoR][c]){
          moves.push({fromR:r,fromC:c,toR:twoR,toC:c,doubleStep:true});
        }
      }
    }
    for (const dc of [-1,1]){
      const tr=r+dir, tc=c+dc;
      if (!inB(tr,tc)) continue;
      const target = board[tr][tc];
      if (target && target.color!==color){
        if (tr===promoRow){
          for (const promo of ['q','r','b','n']) moves.push({fromR:r,fromC:c,toR:tr,toC:tc,capture:true,promotion:promo});
        } else {
          moves.push({fromR:r,fromC:c,toR:tr,toC:tc,capture:true});
        }
      } else if (!target && state.enPassant && state.enPassant.r===tr && state.enPassant.c===tc){
        moves.push({fromR:r,fromC:c,toR:tr,toC:tc,capture:true,enPassant:true});
      }
    }
  } else if (piece.type === 'n'){
    for (const [dr,dc] of KNIGHT_OFFS){
      const tr=r+dr, tc=c+dc;
      if (!inB(tr,tc)) continue;
      const target = board[tr][tc];
      if (!target) moves.push({fromR:r,fromC:c,toR:tr,toC:tc});
      else if (target.color!==color) moves.push({fromR:r,fromC:c,toR:tr,toC:tc,capture:true});
    }
  } else if (piece.type === 'b' || piece.type === 'r' || piece.type === 'q'){
    for (const [dr,dc] of SLIDE_DIRS[piece.type]){
      let tr=r+dr, tc=c+dc;
      while (inB(tr,tc)){
        const target = board[tr][tc];
        if (!target){
          moves.push({fromR:r,fromC:c,toR:tr,toC:tc});
        } else {
          if (target.color!==color) moves.push({fromR:r,fromC:c,toR:tr,toC:tc,capture:true});
          break;
        }
        tr+=dr; tc+=dc;
      }
    }
  } else if (piece.type === 'k'){
    for (const [dr,dc] of KING_OFFS){
      const tr=r+dr, tc=c+dc;
      if (!inB(tr,tc)) continue;
      const target = board[tr][tc];
      if (!target) moves.push({fromR:r,fromC:c,toR:tr,toC:tc});
      else if (target.color!==color) moves.push({fromR:r,fromC:c,toR:tr,toC:tc,capture:true});
    }
    // Castling
    const homeRow = color==='w' ? 7 : 0;
    if (r===homeRow && c===4){
      const rights = state.castling;
      const kSide = color==='w' ? rights.wK : rights.bK;
      const qSide = color==='w' ? rights.wQ : rights.bQ;
      if (kSide && !board[homeRow][5] && !board[homeRow][6] &&
          board[homeRow][7] && board[homeRow][7].type==='r' && board[homeRow][7].color===color){
        if (!isSquareAttacked(state, homeRow, 4, opp(color)) &&
            !isSquareAttacked(state, homeRow, 5, opp(color)) &&
            !isSquareAttacked(state, homeRow, 6, opp(color))){
          moves.push({fromR:r,fromC:c,toR:homeRow,toC:6,castle:'K'});
        }
      }
      if (qSide && !board[homeRow][3] && !board[homeRow][2] && !board[homeRow][1] &&
          board[homeRow][0] && board[homeRow][0].type==='r' && board[homeRow][0].color===color){
        if (!isSquareAttacked(state, homeRow, 4, opp(color)) &&
            !isSquareAttacked(state, homeRow, 3, opp(color)) &&
            !isSquareAttacked(state, homeRow, 2, opp(color))){
          moves.push({fromR:r,fromC:c,toR:homeRow,toC:2,castle:'Q'});
        }
      }
    }
  }
  return moves;
}

// Is (r,c) attacked by any piece of color `byColor`?
function isSquareAttacked(state, r, c, byColor){
  const board = state.board;
  // Pawn attacks
  const pawnDir = byColor==='w' ? 1 : -1; // a white pawn attacking (r,c) sits at r+1
  for (const dc of [-1,1]){
    const pr = r+pawnDir, pc = c+dc;
    if (inB(pr,pc)){
      const p = board[pr][pc];
      if (p && p.type==='p' && p.color===byColor) return true;
    }
  }
  for (const [dr,dc] of KNIGHT_OFFS){
    const tr=r+dr, tc=c+dc;
    if (!inB(tr,tc)) continue;
    const p = board[tr][tc];
    if (p && p.type==='n' && p.color===byColor) return true;
  }
  for (const [dr,dc] of KING_OFFS){
    const tr=r+dr, tc=c+dc;
    if (!inB(tr,tc)) continue;
    const p = board[tr][tc];
    if (p && p.type==='k' && p.color===byColor) return true;
  }
  for (const [dr,dc] of SLIDE_DIRS.b){
    let tr=r+dr, tc=c+dc;
    while (inB(tr,tc)){
      const p = board[tr][tc];
      if (p){
        if (p.color===byColor && (p.type==='b'||p.type==='q')) return true;
        break;
      }
      tr+=dr; tc+=dc;
    }
  }
  for (const [dr,dc] of SLIDE_DIRS.r){
    let tr=r+dr, tc=c+dc;
    while (inB(tr,tc)){
      const p = board[tr][tc];
      if (p){
        if (p.color===byColor && (p.type==='r'||p.type==='q')) return true;
        break;
      }
      tr+=dr; tc+=dc;
    }
  }
  return false;
}

function findKing(state, color){
  const board = state.board;
  for (let r=0;r<8;r++) for (let c=0;c<8;c++){
    const p = board[r][c];
    if (p && p.type==='k' && p.color===color) return {r,c};
  }
  return null;
}

function isInCheck(state, color){
  const k = findKing(state, color);
  if (!k) return false;
  return isSquareAttacked(state, k.r, k.c, opp(color));
}

// Apply a move, returning new state. Does NOT check legality.
function applyMove(state, move){
  const s = cloneState(state);
  const board = s.board;
  const piece = board[move.fromR][move.fromC];
  const color = piece.color;

  // reset en passant, set new one if double step
  s.enPassant = null;

  if (move.enPassant){
    board[move.fromR][move.toC] = null; // captured pawn is beside the from-square rank
  }

  board[move.toR][move.toC] = { type: move.promotion || piece.type, color };
  board[move.fromR][move.fromC] = null;

  if (move.doubleStep){
    s.enPassant = { r:(move.fromR+move.toR)/2, c:move.fromC };
  }

  if (move.castle){
    const homeRow = move.fromR;
    if (move.castle==='K'){
      board[homeRow][5] = board[homeRow][7];
      board[homeRow][7] = null;
    } else {
      board[homeRow][3] = board[homeRow][0];
      board[homeRow][0] = null;
    }
  }

  // update castling rights
  if (piece.type==='k'){
    if (color==='w'){ s.castling.wK=false; s.castling.wQ=false; }
    else { s.castling.bK=false; s.castling.bQ=false; }
  }
  if (piece.type==='r'){
    if (color==='w' && move.fromR===7 && move.fromC===0) s.castling.wQ=false;
    if (color==='w' && move.fromR===7 && move.fromC===7) s.castling.wK=false;
    if (color==='b' && move.fromR===0 && move.fromC===0) s.castling.bQ=false;
    if (color==='b' && move.fromR===0 && move.fromC===7) s.castling.bK=false;
  }
  // if a rook is captured on its home square, remove that castling right
  if (move.toR===7 && move.toC===0) s.castling.wQ=false;
  if (move.toR===7 && move.toC===7) s.castling.wK=false;
  if (move.toR===0 && move.toC===0) s.castling.bQ=false;
  if (move.toR===0 && move.toC===7) s.castling.bK=false;

  // halfmove clock: reset on pawn move or capture
  if (piece.type==='p' || move.capture) s.halfmove = 0;
  else s.halfmove = state.halfmove + 1;

  s.turn = opp(color);
  if (color==='b') s.fullmove++;
  return s;
}

function legalMovesForSquare(state, r, c){
  const piece = state.board[r][c];
  if (!piece || piece.color !== state.turn) return [];
  const pseudo = pseudoMoves(state, r, c);
  const legal = [];
  for (const m of pseudo){
    const next = applyMove(state, m);
    if (!isInCheck(next, piece.color)) legal.push(m);
  }
  return legal;
}

function allLegalMoves(state, color){
  const moves = [];
  for (let r=0;r<8;r++) for (let c=0;c<8;c++){
    const p = state.board[r][c];
    if (p && p.color===color){
      moves.push(...legalMovesForSquare(state, r, c));
    }
  }
  return moves;
}

function gameStatus(state){
  const color = state.turn;
  const inCheck = isInCheck(state, color);
  const moves = allLegalMoves(state, color);
  if (moves.length===0){
    return inCheck ? 'checkmate' : 'stalemate';
  }
  return inCheck ? 'check' : 'playing';
}

// --- app-facing helpers (still pure logic, no DOM) ---------------------------

// Squares of `color` that are attacked by the opponent and defended by nobody.
function hangingPieces(state, color){
  const out = [];
  for (let r=0;r<8;r++) for (let c=0;c<8;c++){
    const p = state.board[r][c];
    if (!p || p.color!==color || p.type==='k') continue; // a king is never "hanging"
    if (isSquareAttacked(state, r, c, opp(color)) && !isSquareAttacked(state, r, c, color)){
      out.push({r, c, type:p.type});
    }
  }
  return out;
}

// One-ply sacrifice heuristic: the piece that just moved can be taken right now
// and it is worth more than whatever it captured. Not a static exchange eval.
function isSacrifice(nextState, move, capturedType){
  const landed = nextState.board[move.toR][move.toC];
  if (!landed) return false;
  const attacker = allLegalMoves(nextState, nextState.turn)
    .some(m => m.toR===move.toR && m.toC===move.toC);
  if (!attacker) return false;
  const gave = PIECE_VALUE[landed.type];
  const got = capturedType ? PIECE_VALUE[capturedType] : 0;
  return gave > got;
}

const API = { initialState, cloneState, pseudoMoves, isSquareAttacked, isInCheck,
  applyMove, legalMovesForSquare, allLegalMoves, gameStatus, opp, findKing,
  hangingPieces, isSacrifice, PIECE_VALUE };

if (typeof module !== 'undefined' && module.exports) module.exports = API;
else if (typeof window !== 'undefined') window.ChessEngine = API;
