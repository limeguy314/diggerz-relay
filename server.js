/**
 * diggerz online relay — presence + chat for all players worldwide
 * Deploy on Render / Fly / Railway (WebSocket)
 *
 * Env: PORT (default 3010)
 */
const http = require("http");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3010;
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("diggerz relay ok\n");
});
const wss = new WebSocketServer({ server });

// id -> { ws, name, x, y, skin, flag, s, last }
const clients = new Map();

function safeSend(ws, obj) {
  if (ws.readyState === 1) {
    try { ws.send(JSON.stringify(obj)); } catch (e) {}
  }
}

function broadcast(fromId, obj, includeSelf) {
  const raw = JSON.stringify(obj);
  for (const [id, c] of clients) {
    if (!includeSelf && id === fromId) continue;
    if (c.ws.readyState === 1) {
      try { c.ws.send(raw); } catch (e) {}
    }
  }
}

function presenceSnapshot() {
  const list = [];
  for (const [id, c] of clients) {
    list.push({
      id,
      name: c.name || "Player",
      x: c.x,
      y: c.y,
      skin: c.skin,
      flag: c.flag,
      s: c.s || 0
    });
  }
  return list;
}

wss.on("connection", (ws) => {
  let myId = null;

  ws.on("message", (buf) => {
    let msg;
    try { msg = JSON.parse(String(buf)); } catch (e) { return; }
    if (!msg || !msg.type) return;

    if (msg.type === "hello" || msg.type === "join") {
      myId = String(msg.id || ("p-" + Math.random().toString(36).slice(2, 10)));
      const data = msg.data || msg;
      clients.set(myId, {
        ws,
        name: data.name || "Player",
        x: data.x != null ? data.x : 20,
        y: data.y != null ? data.y : 15,
        skin: data.skin,
        flag: data.flag,
        s: data.s || 0,
        last: Date.now()
      });
      // Welcome: send full roster to this client
      safeSend(ws, { type: "roster", list: presenceSnapshot() });
      // Tell everyone else
      broadcast(myId, {
        type: "presence",
        id: myId,
        data: {
          name: data.name || "Player",
          x: data.x != null ? data.x : 20,
          y: data.y != null ? data.y : 15,
          skin: data.skin,
          flag: data.flag,
          s: data.s || 0
        },
        t: Date.now()
      }, false);
      console.log("[join]", myId, data.name, "players=", clients.size);
      return;
    }

    if (!myId || !clients.has(myId)) return;

    if (msg.type === "presence") {
      const c = clients.get(myId);
      const d = msg.data || {};
      if (d.name) c.name = d.name;
      if (d.x != null) c.x = d.x;
      if (d.y != null) c.y = d.y;
      if (d.skin != null) c.skin = d.skin;
      if (d.flag != null) c.flag = d.flag;
      if (d.s != null) c.s = d.s;
      c.last = Date.now();
      broadcast(myId, {
        type: "presence",
        id: myId,
        data: {
          name: c.name,
          x: c.x,
          y: c.y,
          skin: c.skin,
          flag: c.flag,
          s: c.s
        },
        t: Date.now()
      }, false);
      return;
    }

    if (msg.type === "msg" || msg.type === "chat") {
      const payload = msg.data || msg;
      broadcast(myId, {
        type: "msg",
        id: myId,
        data: payload,
        t: Date.now()
      }, false);
      return;
    }

    if (msg.type === "leave") {
      // handled on close
    }
  });

  ws.on("close", () => {
    if (!myId) return;
    clients.delete(myId);
    broadcast(myId, { type: "leave", id: myId, t: Date.now() }, false);
    console.log("[leave]", myId, "players=", clients.size);
  });
});

// Drop stale (no presence for 60s)
setInterval(() => {
  const now = Date.now();
  for (const [id, c] of clients) {
    if (now - c.last > 60000) {
      try { c.ws.close(); } catch (e) {}
      clients.delete(id);
      broadcast(id, { type: "leave", id, t: now }, false);
    }
  }
}, 15000);

server.listen(PORT, "0.0.0.0", () => {
  console.log("diggerz relay listening on", PORT);
});
