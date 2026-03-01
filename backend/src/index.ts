import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "colyseus";
import { monitor } from "@colyseus/monitor";

import { ScorchRoom } from "./rooms/ScorchRoom";

const port = Number(process.env.PORT || 2567);
const app = express();

app.use(cors());
app.use(express.json());

const server = new Server({
  server: createServer(app)
});

// define all games here
server.define("scorch_arena", ScorchRoom);

// register colyseus monitor testing
app.use("/colyseus", monitor());

server.listen(port);
console.log(`[SCORCH-BACKEND] 🚀 Listening on http://localhost:${port}`);
