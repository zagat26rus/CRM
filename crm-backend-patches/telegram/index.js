const store = require('./store');

store.migrate();

const router = require('./routes');
const notifier = require('./notifier');

module.exports = { router, start: notifier.start };
