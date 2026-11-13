"""Assemble the app from app/src into single self-contained HTML files.

  python3 app/build.py            writes app/poker-solver.html (open it in any browser, works offline);
                                  web/build.py copies it into the site as docs/demo.html
  python3 app/build.py OUT.html   also writes the same page as a fragment without <html>/<head> wrappers
"""
import pathlib
import sys

here = pathlib.Path(__file__).parent
src = here / "src"
css, body, solver, app = [(src / n).read_text() for n in ("style.css", "body.html", "solver.js", "app.js")]
font = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fira+Sans:wght@400;500;600;700&display=swap">'
core = f"<style>\n{css}</style>\n{body}\n<script>\n{solver}</script>\n<script>\n{app}</script>\n"

page = ("<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n"
        f"<title>River Solver Table</title>\n{font}\n<style>body{{margin:0}}</style>\n</head>\n<body>\n{core}</body>\n</html>\n")
(here / "poker-solver.html").write_text(page)
print("wrote", here / "poker-solver.html", len(page) // 1024, "kB")
# the site in docs/ is assembled by web/build.py, which adds this page as docs/demo.html

if len(sys.argv) > 1:
    frag = f"<title>River Solver Table</title>\n<meta name=\"claude:viewport-fit-sides\" content=\"cover\">\n{font}\n{core}"
    pathlib.Path(sys.argv[1]).write_text(frag)
    print("wrote", sys.argv[1])
