#!/usr/bin/env node

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const os = require('os');
const { execFile } = require('child_process');

// Generate a unique client ID
const clientId = `MaxBot-TUI-${uuidv4().substring(0, 8)}`;

// Initialize application state
const appState = {
  running: true,
  wsStatus: 'Disconnected',
  wsMessages: 0,
  reconnectAttempts: 0,
  lastPingTime: 0,
  lastStatusTime: 0,
  lastPongTime: 0,
  serverErrors: [],
  logs: [],
  chatMessages: [],
  commands: [],
  // Add statistics tracking
  stats: {
    startTime: Date.now(),
    messagesReceived: 0,
    messagesSent: 0,
    reconnections: 0,
    commandsExecuted: 0,
    chatMessagesSent: 0,
    errors: 0,
    lastStatusUpdate: null,
    botUptime: 0,
    botMemoryUsage: {},
    botUsername: '',
    botChannels: [],
    connectionHistory: [],
    botStatus: null,
    botPid: null
  }
};

// Create a PID file
const pidFile = path.join(__dirname, 'maxbot-tui-control.pid');
fs.writeFileSync(pidFile, process.pid.toString());
console.log(`PID file created at ${pidFile}`);

// Set up safety timeout
console.log('Setting up safety timeout (1 hour)');
const safetyTimeout = setTimeout(() => {
  console.log('Safety timeout reached, forcing exit');
  cleanup();
  process.exit(0);
}, 3600000); // 1 hour

// Create Express app
const app = express();
const server = http.createServer(app);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Add log function
function addLog(message) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    time: timestamp,
    message: message
  };
  
  appState.logs.push(logEntry);
  console.log(`[${timestamp}] ${message}`);
  
  // Keep logs to a reasonable size
  if (appState.logs.length > 1000) {
    appState.logs.shift();
  }
}

// Add chat message function
function addChatMessage(username, message, channel, badges = {}) {
  const timestamp = new Date().toISOString();
  const chatEntry = {
    time: timestamp,
    username,
    message,
    channel,
    badges
  };
  
  appState.chatMessages.push(chatEntry);
  
  // Keep chat messages to a reasonable size
  if (appState.chatMessages.length > 100) {
    appState.chatMessages.shift();
  }
}

// Track connection state changes
function trackConnectionState(state, reason = '') {
  const timestamp = Date.now();
  
  // Check if this is a duplicate of the last entry
  const lastEntry = appState.stats.connectionHistory.length > 0 ? 
    appState.stats.connectionHistory[appState.stats.connectionHistory.length - 1] : null;
    
  if (lastEntry && lastEntry.state === state) {
    // Update the timestamp of the existing entry instead of adding a new one
    lastEntry.time = timestamp;
    if (reason && !lastEntry.reason) {
      lastEntry.reason = reason;
    }
    console.log('Updated existing connection history entry:', lastEntry);
    return;
  }
  
  // Add to connection history
  appState.stats.connectionHistory.push({
    time: timestamp,
    state: state,
    reason: reason
  });
  
  // Keep history to a reasonable size
  if (appState.stats.connectionHistory.length > 100) {
    appState.stats.connectionHistory.shift();
  }
  
  // If reconnected, increment counter
  if (state === 'Connected' && appState.stats.connectionHistory.length > 1) {
    appState.stats.reconnections++;
  }
}

// Connect to WebSocket server
let ws = null;
let pingInterval = null;

