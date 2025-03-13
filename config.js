const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

// Default values
const defaults = {
  WEBSOCKET_HOST: 'localhost',
  WEBSOCKET_PORT: '8080'
};

// Get environment variables with fallbacks to defaults
const config = {
  websocket: {
    host: process.env.WEBSOCKET_HOST || defaults.WEBSOCKET_HOST,
    port: process.env.WEBSOCKET_PORT || defaults.WEBSOCKET_PORT,
    get url() {
      return `ws://${this.host}:${this.port}`;
    }
  },
  
  // Add other configuration sections as needed
  ui: {
    title: 'MaxBot TUI'
  }
};

module.exports = config; 