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

  const SERVER_URL = import.meta.env.VITE_COLYSEUS_URL ||
    (window.location.hostname === "localhost" ? "ws://localhost:2567" : "wss://scorch-multiplayer.onrender.com");
  const client = new Colyseus.Client(SERVER_URL);
  const lobbyId = urlParams.get('lobby');

  // Only skip connecting if we explicitly don't pass lobby and want local dev
  if (isDirectLobby && !lobbyId) {
    if (statusText) statusText.innerText = "STARTING LOCAL MATCH...";
    // @ts-ignore
    await import('./game.js');
    return;
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

      // Update turn active player based on Server State
      if (state.activePlayerId && (window as any).tanks) {
        let tk = (window as any).tanks.find((t: any) => t.id === state.activePlayerId);
        if (tk) {
          let idx = (window as any).tanks.indexOf(tk);
          if (idx !== -1 && (window as any).currentPlayerIndex !== idx && (window as any).gameState !== 'SHOP') {
            (window as any).currentPlayerIndex = idx;
            let advance = (window as any).advancePlayerIndex;
            if (advance && typeof advance === 'function') {
              // Trigger visual advance but ensure the ID matches via brute force if needed
              (window as any).currentPlayerIndex = idx - 1;
              if ((window as any).currentPlayerIndex < 0) (window as any).currentPlayerIndex = (window as any).tanks.length - 1;
              advance();
            }
          }
        }
      }
    });

    room.onMessage("fire", (data: any) => {
      if (typeof (window as any).executeRemoteFire === 'function') {
        (window as any).executeRemoteFire(data);
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
