const BotUI = require('./ui');
const BotClient = require('./client');
const fedora = require('./fedora');

// Create UI
const ui = new BotUI();
ui.setupScreen();

// Create client with UI
const client = new BotClient(ui);

// Make sure Fedora integration is initialized after UI is fully set up
setTimeout(() => {
  client.initializeFedora();
}, 100);

// ... rest of the code ... 