function connectToWebSocket() {
  try {
    // Get server URL from environment variables or use default
    const host = process.env.WEBSOCKET_HOST || 'localhost';
    const port = process.env.WEBSOCKET_PORT || '8080';
    const serverUrl = `ws://${host}:${port}`;
    
    addLog(`Connecting to WebSocket server at: ${serverUrl}`);
    appState.reconnectAttempts++;
    
    ws = new WebSocket(serverUrl, {
      handshakeTimeout: 5000 // 5 seconds
    });
    
    // Set up connection timeout
    const connectionTimeout = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        addLog('Connection timeout reached, closing socket');
        trackConnectionState('Failed', 'Connection timeout');
        try {
          ws.terminate();
        } catch (e) {
          // Ignore errors
        }
      }
    }, 10000);
    
    // Handle WebSocket-level ping (automatically responds with pong)
    ws.on('ping', () => {
      addLog('Received WebSocket ping');
      // The ws library automatically responds with a pong
    });
    
    // Handle WebSocket-level pong
    ws.on('pong', () => {
      addLog('Received WebSocket pong');
      appState.lastPongTime = Date.now();
    });
    
    ws.on('open', () => {
      clearTimeout(connectionTimeout);
      addLog('Connected to WebSocket server');
      appState.wsStatus = 'Connected';
      appState.reconnectAttempts = 0;
      trackConnectionState('Connected');
      
      // Send GET_STATUS instead of register
      try {
        const statusRequest = {
          type: 'GET_STATUS',  // This is recognized by index.js
          client_id: clientId,
          timestamp: Date.now()
        };
        
        ws.send(JSON.stringify(statusRequest));
        appState.stats.messagesSent++;
        addLog('Sent status request');
      } catch (e) {
        addLog(`Error sending status request: ${e.message}`);
        appState.stats.errors++;
      }
      
      // Set up ping interval to keep connection alive
      clearInterval(pingInterval);
      pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            // Send application-level ping message
            const pingMsg = {
              type: 'ping',
              client_id: clientId,
              timestamp: Date.now()
            };
            
            ws.send(JSON.stringify(pingMsg));
            appState.stats.messagesSent++;
            appState.lastPingTime = Date.now();
            addLog('Sent ping message');
            
            // Also send a status request periodically
            setTimeout(() => {
              if (ws.readyState === WebSocket.OPEN) {
                try {
                  const statusRequest = {
                    type: 'GET_STATUS',
                    client_id: clientId,
                    timestamp: Date.now()
                  };
                  
                  ws.send(JSON.stringify(statusRequest));
                  appState.stats.messagesSent++;
                  addLog('Sent periodic status request');
                } catch (e) {
                  addLog(`Error sending status request: ${e.message}`);
                  appState.stats.errors++;
                }
              }
            }, 5000); // 5 seconds after ping
            
          } catch (e) {
            addLog(`Error sending ping: ${e.message}`);
            appState.stats.errors++;
            clearInterval(pingInterval);
          }
        } else {
          // WebSocket is not open, clear the interval
          addLog('WebSocket not open, clearing ping interval');
          clearInterval(pingInterval);
        }
      }, 20000); // Send ping every 20 seconds (server checks every 60)
    });
    
    ws.on('message', (data) => {
      try {
        // Log the raw data for debugging
        const dataStr = data.toString();
        addLog(`Received raw data: ${dataStr}`);
        appState.stats.messagesReceived++;
        
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
            appState.lastStatusTime = Date.now();
            
            // Update bot statistics
            appState.stats.lastStatusUpdate = Date.now();
            appState.stats.botUsername = message.username;
            appState.stats.botChannels = message.channels || [];
            appState.stats.botMemoryUsage = message.memory || {};
            appState.stats.botUptime = message.uptime || 0;
            
            // Store the process ID
            appState.stats.botPid = message.processId;
            
            // Update connection state
            appState.wsStatus = message.connectionState || 'Unknown';
            
            // Store the entire status object for reference
            appState.stats.botStatus = message;
            
            // Store commands if available
            if (message.commands) {
              appState.commands = message.commands;
              addLog(`Updated commands list (${appState.commands.length} commands)`);
            }
            
            // Log the status for debugging
            console.log('Bot status updated:', {
              username: appState.stats.botUsername,
              pid: appState.stats.botPid,
              status: appState.wsStatus,
              uptime: appState.stats.botUptime
            });
            
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
            appState.lastStatusTime = Date.now();
            
            // Update bot statistics
            if (message.data) {
              appState.stats.lastStatusUpdate = Date.now();
              appState.stats.botUsername = message.data.username || '';
              appState.stats.botChannels = message.data.channels || [];
              appState.stats.botMemoryUsage = message.data.memory || {};
              appState.stats.botUptime = message.data.uptime || 0;
              
              // Store the process ID
              appState.stats.botPid = message.data.processId;
              
              // Update connection state
              appState.wsStatus = message.data.connectionState || 'Unknown';
              
              // Store the entire status object for reference
              appState.stats.botStatus = message.data;
              
              // Log the status for debugging
              console.log('Bot status updated:', {
                username: appState.stats.botUsername,
                pid: appState.stats.botPid,
                status: appState.wsStatus,
                uptime: appState.stats.botUptime
              });
              
              // Store commands if available
              if (message.data.commands) {
                appState.commands = message.data.commands;
                addLog(`Updated commands list (${appState.commands.length} commands)`);
              }
            }
            break;
            
          case 'COMMANDS':
            addLog(`Received commands list`);
            if (message.data) {
              appState.commands = message.data;
              addLog(`Updated commands list (${appState.commands.length} commands)`);
            }
            break;
            
          case 'CHAT_MESSAGE':
            const chatData = message.data || {};
            addLog(`Received chat message from ${chatData.username || 'unknown'}`);
            
            // Add to chat messages
            addChatMessage(
              chatData.username || 'unknown',
              chatData.message || '',
              chatData.channel || '#unknown',
              chatData.badges || {}
            );
            break;
            
          case 'CONNECTION_STATE':
            const state = message.state || 'unknown';
            addLog(`Received connection state: ${state}`);
            
            // Update the connection state
            appState.wsStatus = state;
            console.log('Connection state updated:', state);
            
            // Add to connection history
            trackConnectionState(`Server: ${state}`, message.reason || '');
            break;
            
          case 'ERROR':
            const errorMsg = message.error || 'Unknown error';
            addLog(`Received error from server: ${errorMsg}`);
            appState.stats.errors++;
            appState.serverErrors.push({
              time: new Date().toISOString(),
              error: errorMsg
            });
            break;
            
          default:
            addLog(`Received message of type: ${message.type}`);
        }
      } catch (error) {
        addLog(`Error processing message: ${error.message}`);
        appState.stats.errors++;
      }
    });
    
    ws.on('close', (code, reason) => {
      addLog(`Disconnected from WebSocket server (Code: ${code}, Reason: ${reason || 'No reason provided'})`);
      appState.wsStatus = 'Disconnected';
      trackConnectionState('Disconnected', `Code: ${code}, Reason: ${reason || 'No reason provided'}`);
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
      appState.stats.errors++;
      trackConnectionState('Error', error.message);
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
    appState.stats.errors++;
    trackConnectionState('Error', error.message);
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

// API endpoints
app.get('/api/status', (req, res) => {
  res.json({
    status: appState.wsStatus,
    messages: appState.wsMessages,
    reconnectAttempts: appState.reconnectAttempts,
    errors: appState.serverErrors.slice(-10) // Return last 10 errors
  });
});

app.get('/api/logs', (req, res) => {
  const count = parseInt(req.query.count) || 50;
  res.json(appState.logs.slice(-count));
});

app.get('/api/chat', (req, res) => {
  const count = parseInt(req.query.count) || 50;
  res.json(appState.chatMessages.slice(-count));
});

app.get('/api/commands', (req, res) => {
  res.json(appState.commands);
});

app.get('/api/stats', (req, res) => {
  // Calculate control panel uptime
  const controlPanelUptime = Math.floor((Date.now() - appState.stats.startTime) / 1000);
  
  // Get system information
  const systemInfo = {
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus().length,
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    uptime: os.uptime()
  };
  
  // Format bot uptime
  let botUptimeFormatted = '';
  if (appState.stats.botUptime) {
    const hours = Math.floor(appState.stats.botUptime / 3600);
    const minutes = Math.floor((appState.stats.botUptime % 3600) / 60);
    const seconds = appState.stats.botUptime % 60;
    botUptimeFormatted = hours + 'h ' + minutes + 'm ' + seconds + 's';
  }
  
  // Format control panel uptime
  const cpHours = Math.floor(controlPanelUptime / 3600);
  const cpMinutes = Math.floor((controlPanelUptime % 3600) / 60);
  const cpSeconds = controlPanelUptime % 60;
  const controlPanelUptimeFormatted = cpHours + 'h ' + cpMinutes + 'm ' + cpSeconds + 's';
  
  // Log the current status for debugging
  console.log('Current bot status:', {
    wsStatus: appState.wsStatus,
    botUsername: appState.stats.botUsername,
    botPid: appState.stats.botPid,
    botUptime: appState.stats.botUptime,
    lastStatusUpdate: appState.stats.lastStatusUpdate ? new Date(appState.stats.lastStatusUpdate).toISOString() : null
  });
  
  // Return combined stats
  res.json({
    bot: {
      username: appState.stats.botUsername,
      channels: appState.stats.botChannels,
      uptime: appState.stats.botUptime,
      uptimeFormatted: botUptimeFormatted,
      memoryUsage: appState.stats.botMemoryUsage,
      lastStatusUpdate: appState.stats.lastStatusUpdate,
      pid: appState.stats.botPid,
      status: appState.wsStatus
    },
    controlPanel: {
      startTime: appState.stats.startTime,
      uptime: controlPanelUptime,
      uptimeFormatted: controlPanelUptimeFormatted,
      messagesReceived: appState.stats.messagesReceived,
      messagesSent: appState.stats.messagesSent,
      reconnections: appState.stats.reconnections,
      commandsExecuted: appState.stats.commandsExecuted,
      chatMessagesSent: appState.stats.chatMessagesSent,
      errors: appState.stats.errors,
      connectionHistory: appState.stats.connectionHistory.slice(-10)
    },
    system: systemInfo,
    connection: {
      status: appState.wsStatus,
      lastPingTime: appState.lastPingTime,
      lastPongTime: appState.lastPongTime,
      lastStatusTime: appState.lastStatusTime
    }
  });
});

app.post('/api/command', (req, res) => {
  const { command, channel } = req.body;
  
  if (!command) {
    return res.status(400).json({ error: 'Command is required' });
  }
  
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return res.status(503).json({ error: 'WebSocket is not connected' });
  }
  
  try {
    const commandMsg = {
      type: 'EXECUTE_COMMAND',
      command,
      channel: channel || process.env.CHANNEL_NAME || '#channel',
      client_id: clientId,
      timestamp: Date.now()
    };
    
    ws.send(JSON.stringify(commandMsg));
    appState.stats.messagesSent++;
    appState.stats.commandsExecuted++;
    addLog(`Sent command: ${command}`);
    
    res.json({ success: true, message: `Command "${command}" sent` });
  } catch (error) {
    addLog(`Error sending command: ${error.message}`);
    appState.stats.errors++;
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/chat', (req, res) => {
  const { message, channel } = req.body;
  
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }
  
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return res.status(503).json({ error: 'WebSocket is not connected' });
  }
  
  try {
    // Use the actual channel from the bot's status if available
    const targetChannel = channel || 
                         (appState.stats.botChannels && appState.stats.botChannels.length > 0 ? 
                          appState.stats.botChannels[0] : 
                          process.env.CHANNEL_NAME || '#maxthriller');
    
    // Use CHAT_COMMAND type which is recognized by index.js
    const chatMsg = {
      type: 'CHAT_COMMAND',
      message: message,
      channel: targetChannel,
      client_id: clientId,
      timestamp: Date.now()
    };
    
    addLog(`Sending message to channel: ${targetChannel}`);
    ws.send(JSON.stringify(chatMsg));
    appState.stats.messagesSent++;
    appState.stats.chatMessagesSent++;
    addLog(`Sent chat message: ${message}`);
    
    res.json({ success: true, message: `Chat message sent to ${targetChannel}` });
  } catch (error) {
    addLog(`Error sending chat message: ${error.message}`);
    appState.stats.errors++;
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/exit', (req, res) => {
  addLog('Exit requested via API');
  res.json({ success: true, message: 'Exiting...' });
  
  // Schedule cleanup and exit
  setTimeout(() => {
    cleanup();
    process.exit(0);
  }, 500);
});

// Update the API endpoints for restart and shutdown
app.post('/api/admin/restart', (req, res) => {
  console.log('Restart API endpoint called');
  
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.error('WebSocket is not connected');
    return res.status(503).json({ error: 'WebSocket is not connected' });
  }
  
  try {
    const restartMsg = {
      type: 'RESTART_BOT',
      client_id: clientId,
      timestamp: Date.now()
    };
    
    console.log('Sending restart command via WebSocket');
    ws.send(JSON.stringify(restartMsg));
    
    // Add to logs
    const timestamp = new Date().toISOString();
    appState.logs.push({
      time: timestamp,
      message: 'Sent restart command to bot'
    });
    
    // Add to connection history
    appState.stats.connectionHistory.push({
      time: Date.now(),
      state: 'Restart Requested',
      reason: 'User initiated restart via API'
    });
    
    console.log('Restart command sent successfully');
    res.json({ success: true, message: 'Restart command sent' });
  } catch (error) {
    console.error('Error sending restart command:', error);
    appState.stats.errors++;
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/shutdown', (req, res) => {
  console.log('Shutdown API endpoint called');
  
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.error('WebSocket is not connected');
    return res.status(503).json({ error: 'WebSocket is not connected' });
  }
  
  try {
    const shutdownMsg = {
      type: 'EXIT_BOT',
      client_id: clientId,
      timestamp: Date.now()
    };
    
    console.log('Sending shutdown command via WebSocket');
    ws.send(JSON.stringify(shutdownMsg));
    
    // Add to logs
    const timestamp = new Date().toISOString();
    appState.logs.push({
      time: timestamp,
      message: 'Sent shutdown command to bot'
    });
    
    // Add to connection history
    appState.stats.connectionHistory.push({
      time: Date.now(),
      state: 'Shutdown Requested',
      reason: 'User initiated shutdown via API'
    });
    
    console.log('Shutdown command sent successfully');
    res.json({ success: true, message: 'Shutdown command sent' });
  } catch (error) {
    console.error('Error sending shutdown command:', error);
    appState.stats.errors++;
    res.status(500).json({ error: error.message });
  }
});

