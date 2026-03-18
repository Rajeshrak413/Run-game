import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = 3000;

  // Ludo Game State Management
  const rooms = new Map();

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join-room", (roomId, playerName) => {
      socket.join(roomId);
      
      if (!rooms.has(roomId)) {
        rooms.set(roomId, {
          players: [],
          gameState: null
        });
      }

      const room = rooms.get(roomId);
      const player = {
        id: socket.id,
        name: playerName,
        color: room.players.length === 0 ? 'red' : 
               room.players.length === 1 ? 'blue' : 
               room.players.length === 2 ? 'green' : 'yellow'
      };

      if (room.players.length < 4) {
        room.players.push(player);
        io.to(roomId).emit("player-joined", room.players);
      } else {
        socket.emit("room-full");
      }
    });

    socket.on("game-action", (roomId, action) => {
      // Broadcast action to all players in the room
      socket.to(roomId).emit("game-update", action);
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
      
      rooms.forEach((room, roomId) => {
        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
          room.players.splice(playerIndex, 1);
          io.to(roomId).emit("player-left", room.players);
          
          if (room.players.length === 0) {
            rooms.delete(roomId);
          }
        }
      });
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
