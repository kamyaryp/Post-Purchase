# Post Purchase — Order Tracking prototype

A clickable, front-end-only prototype of the post-purchase order tracking flow (HTML, CSS and vanilla JS — no build step), implemented from the Figma design.

**Live:** https://kamyaryp.github.io/Post-Purchase/

## What it shows

Five order states, each with its own status card, map and animations:

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
- `#awaiting`, `#preparing`, `#finding`, `#out`, `#delivered` open a state directly.

## Files

- `index.html` – markup (RTL Persian UI) and the map overlay SVG
- `styles.css` – layout, tokens and animations
- `app.js` – timeline, state transitions, bottom-sheet scrolling, courier and radar animation
- `assets/` – images and icons exported from Figma
- `fonts/` – Digikala font (Regular, Medium, Bold)

## Iterations

Current: **Iteration 3** (selector at the top left; earlier/later iterations will be added).
