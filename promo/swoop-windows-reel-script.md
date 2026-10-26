# Swoop reel 2 of 2: Swoop for Windows, "One key"

**Length:** 21.5 seconds, 9:16 vertical (1080x1920 CSS, rendered at 2x to 2160x3840, 30 fps, 645 frames)
**Visuals:** `promo/swoop-windows-reel.html`, render config `promo/reel-windows.json`.
**Sister reel:** `promo/swoop-chrome-reel-script.md`. This one is saturated orange with ink type, flush left, snappy; the Chrome one is dark and cinematic.

## Brief

| | |
|---|---|
| Audience | Windows users who take screenshots all day and want something lighter than the Snipping Tool, Lightshot or ShareX (none named on screen) |
| Platform and format | X video and Instagram Reels · 9:16 · 1080x1920 |
| Length | 21.5 s |
| The one message | Press Print Screen, drag, mark it up, Enter: copied. Tiny, free, and nothing is uploaded. |
| Feeling | Punchy, tactile, premium. |
| Call to action | Go to mhfrough.github.io/swoop |
| Must show | Print Screen opens Swoop, the frozen screen (menus and tooltips stay put), drag with the size readout, toolbar beside the selection, Enter to copy, the small footprint |
| Claims allowed | See the claims check |
| Avoid | Naming other apps, "signed" or "Store" claims (the installer isn't code-signed yet), Mac support, Linux as shipped (it's "coming soon") |
| Brand | Swoop orange `#ff5a1f`, ink `#141210`, Geist + Geist Mono, `icon.svg`, the overlay's own hint text and editor icons, mhfrough.github.io/swoop |
| Given by the person | "Premium product ad"; a separate reel for the Windows app |

## Concepts offered

```
A. One key (metaphor / object, 9:16, 21.5 s)                 <- built
   Logline:   One key does the whole job.
   Opens on:  Full-bleed orange, a giant black PrtSc keycap.
   Middle:    The key is pressed (shockwave, its light comes on) and rushes past the camera into a frozen
              desktop; drag, mark up, Enter; the picture lands in a chat.
   Ends on:   Black opens from the centre; orange tile, wordmark, "Press PrtSc", URL types itself.
   Signature: The key press that freezes the screen.
   Sound:     Clean house groove, the key press is the downbeat.

B. Tray life (day-in-life): Swoop waits in the tray through a day, one press at each moment.
C. Numbers (data-story): 1.4 MB, 30 MB, 0 bytes, built as one long kinetic count.
```

**Chosen:** A.

## Script

**Logline:** One key: the screen freezes, you drag, mark it up, press Enter, and it's on your clipboard.

| Time | On screen | Words on screen | Sound |
|---|---|---|---|
| 0.0-2.3 | Orange. A giant black PrtSc / SysRq keycap rises. At 1.5 it is pressed: it sinks, its light comes on, an ink shockwave rings out. It rushes past the camera. | **One key.** / Swoop for Windows | Groove starts; heavy key clack on the press |
| 2.3-4.6 | Behind it, an invented desktop (Sales · Q3 chart with a tooltip open, Team chat, taskbar with Swoop in the tray) flashes and dims: frozen, the tooltip still showing. Swoop's own hint: "Drag to select an area. Esc to cancel." | **The screen freezes.** | Freeze whoosh |
| 4.6-7.3 | A crosshair drags a selection over the chart and tooltip; the orange box and handles grow, the readout counts to 1340 × 1072. | **Drag over anything.** | Rising tick under the drag |
| 7.3-10.6 | Swoop's toolbar appears under the selection. A box around the tooltip, step 1, an arrow, the text "Send this one". | **Mark it up.** / arrow · box · steps · text · blur | Ticks on each mark |
| 10.6-13.1 | A black Enter key pops up and is pressed. Flash; "Copied to the clipboard"; the overlay lets go and the picture flies into the chat, under Maya's "Can you send me the Q3 chart?" | **Enter. Copied.** | Key clack, pop |
| 13.1-17.0 | Orange, three big rules count up. | **Light enough to forget.** / 1.4 MB installer, no admin rights / 30 MB memory while it waits / 0 bytes uploaded. No account. | Groove at full |
| 17.0-21.5 | Black opens from the centre. The orange tile draws its swoop, "Swoop" rises, "for Windows. Press PrtSc", URL types into an orange pill. | **Swoop** / for Windows. Press PrtSc / mhfrough.github.io/swoop / Free · Open source · Also for Chrome | Final hit, rings out |

## Claims check

