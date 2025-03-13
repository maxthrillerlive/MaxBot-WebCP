#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const WebSocket = require('ws');

// Create a PID file
const pidFile = path.join(__dirname, 'maxbot-tui.pid');
fs.writeFileSync(pidFile, process.pid.toString());
console.log(`PID file created at ${pidFile}`);

// Application state
const appState = {
  wsStatus: 'Disconnected',
  logs: [],
  startTime: Date.now(),
  wsMessages: 0
};

// Add log message
function addLog(message) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}`;
  console.log(logEntry);
  appState.logs.push(logEntry);
  
  // Keep only the last 100 logs
  if (appState.logs.length > 100) {
    appState.logs.shift();
  }
}

// Clean up on exit
process.on('exit', () => {
  try {
    if (fs.existsSync(pidFile)) {
      fs.unlinkSync(pidFile);
      console.log('PID file removed');
    }
  } catch (e) {
    // Ignore errors
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  addLog(`Uncaught exception: ${err.message}`);
  addLog(err.stack);
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  addLog(`Unhandled rejection at: ${promise}, reason: ${reason}`);
});

// Connect to WebSocket server
function connectToWebSocket() {
  try {
    // Get server URL from environment variables or use default
    const host = process.env.WEBSOCKET_HOST || '192.168.1.122';
    const port = process.env.WEBSOCKET_PORT || '8080';
    const serverUrl = `ws://${host}:${port}`;
    
    addLog(`Connecting to WebSocket server at: ${serverUrl}`);
    
    const ws = new WebSocket(serverUrl, {
      handshakeTimeout: 5000 // 5 seconds
    });
    
    ws.on('open', () => {
      addLog('Connected to WebSocket server');
      appState.wsStatus = 'Connected';
    });
    
    ws.on('error', (error) => {
      addLog(`WebSocket error: ${error.message}`);
      appState.wsStatus = 'Error';
    });
    
    ws.on('close', () => {
      addLog('Disconnected from WebSocket server');
      appState.wsStatus = 'Disconnected';
      
      // Try to reconnect after 5 seconds
      setTimeout(() => {
        addLog('Attempting to reconnect...');
        connectToWebSocket();
      }, 5000);
    });
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        appState.wsMessages++;
        addLog(`Received message of type: ${message.type}`);
      } catch (error) {
        addLog(`Error processing message: ${error.message}`);
      }
    });
    
    return ws;
  } catch (error) {
    addLog(`Error creating WebSocket connection: ${error.message}`);
    appState.wsStatus = 'Error';
    return null;
  }
}

// Initialize WebSocket connection
let ws = connectToWebSocket();

// Create HTTP server
const server = http.createServer((req, res) => {
  // Parse URL
  const url = new URL(req.url, `http://${req.headers.host}`);
  
  // Handle different routes
  switch(url.pathname) {
    case '/exit':
      res.setHeader('Content-Type', 'text/html');
      res.write('<html><body><h1>MaxBot TUI is shutting down...</h1></body></html>');
      res.end();
      addLog('Exit command received via HTTP');
      setTimeout(() => {
        process.exit(0);
      }, 500);
      break;
      
    case '/status':
      const status = {
        pid: process.pid,
        uptime: Math.floor((Date.now() - appState.startTime) / 1000),
        memory: process.memoryUsage(),
        wsStatus: appState.wsStatus,
        wsMessages: appState.wsMessages,
        timestamp: new Date().toISOString()
      };
      
      res.setHeader('Content-Type', 'application/json');
      res.write(JSON.stringify(status, null, 2));
      res.end();
      break;
      
    case '/logs':
      res.setHeader('Content-Type', 'application/json');
      res.write(JSON.stringify(appState.logs, null, 2));
      res.end();
      break;
      
    case '/reconnect':
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      ws = connectToWebSocket();
      
      res.setHeader('Content-Type', 'text/html');
      res.write('<html><body><h1>Reconnecting to WebSocket server...</h1><script>setTimeout(() => { window.location.href = "/"; }, 1000);</script></body></html>');
      res.end();
      break;
      
    default:
      // Default page (dashboard)
      res.setHeader('Content-Type', 'text/html');
      res.write(`
        <html>
        <head>
          <title>MaxBot TUI Control</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            h1, h2 { color: #333; }
            .button { 
              display: inline-block; 
              background-color: #f44336; 
              color: white; 
              padding: 14px 20px; 
              margin: 8px 0; 
              border: none; 
              border-radius: 4px; 
              cursor: pointer; 
              font-size: 16px;
            }
            .button:hover { background-color: #d32f2f; }
            .button.blue { background-color: #2196F3; }
            .button.blue:hover { background-color: #0b7dda; }
            .button.green { background-color: #4CAF50; }
            .button.green:hover { background-color: #3e8e41; }
            .info { background-color: #f1f1f1; padding: 10px; border-radius: 4px; margin-bottom: 20px; }
            .status-connected { color: green; font-weight: bold; }
            .status-disconnected { color: red; font-weight: bold; }
            .status-error { color: orange; font-weight: bold; }
            .logs { 
              height: 300px; 
              overflow-y: auto; 
              background-color: #f8f8f8; 
              padding: 10px; 
              border: 1px solid #ddd; 
              font-family: monospace;
              margin-top: 20px;
            }
            .log-entry {
              margin: 0;
              padding: 2px 0;
              border-bottom: 1px solid #eee;
            }
          </style>
        </head>
        <body>
          <h1>MaxBot TUI Control Panel</h1>
          
          <div class="info">
            <p>Process ID: ${process.pid}</p>
            <p>Uptime: ${Math.floor((Date.now() - appState.startTime) / 1000)} seconds</p>
            <p>Started at: ${new Date(appState.startTime).toISOString()}</p>
            <p>WebSocket Status: <span class="status-${appState.wsStatus.toLowerCase()}">${appState.wsStatus}</span></p>
            <p>WebSocket Messages Received: ${appState.wsMessages}</p>
          </div>
          
          <div>
            <a href="/exit" class="button">Exit Application</a>
            <a href="/status" class="button blue">Get Status (JSON)</a>
            <a href="/logs" class="button blue">Get Logs (JSON)</a>
            <a href="/reconnect" class="button green">Reconnect WebSocket</a>
          </div>
          
          <h2>Application Logs</h2>
          <div class="logs">
            ${appState.logs.map(log => `<p class="log-entry">${log}</p>`).join('')}
          </div>
          
          <script>
            // Auto-refresh the page every 5 seconds
            setTimeout(() => {
              window.location.reload();
            }, 5000);
          </script>
        </body>
        </html>
      `);
      res.end();
      break;
  }
});

// Start the server on port 3000
const PORT = 3000;
server.listen(PORT, () => {
  addLog(`HTTP control server running at http://localhost:${PORT}`);
  addLog(`To exit the application, visit http://localhost:${PORT}/exit`);
});

// Set up a safety timeout to force exit after 1 hour
addLog('Setting up safety timeout (1 hour)');
setTimeout(() => {
  addLog('Safety timeout reached, forcing exit');
  process.exit(0);
}, 60 * 60 * 1000);

// Log startup
addLog('MaxBot TUI HTTP Control started'); 