# Manual checklist

The DOM layer has no automated tests. Walk this list before merging anything that touches `eggs.js`, `shell.js`, `root.html`, or the breadcrumbs.

Serve the repo root over HTTP first: `python -m http.server 8765`. Module scripts do not load from `file://`.

Reset between runs by clearing progress in the console: `localStorage.removeItem('egt.eggs')`, then reload.

## Hunt

- [ ] On a fresh load of any page, the console shows the `SYSTEM NOTICE` box telling you to type `hunt()`, and no errors other than the known `/_vercel/speed-insights/script.js` 404.
- [ ] Before anything is found, no `[n/5]` appears next to the brand line.
- [ ] `hunt()` prints `[1/5]`, the masked list with slot 1 filled, and a lead about the home page cursor. The brand line now shows `[1/5]`, and a toast reads `FRAGMENT 1/5 ACQUIRED :: "kern"`.
- [ ] Calling `hunt()` again prints progress without a second toast.
- [ ] On the home page, clicking the blinking cursor three times quickly logs `el_pa` with a toast. Three slow clicks, more than 1.5s apart, do nothing.
- [ ] Navigate away from home and back using the nav, not a reload. The cursor trigger still works, and fires one toast rather than two. *Needs a real, visible browser tab: the page swap waits on `requestAnimationFrame`.*
- [ ] After that navigation, the brand line still shows the counter.
- [ ] View source on the about page: the comment above `IDENTITY CONFIRMED` shows `nic_` and `hunt("nic_")`. Running it logs fragment 3.
- [ ] On any page with nothing focused, the Konami code (up up down down left right left right B A) logs `at_`. Holding Shift for B and A still works.
- [ ] Click into the contact form's name field and type the Konami code there. Nothing is logged.
- [ ] `/robots.txt` contains `# Disallow: /sys_dump.txt`. `/sys_dump.txt` shows `0x00` and `hunt("0x00")`. Running it logs fragment 5.
- [ ] With all five found, `hunt()` says all fragments are recovered and points at `/root`.
- [ ] `hunt("nope")` prints `unknown fragment` and changes nothing.
- [ ] In mobile/touch emulation, or on a phone, reload: no banner, `typeof hunt` is `"undefined"`, and three taps on the cursor log nothing. If devtools emulation does not flip `(pointer: coarse)`, confirm on a real phone.
- [ ] With site data blocked for the origin, every page still loads and `hunt()` still works for the session.
