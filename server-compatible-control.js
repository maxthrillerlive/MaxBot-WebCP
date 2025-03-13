#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const os = require('os');

// Create a PID file
const pidFile = path.join(__dirname, 'maxbot-tui.pid');
fs.writeFileSync(pidFile, process.pid.toString());
console.log(`PID file created at ${pidFile}`);

// Application state
const appState = {
  wsStatus: 'Disconnected',
  logs: [],
  startTime: Date.now(),
  wsMessages: 0,
  lastPingTime: 0,
  lastPongTime: 0,
  reconnectAttempts: 0,
  serverErrors: []
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

// Generate a client ID
const clientId = `MaxBot-TUI-HTTP-${os.hostname()}-${process.pid}`;

// Connect to WebSocket server
function connectToWebSocket() {
  try {
    // Get server URL from environment variables or use default
    const host = process.env.WEBSOCKET_HOST || '192.168.1.122';
    const port = process.env.WEBSOCKET_PORT || '8080';
    const serverUrl = `ws://${host}:${port}`;
    
    addLog(`Connecting to WebSocket server at: ${serverUrl}`);
    appState.reconnectAttempts++;
    
    const ws = new WebSocket(serverUrl, {
      handshakeTimeout: 5000, // 5 seconds
      headers: {
        'User-Agent': clientId
      }
    });
    
    // Set up connection timeout
    const connectionTimeout = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        addLog('Connection timeout reached, closing socket');
        try {
          ws.terminate();
        } catch (e) {
          // Ignore errors
        }
      }
    }, 10000);
    
    ws.on('open', () => {
      clearTimeout(connectionTimeout);
      addLog('Connected to WebSocket server');
      appState.wsStatus = 'Connected';
      appState.reconnectAttempts = 0;
      
      // Wait a short time before sending the first message
      // This can help if the server needs time to initialize the connection
      setTimeout(() => {
        try {
          // Send a simple ping message first to test the connection
          const pingMessage = {
            type: 'ping',
            client_id: clientId,
            timestamp: Date.now()
          };
          
          ws.send(JSON.stringify(pingMessage));
          addLog('Sent initial ping message');
          
          // Wait a bit before sending the status request
          setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
              try {
                const statusRequest = {
                  type: 'GET_STATUS',
                  client_id: clientId,
                  timestamp: Date.now()
                };
                
                ws.send(JSON.stringify(statusRequest));
                addLog('Sent status request');
              } catch (e) {
                addLog(`Error sending status request: ${e.message}`);
              }
            }
          }, 1000);
          
        } catch (e) {
          addLog(`Error sending initial ping: ${e.message}`);
        }
      }, 500);
      
      // Set up a ping interval to keep the connection alive
      pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            // Send a ping message
            const pingMessage = {
              type: 'ping',
              client_id: clientId,
              timestamp: Date.now()
            };
            
            ws.send(JSON.stringify(pingMessage));
            appState.lastPingTime = Date.now();
            addLog('Sent ping message');
            
            // Check if we've received a pong for the last ping
            if (appState.lastPingTime - appState.lastPongTime > 30000 && appState.lastPongTime !== 0) {
              addLog('No pong received for 30 seconds, reconnecting');
              clearInterval(pingInterval);
              try {
                ws.terminate();
              } catch (e) {
                // Ignore errors
              }
              setTimeout(() => connectToWebSocket(), 1000);
            }
          } catch (e) {
            addLog(`Error sending ping: ${e.message}`);
            clearInterval(pingInterval);
          }
        } else {
          // WebSocket is not open, clear the interval
          addLog('WebSocket not open, clearing ping interval');
          clearInterval(pingInterval);
        }
      }, 10000); // Send a ping every 10 seconds
    });
    
    ws.on('message', (data) => {
      try {
        // Log the raw data for debugging
        const dataStr = data.toString();
        addLog(`Received raw data: ${dataStr}`);
        
        // Check if the data is valid JSON
        if (!dataStr.trim().startsWith('{') && !dataStr.trim().startsWith('[')) {
          addLog(`Received non-JSON data: ${dataStr}`);
          return;
        }
        
        const message = JSON.parse(dataStr);
        
        // Check if the message has a type
        if (!message.type) {
          addLog(`Received message without type: ${JSON.stringify(message)}`);
          
          // Try to determine if this is a status message
          if (message.connectionState && message.username) {
            addLog('This appears to be a status message, handling as STATUS type');
            // Store the status information if needed
            appState.wsMessages++;
            return;
          }
          
          return;
        }
        
        appState.wsMessages++;
        
        // Handle different message types
        switch (message.type.toUpperCase()) {  // Convert to uppercase for case-insensitive comparison
          case 'PONG':
            appState.lastPongTime = Date.now();
            addLog('Received pong response');
            break;
            
          case 'STATUS':
            addLog(`Received status update`);
            break;
            
          case 'COMMANDS':
            addLog(`Received commands list`);
            break;
            
          case 'CHAT_MESSAGE':
            addLog(`Received chat message from ${message.data?.username || 'unknown'}`);
            break;
            
          case 'CONNECTION_STATE':
            addLog(`Received connection state: ${message.state || 'unknown'}`);
            break;
            
          case 'ERROR':
            addLog(`Received error from server: ${message.error || 'Unknown error'}`);
            appState.serverErrors.push({
              time: new Date().toISOString(),
              error: message.error || 'Unknown error'
            });
            break;
            
          default:
            addLog(`Received message of type: ${message.type}`);
        }
      } catch (error) {
        addLog(`Error processing message: ${error.message}`);
      }
    });
    
    ws.on('close', (code, reason) => {
      addLog(`Disconnected from WebSocket server (Code: ${code}, Reason: ${reason || 'No reason provided'})`);
      appState.wsStatus = 'Disconnected';
      clearInterval(pingInterval);
      
      // Implement exponential backoff for reconnection
      const delay = Math.min(1000 * Math.pow(1.5, appState.reconnectAttempts - 1), 30000);
      addLog(`Will attempt to reconnect in ${delay/1000} seconds`);
      
      setTimeout(() => {
        if (appState.running) {
          addLog('Attempting to reconnect...');
          connectToWebSocket();
        }
      }, delay);
    });
    
    ws.on('error', (error) => {
      addLog(`WebSocket error: ${error.message}`);
      appState.wsStatus = 'Error';
      appState.serverErrors.push({
        time: new Date().toISOString(),
        error: error.message
      });
      
      // Don't need to close here, the 'close' event will be triggered automatically
    });
    
    return ws;
  } catch (error) {
    addLog(`Error creating WebSocket: ${error.message}`);
    appState.wsStatus = 'Error';
    appState.serverErrors.push({
      time: new Date().toISOString(),
      error: error.message
    });
    
    // Implement exponential backoff for reconnection
    const delay = Math.min(1000 * Math.pow(1.5, appState.reconnectAttempts - 1), 30000);
    addLog(`Will attempt to reconnect in ${delay/1000} seconds`);
    
    setTimeout(() => {
      if (appState.running) {
        addLog('Attempting to reconnect...');
        connectToWebSocket();
      }
    }, delay);
    
    return null;
  }
}

