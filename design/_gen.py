# -*- coding: utf-8 -*-
"""Artboards, emitted with literal markup so the canvas shows real squares."""
import json, pathlib

# One accent, everything else neutral. Down from twelve values across three
# hue families (ink/slate + walnut/maple + brass/moss/alarm) to seven, six of
# which carry no chroma at all.
BG      = "#0E1012"
RAISE   = "#16191C"
LINE    = "#23272B"
TEXT    = "#F0F1F2"
MUTE    = "#868C92"
ACCENT  = "#D8A33F"
LIGHT   = "#E9E7E2"   # light square: bone
DARK    = "#575D63"   # dark square: graphite
W_PIECE = "#FAF9F7"
B_PIECE = "#1A1C1E"

VS = "\ufe0e"
G = {k: v + VS for k, v in
     {"k": "\u265a", "q": "\u265b", "r": "\u265c", "b": "\u265d", "n": "\u265e", "p": "\u265f"}.items()}
SYM = "'Segoe UI Symbol', 'DejaVu Sans', serif"

FILES, RANKS = "abcdefgh", "87654321"
FEN = "r1bqkbnr/1pp2ppp/p1p5/4p3/4P3/5N2/PPPP1PPP/RNBQ1RK1"
LAST = ("h1", "f1")

def parse(fen):
    out = {}
    for r, row in enumerate(fen.split("/")):
        f = 0
        for ch in row:
            if ch.isdigit():
                f += int(ch)
            else:
                out[FILES[f] + RANKS[r]] = ch
                f += 1
    return out

BOARD = parse(FEN)

def board_html(size, coords=True):
    """No wooden surround any more - the board is the object, held by a single
    hairline. The last move is marked by an inset accent rule rather than a
    coloured fill, which keeps the surface monochrome."""
    sq = size / 8
    glyph, coord = round(sq * 0.72), round(sq * 0.17)
    cells = []
    for r, rank in enumerate(RANKS):
        for f, file in enumerate(FILES):
            name = file + rank
            light = (f + r) % 2 == 0
            bg = LIGHT if light else DARK
            mark = f"box-shadow: inset 0 0 0 2px {ACCENT}; " if name in LAST else ""
            inner = []
            ink = "rgba(14,16,18,.55)" if light else "rgba(233,231,226,.65)"
            if coords and r == 7:
                inner.append(f'<span style="position: absolute; right: 4px; bottom: 2px; font-size: {coord}px; '
                             f'font-weight: 500; font-stretch: 84%; line-height: 1; color: {ink}">{file}</span>')
            if coords and f == 0:
                inner.append(f'<span style="position: absolute; left: 4px; top: 2px; font-size: {coord}px; '
                             f'font-weight: 500; font-stretch: 84%; line-height: 1; color: {ink}">{rank}</span>')
            p = BOARD.get(name)
            if p:
                white = p.isupper()
                colour = W_PIECE if white else B_PIECE
                shadow = ("0 0 1px rgba(26,28,30,.9), 1px 1px 0 rgba(26,28,30,.55)" if white
                          else "0 0 1px rgba(250,249,247,.35)")
                inner.append(f'<span style="font-size: {glyph}px; line-height: 1; color: {colour}; '
                             f'text-shadow: {shadow}; font-family: {SYM}">{G[p.lower()]}</span>')
            cells.append(f'<div style="position: relative; display: flex; align-items: center; '
                         f'justify-content: center; background: {bg}; {mark}overflow: hidden">'
                         f'{"".join(inner)}</div>')
    return (f'<div style="display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); '
            f'grid-template-rows: repeat(8, {sq}px); width: {size}px; height: {size}px; '
            f'box-shadow: 0 0 0 1px {LINE}, 0 24px 60px -24px rgba(0,0,0,.8)">' + "".join(cells) + "</div>")

FONT = ('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n  '
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?'
        'family=Archivo:wdth,wght@75..125,300..700&display=swap">')