| Claim | Source |
|---|---|
| Press Print Screen to capture | README "Press Print Screen, drag over any part of the screen, mark it up, then copy or save"; "Print Screen opens Swoop" switch, on by default |
| The screen freezes; menus and tooltips stay put | README "The screen under the pointer freezes, so menus and tooltips stay put" |
| Drag with the size showing; toolbar next to the selection | README "The size shows as you drag, and the toolbar appears next to the selection"; `.se-readout`, `.se-overlay .se-bar` in `shared/editor/editor.css` |
| "Drag to select an area. Esc to cancel." | The overlay's hint, `shared/editor/editor.js` |
| Arrow, box, steps, text, blur | README editor list; icons from `shared/editor/editor.js` |
| Enter copies | README "press Enter to copy and close"; toast "Copied to the clipboard" from the editor |
| 1.4 MB installer | README "a 1.4 MB installer" |
| No admin rights | README download table "Installs for you only, no admin rights" |
| 30 MB memory while it waits | README "about 30 MB of memory while it waits" |
| 0 bytes uploaded, no account | README "Nothing is uploaded. There is no Swoop server, account ..."; "the app have no server to send anything to, and make no network requests" |
| Free, open source | README, LICENSE (MIT) |
| Also for Chrome | README, `extension/` |
| The desktop (Sales · Q3, £48.2k, Team chat, Maya, 14:03) | Invented demo content |

## Direction

Saturated: full-bleed Swoop orange with a warm wash and grain, ink type at 112 px flush left with very tight tracking, the paler line in cream. Motion is snappy and tactile (a spring on the keypress, quick pops), the camera zooms through the key into the screen. The demo is the overlay itself, full size. Ends on black, the reverse of the Chrome reel. `fingerprint.py check`: PASS (closest 7%). `fingerprint.py look`: PASS (closest 35%).

## Sound

**Music:** [House - Flying](https://pixabay.com/music/house-house-flying-580004/) by tape-echo, under the Pixabay Content License (free for commercial use, no credit required). Checked on the track page on 2026-10-25: not Content ID registered, not AI generated. Downloaded on 2026-10-25 from the page's own Pixabay CDN link (2:10, MP3 256 kb/s 44.1 kHz, 4.2 MB) and saved as `promo/swoop-windows-bgm.mp3`, gitignored (the licence doesn't allow redistributing the track on its own).

The reel starts the track at **28.29 s**, so the drop at 29.79 s lands on the key press (`press`, 1.5 s): the quiet tail of the intro (−23.7 dB) plays under "One key." and the full groove (−7.2 dB) starts with the press. Mixed at −14 dB, normalised to −14 LUFS with a −1 dBTP true-peak limit, 1.2 s fade-out.

```sh
python -I <skill>/tools/music_sync.py promo/swoop-windows-bgm.mp3 --cue 1.5 --length 21.5
#   hit 29.79s  offset 28.29  pre -23.7 dB  body -7.2 dB  dips at -  fits yes
```

**SFX:** generated with Sizzle `synth.py kit promo/sfx/windows --palette digital --seed 733`, plus a low `key` clack (`--pitch -7`) and `type-url`. Key clack and impact on the press, a short glitch on the freeze, a swipe under the drag, a pop for the toolbar, clicks on each mark, the Enter clack, a whoosh as the picture flies, a notification on "Copied", ticks on the three numbers, a whoosh into the end, a chime on the tile, typing on the URL. Cues in `promo/reel-windows.json`.

Credit line (optional under the licence): Music: "House - Flying" by tape-echo (Pixabay).

## Voiceover

Recorded by the user in ElevenLabs (voice "Blondie - Saleswoman"), one take, saved as `promo/swoop-windows-voiceover-raw.mp3` (19.4 s). It was cut at its pauses into 14 phrases ("The screen freezes." and "Menus and all." split so both fit before the drag), and each phrase was placed on its scene in `promo/swoop-windows-voiceover.wav` (21.5 s, mono, 44.1 kHz). `reel-windows.json` → `voiceover` (offset 0, music ducked 9 dB under the voice). The music-only cut is kept at `promo/.reel-work/swoop-windows-reel-music-only.mp4`.

| Reel time | Line |
|---|---|
| 0.25-1.33 | One key. |
| 1.45-2.09 | Print Screen. |
| 2.30-3.63 | The screen freezes. |
| 3.68-4.55 | Menus and all. |
| 4.80-6.09 | Drag over anything. |
| 7.40-8.09 | Mark it up. |
| 8.22-10.18 | Arrows, boxes, steps. |
| 10.25-11.00 | Hit Enter. |
| 11.10-11.65 | Copied. |
| 13.35-14.61 | A tiny install. |
| 14.82-16.05 | Zero uploads. |
| 17.35-18.67 | Swoop for Windows. |
| 18.88-19.38 | Free. |
| 19.60-21.09 | Just press Print Screen! |

## Render

```sh
python ../sizzle/skills/sizzle/tools/reel.py all promo/reel-windows.json
python ../sizzle/skills/sizzle/tools/fingerprint.py record promo/reel-windows.json
```
Output: `videos/swoop-windows-reel.mp4` and `videos/swoop-windows-reel.webp` (poster at 9.6 s, the marked-up selection).