// Send a command to the WebSocket server
function sendCommand(command, data = {}) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    addLog('Cannot send command: WebSocket not connected');
    return false;
  }
  
  try {
    const message = {
      type: command,
      client_id: clientId,
      data: data,
      timestamp: Date.now()
    };
    
    ws.send(JSON.stringify(message));
    addLog(`Sent command: ${command}`);
    return true;
  } catch (error) {
    addLog(`Error sending command: ${error.message}`);
    return false;
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
      
      // Try to close the WebSocket connection gracefully
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          const exitMessage = {
            type: 'disconnect',
            client_id: clientId,
            timestamp: Date.now()
          };
          ws.send(JSON.stringify(exitMessage));
          addLog('Sent disconnect message');
          
          setTimeout(() => {
            try {
              ws.close();
            } catch (e) {
              // Ignore errors
            }
          }, 500);
        } catch (e) {
          // Ignore errors
        }
      }
      
      setTimeout(() => {
        process.exit(0);
      }, 1000);
      break;
      
    case '/status':
      const status = {
        pid: process.pid,
        uptime: Math.floor((Date.now() - appState.startTime) / 1000),
        memory: process.memoryUsage(),
        wsStatus: appState.wsStatus,
        wsMessages: appState.wsMessages,
        reconnectAttempts: appState.reconnectAttempts,
        lastPing: appState.lastPingTime ? new Date(appState.lastPingTime).toISOString() : null,
        lastPong: appState.lastPongTime ? new Date(appState.lastPongTime).toISOString() : null,
        clientId: clientId,
        serverErrors: appState.serverErrors,
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
      if (ws) {
        try {
          if (ws.readyState === WebSocket.OPEN) {
            const disconnectMessage = {
              type: 'disconnect',
              client_id: clientId,
              timestamp: Date.now()
            };
            ws.send(JSON.stringify(disconnectMessage));
            addLog('Sent disconnect message');
          }
          
          setTimeout(() => {
            try {
              ws.terminate();
            } catch (e) {
              // Ignore errors
            }
            ws = connectToWebSocket();
          }, 500);
        } catch (e) {
          addLog(`Error during reconnect: ${e.message}`);
          ws = connectToWebSocket();
        }
      } else {
        ws = connectToWebSocket();
      }
      
      res.setHeader('Content-Type', 'text/html');
      res.write('<html><body><h1>Reconnecting to WebSocket server...</h1><script>setTimeout(() => { window.location.href = "/"; }, 1000);</script></body></html>');
      res.end();
      break;
      
    case '/send':
      // Get command from query parameters
      const command = url.searchParams.get('command');
      
      if (!command) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.write(JSON.stringify({ error: 'Missing command parameter' }));
        res.end();
        break;
      }
      
      // Try to parse data parameter as JSON
      let data = {};
      const dataParam = url.searchParams.get('data');
      if (dataParam) {
        try {
          data = JSON.parse(dataParam);
        } catch (e) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.write(JSON.stringify({ error: 'Invalid data parameter, must be valid JSON' }));
          res.end();
          break;
        }
      }
      
      // Send the command
      const success = sendCommand(command, data);
      
      res.setHeader('Content-Type', 'application/json');
      res.write(JSON.stringify({ success, command, data }));
      res.end();
      break;
      
    default:
      // Default page (dashboard)
      res.setHeader('Content-Type', 'text/html');
      res.write(`
        <html>
        <head>
          <title>MaxBot TUI Control</title>
          <meta http-equiv="refresh" content="5">
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
            .command-form {
              margin-top: 20px;
              padding: 10px;
              background-color: #f1f1f1;
              border-radius: 4px;
            }
            .command-form input, .command-form textarea {
              width: 100%;
              padding: 8px;
              margin: 5px 0;
              box-sizing: border-box;
            }
            .errors {
              background-color: #ffebee;
              padding: 10px;
              border-radius: 4px;
              margin-top: 20px;
              border-left: 4px solid #f44336;
            }
            .error-entry {
              margin: 5px 0;
              padding: 5px;
              border-bottom: 1px solid #ffcdd2;
            }
          </style>
        </head>
        <body>
          <h1>MaxBot TUI Control Panel</h1>
          
          <div class="info">
            <p>Process ID: ${process.pid}</p>
            <p>Client ID: ${clientId}</p>
            <p>Uptime: ${Math.floor((Date.now() - appState.startTime) / 1000)} seconds</p>
            <p>Started at: ${new Date(appState.startTime).toISOString()}</p>
            <p>WebSocket Status: <span class="status-${appState.wsStatus.toLowerCase()}">${appState.wsStatus}</span></p>
            <p>WebSocket Messages Received: ${appState.wsMessages}</p>
            <p>Reconnect Attempts: ${appState.reconnectAttempts}</p>
            <p>Last Ping: ${appState.lastPingTime ? new Date(appState.lastPingTime).toISOString() : 'Never'}</p>
            <p>Last Pong: ${appState.lastPongTime ? new Date(appState.lastPongTime).toISOString() : 'Never'}</p>
          </div>
          
          <div>
            <a href="/exit" class="button">Exit Application</a>
            <a href="/status" class="button blue">Get Status (JSON)</a>
            <a href="/logs" class="button blue">Get Logs (JSON)</a>
            <a href="/reconnect" class="button green">Reconnect WebSocket</a>
          </div>
          
          <div class="command-form">
            <h2>Send Command</h2>
            <form action="/send" method="get">
              <label for="command">Command:</label>
              <input type="text" id="command" name="command" placeholder="Enter command (e.g., ping)" required>
              
              <label for="data">Data (JSON):</label>
              <textarea id="data" name="data" placeholder='{"key": "value"}'></textarea>
              
              <input type="submit" value="Send Command" class="button green">
            </form>
            <p><strong>Note:</strong> Avoid using 'status_request' command as it causes a server error.</p>
          </div>
          
          ${appState.serverErrors.length > 0 ? `
          <h2>Server Errors</h2>
          <div class="errors">
            ${appState.serverErrors.map(error => `
              <div class="error-entry">
                <strong>${error.time}</strong>: ${error.error}
              </div>
            `).join('')}
          </div>
          ` : ''}
          
          <h2>Application Logs</h2>
          <div class="logs">
            ${appState.logs.map(log => `<p class="log-entry">${log}</p>`).join('')}
          </div>
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