PROPS = ('{"accent":{"editor":"color","default":"' + ACCENT +
         '","options":["' + ACCENT + '","#E4E6E8","#7FA7C4","#C57B5A"],"section":"Theme"}}')

def shell(body):
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  {FONT}
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <style>
    body {{ margin: 0; background: {BG}; color: {TEXT};
      font-family: Archivo, 'Helvetica Neue', Arial, sans-serif;
      -webkit-font-smoothing: antialiased; }}
    a {{ color: {ACCENT}; text-decoration: none; }}
    a:hover {{ color: #E6B75C; }}
    .fig {{ font-variant-numeric: tabular-nums lining-nums; }}
    .wide {{ font-stretch: 115%; }}
    .narrow {{ font-stretch: 84%; }}
  </style>
</helmet>
{body}
</x-dc>
<script data-dc-script data-props='{PROPS}'>
class Component extends DCLogic {{
  renderVals() {{ return {{ accent: this.props.accent ?? "{ACCENT}" }}; }}
}}
</script>
</body>
</html>
"""
print("base ready")

BOARD_PX = 620

def topbar(engine="Normal", right_action="New game", identity="Guest 8Szv", middle=True):
    """Global controls belong here, not stacked in a column beside the board."""
    tabs = "".join(
        f'<span style="padding: 4px 2px; font-size: 15px; '
        f'color: {TEXT if t == engine else MUTE}; font-weight: {600 if t == engine else 400}; '
        f'border-bottom: 2px solid {"var(--accent)" if t == engine else "transparent"}">{t}</span>'
        for t in ("Easy", "Normal", "Hard")) if middle else ""
    mid = (f'<div style="display: flex; gap: 26px; align-items: center">{tabs}</div>'
           if middle else "<div></div>")
    return (f'<header style="display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; '
            f'height: 64px; padding: 0 56px; border-bottom: 1px solid {LINE}">'
            f'<span class="wide" style="font-size: 16px; font-weight: 600; letter-spacing: -.01em">Chess AI</span>'
            f'{mid}'
            f'<div style="display: flex; align-items: center; justify-content: flex-end; gap: 24px">'
            f'<span style="font-size: 14px; color: {MUTE}">{identity}</span>'
            f'<span style="font-size: 15px; font-weight: 600; color: var(--accent)">{right_action}</span>'
            f'</div></header>')

def player_line(name, detail, captured, active, top):
    """A line of type on the ground, not a filled block. The accent dot is the
    only thing that says whose move it is."""
    edge = ("border-bottom: 1px solid %s" % LINE) if top else ("border-top: 1px solid %s" % LINE)
    dot = (f'<span style="width: 7px; height: 7px; border-radius: 50%; background: var(--accent)"></span>'
           if active else '<span style="width: 7px; height: 7px"></span>')
    taken = "".join(f'<span style="margin-left: -5px; font-family: {SYM}">{G[p]}</span>' for p in captured)
    taken_html = (f'<span style="display: flex; font-size: 18px; line-height: 1; padding-left: 5px; '
                  f'color: {MUTE}">{taken}</span>' if captured else "")
    return (f'<div style="display: flex; align-items: center; gap: 10px; height: 48px; {edge}">'
            f'{dot}'
            f'<span style="font-size: 16px; font-weight: 500">{name}</span>'
            f'<span style="font-size: 14px; color: {MUTE}">{detail}</span>'
            f'<span style="margin-left: auto">{taken_html}</span></div>')

MOVES = [
    (1, "Pawn e2 to e4", "e4", "Pawn e7 to e5", "e5"),
    (2, "Knight g1 to f3", "Nf3", "Knight b8 to c6", "Nc6"),
    (3, "Bishop f1 to b5", "Bb5", "Pawn a7 to a6", "a6"),
    (4, "Bishop b5 takes knight c6", "Bxc6", "Pawn d7 takes bishop c6", "dxc6"),
    (5, "Castles kingside", "O-O", None, None),
]

def movelist():
    rows = []
    for n, wt, ws, bt, bs in MOVES:
        for is_w, text, san in ((True, wt, ws), (False, bt, bs)):
            if text is None:
                continue
            rows.append(
                f'<li style="display: grid; grid-template-columns: 18px 1fr auto; align-items: baseline; '
                f'column-gap: 12px; padding: 5px 0">'
                f'<span class="fig" style="text-align: right; font-size: 13px; color: {MUTE}">'
                f'{n if is_w else ""}</span>'
                f'<span style="font-size: 15px; line-height: 1.35; color: {TEXT if is_w else MUTE}">{text}</span>'
                f'<span class="fig" style="font-size: 13px; color: {MUTE}">{san}</span></li>')
    return f'<ol style="list-style: none; margin: 0; padding: 0">{"".join(rows)}</ol>'

def text_button(label, accent=False):
    colour = "var(--accent)" if accent else MUTE
    return (f'<span style="font-size: 15px; color: {colour}; '
            f'{"font-weight: 600" if accent else ""}">{label}</span>')

def history_section():
    rows = "".join(
        f'<div style="display: grid; grid-template-columns: 120px 1fr 90px 70px; align-items: baseline; '
        f'gap: 24px; padding: 14px 0; border-top: 1px solid {LINE}">'
        f'<span style="font-size: 15px; color: {colour}">{result}</span>'
        f'<span style="font-size: 15px; color: {MUTE}">{opponent}</span>'
        f'<span class="fig" style="font-size: 15px; color: {MUTE}">{moves} moves</span>'
        f'<span style="font-size: 15px; color: {MUTE}">{when}</span></div>'
        for result, colour, opponent, moves, when in [
            ("Won", TEXT, "Minimax as black", "24", "Today"),
            ("Lost", MUTE, "Stockfish as white", "31", "Today"),
            ("Drew", MUTE, "Neural net as white", "58", "Yesterday")])
    # Distinguished by brightness rather than by adding green and red back in.
    return (f'<section style="padding: 44px 56px 48px">'
            f'<div style="display: flex; align-items: baseline; gap: 32px">'
            f'<h2 class="wide" style="margin: 0; font-size: 22px; font-weight: 600; '
            f'letter-spacing: -.01em">Your games</h2>'
            f'<span class="fig" style="font-size: 15px; color: {MUTE}">'
            f'<span style="color: {TEXT}">4 won</span> · 7 lost · 1 drawn</span></div>'
            f'<div style="margin-top: 20px">{rows}</div></section>')
print("pieces ready")

def three_column(left, centre, right, height=836):
    """Board dead-centre on the page, one job in each flanking column. The old
    layout put six stacked zones in a single 368px rail."""
    return (f'<main style="display: grid; grid-template-columns: 300px {BOARD_PX}px 300px; '
            f'gap: 54px; justify-content: center; align-items: start; height: {height}px; '
            f'box-sizing: border-box; padding: 40px 56px">'
            f'<div style="padding-top: 48px">{left}</div>'
            f'<div>{centre}</div>'
            f'<div style="padding-top: 48px">{right}</div></main>')

def board_stack(top, bottom, size=BOARD_PX):
    return f'<div>{top}{board_html(size)}{bottom}</div>'

def status(title, note=None):
    note_html = (f'<p style="margin: 10px 0 0; font-size: 15px; line-height: 1.45; color: {MUTE}">{note}</p>'
                 if note else "")
    return (f'<p class="wide" style="margin: 0; font-size: 30px; font-weight: 600; line-height: 1.15; '
            f'letter-spacing: -.02em">{title}</p>{note_html}')

# ------------------------------------------------------------------- Main ----
main_left = (
    status("White to move")
    + f'<div style="margin-top: 34px; padding-top: 22px; border-top: 1px solid {LINE}">'
      f'<p style="margin: 0; font-size: 15px; font-weight: 500">Minimax</p>'
      f'<p style="margin: 6px 0 0; font-size: 14px; line-height: 1.45; color: {MUTE}">'
      f'2-ply search, counts material, finds mate in one</p></div>'
    + f'<div style="display: flex; flex-direction: column; gap: 14px; margin-top: 30px">'
      f'{text_button("Resign")}{text_button("Flip board")}{text_button("Play someone else", accent=True)}</div>')

main_right = (
    f'<p style="margin: 0 0 14px; font-size: 14px; color: {MUTE}">5 moves</p>' + movelist())

main_body = (
    f'<div style="--accent: {{{{accent}}}}; width: 1440px; height: 1200px; box-sizing: border-box; '
    f'background: {BG}; display: flex; flex-direction: column">'
    f'{topbar()}'
    f'{three_column(main_left, board_stack(player_line("Minimax", "engine", ["n"], False, True), player_line("Guest 8Szv", "white", ["b"], True, False)), main_right)}'
    f'<div style="border-top: 1px solid {LINE}">{history_section()}</div>'
    f'</div>')
pathlib.Path("Main.dc.html").write_text(shell(main_body), encoding="utf-8")

# ------------------------------------------------------------------- Room ----
def seat(label, colour, name=None, you=False, detail=None):
    swatch = (f'<span style="width: 12px; height: 12px; flex: none; background: '
              f'{W_PIECE if colour == "w" else B_PIECE}; box-shadow: 0 0 0 1px {LINE}"></span>')
    if name:
        body = (f'<span style="font-size: 15px">{name}'
                + (f'<span style="color: {MUTE}"> (you)</span>' if you else "") + "</span>"
                + (f'<span style="font-size: 13px; color: {MUTE}"> · {detail}</span>' if detail else ""))
    else:
        body = (f'<span style="display: flex; gap: 16px">'
                f'<span style="font-size: 15px; font-weight: 600; color: var(--accent)">Sit here</span>'
                f'<span style="font-size: 15px; color: {MUTE}">Add an engine</span></span>')
    return (f'<div style="display: flex; align-items: center; gap: 10px; padding: 11px 0; '
            f'border-top: 1px solid {LINE}">{swatch}'
            f'<span style="width: 40px; flex: none; font-size: 14px; color: {MUTE}">{label}</span>'
            f'{body}</div>')

room_left = (
    status("Your move")
    + f'<div style="margin-top: 30px">{seat("White", "w", "Guest 8Szv", you=True)}'
      f'{seat("Black", "b", "Linus")}'
      f'<p style="margin: 14px 0 0; font-size: 14px; color: {MUTE}">Grace and Hopper are watching</p></div>'
    + f'<div style="display: flex; flex-direction: column; gap: 14px; margin-top: 28px">'
      f'{text_button("Resign")}{text_button("Flip board")}</div>')

share = (f'<div style="margin-top: 32px; padding-top: 22px; border-top: 1px solid {LINE}">'
         f'<p style="margin: 0 0 10px; font-size: 14px; line-height: 1.45; color: {MUTE}">'
         f'Anyone with this link can take a seat or watch.</p>'
         f'<div style="display: flex; align-items: center; gap: 12px">'
         f'<span class="fig" style="font-size: 14px; color: {TEXT}; white-space: nowrap; overflow: hidden; '
         f'text-overflow: ellipsis">chess.example/room/lvhmB4uGOSrO</span>'
         f'<span style="font-size: 15px; font-weight: 600; color: var(--accent)">Copy</span></div></div>')

room_body = (
    f'<div style="--accent: {{{{accent}}}}; width: 1440px; height: 900px; box-sizing: border-box; '
    f'background: {BG}; display: flex; flex-direction: column">'
    f'{topbar(right_action="Leave room", identity="Guest 8Szv", middle=False)}'
    f'{three_column(room_left, board_stack(player_line("Linus", "black", ["n"], False, True), player_line("Guest 8Szv", "white", ["b"], True, False)), f"<p style=\'margin: 0 0 14px; font-size: 14px; color: {MUTE}\'>5 moves</p>" + movelist() + share)}'
    f'</div>')
pathlib.Path("Room.dc.html").write_text(shell(room_body), encoding="utf-8")
print("Main + Room written")

# ----------------------------------------------------------------- Invite ----
# One column, centred, nothing else on screen. The board sits underneath at low
# contrast so the page says what it is before a word is read.
invite_body = (
    f'<div style="--accent: {{{{accent}}}}; position: relative; width: 1440px; height: 900px; '
    f'box-sizing: border-box; background: {BG}; overflow: hidden">'
    f'<div style="position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); '
    f'opacity: .14; filter: saturate(0)">{board_html(760, coords=False)}</div>'
    f'<div style="position: absolute; inset: 0; background: '
    f'radial-gradient(circle at 50% 50%, rgba(14,16,18,.55) 0%, {BG} 68%)"></div>'
    f'<div style="position: relative; height: 100%; display: flex; flex-direction: column">'
    f'{topbar(right_action="", identity="", middle=False)}'
    f'<main style="flex: 1; display: flex; align-items: center; justify-content: center">'
    f'<section style="width: 440px; text-align: center">'
    f'<p style="margin: 0 0 14px; font-size: 14px; color: var(--accent)">Linus invited you</p>'
    f'<h1 class="wide" style="margin: 0; font-size: 46px; font-weight: 600; line-height: 1.08; '
    f'letter-spacing: -.025em">A game is waiting</h1>'
    f'<p style="margin: 16px 0 0; font-size: 16px; line-height: 1.5; color: {MUTE}">'
    f'Black is open. Take it, or watch the board move by move.</p>'
    f'<div style="display: flex; flex-direction: column; gap: 12px; margin-top: 34px">'
    f'<div style="display: flex; align-items: center; justify-content: center; height: 46px; '
    f'border: 1px solid {LINE}; background: {RAISE}; font-size: 15px">Guest 8Szv</div>'
    f'<div style="display: flex; align-items: center; justify-content: center; height: 46px; '
    f'background: var(--accent); color: {BG}; font-size: 15px; font-weight: 600">Take the black seat</div>'
    f'<div style="display: flex; align-items: center; justify-content: center; height: 46px; '
    f'font-size: 15px; color: {MUTE}">Just watch</div></div>'
    f'<p style="margin: 26px 0 0; font-size: 14px; line-height: 1.5; color: {MUTE}">'
    f'Your games are saved to this browser. <a href="#">Sign in</a> to keep them across devices.</p>'
    f'</section></main></div></div>')
pathlib.Path("Invite.dc.html").write_text(shell(invite_body), encoding="utf-8")

# ----------------------------------------------------------------- Mobile ----
M = 342
m_recent = "".join(
    f'<li style="display: grid; grid-template-columns: 16px 1fr auto; align-items: baseline; '
    f'column-gap: 10px; padding: 5px 0">'
    f'<span class="fig" style="text-align: right; font-size: 13px; color: {MUTE}">{n}</span>'
    f'<span style="font-size: 15px; line-height: 1.3; color: {col}">{t}</span>'
    f'<span class="fig" style="font-size: 13px; color: {MUTE}">{s}</span></li>'
    for n, col, t, s in [
        ("4", TEXT, "Bishop b5 takes knight c6", "Bxc6"),
        ("", MUTE, "Pawn d7 takes bishop c6", "dxc6"),
        ("5", TEXT, "Castles kingside", "O-O")])

def m_line(name, detail, captured, active, top):
    edge = ("border-bottom: 1px solid %s" % LINE) if top else ("border-top: 1px solid %s" % LINE)
    dot = (f'<span style="width: 6px; height: 6px; border-radius: 50%; background: var(--accent)"></span>'
           if active else '<span style="width: 6px; height: 6px"></span>')
    taken = "".join(f'<span style="margin-left: -5px; font-family: {SYM}">{G[p]}</span>' for p in captured)
    return (f'<div style="display: flex; align-items: center; gap: 9px; height: 44px; {edge}">{dot}'
            f'<span style="font-size: 15px; font-weight: 500">{name}</span>'
            f'<span style="font-size: 13px; color: {MUTE}">{detail}</span>'
            f'<span style="margin-left: auto; display: flex; font-size: 17px; line-height: 1; '
            f'color: {MUTE}">{taken}</span></div>')

mobile_body = (
    f'<div style="--accent: {{{{accent}}}}; width: 390px; height: 844px; box-sizing: border-box; '
    f'background: {BG}; display: flex; flex-direction: column">'
    f'<header style="display: flex; align-items: center; justify-content: space-between; height: 52px; '
    f'padding: 0 24px; border-bottom: 1px solid {LINE}">'
    f'<span class="wide" style="font-size: 15px; font-weight: 600">Chess AI</span>'
    f'<span style="font-size: 14px; color: {MUTE}">Guest 8Szv</span></header>'
    f'<div style="padding: 0 24px">'
    f'{m_line("Linus", "black", ["n"], False, True)}'
    f'{board_html(M)}'
    f'{m_line("Guest 8Szv", "white", ["b"], True, False)}'
    f'</div>'
    f'<div style="padding: 22px 24px 0">'
    f'<p class="wide" style="margin: 0; font-size: 26px; font-weight: 600; letter-spacing: -.02em">'
    f'Your move</p></div>'
    # Full-width targets in one row, rather than the desktop columns stacked
    # into a long scroll.
    f'<div style="display: flex; gap: 10px; padding: 18px 24px 0">'
    f'<div style="flex: 1; display: flex; align-items: center; justify-content: center; height: 48px; '
    f'background: var(--accent); color: {BG}; font-size: 15px; font-weight: 600">Share link</div>'
    f'<div style="flex: 1; display: flex; align-items: center; justify-content: center; height: 48px; '
    f'border: 1px solid {LINE}; color: {MUTE}; font-size: 15px">Resign</div>'
    f'<div style="width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; '
    f'border: 1px solid {LINE}; color: {MUTE}">'
    f'<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" '
    f'stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h9l-2.5-2.5M16 13H7l2.5 2.5"/></svg>'
    f'</div></div>'
    f'<div style="margin: 22px 24px 0; padding-top: 14px; border-top: 1px solid {LINE}">'
    f'<ol style="list-style: none; margin: 0; padding: 0">{m_recent}</ol></div>'
    f'</div>')
pathlib.Path("Mobile.dc.html").write_text(shell(mobile_body), encoding="utf-8")

pathlib.Path("canvas.json").write_text(json.dumps({
    "artboards": [
        {"file": "Main.dc.html", "x": 0, "y": 0, "w": 1440, "h": 1200, "title": "Single player"},
        {"file": "Room.dc.html", "x": 1560, "y": 0, "w": 1440, "h": 900, "title": "Room"},
        {"file": "Invite.dc.html", "x": 3120, "y": 0, "w": 1440, "h": 900, "title": "Invite"},
        {"file": "Mobile.dc.html", "x": 4680, "y": 0, "w": 390, "h": 844, "title": "Phone"},
    ],
    "annotations": [
        {"id": "direction", "x": 0, "y": -170, "w": 700,
         "text": "Simpler palette: seven values, six of them neutral. The wooden board is gone "
                 "(bone and graphite squares), and the last move is an inset accent rule rather "
                 "than a coloured fill, so the accent is the only chroma on the page.\n"
                 "Nothing is stacked in one rail any more: global controls sit in the top bar, "
                 "the board is dead-centre, and each flanking column does one job. History is its "
                 "own full-width section below the fold."},
    ],
    "launch": {"view": "canvas"},
}, indent=2), encoding="utf-8")
print("Invite + Mobile + canvas.json written")
