"""Build the site in docs/ (GitHub Pages: main branch, /docs folder).

  python3 web/build.py

Pages: index.html (postflop solver), preflop.html (preflop and multiway), reports.html (aggregate flop reports),
demo.html (the river table used in the talk), methods.html (numerical methods and a short guide).
The solver pages load web/js/*.js as separate files so that the Web Workers can load the engine.
"""
import pathlib
import re
import shutil
import subprocess
import sys

web = pathlib.Path(__file__).resolve().parent
repo = web.parent
docs = repo / "docs"
PAGES = [("index.html", "Postflop"), ("preflop.html", "Preflop and multiway"), ("reports.html", "Flop reports"),
         ("demo.html", "Talk demo"), ("methods.html", "Methods")]
FONT = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fira+Sans:wght@400;500;600;700&display=swap">'


def nav(current):
    return '<nav class="nav" aria-label="Pages">' + "".join(
        f'<a href="{f}"{" aria-current=\"page\"" if f == current else ""}>{t}</a>' for f, t in PAGES) + "</nav>"


def head(title, current):
    return ("<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
            "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n"
            f"<title>{title} · DCFR poker solver</title>\n{FONT}\n<link rel=\"stylesheet\" href=\"css/site.css\">\n"
            "<style>body{margin:0}</style>\n</head>\n<body>\n"
            f"<div class=\"top\"><div class=\"top-in\"><h1><a href=\"index.html\">DCFR poker solver</a></h1>"
            f"<span class=\"sub1\">{title}</span>{nav(current)}</div></div>\n")


def main():
    docs.mkdir(exist_ok=True)
    for sub in ("js", "css"):
        (docs / sub).mkdir(exist_ok=True)
    for f in (web / "js").glob("*.js"):
        shutil.copy(f, docs / "js" / f.name)
    shutil.copy(web / "css" / "site.css", docs / "css" / "site.css")
    (docs / "data").mkdir(exist_ok=True)
    for name in ("c2.u16", "eq2.f32", "eq3r.f32"):          # eq3.u16 (the full three-way table) stays in the repository
        shutil.copy(web / "data" / name, docs / "data" / name)
    for name, title in PAGES:
        src = web / "pages" / name
        if name == "demo.html" or not src.exists():
            continue
        body = src.read_text()
        m = re.match(r"<!--HEAD (.*?)-->\n", body)
        page = head(m.group(1) if m else title, name) + (body[m.end():] if m else body) + "</body>\n</html>\n"
        (docs / name).write_text(page)
        print("wrote", docs / name)
    # the talk demo: the single-file river app, with the site navigation added to its header bar
    subprocess.run([sys.executable, str(repo / "app" / "build.py")], check=True, stdout=subprocess.DEVNULL)
    demo = (repo / "app" / "poker-solver.html").read_text()
    navcss = ("<style>.nav{display:flex;flex-wrap:wrap;gap:2px;margin-left:auto}.nav a{color:var(--bar-fg);text-decoration:none;"
              "font-size:13.5px;padding:5px 12px;border-radius:5px;opacity:.78}.nav a:hover{opacity:1;background:rgba(252,252,251,.12)}"
              ".nav a[aria-current=page]{opacity:1;background:rgba(252,252,251,.18);font-weight:600}</style>")
    demo = demo.replace("</head>", navcss + "\n</head>", 1)
    demo = demo.replace('<button class="btn" id="btnGuide" type="button">Demo guide</button>',
                        '<button class="btn" id="btnGuide" type="button">Demo guide</button>' + nav("demo.html"), 1)
    (docs / "demo.html").write_text(demo)
    (docs / ".nojekyll").write_text("")
    print("wrote", docs / "demo.html")


if __name__ == "__main__":
    main()
