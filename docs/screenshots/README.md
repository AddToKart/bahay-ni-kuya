# Bahay ni Kuya — Visual & Screenshot Verification Guide

This guide outlines manual verification steps for each room camera view, character state, and visual feature in Bahay ni Kuya.

---

## 1. Running the Visualizer

1. Start the Bahay ni Kuya Bun server:
   ```bash
   bun run src/server.ts
   ```
2. Open your web browser to:
   ```
   http://localhost:4777
   ```
3. To simulate an active house day with waking up, chores, task dispatch, office typing, subagents, and confession room events:
   ```bash
   bun run fake
   ```

---

## 2. Room Cameras & CCTV Controls

Click the camera channel buttons in the header toolbar to verify pan, zoom, and dynamic CCTV channel labels:

| Camera Button | View / Target | Verification Checklist |
| :--- | :--- | :--- |
| **ALL** | Whole House (1x) | Retro corner brackets `[ ]`, blinking red `● REC` indicator, live timestamp, soft vignette around perimeter. All 7 rooms visible. |
| **OFFICE** | Office Wing (2x) | 8 primary wood desks with amber CRT monitors + 4 subagent desks with green phosphor glow. Characters sit and type when working. |
| **LIVING** | Living Room (2x) | Blue sectional sofa, animated CRT television console with soft blue scanline flicker, bookshelf reading nook. |
| **BEDROOM** | Bedroom (2x) | 4 bunk beds, bedside tables with warm amber lamp glows. Inactive housemates sleep with floating animated `Zzz` bubbles. |
| **KITCHEN** | Kitchen (2x) | Ceramic checkerboard floor, stainless refrigerator, stove with burners, sink, dining table with chairs. Characters wash dishes and cook. |
| **GAME** | Game Room (2x) | Mauve felt floor, green baize pool table with white cue ball, retro arcade cabinets with glowing marquees. |
| **CONFESSION**| Confession Room (2.5x)| Dark obsidian floor, solitary spotlight chair. Dramatic radial spotlight beam with subtle atmospheric pulse. Blocked housemates wait here with exclamation `!` bubble. |

---

## 3. Character Species & Accessories

Confirm that each harness renders with its unique procedural pixel art species:
- **opencode**: Canadian Beaver (amber-brown coat, chisel front teeth, flat tail, blueprint tool).
- **codex**: Deep-sea Octopus (purple cephalopod, 6 animated tentacles, fluid typing rhythm).
- **pi**: Golden Hamster (honey coat, chubby cheeks, compact scurrying).
- **omp**: Mischievous Raccoon (slate fur, bandit mask, striped tail).
- **hermes**: Scholarly Barn Owl (taupe plumage, spectacles, feather tufts, routes to bookshelf when researching).

Multiple instances of the same harness display distinct accessory color pips (Amber, Emerald, Indigo, Ruby).

---

## 4. Kuya Console & Dispatch

1. Scroll below the canvas to the **Kuya Console**.
2. Select a target housemate from the dropdown (e.g. `codex` or `opencode`).
3. Select an allowlisted repository directory from the project dropdown.
4. Enter a task prompt (e.g. `echo "testing kuya dispatch"`).
5. Click **Utos kay Kuya (Dispatch)**:
   - Kuya announcement banner appears at the top: `KUYA: {harness}, pumunta po kayo sa office. May task po kayo.`
   - The target housemate wakes up or stops its chore, turns, and walks through hallway doors to a desk in the Office.
   - The housemate sits and types, displaying the active tool icon.
   - Upon completion, the housemate displays a thumbs-up emote (👍), returns to house life, and the console shows the task summary and git diff stat.

---

## 5. Background Tab Power Saving

1. Minimize or switch away from the Bahay ni Kuya browser tab.
2. In the developer console or task manager, verify CPU utilization drops to 0% as `requestAnimationFrame` automatically pauses via the `visibilitychange` listener.
3. Switch back to the tab: animation resumes smoothly without delta-time jumping or position glitches.
