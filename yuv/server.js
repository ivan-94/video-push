const http = require('http');
const ws = require('ws');
const { URL } = require('url');
const Splitter = require('./size-split');

const prefix = `[YUV-Server] `;

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
    if (id in this.sessions) {
      const sess = this.sessions[id].values();
      for (const s of sess) {
        s.onMessage(chunk);
      }
    }
  }

  constructor(port) {
    this.sessions = {};
    this.publisher = {};

    this.server = http
      .createServer((req, res) => {
        // 不超时
        const url = req.url || '/';

        if (!url.startsWith('/push')) {
          res.statusCode = 400;
          res.write(
            'hello from yuv server, push stream to /push?id={id}&width={width}&height={height}',
          );
          res.end();
          return;
        }

        const parsed = new URL('http://host' + url);
        let id = parsed.searchParams.get('id'),
          width = parsed.searchParams.get('width'),
          height = parsed.searchParams.get('height');

        if (id == null || width == null || height == null) {
          res.statusCode = 400;
          res.write('id、width、height are required');
          res.end();
          return;
        }

        console.log(`${prefix}Stream connected: ${id}`);

        res.connection.setTimeout(0);

        const nwidth = parseInt(width);
        const nheight = parseInt(height);
        // var codedWidth = ((nwidth + 15) >> 4) << 4;
        // Reading Frames of uncompressed yuv video file?
        // https://raspberrypi.stackexchange.com/questions/28033/reading-frames-of-uncompressed-yuv-video-file
        // YUV format is YUV420p which uses 1.5 bytes per pixel
        const frameSize = (nwidth * nheight * 3) >> 1;

        const stream = req.pipe(new Splitter(frameSize));
        this.publisher[id] = {
          width: nwidth,
          height: nheight,
        };

        stream.on('data', (c) => {
          this.broadcast(id, c);
        });

        req.on('end', () => {
          console.log(`${prefix}Stream closed: ${id}`);
          delete this.publisher[id];
        });
      })
      .listen(port, () => {
        console.log(
          `${prefix}Listening for incomming YUV Stream on http://127.0.0.1:${port}`,
        );
      });

    /**
     * 使用 webSocket 拉取流
     */
    this.wss = new ws.Server({
      server: this.server,
      verifyClient: (info, cb) => {
        if (info.req.url && info.req.url.startsWith('/ws')) {
          cb(true);
        } else {
          cb(false, undefined, 'use /ws/*');
        }
      },
    });

    // 新连接
    this.wss.on('connection', (client, req) => {
      const url = req.url;
      const id = url.slice(4);

      console.log(`${prefix}new player attached from ${url} - ${id}`);

      let buzy = false;
      let sizeSended = false;
      const source = {
        id,
        onMessage: (data) => {
          // 推送
          if (buzy) {
            return;
          }

          buzy = true;

          if (!sizeSended) {
            sizeSended = true;
            client.send(
              JSON.stringify({ type: 'initial', data: this.publisher[id] }),
            );
          }

          client.send(data, { binary: true }, function ack() {
            buzy = false;
          });
        },
      };

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
