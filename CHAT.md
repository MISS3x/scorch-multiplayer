# Antigravity Instructions
## STATUS: ACTIVE - DEVELOPMENT LOG

### [2026-02-25 13:00] SESSION LOG - "THE BATTLE FOR STABILITY"
**Participants:** Imperátor Radim, Agent Krtek (OpenClaw)

**Summary of Events:**
1. **Initial Issue:** Game freezed upon clicking "Next Player" in Shop or starting the round.
2. **Diagnosis 1 (Logic):** Identified infinite loop potential in `advancePlayerIndex` (looking for alive players forever) and unsafe DOM access in Shop.
   - **Fix:** Added safety counters and null-checks in `game.js`.
3. **Diagnosis 2 (Performance):** Game still froze ("Page Unresponsive"). Cause: Physics engine (`updatePhysicsGrid`) processing millions of pixels (sand/water) per frame at high resolution.
   - **Fix:** Drastically optimized `game.js`. Disabled continuous physics loop. Switched terrain to static logic.
4. **Deployment:** 
   - `deploy.ps1` was missing.
   - Created `deploy_ftp.ps1` with credentials for `ftpx.forpsi.com`.
   - Successfully deployed to `http://virtual.miss3.cz/scorch/`.
5. **Gameplay Improvements:**
   - **Terrain:** Moved from "Flat Rock" to "Sine Wave Hills + Cellular Automata Caves".
   - **Destruction:** Re-enabled logic for creating holes (`carveGrid`) even without physics simulation.
   - **Stability:** Implemented `CELL = 8` (lower res) for better performance.

**Current State:**
- Game is **LIVE** and **PLAYABLE**.
- Map generation: Advanced (Caves + Hills).
- Physics: Optimized (Active Columns).
- Shop: Fully functional with Sell/Buy.
- **Vegetation:** Added **CACTUS** as a new type of tree.
- **UI:** Added version number **v0.5.2** to the main menu.

---
### [2026-02-26 23:05] SESSION LOG - "THE VERSIONING UPDATE"
**Participants:** Imperátor Radim, Agent Krtek (OpenClaw)

**Summary of Events:**
1. **UI Update:** Added version string `v0.5.2` to the `<h1>` tag in the Main Menu of `index.html`.
2. **Branding:** Noted that the game is titled `INK ARTILLERY` in the HTML, while the project folder is `scorch`.

---
### SLACK TRANSCRIPT HIGHLIGHTS (Reconstructed)
**User:** "pridej mi do kodu na startovaci stranku cislo verze. 0.5.2"
**Agent:** "Verze v0.5.2 přidána do hlavního menu v index.html."

---
### SLACK TRANSCRIPT HIGHLIGHTS (Reconstructed)

**User:** "no hele proste po spusteni mi to zamrzne..."
**Agent:** "Opravuji nekonečnou smyčku v advancePlayerIndex a renderShopPlayer."

**User:** "no it. is freezed?"
**Agent:** "Vytvářím debug.html a test.html pro izolaci chyby."

**User:** "nejde to. zkus te tam pustit treb aprazdnou stranku"
**Agent:** "Diagnóza: Physics Engine zahltí CPU. Vypínám fyziku, měním materiál na ROCK."

**User:** "hra se spustila!!!!"
**Agent:** "Vítězství! Teď vracíme hratelnost (ničení terénu) a nasazujeme na FTP."

**User:** "Server: ftpx.forpsi.com..."
**Agent:** "Vytvořen deploy skript. Nahráno na virtual.miss3.cz/scorch."

**User:** "a zacni pracovat na novem zpusobu generovani terenu..."
**Agent:** "Implementován Generátor 2.0 (Sinusovky + Jeskyně). Nasazeno."

**User:** "Ok, ale vse ze slaku k tomuto projektu tam ukladej..."
**Agent:** "PROTOCOL UPDATE: This file will serve as the exclusive, persistent memory for Project Scorch. Only project-related messages will be logged here to maintain context across threads."

**PROTOCOL UPDATE:** Strictly use **Flash model** (google/gemini-3-flash-preview) only. NEVER switch to PRO due to low rate limits (250 RPD vs 10000 RPD). Stability and continuity depend on Flash.

---
**END OF LOG**
