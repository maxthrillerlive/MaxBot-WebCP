#!/usr/bin/env node

const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

// Generate a unique client ID
const clientId = `MaxBot-TUI-${uuidv4().substring(0, 8)}`;

// WebSocket connection and state
let ws = null;
let pingInterval = null;
let reconnectTimer = null;

/**
 * WebSocket client module for MaxBot
 * @module websocket-client
 */
class WebSocketClient {
  constructor(appState, addLog, trackConnectionState) {
    this.appState = appState;
    this.addLog = addLog;
    this.trackConnectionState = trackConnectionState;
    this.ws = null;
    this.pingInterval = null;
    this.reconnectTimer = null;
    this.messageHandlers = new Map();
    this.lastError = null;
  }

  /**
   * Register a message handler for a specific message type
   * @param {string} messageType - The type of message to handle
   * @param {function} handler - The handler function
   */
  registerMessageHandler(messageType, handler) {
    this.messageHandlers.set(messageType.toUpperCase(), handler);
  }

  /**
   * Connect to the WebSocket server
   */
  connect() {
    // Get host and port from environment variables or use defaults
    const host = process.env.WEBSOCKET_HOST || 'localhost';
    const port = process.env.WEBSOCKET_PORT || 8080;
    const serverUrl = `ws://${host}:${port}`;
    
    // Check if we're already connected to the same server
    if (this.ws && 
        this.ws.url === serverUrl && 
        (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      this.addLog(`Already connected or connecting to ${serverUrl}, skipping connection attempt`);
      return;
    }
    
    this.addLog(`Connecting to WebSocket server at: ${serverUrl}`);
    this.appState.reconnectAttempts++;
    
    // Close existing connection if it exists
    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.close();
        }
      } catch (e) {
        this.addLog(`Error closing existing connection: ${e.message}`);
      }
    }
    
    // Create new WebSocket connection
    this.ws = new WebSocket(serverUrl, {
      handshakeTimeout: 5000 // 5 seconds
    });
    
    // Set up connection timeout
    const connectionTimeout = setTimeout(() => {
      if (this.ws && (this.ws.readyState === WebSocket.CONNECTING)) {
        this.addLog('Connection timeout reached, closing socket');
        this.trackConnectionState('Failed', 'Connection timeout');
        try {
          this.ws.terminate();
        } catch (e) {
          // Ignore errors
        }
      }
    }, 10000);
    
    // Handle WebSocket-level ping (automatically responds with pong)
    this.ws.on('ping', () => {
      this.addLog('Received WebSocket ping');
      // The ws library automatically responds with a pong
    });
    
    // Handle WebSocket-level pong
    this.ws.on('pong', () => {
      this.addLog('Received WebSocket pong');
      this.appState.lastPongTime = Date.now();
    });
    
    this.ws.on('open', () => {
      clearTimeout(connectionTimeout);
      this.addLog('Connected to WebSocket server');
      this.appState.wsStatus = 'Connected';
      this.appState.reconnectAttempts = 0;
      this.trackConnectionState('Connected');
      
      // Send GET_STATUS instead of register
      try {
        const statusRequest = {
          type: 'GET_STATUS',  // This is recognized by index.js
          client_id: clientId,
          timestamp: Date.now()
        };
        
        this.ws.send(JSON.stringify(statusRequest));
        this.appState.stats.messagesSent++;
        this.addLog('Sent status request');
      } catch (e) {
        this.addLog(`Error sending status request: ${e.message}`);
        this.appState.stats.errors++;
      }
      
      // Set up ping interval to keep connection alive
      clearInterval(this.pingInterval);
      this.pingInterval = setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          try {
            // Send application-level ping message
            const pingMsg = {
              type: 'ping',
              client_id: clientId,
              timestamp: Date.now()
            };
            
            this.ws.send(JSON.stringify(pingMsg));
            this.appState.stats.messagesSent++;
            this.appState.lastPingTime = Date.now();
            this.addLog('Sent ping message');
            
            // Also send a status request periodically
            setTimeout(() => {
              if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                try {
                  const statusRequest = {
                    type: 'GET_STATUS',
                    client_id: clientId,
                    timestamp: Date.now()
                  };
                  
                  this.ws.send(JSON.stringify(statusRequest));
                  this.appState.stats.messagesSent++;
                  this.addLog('Sent periodic status request');
                } catch (e) {
                  this.addLog(`Error sending status request: ${e.message}`);
                  this.appState.stats.errors++;
                }
              }
            }, 5000);
          } catch (e) {
            this.addLog(`Error sending ping: ${e.message}`);
            this.appState.stats.errors++;
          }
        }
      }, 60000); // Send ping every 60 seconds
    });
    
    this.ws.on('message', (data) => {
      try {
        // Log the raw data for debugging
        const dataStr = data.toString();
        this.addLog(`Received raw data: ${dataStr}`);
        this.appState.stats.messagesReceived++;
        
        // Check if the data is valid JSON
        if (!dataStr.trim().startsWith('{') && !dataStr.trim().startsWith('[')) {
          this.addLog(`Received non-JSON data: ${dataStr}`);
          return;
        }
        
        const message = JSON.parse(dataStr);
        
        // Check if the message has a type
        if (!message.type) {
          this.addLog(`Received message without type: ${JSON.stringify(message)}`);
          
          // Try to determine if this is a status message
          if (message.connectionState && message.username) {
            this.addLog('This appears to be a status message, handling as STATUS type');
            // Store the status information if needed
            this.appState.wsMessages++;
            this.appState.lastStatusTime = Date.now();
            
            // Update bot statistics
            this.appState.stats.lastStatusUpdate = Date.now();
            this.appState.stats.botUsername = message.username;
            this.appState.stats.botChannels = message.channels || [];
            this.appState.stats.botMemoryUsage = message.memory || {};
            this.appState.stats.botUptime = message.uptime || 0;
            
            // Store the process ID
            this.appState.stats.botPid = message.processId;
            
            // Update connection state - this is the Twitch connection state
            this.appState.twitchStatus = message.connectionState || 'Unknown';
            // WebSocket is connected if we're receiving messages
            this.appState.wsStatus = 'Connected';
            
            // Store the entire status object for reference
            this.appState.stats.botStatus = message;
            
            // Store commands if available
            if (message.commands) {
              this.appState.commands = message.commands;
              this.addLog(`Updated commands list (${this.appState.commands.length} commands)`);
            }
            
            // Log the status for debugging
            console.log('Bot status updated:', {
              username: this.appState.stats.botUsername,
              pid: this.appState.stats.botPid,
              wsStatus: this.appState.wsStatus,
              twitchStatus: this.appState.twitchStatus,
              uptime: this.appState.stats.botUptime
            });
            
            return;
          }
          
          return;
        }
        
        this.appState.wsMessages++;
        
        // Check if we have a registered handler for this message type
        const messageType = message.type.toUpperCase();
        if (this.messageHandlers.has(messageType)) {
          this.messageHandlers.get(messageType)(message);
          return;
        }
        
        // Handle different message types
        switch (messageType) {
          case 'PONG':
            this.appState.lastPongTime = Date.now();
            this.addLog('Received pong response');
            break;
            
          case 'STATUS':
            this.addLog(`Received status update`);
            this.appState.lastStatusTime = Date.now();
            
            // Update bot statistics
            if (message.data) {
              this.appState.stats.lastStatusUpdate = Date.now();
              this.appState.stats.botUsername = message.data.username || '';
              this.appState.stats.botChannels = message.data.channels || [];
              this.appState.stats.botMemoryUsage = message.data.memory || {};
              this.appState.stats.botUptime = message.data.uptime || 0;
              
              // Store the process ID
              this.appState.stats.botPid = message.data.processId;
              
              // Update connection state - this is the Twitch connection state
              this.appState.twitchStatus = message.data.connectionState || 'Unknown';
              // WebSocket is connected if we're receiving messages
              this.appState.wsStatus = 'Connected';
              
              // Store connection details if available
              if (message.data.connectionDetails) {
                this.appState.stats.connectionDetails = message.data.connectionDetails;
                this.addLog(`Connection details: ReadyState=${message.data.connectionDetails.readyStateText}, Channels=${message.data.connectionDetails.channels.join(',')}`);
              }
              
              // Store the entire status object for reference
              this.appState.stats.botStatus = message.data;
              
              // Log the status for debugging
              console.log('Bot status updated:', {
                username: this.appState.stats.botUsername,
                pid: this.appState.stats.botPid,
                wsStatus: this.appState.wsStatus,
                twitchStatus: this.appState.twitchStatus,
                readyState: this.appState.stats.connectionDetails?.readyStateText || 'Unknown',
                uptime: this.appState.stats.botUptime
              });
              
              // Store commands if available
              if (message.data.commands) {
                this.appState.commands = message.data.commands;
                this.addLog(`Updated commands list (${this.appState.commands.length} commands)`);
              }
            }
            break;
            
          case 'COMMANDS':
            this.addLog(`Received commands list`);
            if (message.data) {
              this.appState.commands = message.data;
              this.addLog(`Updated commands list (${this.appState.commands.length} commands)`);
            }
            break;
            
          case 'CHAT_MESSAGE':
            const chatData = message.data || {};
            this.addLog(`Received chat message from ${chatData.username || 'unknown'}`);
            
            // Add to chat messages if a handler is provided
            if (this.addChatMessage) {
              this.addChatMessage(
                chatData.username || 'unknown',
                chatData.message || '',
                chatData.channel || '#unknown',
                chatData.badges || {}
              );
            }
            break;
            
          case 'CHAT':
            // Handle CHAT messages from the server
            this.addLog(`Received CHAT message: ${message.message || ''}`);
            
            // Add to chat messages if a handler is provided
            if (this.addChatMessage) {
              // For outgoing messages from the control panel, the username is the bot's username
              const username = this.appState.stats.botUsername || 'Max2d2';
              this.addChatMessage(
                username,
                message.message || '',
                message.channel || '#unknown',
                {} // No badges for bot messages
              );
            }
            break;
            
          case 'CHAT_FROM_TWITCH':
            // Handle chat messages from Twitch users
            this.addLog(`Received Twitch chat message from ${message.username || 'unknown'}: ${message.message || ''}`);
            
            // Add to chat messages if a handler is provided
            if (this.addChatMessage) {
              this.addChatMessage(
                message.username || 'unknown',
                message.message || '',
                message.channel || '#unknown',
                message.badges || {}
              );
            }
            break;
            
          case 'CONNECTION_STATE':
            const state = message.state || 'unknown';
            this.addLog(`Received connection state: ${state}`);
            
            // Update the connection state
            // This is the Twitch connection state, not the WebSocket connection state
            // The WebSocket connection can be connected while the Twitch connection is disconnected
            this.appState.twitchStatus = state;
            this.appState.wsStatus = 'Connected'; // WebSocket is connected if we're receiving messages
            
            // Store connection details if available
            if (message.details) {
              this.appState.stats.connectionDetails = message.details;
              this.addLog(`Connection details: ReadyState=${message.details.readyStateText}, Channels=${message.details.channels.join(',')}`);
            }
            
            console.log('Twitch connection state updated:', state, 
              message.details ? `(ReadyState: ${message.details.readyStateText})` : '');
            
            // Distinguish between WebSocket connection and Twitch connection
            // The 'Disconnected' state from the server means the bot is disconnected from Twitch,
            // not that the WebSocket connection is disconnected
            if (state === 'Disconnected') {
              // This is a Twitch connection state, not a WebSocket connection state
              // Add with a prefix to distinguish it
              this.trackConnectionState(`Twitch: ${state}`, 
                message.reason || 
                (message.details ? `ReadyState: ${message.details.readyStateText}` : 'Disconnected from Twitch'));
            } else {
              // For other states, add them normally
              this.trackConnectionState(`Twitch: ${state}`, 
                message.reason || 
                (message.details ? `ReadyState: ${message.details.readyStateText}` : ''));
            }
            break;
            
          case 'ERROR':
            const errorMsg = message.error || 'Unknown error';
            this.addLog(`Received error from server: ${errorMsg}`);
            this.appState.stats.errors++;
            this.appState.serverErrors.push({
              time: new Date().toISOString(),
              error: errorMsg
            });
            break;
            
          default:
            this.addLog(`Received message of type: ${messageType}`);
            
            // Check if this is a chat-related message that wasn't caught by the specific handlers
            if (message.username && message.message) {
              this.addLog(`This appears to be a chat message from ${message.username}`);
              
              // Add to chat messages if a handler is provided
              if (this.addChatMessage) {
                this.addChatMessage(
                  message.username,
                  message.message,
                  message.channel || '#unknown',
                  message.badges || {}
                );
              }
            }
            break;
        }
      } catch (error) {
        this.addLog(`Error processing message: ${error.message}`);
        this.appState.stats.errors++;
      }
    });
    
    this.ws.on('close', (code, reason) => {
      const reasonStr = reason ? reason.toString() : 'No reason provided';
      this.handleClose({
        code: code,
        reason: reasonStr
      });
    });
    
    this.ws.on('error', (error) => {
      this.addLog(`WebSocket error: ${error.message}`);
      this.appState.stats.errors++;
      
      // Add to connection history
      this.trackConnectionState('Error', error.message);
      
      // Don't attempt to reconnect here, the close event will handle that
      // But we can set a flag to indicate that we had an error
      this.lastError = {
        time: Date.now(),
        message: error.message
      };
    });
  }

  /**
   * Send a message to the WebSocket server
   * @param {Object} message - The message to send
   * @returns {boolean} - Whether the message was sent successfully
   */
  sendMessage(message) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.addLog('Cannot send message, WebSocket is not connected');
      return false;
    }
    
    try {
      this.ws.send(JSON.stringify(message));
      this.appState.stats.messagesSent++;
      return true;
    } catch (error) {
      this.addLog(`Error sending message: ${error.message}`);
      this.appState.stats.errors++;
      return false;
    }
  }

  /**
   * Close the WebSocket connection
   * @param {number} code - The close code
   * @param {string} reason - The reason for closing
   */
  close(code = 1000, reason = 'User initiated close') {
    if (this.ws) {
      try {
        this.ws.close(code, reason);
      } catch (error) {
        this.addLog(`Error closing WebSocket: ${error.message}`);
      }
    }
    
    clearInterval(this.pingInterval);
    clearTimeout(this.reconnectTimer);
  }

  /**
   * Set the chat message handler
   * @param {function} handler - The chat message handler function
   */
  setAddChatMessageHandler(handler) {
    this.addChatMessage = handler;
  }

  /**
   * Check if the WebSocket is connected
   * @returns {boolean} - Whether the WebSocket is connected
   */
  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Get the WebSocket ready state
   * @returns {number} - The WebSocket ready state
   */
  getReadyState() {
    return this.ws ? this.ws.readyState : WebSocket.CLOSED;
  }

  /**
   * Handle WebSocket close event
   * @param {Event} event - The close event
   */
  handleClose(event) {
    this.addLog(`WebSocket connection closed: ${event.code} - ${event.reason}`);
    this.trackConnectionState('Disconnected', `Connection closed: ${event.code} - ${event.reason}`);
    
    // Update app state
    this.appState.wsStatus = 'Disconnected';
    this.appState.twitchStatus = 'Unknown'; // Reset Twitch status when WebSocket is disconnected
    
    // Clear any existing ping interval
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    // Schedule reconnect if not shutting down
    if (this.appState.running) {
      this.scheduleReconnect();
    }
  }

  /**
   * Schedule a reconnection attempt with exponential backoff
   */
  scheduleReconnect() {
    // Implement exponential backoff for reconnection
    const delay = Math.min(1000 * Math.pow(1.5, this.appState.reconnectAttempts - 1), 30000);
    this.addLog(`Will attempt to reconnect in ${delay/1000} seconds`);
    
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      if (this.appState.running) {
        this.addLog('Attempting to reconnect...');
        
        // Check if we're already connected before trying to reconnect
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
          this.addLog('Already connected or connecting, skipping reconnection attempt');
          return;
        }
        
        this.connect();
      }
    }, delay);
  }
}

module.exports = WebSocketClient; 