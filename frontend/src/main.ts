import * as Colyseus from "colyseus.js";

// Include CSS
import '../style.css';

// Initialize Game Connection
async function connectToGame() {
  const urlParams = new URLSearchParams(window.location.search);
  const isDirectLobby = urlParams.has('lobby');

  const statusText = document.getElementById("lobby-status-text");
  const lobbyInfo = document.getElementById("lobby-info");
  const playerCountText = document.getElementById("lobby-player-count");

  const SERVER_URL = import.meta.env.VITE_COLYSEUS_URL || "ws://localhost:2567";
  const client = new Colyseus.Client(SERVER_URL);
  const lobbyId = urlParams.get('lobby');

  if (isDirectLobby) {
    if (statusText) statusText.innerText = "CONNECTING TO MATCH...";
    if (statusText) statusText.classList.remove("blink");
  }

  try {
    let room;
    if (isDirectLobby && lobbyId) {
      room = await client.joinOrCreate("scorch_arena", {
        lobbyId: lobbyId,
        name: "Mole_" + Math.floor(Math.random() * 1000)
      });
    } else {
      room = await client.joinOrCreate("scorch_arena", {
        name: "Mole_" + Math.floor(Math.random() * 1000)
      });
    }

    console.log("Joined Scorch server successfully!", room.sessionId);
    (window as any).scorchRoom = room;

    if (statusText && !isDirectLobby) statusText.innerText = "CONNECTED!";
    if (statusText && !isDirectLobby) statusText.classList.remove("blink");
    if (lobbyInfo && !isDirectLobby) lobbyInfo.classList.remove("hidden");

    if (isDirectLobby) {
      let p = parseInt(urlParams.get('p') || '1');
      // Wait for all human players to join Colyseus before automatically 'ready'ing the host
      room.onStateChange((state) => {
        let activePlayers = 0;
        if (state.players && typeof state.players.forEach === 'function') {
          state.players.forEach(() => activePlayers++);
        }
        if (activePlayers >= p) {
          room.send("ready", true);
        }
      });

      // Load game logic
      // @ts-ignore
      await import('./game.js');
    }

    const startBtn = document.getElementById("start-btn") as HTMLButtonElement;
    if (startBtn && !isDirectLobby) {
      startBtn.onclick = () => {
        room.send("ready", true);
        startBtn.innerText = "WAITING...";
        startBtn.disabled = true;
        startBtn.style.opacity = "0.5";
      };
    }

    // Listen for state changes
    room.onStateChange((state) => {
      let activePlayers = 0;
      if (state.players && typeof state.players.forEach === 'function') {
        state.players.forEach(() => activePlayers++);
      }

      if (playerCountText) {
        playerCountText.innerText = `${activePlayers} / 4`;
      }

      if (state.phase === "playing") {
        if (statusText) statusText.innerText = "GAME STARTING...";
        if (typeof (window as any).startGameFromMultiplayer === "function" && !(window as any).gameStarted) {
          (window as any).gameStarted = true;
          (window as any).startGameFromMultiplayer();
        }
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
