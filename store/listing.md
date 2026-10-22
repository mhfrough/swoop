# Chrome Web Store listing

Paste these into the developer dashboard. The images in this folder come from `node tools/make-brand.mjs`.

| Field | Value |
|---|---|
| Name | Swoop: full page screenshot (from `extension/manifest.json`) |
| Category | Tools |
| Language | English |
| Store icon | `extension/icons/128.png` |
| Small promo tile (440 x 280) | `store/promo-small.png` |
| Marquee (1400 x 560) | `store/marquee.png` |
| Screenshots (1280 x 800) | `store/screenshot-1.png` |
| Homepage | https://mhfrough.github.io/swoop/ |
| Support | https://github.com/mhfrough/swoop/issues |
| Privacy policy | https://mhfrough.github.io/swoop/privacy.html |

## Summary (up to 132 characters)

Capture a whole web page as one image, then mark it up with arrows, boxes, text, steps and blur. Free, and nothing is uploaded.

## Description

Swoop captures a whole web page, from top to bottom, as one image. Click the Swoop button or press Alt+Shift+S. The editor opens in a new tab.

Made for real pages:
• Sticky headers and cookie bars show once, not on every screen.
• Swoop scrolls through first, so lazy images and fade-in effects have loaded.
• Web apps that scroll inside a box are captured by that box.
• Alt+Shift+V takes just the part you can see.

Mark it up, free:
• Arrow, box, ellipse, line, pen and highlighter
• Text and numbered steps (1, 2, 3) for how-to guides
• Blur, to hide names and emails
• Crop, undo and redo
• Save as PNG, JPG, WebP or PDF, or copy to the clipboard
• Right-click for Copy, Save and Undo, and click the title to rename the file

Private by design:
• Nothing is uploaded. There is no Swoop server, no account and no links.
• Swoop can only see a tab after you click its button.
• Open source under the MIT licence.

There is also a free Swoop app for Windows and Linux: press Print Screen, drag over any part of the screen, mark it up and save. https://mhfrough.github.io/swoop/

## Privacy practices

Single purpose: capture the current web page as an image and let the user mark it up and save it.

| Permission | Why Swoop needs it |
|---|---|
| activeTab | To capture the tab the user clicked Swoop on, and only that tab. |
| scripting | To scroll that tab during the capture and put it back the way it was. |
| contextMenus | For "Capture the whole page" and "Capture the visible part" on the Swoop button's right-click menu. |
| storage | To keep the user's capture settings, such as whether to scroll the page first. |
| unlimitedStorage | To keep the user's recent captures in the browser, since a long page can be a large image. |

Data use: Swoop collects no user data. Tick none of the data types, and certify that data is not sold, not used for unrelated purposes and not used for credit decisions.
