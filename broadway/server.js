const http = require('http');
const ws = require('ws');
const Splitter = require('stream-split');
const NALseparator = new Buffer([0, 0, 0, 1]); //NAL break

const prefix = `[H264-Server] `;

class Server {
  attachSource(source) {
    const id = source.id;
    if (id in this.sessions) {
      this.sessions[id].add(source);
    } else {
      const set = (this.sessions[id] = new Set());
      set.add(source);
    }

    console.log(`${prefix}attach new Session: ${id}`);
  }

  dettachSource(source) {
    const id = source.id;
    if (id in this.sessions && this.sessions[id].has(source)) {
      this.sessions[id].delete(source);
      console.log(`${prefix}detach new Session: ${id}`);
    }
  }

  broadcast(id, chunk) {
    const data = Buffer.concat([NALseparator, chunk]);
    if (id in this.sessions) {
      const sess = this.sessions[id].values();
      for (const s of sess) {
        s.onMessage(data);
      }
    }
  }

  constructor(port) {
    this.sessions = {};
    this.publisher = {};

    this.server = http
      .createServer((req, res) => {
        const url = req.url || '/';

        if (!url.startsWith('/push')) {
          res.statusCode = 404;
          res.write('Not Found');
          res.end();
          return;
        }

        const id = url.slice(6);
        console.log(`${prefix}Stream connected: ${id}`);

        res.connection.setTimeout(0);

        const stream = req.pipe(new Splitter(NALseparator));
        const desc = (this.publisher[id] = {});

        stream.on('data', (c) => {
          if (desc.firstChunk == null) {
            const b = Buffer.alloc(c.byteLength);
            c.copy(b);
            desc.firstChunk = b;
          }

          this.broadcast(id, c);
        });

        req.on('end', () => {
          console.log(`${prefix}Stream closed: ${id}`);
          delete this.publisher[id];
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
          cb(false, undefined, 'use /pull/*');
        }
      },
    });

    // 新连接
    this.wss.on('connection', (client, req) => {
      const url = req.url;
      const id = url.slice(6);

      console.log(`${prefix}new player attached from ${url} - ${id}`);
      client.send(
        JSON.stringify({
          action: 'connected',
          hasPublisher: !!this.publisher[id],
        }),
      );

      let buzy = false;
      const source = {
        id,
        onMessage: (data) => {
          if (client.readyState === client.OPEN) {
            // 推送
            if (buzy) {
              return;
            }

            buzy = true;
            client.send(data, { binary: true }, function ack() {
              buzy = false;
            });
          }
        },
      };

      if (this.publisher[id] && this.publisher[id].firstChunk) {
        client.send(this.publisher[id].firstChunk, { binary: true });
      }

      this.attachSource(source);

      client.on('message', (data) => {
        console.log(`${prefix}incomming message from ${id}`, data);
      });

      client.on('close', () => {
        console.log(`${prefix} player dettached: ${id}`);
        this.dettachSource(source);
      });
    });
  }
}

new Server(9999);
