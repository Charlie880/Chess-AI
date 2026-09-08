# Design canvas

Working files for the Chess AI design canvas. `_gen.py` emits the `.dc.html`
artboards (the board is generated as literal markup so the canvas editor shows
real squares rather than template placeholders), and `chess-ai-interface.html`
is the seeded canvas that gets published.

To change a design: edit `_gen.py`, `python _gen.py`, then re-seed and
republish the same artifact. Never edit the seeded output file directly.

The implementation in `frontend/` is the source of truth for tokens; the
artboards are drawn from it. Where the two differ deliberately, the code wins -
notably the legal-move indicator, which flips to a light dot on dark squares
because a dark one cannot reach the 3:1 non-text contrast floor there.
