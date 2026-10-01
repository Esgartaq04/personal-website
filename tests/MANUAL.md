# Manual checklist

The DOM layer has no automated tests. Walk this list before merging anything that touches `eggs.js`, `lock.js`, `shell.js`, `shell/`, `root.html`, `api/`, `lib/`, `middleware.js`, or the breadcrumbs.

Serve with the API and middleware running: `vercel dev`, or `npm run serve` (see the README). `python -m http.server` serves the pages but not `/api`, so secret fragments and the unlock will not work there.

Secret fragment texts and the passphrase are deliberately not written here. Use the test values from the README in `.env.local`; the production values are sensitive in Vercel and cannot be pulled.

Reset between runs: `localStorage.removeItem('egt.eggs')` in the console, delete the `egt_root` cookie, then reload.

## Hunt

- [ ] On a fresh load of any page, the console shows the `SYSTEM NOTICE` box telling you to type `hunt()`, and no errors other than the known `/_vercel/speed-insights/script.js` 404.
- [ ] Before anything is found, no `[n/5]` appears next to the brand line.
- [ ] `hunt()` prints `[1/5]`, the masked list with slot 1 filled, and a lead about the home page cursor. The brand line now shows `[1/5]`, and a toast reads `FRAGMENT 1/5 ACQUIRED :: "<console fragment>"`. The Network tab shows one `POST /api/fragment`.
- [ ] Calling `hunt()` again prints progress without a second toast.
- [ ] On the home page, clicking the blinking cursor three times quickly logs the cursor fragment with a toast. Three slow clicks, more than 1.5s apart, do nothing.
- [ ] Navigate away from home and back using the nav, not a reload. The cursor trigger still works, and fires one toast rather than two. *Needs a real, visible browser tab: the page swap waits on `requestAnimationFrame`.*
- [ ] After that navigation, the brand line still shows the counter.
- [ ] View source on the about page: the comment above `IDENTITY CONFIRMED` shows `ash_` and `hunt("ash_")`. Running it logs fragment 3.
- [ ] On any page with nothing focused, the Konami code (up up down down left right left right B A) logs the Konami fragment. Holding Shift for B and A still works.
- [ ] Click into the contact form's name field and type the Konami code there. Nothing is logged.
- [ ] `/robots.txt` contains `# Disallow: /sys_dump.txt`. `/sys_dump.txt` shows `0xd4` and `hunt("0xd4")`. Running it logs fragment 5.
- [ ] With all five found, `hunt()` says all fragments are recovered and points at `/root`.
- [ ] `hunt("nope")` prints `unknown fragment` and changes nothing.
- [ ] With the API down (stop the server's API, or block `/api/*` in devtools), the Konami code logs `signal lost` and no toast; once the API is back it works.
- [ ] View source of every served `.js` file: none of the three secret fragment texts appear anywhere.
- [ ] In mobile/touch emulation, or on a phone, reload: no banner, `typeof hunt` is `"undefined"`, and three taps on the cursor log nothing. If devtools emulation does not flip `(pointer: coarse)`, confirm on a real phone.
- [ ] With site data blocked for the origin, every page still loads and `hunt()` still works for the session.

## Shell

Locally the page is `/root.html`; the `/root` rewrite only exists on Vercel.

- [ ] With progress cleared and no cookie, `/root.html` shows `authorization required.` and a `passphrase:` prompt, with no nav and no console errors.
- [ ] Without the cookie, `/shell.js` and `/shell/vfs.js` return 404. So do `/package.json` and `/node_modules/@vercel/functions/package.json`.
- [ ] `localStorage.setItem('egt.eggs', '{"unlocked":true}')` then reload: still the lock screen.
- [ ] A wrong guess echoes as asterisks, shows `verifying...`, then prints `ACCESS DENIED [1]` in red after about half a second. The third wrong guess adds a `hint:` line.
- [ ] The passphrase (any case, with stray spaces) prints `ACCESS GRANTED`, and the prompt becomes `visitor@egt:~$`. The response sets an `egt_root` cookie marked HttpOnly, Secure, SameSite=Strict.
- [ ] Reloading goes straight to `session restored.`
- [ ] `help` lists every visible command alphabetically, including `matrix`, `neofetch`, `open`, and `tree`, and not `sudo`, `rm`, `vim`, `ssh`, or `hack`.
- [ ] `ls` hides `.secret`; `ls -a` shows it. Directories end in `/`.
- [ ] `cat .secret`, `cd projects`, `ls`, `cat trading-bot.md`, `cd ..`, and `pwd` all behave, and the prompt shows `~/projects` while inside it.
- [ ] `cat projects` prints `cat: projects: Is a directory`. `foo` prints `bash: foo: command not found`.
- [ ] Tab: `he` completes to `help `; `cd pr` completes to `cd projects/`; `h` lists `help  history` and leaves the line alone.
- [ ] Up and Down walk history; Down past the newest entry clears the line. The passphrase never appears in `history`.
- [ ] `sudo`, `rm -rf /`, and `whoami` give their joke answers and `visitor`.
- [ ] Typing `<img src=x onerror=alert(1)>` and pressing Enter prints that text literally, with no alert.
- [ ] `snake` replaces the output with a bordered grid; arrows and WASD steer; eating raises the score; hitting a wall returns to the prompt with `game over. score N, high score M.`
- [ ] A new high score survives a reload and shows in the next game's status line.
- [ ] `q` or Escape quits mid-game back to the prompt.
- [ ] Typing the Konami code into the shell, or steering Snake with those keys, logs no fragment.
- [ ] `clear` empties the screen. `exit` prints `logout` and lands on the home page.
- [ ] `tree`, `ls -l`, `grep -ri react ~`, `find ~ -name "*.log"`, `head -n 3 skills.txt`, `wc notes.txt`, and `man grep` print sensible output that lines up in columns.
- [ ] `neofetch` draws the logo beside the info, and shows the Snake high score after a game.
- [ ] `open projects` prints `opening /projects...` and lands on the projects page. `open nope` lists the valid pages.
- [ ] `resume` downloads `Resume-current.pdf`. `contact` prints the links.
- [ ] `matrix` fills the screen with falling green characters; `q` returns to the prompt with `wake up, visitor.`
- [ ] `pwd` then `!!` echoes `pwd` and prints the directory again. `!!` on a fresh session prints `event not found`.
- [ ] In mobile/touch emulation, `/root.html` shows only `/root needs a keyboard. come back on a desktop.`
