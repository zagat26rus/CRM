const https = require('https');
const net = require('net');
const tls = require('tls');

const HOST = 'api.telegram.org';
const ROUND_MS = 2500;
const PARALLEL = 4;

/**
 * Некоторые хостинги отдают api.telegram.org по DNS на адрес, который с сервера не открывается,
 * а рабочие адреса Telegram пропускают лишь часть новых TCP-соединений. Поэтому адреса задаются явно,
 * а соединение открывается несколькими параллельными попытками: побеждает первая успешная.
 */
function createDirectTransport(ips) {
  const list = ips.length ? ips : ['149.154.167.220'];
  let lastGood = 0;
  let round = 0;

  function rawConnect(ip) {
    return new Promise((resolve, reject) => {
      const socket = net.connect({ host: ip, port: 443, family: 4 });
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error('connect timeout'));
      }, ROUND_MS);
      socket.once('connect', () => {
        clearTimeout(timer);
        resolve(socket);
      });
      socket.once('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
    });
  }

  async function openRound() {
    round += 1;
    const targets = [];
    for (let i = 0; i < PARALLEL; i += 1) {
      const idx = i < PARALLEL - 1 ? lastGood : (round + i) % list.length;
      targets.push(idx);
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      let failed = 0;
      targets.forEach((idx) => {
        rawConnect(list[idx]).then(
          (socket) => {
            if (settled) {
              socket.destroy();
              return;
            }
            settled = true;
            lastGood = idx;
            resolve(socket);
          },
          () => {
            failed += 1;
            if (failed === targets.length && !settled) reject(new Error('connect failed'));
          }
        );
      });
    });
  }

  async function openTlsSocket(maxMs) {
    const deadline = Date.now() + maxMs;
    let lastError = null;
    while (Date.now() < deadline) {
      let raw;
      try {
        raw = await openRound();
      } catch (e) {
        lastError = e;
        continue;
      }
      try {
        return await new Promise((resolve, reject) => {
          const secure = tls.connect({ socket: raw, servername: HOST });
          const timer = setTimeout(() => {
            secure.destroy();
            reject(new Error('tls timeout'));
          }, 6000);
          secure.once('secureConnect', () => {
            clearTimeout(timer);
            resolve(secure);
          });
          secure.once('error', (e) => {
            clearTimeout(timer);
            reject(e);
          });
        });
      } catch (e) {
        lastError = e;
        raw.destroy();
      }
    }
    const err = new Error(lastError?.message || 'connect failed');
    err.code = 'ETGCONNECT';
    throw err;
  }

  class PinnedAgent extends https.Agent {
    createConnection(options, callback) {
      openTlsSocket(20000).then(
        (socket) => callback(null, socket),
        (err) => callback(err)
      );
    }
  }

  const agent = new PinnedAgent({ keepAlive: true, keepAliveMsecs: 10000, maxSockets: 8, maxFreeSockets: 4 });

  function request(path, { method = 'POST', headers = {}, body = null, timeoutMs = 30000 } = {}) {
    return new Promise((resolve, reject) => {
      const req = https.request(
        { agent, host: HOST, servername: HOST, path, method, headers: { Host: HOST, ...headers } },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            clearTimeout(timer);
            resolve({ status: res.statusCode, body: Buffer.concat(chunks) });
          });
          res.on('error', (e) => {
            clearTimeout(timer);
            reject(e);
          });
        }
      );
      const timer = setTimeout(() => {
        const err = new Error('request timeout');
        err.code = 'ETIMEDOUT';
        req.destroy(err);
      }, timeoutMs);
      req.on('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
      if (body) req.write(body);
      req.end();
    });
  }

  return { request };
}

module.exports = { createDirectTransport };
