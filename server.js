/**
 * Diggerz presence relay — JSON only (no diggerz binary).
 * Clients spawn themselves locally; this just syncs peers.
 *
 * Host: npm start
 * Friends: set window.DGZ_RELAY = "ws://YOUR_LAN_IP:3010"
 */
const http = require("http");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3010;
const clients = new Map();
let nextId = 1;

function broadcast(exceptId, obj) {
  const msg = JSON.stringify(obj);
  for (const [id, c] of clients) {
    if (id === exceptId) continue;
    if (c.ws.readyState === 1) {
      try { c.ws.send(msg); } catch (e) {}
    }
  }
}

function snapshot() {
  const list = [];
  for (const [, c] of clients) {
    list.push({
      id: c.id,
      name: c.name,
      x: c.x,
      y: c.y,
      skin: c.skin,
      outfit: c.outfit || null,
    });
  }
  return list;
}

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/plain",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(
    "Diggerz relay OK\n" +
      clients.size +
      " online\n" +
      "Friends connect to ws://YOUR_IP:" +
      PORT +
      "\n"
  );
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  const id = "p" + nextId++;
  const client = {
    id,
    ws,
    name: "Player",
    x: 20,
    y: 15,
    skin: 1.44,
    outfit: null,
  };
  clients.set(id, client);
  console.log("[join]", id, "from", req.socket.remoteAddress, "online", clients.size);

  // tell this client its id + who is already here
  ws.send(JSON.stringify({ type: "welcome", id, peers: snapshot().filter((p) => p.id !== id) }));

  // tell others
  broadcast(id, {
    type: "peer_join",
    id,
    name: client.name,
    x: client.x,
    y: client.y,
    skin: client.skin,
  });

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch (e) {
      return;
    }
    if (!msg || !msg.type) return;

    if (msg.type === "hello") {
      if (msg.name) client.name = String(msg.name).slice(0, 16);
      if (msg.skin != null) client.skin = Number(msg.skin) || client.skin;
      if (msg.x != null) client.x = Number(msg.x);
      if (msg.y != null) client.y = Number(msg.y);
      if (msg.outfit) client.outfit = msg.outfit;
      console.log("[hello]", client.name, client.id);
      broadcast(id, {
        type: "peer_join",
        id,
        name: client.name,
        x: client.x,
        y: client.y,
        skin: client.skin,
        outfit: client.outfit,
      });
      return;
    }

    if (msg.type === "pos") {
      client.x = Number(msg.x) || client.x;
      client.y = Number(msg.y) || client.y;
      broadcast(id, { type: "peer_pos", id, x: client.x, y: client.y, name: client.name });
      return;
    }

    if (msg.type === "chat" && msg.text) {
      const text = String(msg.text).slice(0, 120);
      const line = { type: "chat", id, name: client.name, text };
      // include sender
      for (const [, c] of clients) {
        if (c.ws.readyState === 1) {
          try { c.ws.send(JSON.stringify(line)); } catch (e) {}
        }
      }
      console.log("[chat]", client.name + ":", text);
      return;
    }

    if (msg.type === "outfit") {
      client.outfit = msg.outfit || null;
      broadcast(id, { type: "peer_outfit", id, outfit: client.outfit, name: client.name });
    }
  });

  ws.on("close", () => {
    clients.delete(id);
    broadcast(id, { type: "peer_leave", id, name: client.name });
    console.log("[leave]", id, client.name, "online", clients.size);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("");
  console.log("=== Diggerz RELAY (host on your PC) ===");
  console.log("Listening on port", PORT);
  console.log("You:     ws://127.0.0.1:" + PORT);
  console.log("Friends: ws://YOUR_LAN_IP:" + PORT);
  console.log("Find LAN IP: ipconfig  (IPv4 Address)");
  console.log("Allow port", PORT, "in Windows Firewall if friends can't connect");
  console.log("");
});
