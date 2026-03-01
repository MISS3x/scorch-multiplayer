# SCORCH MULTIPLAYER HANDOFF FROM 128MOLES AGENT

Hello Scorch Agent! This is a handoff document directly from the 128moles agent.

## Current State of Integration
We have successfully completed the Lobby Sync between the `128moles` web platform and your `scorch` game frontend. 
When the Host clicks "START MATCH" on the `128moles` website, the system automatically opens a new browser window for ALL joined players across the internet, pointing to your Vite frontend on Vercel:
`https://scorch-multiplayer.vercel.app/?lobby=[LOBBY_ID]&p=[HUMANS]&b=[BOTS]&n=[NAMES_ARRAY]&u=[USER_IDS_ARRAY]`

**CRITICAL NOTE ON CURRENT FRONTEND BYPASS:**
Because the True Multiplayer Colyseus Backend is not yet deployed online, I added a temporary bypass in your `frontend/src/main.ts`. If `isDirectLobby` is true, the game *skips* the `client.joinOrCreate` WebSocket connection and instantly loads `game.js` in local Hotseat (Pass&Play) mode. This was necessary to prevent a `net::ERR_CONNECTION_REFUSED` on `localhost:2567` for standard internet users.

## Your Mission: Rewrite for True Multiplayer
The user's ultimate goal is **true internet synchronization** where Player A fires on their computer, and Player B sees it on theirs. You need to rewrite the 5000+ line vanilla `game.js` to rely on the Colyseus Backend State, rather than local loops.

### Step 1: Deploy the Colyseus Server
- You must deploy the `backend` folder to Render.com (using the `render.yaml` provided) or another Node.js hosting service.
- Once deployed, you must update the `VITE_COLYSEUS_URL` environment variable in the Vercel Frontend settings to point to the `wss://...` Render URL.

### Step 2: Establish the Global State schema (`backend/src/rooms/schema/ScorchState.ts`)
The server must be the source of truth for:
- The `terrainHeights` array (1024 or whatever width you use). The server should generate the terrain seed and send it to all clients.
- `tanks` Map/Array: Each tank needs `x`, `y`, `health`, `color`, `name`, `inventory`, `angle`, `power`, and `alive` status.
- Current Active Player index (`activePlayerId`).
- Wind speed/direction.

### Step 3: Remove the Offline Bypass from `main.ts`
Once the backend is live:
1. Remove my temporary `return;` bypass inside the `if (isDirectLobby)` block in `frontend/src/main.ts`.
2. Connect to the room using the `lobbyId` from the URL parameter.
3. Once the room connection is successful and the state is fully synchronized, instantiate `game.js` and allow the user to play *synchronously*!

### Step 4: Refactor Frontend Game Engine
Right now, `frontend/src/game.js` runs a local loop that reads local keyboard inputs and instantly moves local tank objects.
- **Inputs**: Intercept keyboard/mouse inputs (Angle changing, Power changing, Weapon selection) and send them to the server via `room.send("updateAngle", value)`, etc.
- **Simulation**: Determine if the Projectile simulation will run redundantly on both the Server and Client (Client-side prediction), or ONLY on the Server with the Client just rendering the received X/Y packets (easier to avoid desync).
- **Turns**: Never change turns locally. Only wait for the Server to change the `activePlayerId`.

**Good luck! The URL pipeline from 128moles is perfectly stable, so you only need to focus on the Scorch real-time engine now!**
