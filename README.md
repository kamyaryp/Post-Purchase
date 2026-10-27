# Post Purchase — Order Tracking prototype

A clickable, front-end-only prototype of the post-purchase order tracking flow (HTML, CSS and vanilla JS — no build step), implemented from the Figma design.

**Live:** https://kamyaryp.github.io/Post-Purchase/

## What it shows

It opens on **Address confirmation**: a 10-second window to check the delivery address before the order is submitted ("تغییر آدرس" restarts it). When it ends, a soft fade sweeps through the circle while the map is revealed behind the page at the same height, and the circle settles into the countdown badge as the tracking cards rise in.

Then five order states, each with its own status card, map and animations:

| State | Map |
|---|---|
| Awaiting confirmation | Destination pin |
| Preparing | Store pin and dashed planned route |
| Finding courier | Red store pin, radar sweep, nearby couriers blinking on the streets |
| Out for delivery | Courier riding the route (completed / remaining route) |
| Delivered | Completed route |

- One 45-minute countdown drives the flow; each step is a quarter of it. The countdown ring and the step connector bars follow it, and the flow advances on its own.
- Click a step in the progress indicator (or use the **State** dropdown at the top left) to jump to that state.
- Scroll up at the top to tuck the cards away and see the map full-screen; scroll down to bring them back.
- `?speed=60` in the URL runs the timeline 60× faster for demos, e.g. `index.html?speed=60#awaiting`.
- No hash or `#confirm` starts at address confirmation; `#awaiting`, `#preparing`, `#finding`, `#out`, `#delivered` open a state directly.

## Files

- `index.html` – markup (RTL Persian UI) and the map overlay SVG
- `styles.css` – layout, tokens and animations
- `app.js` – timeline, state transitions, bottom-sheet scrolling, courier and radar animation
- `assets/` – images and icons exported from Figma
- `fonts/` – Digikala font (Regular, Medium, Bold)

## Iterations

- **Iteration 3** – the full flow (`index.html`).
- **Iteration 4** – a single page focused on the glassy countdown gauge (`iteration-4/`). The **Time** slider at the top left scrubs the countdown; `?speed=60` runs it faster.

- **Iteration 5** – all 13 order states from the Figma *Order Tracking Screens* (`iteration-5/`), still opening on Address confirmation. The main flow (awaiting confirmation → preparing → finding courier → courier to store → out for delivery) runs on one 45-minute countdown; at 00:00 the ring fills and the customer is asked to confirm delivery (→ delivered, or → support follow-up). Exception states — item replacement, replacement confirmation, awaiting payment, support follow-up, cancelled, returned — show a static status dial and are reachable from the **State** picker or the card actions (e.g. لغو سفارش → cancelled, جایگزینی → replacement confirmation, تایید → preparing). `?speed=60` and `#state` hashes work as in iteration 3 (`#awaiting`, `#preparing`, `#finding`, `#toStore`, `#out`, `#confirmDelivery`, `#delivered`, `#replace`, `#replaceConfirm`, `#payment`, `#support`, `#cancelled`, `#returned`).

Switch between them with the **Iteration** selector in the prototype settings (gear at the bottom of the page).
