// WebSocket polyfill for VS Code extension context
// Uses Node.js built-in WebSocket (Node 21+) or falls back to simple http upgrade
const http = require('http');
const https = require('https');
const { URL } = require('url');
const crypto = require('crypto');
const { EventEmitter } = require('events');

class SimpleWebSocket extends EventEmitter {
  constructor(url) {
    super();
    this.readyState = 0; // CONNECTING
    this._buffer = Buffer.alloc(0);
    this._connect(url);
  }

  _connect(urlStr) {
    const url = new URL(urlStr);
    const mod = url.protocol === 'wss:' ? https : http;
    const key = crypto.randomBytes(16).toString('base64');

    const opts = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'wss:' ? 443 : 80),
      path: url.pathname + url.search,
      headers: {
        'Upgrade': 'websocket',
        'Connection': 'Upgrade',
        'Sec-WebSocket-Key': key,
        'Sec-WebSocket-Version': '13',
      },
    };

    const req = mod.request(opts);

    req.on('upgrade', (res, socket) => {
      this._socket = socket;
      this.readyState = 1; // OPEN
      this.emit('open');

      socket.on('data', (data) => {
        this._buffer = Buffer.concat([this._buffer, data]);
        this._processFrames();
      });

      socket.on('close', () => {
        this.readyState = 3;
        this.emit('close');
      });

      socket.on('error', (err) => {
        this.emit('error', err);
      });
    });

    req.on('error', (err) => {
      this.readyState = 3;
      this.emit('error', err);
      this.emit('close');
    });

    req.end();
  }

  _processFrames() {
    while (this._buffer.length >= 2) {
      const firstByte = this._buffer[0];
      const secondByte = this._buffer[1];
      const opcode = firstByte & 0x0f;
      const payloadLen = secondByte & 0x7f;

      let offset = 2;
      let len = payloadLen;

      if (payloadLen === 126) {
        if (this._buffer.length < 4) return;
        len = this._buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLen === 127) {
        if (this._buffer.length < 10) return;
        len = Number(this._buffer.readBigUInt64BE(2));
        offset = 10;
      }

      if (this._buffer.length < offset + len) return;

      const payload = this._buffer.slice(offset, offset + len);
      this._buffer = this._buffer.slice(offset + len);

      if (opcode === 0x01) { // text
        this.emit('message', payload);
      } else if (opcode === 0x08) { // close
        this.close();
      } else if (opcode === 0x09) { // ping
        this._sendFrame(0x0a, payload); // pong
      }
    }
  }

  send(data) {
    if (this.readyState !== 1) return;
    const buf = Buffer.from(data, 'utf8');
    this._sendFrame(0x01, buf);
  }

  _sendFrame(opcode, payload) {
    if (!this._socket || this._socket.destroyed) return;

    const mask = crypto.randomBytes(4);
    let header;

    if (payload.length < 126) {
      header = Buffer.alloc(6);
      header[0] = 0x80 | opcode;
      header[1] = 0x80 | payload.length;
      mask.copy(header, 2);
    } else if (payload.length < 65536) {
      header = Buffer.alloc(8);
      header[0] = 0x80 | opcode;
      header[1] = 0x80 | 126;
      header.writeUInt16BE(payload.length, 2);
      mask.copy(header, 4);
    } else {
      header = Buffer.alloc(14);
      header[0] = 0x80 | opcode;
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(payload.length), 2);
      mask.copy(header, 10);
    }

    const masked = Buffer.alloc(payload.length);
    for (let i = 0; i < payload.length; i++) {
      masked[i] = payload[i] ^ mask[i % 4];
    }

    this._socket.write(Buffer.concat([header, masked]));
  }

  close() {
    if (this.readyState >= 2) return;
    this.readyState = 2;
    if (this._socket && !this._socket.destroyed) {
      this._sendFrame(0x08, Buffer.alloc(0));
      this._socket.end();
    }
    this.readyState = 3;
    this.emit('close');
  }
}

module.exports = SimpleWebSocket;
