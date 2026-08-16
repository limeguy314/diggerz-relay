/**
 * Diggerz online relay — names + positions for remote players
 * Deploy on Render: node server.js
 */
const http = require("http");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3010;
const clients = new Map(); // id -> { ws, name, x, y, skin, outfit, lastSeen }

function broadcast(exceptId, obj) {
  const raw = JSON.stringify(obj);
  for (const [id, c] of clients) {
    if (id === exceptId) continue;
    if (c.ws.readyState === 1) {
      try { c.ws.send(raw); } catch (e) {}
    }
  }
}

function roster(exceptId) {
  const list = [];
  for (const [id, c] of clients) {
    if (id === exceptId) continue;
    list.push({
      id,
      name: c.name || "Player",
      x: c.x,
      y: c.y,
      skin: c.skin || 0,
      outfit: c.outfit || null
    });
  }
  return list;
}

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/plain",
    "Access-Control-Allow-Origin": "*"
  });
  res.end("Diggerz relay OK — " + clients.size + " online\n");
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  const id = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  clients.set(id, {
    ws,
    name: "Player",
    x: 20,
    y: 10,
    skin: 0,
    outfit: null,
    lastSeen: Date.now()
  });

  console.log("[join]", id, "online=", clients.size);

  // Tell this client their id + everyone already here
  try {
    ws.send(JSON.stringify({ type: "welcome", id, peers: roster(id) }));
  } catch (e) {}

  // Tell others someone joined (name may update on hello)
  broadcast(id, {
    type: "join",
    id,
    name: "Player",
    x: 20,
    y: 10,
    skin: 0
  });

  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(String(data));
    } catch (e) {
      return;
    }
    const c = clients.get(id);
    if (!c) return;
    c.lastSeen = Date.now();

    if (msg.type === "hello") {
      if (msg.name && String(msg.name).trim()) {
        c.name = String(msg.name).trim().slice(0, 24);
      }
      if (typeof msg.skin === "number") c.skin = msg.skin;
      if (msg.outfit) c.outfit = msg.outfit;
      console.log("[hello]", id, c.name);
      // Re-announce with real name
      broadcast(id, {
        type: "join",
        id,
        name: c.name,
        x: c.x,
        y: c.y,
        skin: c.skin,
        outfit: c.outfit
      });
      // Also send name update
      broadcast(id, {
        type: "name",
        id,
        name: c.name,
        skin: c.skin
      });
      return;
    }

    if (msg.type === "pos") {
      if (typeof msg.x === "number") c.x = msg.x;
      if (typeof msg.y === "number") c.y = msg.y;
      broadcast(id, {
        type: "pos",
        id,
        name: c.name,
        x: c.x,
        y: c.y
      });
      return;
    }

    if (msg.type === "chat" && msg.text) {
      broadcast(id, {
        type: "chat",
        id,
        name: c.name,
        text: String(msg.text).slice(0, 120)
      });
      return;
    }

    if (msg.type === "outfit") {
      c.outfit = msg.outfit || null;
      broadcast(id, {
        type: "outfit",
        id,
        name: c.name,
        outfit: c.outfit
      });
    }
  });

  ws.on("close", () => {
    clients.delete(id);
    broadcast(id, { type: "leave", id });
    console.log("[leave]", id, "online=", clients.size);
  });

  ws.on("error", () => {});
});

// Drop stale clients
setInterval(() => {
  const now = Date.now();
  for (const [id, c] of clients) {
    if (now - c.lastSeen > 120000) {
      try { c.ws.close(); } catch (e) {}
      clients.delete(id);
      broadcast(id, { type: "leave", id });
    }
  }
}, 30000);

server.listen(PORT, "0.0.0.0", () => {
  console.log("[diggerz-relay] listening on", PORT);
});
