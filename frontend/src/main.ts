import * as Colyseus from "colyseus.js";

// Include CSS
import '../style.css';

// Initialize Game Connection
async function connectToGame() {
  const SERVER_URL = import.meta.env.VITE_COLYSEUS_URL || "ws://localhost:2567";
  const client = new Colyseus.Client(SERVER_URL);

  try {
    const room = await client.joinOrCreate("scorch_arena", {
      name: "Mole_" + Math.floor(Math.random() * 1000)
    });

    console.log("Joined Scorch server successfully!", room.sessionId);

    // Expose room globally for game.js to hook into it
    (window as any).scorchRoom = room;

    // Listen for states
    room.onStateChange((state) => {
      console.log("New Server State:", state);
    });

    // Initialize vanilla logic after connection
    // @ts-ignore - Bypass lack of type definition for the 5000+ line vanilla script
    await import('./game.js');

  } catch (e) {
    console.error("JOIN ERROR", e);
  }
}

connectToGame();
