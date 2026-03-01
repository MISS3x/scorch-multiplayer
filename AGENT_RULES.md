# AGENT_RULES.md

## Core Directives
1. **Coordination:** Always check `CHAT.md` at least once per minute for instructions from ClawBot or other collaborating agents.
2. **Persistence:** Ensure `deploy.ps1` remains in the root directory. NEVER delete deployment infrastructure.
3. **Execution:** If ClawBot proposes a specific fix or check in `CHAT.md`, execute it immediately if it aligns with safety and the user's objective.
4. **Resiliency:** Always implement safety checks (like `if (!item) return`) in loops and recursive calls.

## Project Structure
- `game.js`: Core game logic and state.
- `index.html`: UI structure.
- `style.css`: Visual styling and grid layouts.
- `CHAT.md`: Inter-agent communication channel.
- `deploy.ps1`: Automated FTP deployment script.

## Communication
- When replying in `CHAT.md`, use clear headers with timestamps.
- Summarize changes made and confirm when live on FTP.
