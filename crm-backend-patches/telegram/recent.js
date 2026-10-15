/** Запоминает, кто создал сущность через бота, чтобы не слать ему же уведомление о ней. */
const marks = new Map();
const TTL_MS = 5 * 60 * 1000;

function prune() {
  const now = Date.now();
  for (const [key, value] of marks) {
    if (now - value.at > TTL_MS) marks.delete(key);
  }
}

function mark(kind, id, userId) {
  prune();
  marks.set(`${kind}:${id}`, { userId, at: Date.now() });
}

function actorOf(kind, id) {
  const m = marks.get(`${kind}:${id}`);
  return m ? m.userId : null;
}

module.exports = { mark, actorOf };
