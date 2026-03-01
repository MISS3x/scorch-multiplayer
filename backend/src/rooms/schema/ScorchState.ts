import { Schema, MapSchema, ArraySchema, type } from "@colyseus/schema";

export class Player extends Schema {
  @type("string") id: string = "";
  @type("string") name: string = "Player";
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("number") health: number = 100;
  @type("number") angle: number = 45;
  @type("number") power: number = 50;
  @type("string") color: string = "#fff";
  @type("boolean") isReady: boolean = false;
  @type("boolean") isAlive: boolean = true;
  @type("number") score: number = 0;
}

export class Projectile extends Schema {
  @type("string") id: string = "";
  @type("string") ownerId: string = "";
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("number") radius: number = 5;
}

export class ScorchState extends Schema {
  @type("string") phase: string = "lobby"; // lobby, playing, gameover
  @type("string") activePlayerId: string = "";
  @type("number") wind: number = 0;

  // Representing the destructible terrain heightmap simply as an array of Y heights.
  @type(["number"]) terrainHeights = new ArraySchema<number>();

  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Projectile }) projectiles = new MapSchema<Projectile>();
}
