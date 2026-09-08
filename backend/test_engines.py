"""Smallest checks that fail if the search logic breaks. Run: python test_engines.py"""

import chess
from engines import minmax_engine as mm


def test_finds_mate_in_one():
    # After 1.f3 e5 2.g4, black mates with Qh4#.
    board = chess.Board("rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2")
    assert mm.get_move(board, depth=2).uci() == "d8h4"


def test_avoids_mate_in_one():
    # Same position one ply earlier: white must not play g4 and walk into Qh4#.
    board = chess.Board("rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2")
    assert mm.get_move(board, depth=3).uci() != "g2g4"


def test_takes_free_material():
    # Black queen hangs on d5; white pawn on e4 must capture it.
    board = chess.Board("rnb1kbnr/ppp1pppp/8/3q4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3")
    assert mm.get_move(board, depth=2).uci() == "e4d5"


def test_terminal_scores_signed_correctly():
    # White is mated -> strongly negative; stalemate -> exactly zero.
    mated = chess.Board("rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3")
    assert mated.is_checkmate() and mm.terminal_score(mated, 0) < -50_000
    stale = chess.Board("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1")
    assert stale.is_stalemate() and mm.terminal_score(stale, 0) == 0


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_"):
            fn()
            print(f"{name} ok")
    print("all ok")
