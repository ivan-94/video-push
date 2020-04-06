const http = require('http');
const ws = require('ws');

const prefix = `[JSMpeg-Server] `;

class Server {
  attachListener(source) {
    const id = source.id;
    if (id in this.sessions) {
      this.sessions[id].add(source);
    } else {
      const set = (this.sessions[id] = new Set());
      set.add(source);
    }

    console.log(`${prefix}attach new Session: ${id}`);
  }

  detachListener(source) {
    const id = source.id;
    if (id in this.sessions && this.sessions[id].has(source)) {
      this.sessions[id].delete(source);
      console.log(`${prefix}detach new Session: ${id}`);
    }
  }

  broadcast(id, chunk) {
    if (id in this.sessions) {
      const sess = this.sessions[id].values();
      for (const s of sess) {
        s.onMessage(chunk);
      }
    }
  }

  constructor(port) {
    this.sessions = {};

    this.server = http
      .createServer((req, res) => {
        const url = req.url || '/';

        if (!url.startsWith('/push/')) {
          res.statusCode = 404;
          res.write('Not found');
          res.end();
          return;
        }

        const id = url.slice(6);

        console.log(`${prefix}Stream connected: ${id}`);

        res.connection.setTimeout(0);

        req.on('data', (c) => {
          this.broadcast(id, c);
        });

        req.on('end', () => {
          console.log(`${prefix}Stream closed: ${id}`);
        });
      })
      .listen(port, () => {
        console.log(
          `${prefix}Listening for incomming MPEG-TS Stream on http://127.0.0.1:${port}`,
        );
      });

    /**
     * 使用 webSocket 拉取流
     */
    this.wss = new ws.Server({
      server: this.server,
      verifyClient: (info, cb) => {
        if (info.req.url && info.req.url.startsWith('/pull')) {
          cb(true);
        } else {
          cb(false, undefined, 'use /pull/{id}');
        }
      },
    });

    // 新连接
    this.wss.on('connection', (client, req) => {
      const url = req.url;
      const id = url.slice(6);

      console.log(`${prefix}new player attached: ${id}`);

      let buzy = false;
      const listener = {
        id,
        onMessage: (data) => {
          // 推送
          if (buzy) {
            return;
          }

          buzy = true;
          client.send(data, { binary: true }, function ack() {
            buzy = false;
          });
        },
      };

      this.attachListener(listener);

      client.on('close', () => {
        console.log(`${prefix} player dettached: ${id}`);
        this.detachListener(listener);
      });
    });
  }
}

new Server(9999);