// Add a new endpoint for connecting to a remote MaxBot instance
app.post('/api/connect', (req, res) => {
  console.log('Connect API endpoint called');
  
  const { host, port } = req.body;
  
  if (!host || !port) {
    return res.status(400).json({ 
      success: false, 
      error: 'Host and port are required' 
    });
  }
  
  try {
    // Set environment variables for the WebSocket connection
    process.env.WEBSOCKET_HOST = host;
    process.env.WEBSOCKET_PORT = port;
    
    // Close existing WebSocket connection if open
    if (ws && ws.readyState === WebSocket.OPEN) {
      addLog(`Closing existing WebSocket connection to reconnect to ${host}:${port}`);
      ws.close();
    } else {
      // If not open or no connection exists, connect immediately
      addLog(`Connecting to new WebSocket server at ${host}:${port}`);
      connectToWebSocket();
    }
    
    // Add to logs
    const timestamp = new Date().toISOString();
    appState.logs.push({
      time: timestamp,
      message: `Connection to ${host}:${port} initiated`
    });
    
    // Add to connection history
    appState.stats.connectionHistory.push({
      time: Date.now(),
      state: 'Connection Requested',
      reason: `Manual connection to ${host}:${port}`
    });
    
    console.log(`Connection to ${host}:${port} initiated`);
    res.json({ success: true, message: `Connecting to ${host}:${port}...` });
  } catch (error) {
    console.error('Error connecting to WebSocket server:', error);
    appState.stats.errors++;
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add a simple GET endpoint for starting the bot
app.get('/api/admin/start-bot', (req, res) => {
  console.log('Start bot endpoint called');
  
  try {
    const { execFile } = require('child_process');
    const scriptPath = path.join(__dirname, 'start-bot.js');
    
    console.log('Executing start script:', scriptPath);
    
    // Execute the start script
    execFile(scriptPath, [], (error, stdout, stderr) => {
      if (error) {
        console.error('Error executing start script:', error);
        console.error('stderr:', stderr);
        return res.status(500).send('Error starting bot: ' + error.message);
      }
      
      console.log('Start script output:', stdout);
      
      // Make sure we're using the global appState
      if (typeof appState !== 'undefined') {
        // Add to logs
        const timestamp = new Date().toISOString();
        appState.logs.push({
          time: timestamp,
          message: 'Bot start initiated via external script'
        });
        
        // Add to connection history locally
        if (appState.stats && appState.stats.connectionHistory) {
          appState.stats.connectionHistory.push({
            time: Date.now(),
            state: 'Start Requested',
            reason: 'User initiated start via external script'
          });
        }
      } else {
        console.warn('Warning: appState is not defined, cannot update logs');
      }
      
      return res.status(200).send('Bot start initiated');
    });
  } catch (error) {
    console.error('Error starting bot:', error);
    return res.status(500).send('Error starting bot: ' + error.message);
  }
});

// Serve HTML for the control panel
app.get('/', (req, res) => {
  const html = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MaxBot Control Panel</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        margin: 0;
        padding: 0;
        background-color: #1e1e1e;
        color: #e0e0e0;
      }
      .container {
        display: flex;
        flex-direction: column;
        height: 100vh;
        padding: 10px;
        box-sizing: border-box;
      }
      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px;
        background-color: #2d2d2d;
        border-radius: 5px;
        margin-bottom: 10px;
      }
      .status {
        display: flex;
        align-items: center;
      }
      .status-indicator {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        margin-right: 10px;
      }
      .connected { background-color: #4CAF50; }
      .disconnected { background-color: #F44336; }
      .error { background-color: #FF9800; }
      
      .tabs {
        display: flex;
        margin-bottom: 10px;
      }
      
      .tab {
        padding: 10px 20px;
        background-color: #2d2d2d;
        border-radius: 5px 5px 0 0;
        margin-right: 5px;
        cursor: pointer;
      }
      
      .tab.active {
        background-color: #3a3a3a;
        font-weight: bold;
      }
      
      .tab-content {
        display: none;
        flex: 1;
        overflow: hidden;
      }
      
      .tab-content.active {
        display: flex;
      }
      
      .main-content {
        display: flex;
        flex: 1;
        gap: 10px;
        overflow: hidden;
      }
      
      .panel {
        flex: 1;
        background-color: #2d2d2d;
        border-radius: 5px;
        padding: 10px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      
      .panel-header {
        font-weight: bold;
        margin-bottom: 10px;
        padding-bottom: 5px;
        border-bottom: 1px solid #444;
      }
      
      .logs-container, .chat-container {
        flex: 1;
        overflow-y: auto;
        font-family: monospace;
        background-color: #1a1a1a;
        padding: 10px;
        border-radius: 3px;
      }
      
      .log-entry {
        margin-bottom: 5px;
        word-wrap: break-word;
      }
      
      .chat-container {
        flex: 1;
        overflow-y: auto;
        font-family: monospace;
        background-color: #1a1a1a;
        padding: 10px;
        border-radius: 3px;
        font-size: 18px; /* Significantly increased font size for chat */
        line-height: 1.4;
      }
      
      .chat-entry {
        margin-bottom: 12px;
        word-wrap: break-word;
      }
      
      .chat-line {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
      }
      
      .chat-time {
        color: #888;
        font-size: 16px;
        margin-right: 8px;
        white-space: nowrap;
      }
      
      .chat-badges {
        display: inline-flex;
        margin-right: 5px;
      }
      
      .chat-badge {
        width: 18px;
        height: 18px;
        margin-right: 2px;
        border-radius: 3px;
        background-size: contain;
        background-repeat: no-repeat;
        background-position: center;
      }
      
      .badge-broadcaster {
        background-color: #e91916;
        background-image: url('https://static-cdn.jtvnw.net/badges/v1/5527c58c-fb7d-422d-b71b-f309dcb85cc1/1');
      }
      
      .badge-moderator {
        background-color: #34ae0a;
        background-image: url('https://static-cdn.jtvnw.net/badges/v1/3267646d-33f0-4b17-b3df-f923a41db1d0/1');
      }
      
      .badge-vip {
        background-color: #e005b9;
        background-image: url('https://static-cdn.jtvnw.net/badges/v1/b817aba4-fad8-49e2-b88a-7cc744dfa6ec/1');
      }
      
      .badge-subscriber {
        background-color: #6441a5;
        background-image: url('https://static-cdn.jtvnw.net/badges/v1/5d9f2208-5dd8-11e7-8513-2ff4adfae661/1');
      }
      
      .badge-premium {
        background-color: #009cdc;
        background-image: url('https://static-cdn.jtvnw.net/badges/v1/bbbe0db0-a598-423e-86d0-f9fb98ca1933/1');
      }
      
      .badge-bot {
        background-color: #0099ff;
        background-image: url('https://static-cdn.jtvnw.net/badges/v1/5527c58c-fb7d-422d-b71b-f309dcb85cc1/1');
      }
      
      .chat-username {
        font-weight: bold;
        color: #4CAF50;
        font-size: 18px;
        margin-right: 8px;
        white-space: nowrap;
      }
      
      .chat-message {
        font-size: 18px;
        word-break: break-word;
      }
      
      .input-container {
        display: flex;
        margin-top: 10px;
      }
      
      input[type="text"] {
        flex: 1;
        padding: 8px;
        border: none;
        border-radius: 3px;
        background-color: #3a3a3a;
        color: #e0e0e0;
      }
      
      button {
        padding: 8px 15px;
        margin-left: 5px;
        border: none;
        border-radius: 3px;
        background-color: #4CAF50;
        color: white;
        cursor: pointer;
      }
      
      button:hover {
        background-color: #45a049;
      }
      
      button.danger {
        background-color: #F44336;
      }
      
      button.danger:hover {
        background-color: #d32f2f;
      }
      
      .commands-container {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        margin-top: 10px;
      }
      
      .command-button {
        padding: 5px 10px;
        background-color: #3a3a3a;
        border-radius: 3px;
        cursor: pointer;
      }
      
      .command-button:hover {
        background-color: #4a4a4a;
      }
      
      .command-button.disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      
      /* Dashboard styles */
      .dashboard {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        padding: 10px;
        overflow-y: auto;
      }
      
      .stat-card {
        background-color: #2d2d2d;
        border-radius: 5px;
        padding: 15px;
        flex: 1;
        min-width: 200px;
      }
      
      .stat-card h3 {
        margin-top: 0;
        margin-bottom: 10px;
        color: #4CAF50;
        border-bottom: 1px solid #444;
        padding-bottom: 5px;
      }
      
      .stat-item {
        display: flex;
        justify-content: space-between;
        margin-bottom: 8px;
      }
      
      .stat-label {
        color: #aaa;
      }
      
      .stat-value {
        font-weight: bold;
      }
      
      .memory-bar {
        height: 20px;
        background-color: #1a1a1a;
        border-radius: 3px;
        overflow: hidden;
        margin-top: 5px;
      }
      
      .memory-used {
        height: 100%;
        background-color: #4CAF50;
      }
      
      .connection-history {
        max-height: 200px;
        overflow-y: auto;
        margin-top: 10px;
        background-color: #1a1a1a;
        border-radius: 3px;
        padding: 5px;
      }
      
      .history-item {
        padding: 8px;
        border-bottom: 1px solid #333;
        display: flex;
        align-items: center;
        font-size: 14px;
      }
      
      .history-time {
        color: #888;
        font-size: 0.9em;
        min-width: 80px;
      }
      
      .history-state {
        margin-left: 10px;
        font-weight: bold;
      }
      
      .history-state.connected {
        color: #4CAF50;
      }
      
      .history-state.disconnected {
        color: #F44336;
      }
      
      .history-state.error {
        color: #FF9800;
      }
      
      .history-reason {
        margin-left: 10px;
        color: #aaa;
        font-style: italic;
        font-size: 0.9em;
      }
      
      /* Connection settings styles */
      .connection-settings {
        margin-top: 10px;
        background-color: #1a1a1a;
        border-radius: 5px;
        padding: 15px;
      }
      
      .setting-item {
        margin-bottom: 10px;
        display: flex;
        align-items: center;
      }
      
      .setting-item label {
        width: 120px;
        color: #aaa;
      }
      
      .setting-item input[type="text"] {
        flex: 1;
        padding: 8px;
        background-color: #2d2d2d;
        border: 1px solid #444;
        border-radius: 3px;
        color: #e0e0e0;
      }
      
      .admin-button {
        padding: 8px 15px;
        margin-top: 10px;
        border: none;
        border-radius: 3px;
        cursor: pointer;
        font-weight: bold;
      }
      
      .admin-button.success {
        background-color: #4CAF50;
        color: white;
      }
      
      .admin-button.warning {
        background-color: #FF9800;
        color: white;
      }
      
      .admin-button.danger {
        background-color: #F44336;
        color: white;
      }
      
      .admin-button:hover {
        opacity: 0.9;
      }
      
      /* Modal styles */
      .modal {
        display: none;
        position: fixed;
        z-index: 1000;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.7);
      }
      
      .modal-content {
        background-color: #2d2d2d;
        margin: 15% auto;
        padding: 20px;
        border-radius: 5px;
        width: 50%;
        max-width: 500px;
      }
      
      .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid #444;
        padding-bottom: 10px;
        margin-bottom: 15px;
      }
      
      .modal-header h3 {
        margin: 0;
        color: #e0e0e0;
      }
      
      .close-modal {
        color: #aaa;
        font-size: 28px;
        font-weight: bold;
        cursor: pointer;
      }
      
      .close-modal:hover {
        color: #e0e0e0;
      }
      
      .modal-footer {
        display: flex;
        justify-content: flex-end;
        margin-top: 20px;
        gap: 10px;
      }
      
      .modal-button {
        padding: 8px 15px;
        border: none;
        border-radius: 3px;
        cursor: pointer;
        background-color: #555;
        color: white;
      }
      
      .modal-button.danger {
        background-color: #F44336;
      }
      
      .modal-button:hover {
        opacity: 0.9;
      }
      
      /* Connection history styles */
      .admin-history {
        max-height: 200px;
        overflow-y: auto;
        background-color: #1a1a1a;
        border-radius: 3px;
        padding: 5px;
        margin-bottom: 15px;
      }
      
      .history-entry {
        padding: 8px;
        border-bottom: 1px solid #333;
        display: flex;
        align-items: center;
        font-size: 14px;
        margin-bottom: 5px;
      }
      
      .history-time {
        color: #888;
        margin-right: 10px;
        font-size: 0.9em;
      }
      
      .history-event {
        margin-left: 10px;
        font-weight: bold;
      }
      
      .state-connected {
        color: #4CAF50;
      }
      
      .state-disconnected {
        color: #f44336;
      }
      
      .state-error {
        color: #ff9800;
      }
      
      .history-reason {
        margin-left: 10px;
        color: #aaa;
        font-style: italic;
        font-size: 0.9em;
      }
      
      @media (max-width: 768px) {
        .main-content {
          flex-direction: column;
        }
        
        .stat-card {
          min-width: 100%;
        }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>MaxBot Control Panel</h1>
        <div class="status">
          <div id="status-indicator" class="status-indicator disconnected"></div>
          <span id="status-text">Disconnected</span>
        </div>
      </div>
      
      <div class="tabs">
        <div class="tab active" data-tab="dashboard">Dashboard</div>
        <div class="tab" data-tab="chat">Chat</div>
        <div class="tab" data-tab="logs">Logs</div>
        <div class="tab" data-tab="admin">Admin</div>
      </div>
      
      <div class="tab-content active" id="dashboard-tab">
        <div class="dashboard">
          <div class="stat-card">
            <h3>Bot Status</h3>
            <div class="stat-item">
              <span class="stat-label">Username:</span>
              <span class="stat-value" id="bot-username">-</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Channels:</span>
              <span class="stat-value" id="bot-channels">-</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Uptime:</span>
              <span class="stat-value" id="bot-uptime">-</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Commands:</span>
              <span class="stat-value" id="bot-commands">-</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Memory Usage:</span>
              <span class="stat-value" id="bot-memory">-</span>
            </div>
            <div class="memory-bar">
              <div class="memory-used" id="memory-bar" style="width: 0%"></div>
            </div>
          </div>
          
          <div class="stat-card">
            <h3>Control Panel</h3>
            <div class="stat-item">
              <span class="stat-label">Uptime:</span>
              <span class="stat-value" id="cp-uptime">-</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Messages Received:</span>
              <span class="stat-value" id="cp-messages-received">-</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Messages Sent:</span>
              <span class="stat-value" id="cp-messages-sent">-</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Reconnections:</span>
              <span class="stat-value" id="cp-reconnections">-</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Commands Executed:</span>
              <span class="stat-value" id="cp-commands-executed">-</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Errors:</span>
              <span class="stat-value" id="cp-errors">-</span>
            </div>
          </div>
          
          <div class="stat-card">
            <h3>System Info</h3>
            <div class="stat-item">
              <span class="stat-label">Platform:</span>
              <span class="stat-value" id="sys-platform">-</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">CPUs:</span>
              <span class="stat-value" id="sys-cpus">-</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Memory:</span>
              <span class="stat-value" id="sys-memory">-</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Uptime:</span>
              <span class="stat-value" id="sys-uptime">-</span>
            </div>
          </div>
          
          <div class="stat-card">
            <h3>Connection History</h3>
            <div class="connection-history" id="connection-history">
              <!-- Connection history items will be added here -->
            </div>
          </div>
        </div>
      </div>
      
      <div class="tab-content" id="chat-tab">
        <div class="main-content">
          <div class="panel">
            <div class="panel-header">Chat</div>
            <div id="chat-container" class="chat-container"></div>
            <div class="input-container">
              <input type="text" id="chat-input" placeholder="Type a message...">
              <button id="send-chat">Send</button>
            </div>
          </div>
        </div>
      </div>
      
      <div class="tab-content" id="logs-tab">
        <div class="main-content">
          <div class="panel">
            <div class="panel-header">Logs</div>
            <div id="logs-container" class="logs-container"></div>
            <div class="commands-container" id="commands-container"></div>
            <div class="input-container">
              <input type="text" id="command-input" placeholder="Type a command...">
              <button id="send-command">Execute</button>
              <button id="exit-button" class="danger">Exit</button>
            </div>
          </div>
        </div>
      </div>
      
      <div class="tab-content" id="admin-tab">
        <div class="admin-panel">
          <div class="panel">
            <div class="panel-header">Bot Administration</div>
            <div class="admin-content">
              <div class="admin-section">
                <h3>Bot Status</h3>
                <div class="status-display">
                  <div class="status-item">
                    <span class="status-label">Current Status:</span>
                    <span id="admin-bot-status" class="status-value">Unknown</span>
                  </div>
                  <div class="status-item">
                    <span class="status-label">Uptime:</span>
                    <span id="admin-bot-uptime" class="status-value">-</span>
                  </div>
                  <div class="status-item">
                    <span class="status-label">Process ID:</span>
                    <span id="admin-bot-pid" class="status-value">-</span>
                  </div>
                </div>
              </div>
              
              <div class="admin-section">
                <h3>Bot Control</h3>
                <div class="admin-controls">
                  <button id="restart-bot" class="admin-button warning">
                    <span class="button-icon">🔄</span> Restart Bot
                  </button>
                  <button id="shutdown-bot" class="admin-button danger">
                    <span class="button-icon">⏹️</span> Shutdown Bot
                  </button>
                  <button id="start-bot" class="admin-button success">
                    <span class="button-icon">▶️</span> Start Bot
                  </button>
                </div>
                <div class="admin-note">
                  <p><strong>Note:</strong> Restarting or shutting down the bot will disconnect it from Twitch chat temporarily.</p>
                </div>
              </div>
              
              <div class="admin-section">
                <h3>Connection History</h3>
                <div id="admin-connection-history" class="admin-history">
                  <!-- Connection history will be populated here -->
                </div>
              </div>

              <div class="admin-section">
                <h3>Remote Connection Settings</h3>
                <div class="connection-settings">
                  <div class="setting-item">
                    <label for="ws-host">WebSocket Host:</label>
                    <input type="text" id="ws-host" placeholder="localhost or IP address">
                  </div>
                  <div class="setting-item">
                    <label for="ws-port">WebSocket Port:</label>
                    <input type="text" id="ws-port" placeholder="8080">
                  </div>
                  <button id="connect-button" class="admin-button success">
                    <span class="button-icon">🔌</span> Connect
                  </button>
                </div>
                <div class="admin-note">
                  <p><strong>Note:</strong> If MaxBot is running on another computer, enter its IP address and WebSocket port (default: 8080).</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Confirmation Modal -->
    <div id="confirmation-modal" class="modal">
      <div class="modal-content">
        <div class="modal-header">
          <h3 id="modal-title">Confirm Action</h3>
          <span class="close-modal">&times;</span>
        </div>
        <div class="modal-body">
          <p id="modal-message">Are you sure you want to perform this action?</p>
        </div>
        <div class="modal-footer">
          <button id="modal-cancel" class="modal-button">Cancel</button>
          <button id="modal-confirm" class="modal-button danger">Confirm</button>
        </div>
      </div>
    </div>
    
    <script>
      // Elements
      const statusIndicator = document.getElementById('status-indicator');
      const statusText = document.getElementById('status-text');
      const logsContainer = document.getElementById('logs-container');
      const chatContainer = document.getElementById('chat-container');
      const commandsContainer = document.getElementById('commands-container');
      const chatInput = document.getElementById('chat-input');
      const commandInput = document.getElementById('command-input');
      const sendChatButton = document.getElementById('send-chat');
      const sendCommandButton = document.getElementById('send-command');
      const exitButton = document.getElementById('exit-button');
      
      // Tab switching
      const tabs = document.querySelectorAll('.tab');
      const tabContents = document.querySelectorAll('.tab-content');
      
      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          const tabId = tab.getAttribute('data-tab');
          
          // Remove active class from all tabs and contents
          tabs.forEach(t => t.classList.remove('active'));
          tabContents.forEach(c => c.classList.remove('active'));
          
          // Add active class to selected tab and content
          tab.classList.add('active');
          document.getElementById(tabId + '-tab').classList.add('active');
        });
      });
      
      // Update status
      function updateStatus() {
        fetch('/api/status')
          .then(response => response.json())
          .then(data => {
            statusText.textContent = data.status;
            statusIndicator.className = 'status-indicator';
            
            if (data.status === 'Connected') {
              statusIndicator.classList.add('connected');
            } else if (data.status === 'Error') {
              statusIndicator.classList.add('error');
            } else {
              statusIndicator.classList.add('disconnected');
            }
          })
          .catch(error => {
            console.error('Error fetching status:', error);
            statusText.textContent = 'Error';
            statusIndicator.className = 'status-indicator error';
          });
      }
      
      // Update logs
      function updateLogs() {
        fetch('/api/logs?count=100')
          .then(response => response.json())
          .then(logs => {
            logsContainer.innerHTML = '';
            logs.forEach(log => {
              const logEntry = document.createElement('div');
              logEntry.className = 'log-entry';
              logEntry.textContent = '[' + new Date(log.time).toLocaleTimeString() + '] ' + log.message;
              logsContainer.appendChild(logEntry);
            });
            logsContainer.scrollTop = logsContainer.scrollHeight;
          })
          .catch(error => {
            console.error('Error fetching logs:', error);
          });
      }
      
      // Update chat
      function updateChat() {
        fetch('/api/chat?count=100')
          .then(function(response) {
            return response.json();
          })
          .then(function(chatMessages) {
            // Clear the container
            chatContainer.innerHTML = '';
            
            // Loop through each message
            for (let i = 0; i < chatMessages.length; i++) {
              const entry = chatMessages[i];
              
              // Create chat entry
              const chatEntry = document.createElement('div');
              chatEntry.className = 'chat-entry';
              
              // Create chat line
              const chatLine = document.createElement('div');
              chatLine.style.fontSize = '18px';
              chatLine.style.lineHeight = '1.4';
              chatLine.style.display = 'flex';
              chatLine.style.flexWrap = 'wrap';
              chatLine.style.alignItems = 'center';
              
              // Create timestamp
              const timeSpan = document.createElement('span');
              timeSpan.style.color = '#888';
              timeSpan.style.marginRight = '8px';
              timeSpan.style.fontSize = '16px';
              timeSpan.textContent = '[' + new Date(entry.time).toLocaleTimeString() + ']';
              
              // Create badges
              let badgeText = '';
              
              // Check username for special badges
              if (entry.username.toLowerCase() === 'max2d2') {
                badgeText += '🤖 '; // Bot badge
              }
              
              if (entry.username.toLowerCase() === 'maxthriller') {
                badgeText += '📺 '; // Broadcaster badge
              }
              
              // Check badges object if it exists
              if (entry.badges) {
                if (entry.badges.moderator) badgeText += '🛡️ ';
                if (entry.badges.vip) badgeText += '⭐ ';
                if (entry.badges.subscriber) badgeText += '💎 ';
                if (entry.badges.premium) badgeText += '�� ';
              }
              
              // Create username with badges
              const usernameSpan = document.createElement('span');
              usernameSpan.style.fontWeight = 'bold';
              usernameSpan.style.color = '#4CAF50';
              usernameSpan.style.marginRight = '8px';
              usernameSpan.style.fontSize = '18px';
              usernameSpan.textContent = badgeText + entry.username;
              
              // Create message
              const messageSpan = document.createElement('span');
              messageSpan.style.fontSize = '18px';
              messageSpan.style.wordBreak = 'break-word';
              messageSpan.textContent = entry.message;
              
              // Append elements
              chatLine.appendChild(timeSpan);
              chatLine.appendChild(usernameSpan);
              chatLine.appendChild(messageSpan);
              chatEntry.appendChild(chatLine);
              chatContainer.appendChild(chatEntry);
            }
            
            // Scroll to bottom
            chatContainer.scrollTop = chatContainer.scrollHeight;
          })
          .catch(function(error) {
            console.error('Error fetching chat:', error);
          });
      }
      
      // Update commands
      function updateCommands() {
        fetch('/api/commands')
          .then(response => response.json())
          .then(commands => {
            commandsContainer.innerHTML = '';
            commands.forEach(cmd => {
              const commandButton = document.createElement('div');
              commandButton.className = 'command-button';
              if (!cmd.enabled) {
                commandButton.classList.add('disabled');
              }
              commandButton.textContent = cmd.trigger || cmd.name;
              commandButton.title = cmd.description || '';
              
              if (cmd.enabled) {
                commandButton.addEventListener('click', () => {
                  commandInput.value = cmd.trigger || cmd.name;
                });
              }
              
              commandsContainer.appendChild(commandButton);
            });
          })
          .catch(error => {
            console.error('Error fetching commands:', error);
          });
      }
      
      // Update statistics
      function updateStats() {
        fetch('/api/stats')
          .then(response => response.json())
          .then(stats => {
            // Bot stats
            document.getElementById('bot-username').textContent = stats.bot.username || '-';
            document.getElementById('bot-channels').textContent = stats.bot.channels ? stats.bot.channels.join(', ') : '-';
            document.getElementById('bot-uptime').textContent = stats.bot.uptimeFormatted || '-';
            document.getElementById('bot-commands').textContent = document.querySelectorAll('.command-button').length || '-';
            
            // Memory usage
            if (stats.bot.memoryUsage && stats.bot.memoryUsage.heapUsed && stats.bot.memoryUsage.heapTotal) {
              const heapUsed = Math.round(stats.bot.memoryUsage.heapUsed / 1024 / 1024 * 100) / 100;
              const heapTotal = Math.round(stats.bot.memoryUsage.heapTotal / 1024 / 1024 * 100) / 100;
              const percentage = Math.round((heapUsed / heapTotal) * 100);
              
              document.getElementById('bot-memory').textContent = heapUsed + ' MB / ' + heapTotal + ' MB (' + percentage + '%)';
              document.getElementById('memory-bar').style.width = percentage + '%';
            } else {
              document.getElementById('bot-memory').textContent = '-';
              document.getElementById('memory-bar').style.width = '0%';
            }
            
            // Control panel stats
            document.getElementById('cp-uptime').textContent = stats.controlPanel.uptimeFormatted || '-';
            document.getElementById('cp-messages-received').textContent = stats.controlPanel.messagesReceived || '0';
            document.getElementById('cp-messages-sent').textContent = stats.controlPanel.messagesSent || '0';
            document.getElementById('cp-reconnections').textContent = stats.controlPanel.reconnections || '0';
            document.getElementById('cp-commands-executed').textContent = stats.controlPanel.commandsExecuted || '0';
            document.getElementById('cp-errors').textContent = stats.controlPanel.errors || '0';
            
            // System stats
            document.getElementById('sys-platform').textContent = \`\${stats.system.platform} (\${stats.system.arch})\`;
            document.getElementById('sys-cpus').textContent = stats.system.cpus || '-';
            
            if (stats.system.totalMemory && stats.system.freeMemory) {
              const totalMemory = Math.round(stats.system.totalMemory / 1024 / 1024 / 1024 * 100) / 100;
              const freeMemory = Math.round(stats.system.freeMemory / 1024 / 1024 / 1024 * 100) / 100;
              const usedMemory = Math.round((totalMemory - freeMemory) * 100) / 100;
              const percentage = Math.round((usedMemory / totalMemory) * 100);
              
              document.getElementById('sys-memory').textContent = usedMemory + ' GB / ' + totalMemory + ' GB (' + percentage + '%)';
            } else {
              document.getElementById('sys-memory').textContent = '-';
            }
            
            if (stats.system.uptime) {
              const days = Math.floor(stats.system.uptime / 86400);
              const hours = Math.floor((stats.system.uptime % 86400) / 3600);
              const minutes = Math.floor((stats.system.uptime % 3600) / 60);
              
              document.getElementById('sys-uptime').textContent = days + 'd ' + hours + 'h ' + minutes + 'm';
            } else {
              document.getElementById('sys-uptime').textContent = '-';
            }
            
            // Connection history
            if (stats.controlPanel.connectionHistory && stats.controlPanel.connectionHistory.length > 0) {
              const historyContainer = document.getElementById('connection-history');
              historyContainer.innerHTML = '';
              
              stats.controlPanel.connectionHistory.forEach(item => {
                const historyItem = document.createElement('div');
                historyItem.className = 'history-item';
                
                const time = new Date(item.time).toLocaleTimeString();
                const stateClass = item.state.toLowerCase().includes('connected') ? 'connected' : 
                                  item.state.toLowerCase().includes('error') ? 'error' : 'disconnected';
                
                historyItem.innerHTML = 
                  '<span class="history-time">' + time + '</span>' +
                  '<span class="history-state ' + stateClass + '">' + item.state + '</span>' +
                  (item.reason ? '<span class="history-reason">(' + item.reason + ')</span>' : '');
                
                historyContainer.appendChild(historyItem);
              });
            }
          })
          .catch(error => {
            console.error('Error fetching stats:', error);
          });
      }
      
      // Send chat message
      function sendChatMessage() {
        const message = chatInput.value.trim();
        if (!message) return;
        
        fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ message })
        })
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              chatInput.value = '';
              updateChat();
            } else {
              console.error('Error sending chat message:', data.error);
            }
          })
          .catch(error => {
            console.error('Error sending chat message:', error);
          });
      }
      
      // Send command
      function sendCommand() {
        const command = commandInput.value.trim();
        if (!command) return;
        
        fetch('/api/command', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ command })
        })
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              commandInput.value = '';
              updateLogs();
            } else {
              console.error('Error sending command:', data.error);
            }
          })
          .catch(error => {
            console.error('Error sending command:', error);
          });
      }
      
      // Exit application
      function exitApplication() {
        if (confirm('Are you sure you want to exit?')) {
          fetch('/api/exit', {
            method: 'POST'
          })
            .then(response => response.json())
            .then(data => {
              if (data.success) {
                alert('Application is exiting. You can close this window.');
              }
            })
            .catch(error => {
              console.error('Error exiting application:', error);
            });
        }
      }
      
      // Event listeners
      sendChatButton.addEventListener('click', sendChatMessage);
      chatInput.addEventListener('keypress', event => {
        if (event.key === 'Enter') {
          sendChatMessage();
        }
      });
      
      sendCommandButton.addEventListener('click', sendCommand);
      commandInput.addEventListener('keypress', event => {
        if (event.key === 'Enter') {
          sendCommand();
        }
      });
      
      exitButton.addEventListener('click', exitApplication);
      
      // Initial updates
      updateStatus();
      updateLogs();
      updateChat();
      updateCommands();
      updateStats();
      
      // Set up polling
      setInterval(updateStatus, 5000);
      setInterval(updateLogs, 2000);
      setInterval(updateChat, 2000);
      setInterval(updateCommands, 10000);
      setInterval(updateStats, 5000);
      
      // Add a specific function to update the admin panel
      function updateAdminPanel() {
        console.log('Updating admin panel...');
        fetch('/api/stats')
          .then(response => response.json())
          .then(data => {
            console.log('Admin panel data:', data);
            
            // Get admin panel elements
            const adminBotStatus = document.getElementById('admin-bot-status');
            const adminBotUptime = document.getElementById('admin-bot-uptime');
            const adminBotPid = document.getElementById('admin-bot-pid');
            const adminConnectionHistory = document.getElementById('admin-connection-history');
            
            if (!adminBotStatus || !adminBotUptime || !adminBotPid) {
              console.error('Admin panel elements not found');
              return;
            }
            
            // Update bot status
            if (data.bot) {
              // Update status display - prioritize the connection status from the bot
              adminBotStatus.textContent = data.bot.status || data.connection.status || 'Unknown';
              console.log('Setting status to:', adminBotStatus.textContent);
              
              // Set status color based on connection state
              if (adminBotStatus.textContent.toLowerCase() === 'connected') {
                adminBotStatus.style.color = '#4CAF50'; // Green
              } else if (adminBotStatus.textContent.toLowerCase() === 'disconnected') {
                adminBotStatus.style.color = '#f44336'; // Red
              } else {
                adminBotStatus.style.color = '#ff9800'; // Orange for unknown or other states
              }
              
              // Update uptime
              if (data.bot.uptimeFormatted) {
                adminBotUptime.textContent = data.bot.uptimeFormatted;
              } else if (data.bot.uptime) {
                const hours = Math.floor(data.bot.uptime / 3600);
                const minutes = Math.floor((data.bot.uptime % 3600) / 60);
                const seconds = data.bot.uptime % 60;
                adminBotUptime.textContent = hours + 'h ' + minutes + 'm ' + seconds + 's';
              } else {
                adminBotUptime.textContent = '-';
              }
              
              // Update PID
              if (data.bot.pid) {
                adminBotPid.textContent = data.bot.pid;
              } else {
                adminBotPid.textContent = '-';
              }
            } else {
              adminBotStatus.textContent = 'Unknown';
              adminBotUptime.textContent = '-';
              adminBotPid.textContent = '-';
            }
            
            // Update connection history if available
            if (adminConnectionHistory && data.controlPanel && data.controlPanel.connectionHistory) {
              adminConnectionHistory.innerHTML = '';
              
              data.controlPanel.connectionHistory.forEach(entry => {
                const historyEntry = document.createElement('div');
                historyEntry.className = 'history-entry';
                
                // Format time
                const date = new Date(entry.time);
                const time = date.toLocaleTimeString();
                
                // Determine state class
                let stateClass = '';
                if (entry.state.toLowerCase().includes('connected')) {
                  stateClass = 'state-connected';
                } else if (entry.state.toLowerCase().includes('disconnected')) {
                  stateClass = 'state-disconnected';
                } else if (entry.state.toLowerCase().includes('error')) {
                  stateClass = 'state-error';
                }
                
                historyEntry.innerHTML = 
                  '<span class="history-time">' + time + '</span>' +
                  '<span class="history-event ' + stateClass + '">' + entry.state + '</span>' +
                  (entry.reason ? '<span class="history-reason">(' + entry.reason + ')</span>' : '');
                
                adminConnectionHistory.appendChild(historyEntry);
              });
            }
          })
          .catch(error => {
            console.error('Error updating admin panel:', error);
          });
      }
      
      // Call updateAdminPanel initially and set up polling
      updateAdminPanel();
      setInterval(updateAdminPanel, 2000);
      
      // Modal handling
      const modal = document.getElementById('confirmation-modal');
      const modalTitle = document.getElementById('modal-title');
      const modalMessage = document.getElementById('modal-message');
      const modalConfirm = document.getElementById('modal-confirm');
      const modalCancel = document.getElementById('modal-cancel');
      const closeModal = document.querySelector('.close-modal');
      
      // Hide modal by default
      if (modal) {
        modal.style.display = 'none';
      }
      
      // Close modal when clicking the X
      if (closeModal) {
        closeModal.onclick = function() {
          modal.style.display = 'none';
        };
      }
      
      // Close modal when clicking Cancel
      if (modalCancel) {
        modalCancel.onclick = function() {
          modal.style.display = 'none';
        };
      }
      
      // Close modal when clicking outside
      window.onclick = function(event) {
        if (event.target === modal) {
          modal.style.display = 'none';
        }
      };
      
      // Function to show modal with custom title, message, and action
      function showConfirmationModal(title, message, confirmAction) {
        if (!modal) return;
        
        modalTitle.textContent = title;
        modalMessage.textContent = message;
        
        // Set up confirm button action
        modalConfirm.onclick = function() {
          confirmAction();
          modal.style.display = 'none';
        };
        
        // Show the modal
        modal.style.display = 'block';
      }
      
      // Replace the existing button handlers with these direct WebSocket implementations
      window.addEventListener('load', function() {
        console.log('Page fully loaded, attaching button handlers');
        
        // Get button references
        const restartBtn = document.getElementById('restart-bot');
        const shutdownBtn = document.getElementById('shutdown-bot');
        const startBtn = document.getElementById('start-bot');
        const connectBtn = document.getElementById('connect-button');
        const wsHostInput = document.getElementById('ws-host');
        const wsPortInput = document.getElementById('ws-port');
        
        console.log('Button elements:', { 
          restart: restartBtn, 
          shutdown: shutdownBtn, 
          start: startBtn,
          connect: connectBtn
        });
        
        // Set initial values from localStorage if available
        if (wsHostInput && wsPortInput) {
          wsHostInput.value = localStorage.getItem('wsHost') || '';
          wsPortInput.value = localStorage.getItem('wsPort') || '';
        }
        
        // Add handler for connect button
        if (connectBtn && wsHostInput && wsPortInput) {
          connectBtn.onclick = function() {
            const host = wsHostInput.value.trim();
            const port = wsPortInput.value.trim();
            
            if (!host) {
              alert('Please enter a valid WebSocket host');
              return;
            }
            
            if (!port || isNaN(parseInt(port))) {
              alert('Please enter a valid WebSocket port');
              return;
            }
            
            // Save to localStorage for future use
            localStorage.setItem('wsHost', host);
            localStorage.setItem('wsPort', port);
            
            // Send connection request to server
            fetch('/api/connect', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ host, port })
            })
            .then(response => response.json())
            .then(data => {
              if (data.success) {
                alert('Connecting to MaxBot at ' + host + ':' + port + '...');
                // Refresh the admin panel after a short delay
                setTimeout(updateAdminPanel, 2000);
              } else {
                alert('Error: ' + (data.error || 'Unknown error'));
              }
            })
            .catch(error => {
              console.error('Connection error:', error);
              alert('Error connecting to MaxBot: ' + error.message);
            });
          };
        }
        
        if (restartBtn) {
          restartBtn.onclick = function() {
            console.log('Restart button clicked');
            showConfirmationModal(
              'Confirm Restart',
              'Are you sure you want to restart the bot? This will temporarily disconnect it from Twitch chat.',
              function() {
                fetch('/api/admin/restart', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  }
                })
                .then(function(response) {
                  return response.json();
                })
                .then(function(data) {
                  console.log('Restart response:', data);
                  if (data.success) {
                    alert('Restart command sent. The bot will restart shortly.');
                  } else {
                    alert('Error: ' + (data.error || 'Unknown error'));
                  }
                })
                .catch(function(error) {
                  console.error('Restart error:', error);
                  alert('Error restarting bot: ' + error.message);
                });
              }
            );
          };
        }
        
        if (shutdownBtn) {
          shutdownBtn.onclick = function() {
            console.log('Shutdown button clicked');
            showConfirmationModal(
              'Confirm Shutdown',
              'Are you sure you want to shut down the bot? You will need to manually restart it.',
              function() {
                fetch('/api/admin/shutdown', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  }
                })
                .then(function(response) {
                  return response.json();
                })
                .then(function(data) {
                  console.log('Shutdown response:', data);
                  if (data.success) {
                    alert('Shutdown command sent. The bot will shut down shortly.');
                  } else {
                    alert('Error: ' + (data.error || 'Unknown error'));
                  }
                })
                .catch(function(error) {
                  console.error('Shutdown error:', error);
                  alert('Error shutting down bot: ' + error.message);
                });
              }
            );
          };
        }
        
        if (startBtn) {
          startBtn.onclick = function() {
            console.log('Start button clicked');
            showConfirmationModal(
              'Confirm Start',
              'Are you sure you want to start the bot?',
              function() {
                // Use a simple GET endpoint that doesn't return JSON
                fetch('/api/admin/start-bot', {
                  method: 'GET'
                })
                .then(function(response) {
                  if (response.ok) {
                    alert('Bot start initiated. Check logs for details.');
                    
                    // Add to logs locally
                    const timestamp = new Date().toISOString();
                    if (window.appState && window.appState.logs) {
                      window.appState.logs.push({
                        time: timestamp,
                        message: 'Bot start initiated via external script'
                      });
                    }
                    
                    // Add to connection history locally
                    if (window.appState && window.appState.stats && window.appState.stats.connectionHistory) {
                      window.appState.stats.connectionHistory.push({
                        time: Date.now(),
                        state: 'Start Requested',
                        reason: 'User initiated start via external script'
                      });
                    }
                    
                    // Refresh the admin panel after a short delay
                    setTimeout(updateAdminPanel, 2000);
                  } else {
                    response.text().then(text => {
                      alert('Error starting bot: ' + text);
                    });
                  }
                })
                .catch(function(error) {
                  console.error('Start error:', error);
                  alert('Error starting bot: ' + error.message);
                });
              }
            );
          };
        }
      });
    </script>
  </body>
  </html>
  `;
  
  res.send(html);
});

// Start the server
const PORT = process.env.HTTP_PORT || 3000;
server.listen(PORT, () => {
  console.log(`MaxBot TUI HTTP Control started on http://localhost:${PORT}`);
  
  // Connect to WebSocket server
  connectToWebSocket();
});

// Cleanup function
function cleanup() {
  addLog('Cleaning up...');
  
  // Close WebSocket connection
  if (ws) {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        // Don't send a disconnect message, just close the connection
        ws.close();
      }
    } catch (e) {
      addLog(`Error closing WebSocket: ${e.message}`);
    }
  }
  
  // Clear intervals
  clearInterval(pingInterval);
  clearTimeout(safetyTimeout);
  
  // Remove PID file
  try {
    if (fs.existsSync(pidFile)) {
      fs.unlinkSync(pidFile);
      addLog('PID file removed');
    }
  } catch (e) {
    addLog(`Error removing PID file: ${e.message}`);
  }
}

// Handle exit events
process.on('exit', cleanup);
process.on('SIGINT', () => {
  addLog('SIGINT received, exiting...');
  cleanup();
  process.exit(0);
});
process.on('SIGTERM', () => {
  addLog('SIGTERM received, exiting...');
  cleanup();
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  addLog(`Uncaught exception: ${error.message}`);
  addLog(error.stack);
  cleanup();
  process.exit(1);
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  addLog(`Unhandled rejection at: ${promise}, reason: ${reason}`);
  cleanup();
  process.exit(1);
});

console.log('MaxBot TUI HTTP Control started'); 