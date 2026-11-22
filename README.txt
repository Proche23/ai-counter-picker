AI Counter Picker - in-browser version
=======================================

Everything here is plain files: put this folder on any static web host and anyone can open it, with
nothing to install. The engine (Python, in the browser through Pyodide) starts in the page; the first
visit downloads about 15 MB (Python itself from cdn.jsdelivr.net, plus the statistics), then the
browser keeps it.

Try it on this PC:   py -m http.server 8780 -d site      then open http://127.0.0.1:8780
(Opening index.html straight from the folder doesn't work: browsers only run the engine from a web address.)

Put it online for free, for example:
  * GitHub Pages: make a repository, upload the contents of this folder, Settings > Pages > deploy from the branch.
  * Netlify: drag this folder onto app.netlify.com/drop.
  * Cloudflare Pages: create a project and upload this folder.

Refresh the data: on the PC run update.bat (new pro games), then py build_web.py, then upload again.

Not in the browser version (they need the PC next to League): following the League client, phone mode,
the tracker window, Riot-key look-ups, the Players page and pro-game replays.

If you put it online for others: Riot asks every public fan site to register at developer.riotgames.com
(free) and to show the legal line in the footer (already there). Leaguepedia's data is CC BY-SA 3.0.
