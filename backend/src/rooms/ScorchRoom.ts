import { Room, Client } from "colyseus";
import { ScorchState, Player } from "./schema/ScorchState";

export class ScorchRoom extends Room<ScorchState> {
  maxClients = 4;

  onCreate(options: any) {
    if (options.lobbyId) {
      this.roomId = options.lobbyId;
    }
    this.setState(new ScorchState());

    // Set map width for the heightmap array
    const MAP_WIDTH = 1000;
    for (let i = 0; i < MAP_WIDTH; i++) {
      this.state.terrainHeights.push(500); // flat ground 500px down initially
    }

    this.onMessage("ready", (client, message) => {
      const player = this.state.players.get(client.sessionId);
      if (player) {
        player.isReady = message;
        this.checkGameStart();
      }
    });

    this.onMessage("update_aim", (client, data) => {
      const player = this.state.players.get(client.sessionId);
      if (player && this.state.activePlayerId === client.sessionId) {
        player.angle = data.angle;
        player.power = data.power;
      }
    });

    this.onMessage("fire", (client, data) => {
      if (this.state.phase !== "playing") return;
      if (this.state.activePlayerId !== client.sessionId) return;

      const player = this.state.players.get(client.sessionId);
      if (player) {
        player.angle = data.angle;
        player.power = data.power;
      }

      // Tell everyone to execute the fire logic identically using deterministic lockstep
      this.broadcast("fire", {
        playerId: client.sessionId,
        angle: data.angle,
        power: data.power,
        weaponIndex: data.weaponIndex
      });
    });

    this.onMessage("pass_turn", (client, data) => {
      // The active client tells the server their physics has visually settled
      if (this.state.activePlayerId === client.sessionId) {
        const pKeys = Array.from(this.state.players.keys());
        let currentIndex = pKeys.indexOf(this.state.activePlayerId);
        let nextIndex = (currentIndex + 1) % pKeys.length;

        // Skip dead players - basic logic, frontend will enforce too
        this.state.activePlayerId = pKeys[nextIndex];
      }
    });
  }

  onJoin(client: Client, options: any) {
    const p = new Player();
    p.id = client.sessionId;
    p.name = options.name || "Mole_" + Math.floor(Math.random() * 1000);
    p.color = "#" + Math.floor(Math.random() * 16777215).toString(16);
    this.state.players.set(client.sessionId, p);

    console.log(`Player ${p.name} joined!`);
  }

  onLeave(client: Client, consented: boolean) {
    this.state.players.delete(client.sessionId);
    console.log(`Player left!`);
  }

  onDispose() {
    console.log("Room disposed");
  }

  checkGameStart() {
    // If at least two players and all are ready
    let readyCount = 0;
    let totalCount = 0;
    this.state.players.forEach(p => {
      totalCount++;
      if (p.isReady) readyCount++;
    });

    // Usually checking if totalCount > 1, but for dev 1 might be tested
    if (totalCount >= 1 && readyCount === totalCount) {
      this.state.phase = "playing";
      console.log("ALL PLAYERS READY. STARTING MISSION.");

      // Generate actual terrain logic here later
      // Pick active player
      const pKeys = Array.from(this.state.players.keys());
      this.state.activePlayerId = pKeys[0];
    }
  }
}
