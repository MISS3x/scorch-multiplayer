import * as Colyseus from "colyseus.js";

// Include CSS
import '../style.css';

// Initialize Game Connection
async function connectToGame() {
  const SERVER_URL = import.meta.env.VITE_COLYSEUS_URL || "ws://localhost:2567";
  const client = new Colyseus.Client(SERVER_URL);

  const statusText = document.getElementById("lobby-status-text");
  const lobbyInfo = document.getElementById("lobby-info");
  const playerCountText = document.getElementById("lobby-player-count");

  try {
    const room = await client.joinOrCreate("scorch_arena", {
      name: "Mole_" + Math.floor(Math.random() * 1000)
    });

    console.log("Joined Scorch server successfully!", room.sessionId);
    (window as any).scorchRoom = room;

    if (statusText) statusText.innerText = "CONNECTED!";
    if (statusText) statusText.classList.remove("blink");
    if (lobbyInfo) lobbyInfo.classList.remove("hidden");

    // Listen for state changes
    room.onStateChange((state) => {
      let activePlayers = 0;
      state.players.forEach(() => activePlayers++);

      if (playerCountText) {
        playerCountText.innerText = `${activePlayers} / 4`;
      }

      if (state.phase === "playing") {
        if (statusText) statusText.innerText = "GAME STARTING...";
      }
    });

    // Initialize vanilla logic after connection
    // @ts-ignore - Bypass lack of type definition for the 5000+ line vanilla script
    await import('./game.js');

  } catch (e) {
    if (statusText) {
      statusText.innerText = "CONNECTION FAILED";
      statusText.style.color = "red";
    }
    console.error("JOIN ERROR", e);
  }
}

connectToGame();
