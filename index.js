const BotUI = require('./ui');
const BotClient = require('./client');
const fedora = require('./fedora');

// Create UI
const ui = new BotUI();

// Setup the screen first
ui.setupScreen();

// Create client with UI
const client = new BotClient(ui);

// Connect to the bot server
client.connect();

// Initialize Fedora integration after a delay to ensure UI is ready
setTimeout(() => {
  client.initializeFedora();
}, 500);

// ... rest of the code ... 