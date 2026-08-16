const http = require("http");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3010;
const clients = new Map();

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
      skin: c.skin || 0
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
    x: 24,
    y: 10,
    skin: 0,
    lastSeen: Date.now(),
    announced: false
  });
  console.log("[join]", id, "online=", clients.size);

  try {
    ws.send(JSON.stringify({ type: "welcome", id, peers: roster(id) }));
  } catch (e) {}

  // Do NOT broadcast join until hello (avoids "Player" spam)
  // If no hello in 2s, announce as Player anyway
  setTimeout(() => {
    const c = clients.get(id);
    if (!c || c.announced) return;
    c.announced = true;
    broadcast(id, {
      type: "join",
      id,
      name: c.name,
      x: c.x,
      y: c.y,
      skin: c.skin
    });
  }, 2000);

  ws.on("message", (data) => {
    let msg;
    try { msg = JSON.parse(String(data)); } catch (e) { return; }
    const c = clients.get(id);
    if (!c) return;
    c.lastSeen = Date.now();

    if (msg.type === "hello") {
      const newName = (msg.name && String(msg.name).trim()) ? String(msg.name).trim().slice(0, 24) : c.name;
      const nameChanged = newName !== c.name;
      c.name = newName;
      if (typeof msg.skin === "number") c.skin = msg.skin;
      console.log("[hello]", id, c.name);

      if (!c.announced) {
        c.announced = true;
        broadcast(id, {
          type: "join",
          id,
          name: c.name,
          x: c.x,
          y: c.y,
          skin: c.skin
        });
      } else if (nameChanged) {
        broadcast(id, {
          type: "name",
          id,
          name: c.name,
          skin: c.skin
        });
        broadcast(id, {
          type: "join",
          id,
          name: c.name,
          x: c.x,
          y: c.y,
          skin: c.skin
        });
      }
      return;
    }

    if (msg.type === "pos") {
      if (typeof msg.x === "number") c.x = msg.x;
      if (typeof msg.y === "number") c.y = msg.y;
      if (msg.name && String(msg.name).trim()) c.name = String(msg.name).trim().slice(0, 24);
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
    }
  });

  ws.on("close", () => {
    clients.delete(id);
    broadcast(id, { type: "leave", id });
    console.log("[leave]", id, "online=", clients.size);
  });
  ws.on("error", () => {});
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("[diggerz-relay] listening on", PORT);
});
