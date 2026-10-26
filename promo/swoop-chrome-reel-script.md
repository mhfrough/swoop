# Swoop reel 1 of 2: Swoop for Chrome, "The whole page"

**Length:** 23 seconds, 9:16 vertical (1080x1920 CSS, rendered at 2x to 2160x3840, 30 fps, 690 frames)
**Visuals:** `promo/swoop-chrome-reel.html`, render config `promo/reel-chrome.json`.
**Sister reel:** `promo/swoop-windows-reel-script.md` (Swoop for Windows). The two are cut as a pair: this one is dark and cinematic and ends on orange, the Windows one is orange all the way through and ends on black.

## Brief

| | |
|---|---|
| Audience | People who screenshot web pages for work: designers, PMs, support, QA, devs. Seen on X (＠mhfrough_dev), then Instagram Reels. |
| Platform and format | X video and Instagram Reels · 9:16 · 1080x1920 |
| Length | 23 s |
| The one message | Swoop captures a whole web page as one image and gives you a free editor, and nothing is uploaded. |
| Feeling | Premium, calm, confident. A product launch spot, not a tutorial. |
| Call to action | Go to mhfrough.github.io/swoop |
| Must show | Full-page capture (scroll, sticky header once), one tall image, the editor (box, steps, arrow, blur, highlighter, copy), privacy |
| Claims allowed | See the claims check |
| Avoid | Speeds, user counts, comparisons with named tools, "Chrome Web Store" (the listing isn't live yet), real people or sites |
| Brand | Swoop orange `#ff5a1f`, ink `#141210`, Geist + Geist Mono (`tokens.css`), `icon.svg`, editor icons from `shared/editor/editor.js`, mhfrough.github.io/swoop |
| Given by the person | "Premium product ad, polished, cinematic, confident"; two separate reels, Chrome and Windows |

## Concepts offered

`fingerprint.py fresh` said recent reels used: speedrun and quiz concepts, question-text openings, centred layouts, stamp endings, circle-wipe and split-door reveals.

```
A. The whole page (cold-open demo, 9:16, 23 s)              <- built
   Logline:   One click, and the whole page, top to bottom, becomes one picture.
   Opens on:  A browser window on black: an ordinary screenshot flashes and only catches one screen.
   Middle:    The Swoop button is clicked, an orange swoop draws down the window, the page scans
              screen by screen, then the camera pulls back to one tall image and pushes into the editor.
   Ends on:   The swoop curve floods the screen orange; app tile, wordmark, URL types itself.
   Signature: Pull-back from the browser to the full 5-screen page standing like a monolith.
   Sound:     Cinematic pulse bed, low hits on the scan steps, a riser into the pull-back.

B. Receipt (data-story): the page prints out like a long receipt from the top of the frame.
C. Before/after: split screen, a cropped screenshot on the left, Swoop's full page on the right.
```

**Chosen:** A, as it reads best as a premium launch spot.

## Script

**Logline:** One click, and the whole page, top to bottom, becomes one picture you can mark up, without anything leaving your computer.

| Time | On screen | Words on screen | Sound |
|---|---|---|---|
| 0.0-2.5 | Black, film grain. A dark browser window rises in (aster.example/shop, an invented ceramics shop). An ordinary screenshot flashes and frames only the visible screen ("Screenshot · 1 screen"). A cursor moves to the Swoop button. | **Not just the screen.** | Low pad; soft shutter at 1.0 |
| 2.5-6.5 | Click: orange ring on the button, an orange swoop draws down the window. The page scans: an orange scan line sweeps each screen, the page jumps one screen at a time, the header and cookie bar stay fixed. Pill: "Capturing 1 / 5" … "Joined · 1 image". | **The whole page.** / Sticky headers once. Lazy images loaded. | Click; a tick on each of the five scans |
| 6.5-10.0 | The window falls away and the camera pulls back: all five screens stand as one tall picture, orange seams flash where they were joined. Labels: ← 5 screens, ← 1 picture; PNG / JPG / WebP / PDF. | **One tall image.** | Riser into the pull-back, hit at 7.3 |
| 10.0-15.5 | Push into the basket at the bottom of the page, inside Swoop's editor (its real toolbar and icons). Box round the total, step 1, arrow to Pay, step 2, the address pixelated, "Free delivery" highlighted. "Copied to the clipboard". | **Mark it up.** / Every tool free. No watermark. | Small ticks on each mark; pop on the toast |
| 15.5-18.7 | Black. Four lines are struck through in orange one by one. | **Nothing is uploaded.** / No server / No account / No cloud gallery / No share link / Your clipboard. Your disk. | Music thins; four soft strikes |
| 18.7-23.0 | The swoop curve sweeps the screen orange. The ink app tile draws its swoop; "Swoop" rises; the URL types into a pill. | **Swoop** / Full-page screenshots for Chrome. / mhfrough.github.io/swoop / Free · Open source · Also on Windows | Final hit on the flood, rings out |

## Claims check

| Claim | Source |
|---|---|
| Captures a whole page as one image, top to bottom | README "Swoop for Chrome captures a whole web page, top to bottom, as one image"; `extension/capture.js` |
| One click (the Swoop button) | README "Click the Swoop button or press Alt+Shift+S" |
| Scrolls one screen at a time and joins the parts | README "Swoop scrolls the page one screen at a time, joins the parts into one tall image" |
| Sticky headers once | README "Sticky headers and cookie bars show once, not on every screen" |
| Lazy images loaded | README "Swoop scrolls through the page once before capturing, so lazy images ... have loaded" |
| PNG, JPG, WebP, PDF | README "Save as PNG, JPG, WebP or PDF" |
| Box, steps, arrow, blur, highlighter, copy | README editor list (arrow, box, ellipse, line, pen, highlighter, text, numbered steps, blur, crop); toolbar icons copied from `shared/editor/editor.js`; toast text "Copied to the clipboard" from the editor |
| Every tool free. No watermark. | README "One editor, every tool free ... No paid tier and no watermark" |
| Nothing is uploaded; no server, account, cloud gallery or share link | README "There is no Swoop server, account, cloud gallery or share link. Pictures go to your clipboard or your disk." |
| Free, open source | README, LICENSE (MIT) |
| Also on Windows | README "a tiny Print Screen app for Windows and Linux"; `Swoop-setup.exe` release asset |
| mhfrough.github.io/swoop | README link, `index.html` canonical |
| The shop page (Aster & Co., aster.example, Sam Rivera, prices, reviews) | Invented demo content; `.example` is a reserved domain |

## Direction

Dark and cinematic: near-black `#09090b` with film grain, an orange bloom and a vignette, Geist at 102 px with tight tracking, headlines rising word by word out of a mask. The camera does the work: a scroll inside the browser, a pull-back to the tall page, a push into the editor. Swoop orange is the only colour outside the demo page until the end card floods to orange. `fingerprint.py check`: PASS (closest 30%). `fingerprint.py look`: PASS (closest 42%).

## Sound

**Music:** [Technology Epic Cinematic Music (No Copyright)](https://pixabay.com/music/build-up-scenes-technology-epic-cinematic-music-no-copyright-620089/) by MiroMaxMusic, under the Pixabay Content License (free for commercial use, no credit required). Checked on the track page on 2026-10-25: not Content ID registered, not AI generated. Downloaded on 2026-10-25 from the page's own Pixabay CDN link (2:36, MP3 256 kb/s 44.1 kHz, 5.0 MB) and saved as `promo/swoop-chrome-bgm.mp3`, which is gitignored because the licence doesn't allow redistributing the track on its own.

The reel starts the track at **5.45 s**, so its hit at 12.20 s lands on the pull-back (`stitch+.25`, 6.75 s); the build plays under the opening (−12.4 dB) and the full section (−8.0 dB) carries the rest. Mixed at −14 dB, normalised to −14 LUFS with a −1 dBTP true-peak limit, 1.2 s fade-out.

```sh
python -I <skill>/tools/music_sync.py promo/swoop-chrome-bgm.mp3 --cue 6.75 --length 23
#   hit 12.20s  offset 5.45  pre -12.4 dB  body -8.0 dB  dips at -  fits yes
```

**SFX:** generated with Sizzle `synth.py kit promo/sfx/chrome --palette cinematic --seed 517`, plus `click` and `type-url` (24 chars at 26 cps). Shutter on the plain screenshot, click on the Swoop button, a tick on each of the five scans, a riser into the pull-back with an impact on it, a whoosh into the editor, ticks on each mark, four soft strikes, a sub drop under "Nothing is uploaded", a boom on the orange flood, shimmer on the tile, typing on the URL. Cues in `promo/reel-chrome.json`.

Credit line (optional under the licence): Music: "Technology Epic Cinematic Music" by MiroMaxMusic (Pixabay).

## Voiceover

Recorded by the user in ElevenLabs (voice "Valory - Mysterious, Calm and Natural"), one take, saved as `promo/swoop-chrome-voiceover-raw.mp3` (22.0 s). It was cut at its pauses into 11 phrases, and each phrase was placed on its scene in `promo/swoop-chrome-voiceover.wav` (23 s, mono). `reel-chrome.json` → `voiceover` (offset 0, music ducked 9 dB under the voice). The music-only cut is kept at `promo/.reel-work/swoop-chrome-reel-music-only.mp4`.

| Reel time | Line |
|---|---|
| 0.15-2.69 | A screenshot only sees one screen. |
| 2.75-4.69 | Swoop takes the whole page. |
| 4.85-6.64 | Top to bottom, in one click. |
| 7.00-9.50 | The whole page, joined into one picture. |
| 10.20-11.05 | Mark it up. |
| 11.20-15.52 | Arrows, steps, blur. Every tool is free. No watermark. |
| 15.75-17.26 | And nothing is uploaded. |
| 17.50-17.91 | Ever. |
| 19.35-19.89 | Swoop. |
| 20.05-21.82 | Full-page screenshots for Chrome. |
| 22.00-22.50 | Free. |

## Render

```sh
python ../sizzle/skills/sizzle/tools/reel.py stills promo/reel-chrome.json 1.2,3.3,7.6,9.6,12.6,16.2,21
python ../sizzle/skills/sizzle/tools/reel.py all promo/reel-chrome.json
python ../sizzle/skills/sizzle/tools/fingerprint.py record promo/reel-chrome.json
```
Output: `videos/swoop-chrome-reel.mp4` and `videos/swoop-chrome-reel.webp` (poster at 9.2 s, the tall image).
