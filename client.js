const WebSocket = require('ws');
const BotUI = require('./ui');
const EventEmitter = require('events');
const fedora = require('./fedora');
const config = require('./config');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_BASE = 2000;

class BotClient extends EventEmitter {
    constructor(ui) {
        super();
        console.log('BotClient constructor called with UI:', ui ? 'UI provided' : 'No UI');
        this.ui = ui;
        this.ws = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 2000; // 2 seconds
        this.maxReconnectDelay = 30000;
        this.reconnectTimer = null;
        this.connectionState = 'disconnected';
        this.restartInProgress = false;
        this.botStatus = {
            connected: false,
            channel: '',
            uptime: 0,
            commands: []
        };
        
        // We'll initialize Fedora later when UI is ready
        console.log('BotClient initialized, deferring Fedora integration');
        
        if (ui) {
            ui.setClient(this);
            console.log('Client created with UI');
        } else {
            console.log('Client initialized, deferring UI integration');
        }
        
        // Connect to the WebSocket server
        this.connectToServer();
    }

    // Helper method to safely log to console
    safeLog(message) {
        if (this.ui && typeof this.ui.logToConsole === 'function') {
            this.ui.logToConsole(message);
        } else {
            // Strip any blessed tags for console output
            const cleanMessage = message.replace(/\{[^}]+\}/g, '');
            console.log(cleanMessage);
        }
    }

    connectToServer() {
        // Get server URL from environment variables or use default
        const host = process.env.WEBSOCKET_HOST || '192.168.1.122';
        const port = process.env.WEBSOCKET_PORT || '8080';
        const serverUrl = `ws://${host}:${port}`;
        
        console.log(`Connecting to WebSocket server at: ${serverUrl}`);
        
        try {
            this.ws = new WebSocket(serverUrl);
            console.log('Connection initiated');
            
            this.ws.on('open', () => {
                console.log('Connected to WebSocket server');
                this.reconnectAttempts = 0;
                
                // Request initial status
                this.sendMessage({ type: 'getStatus' });
                
                // Request command list
                this.sendMessage({ type: 'getCommands' });
                
                // Update UI if available
                if (this.ui && this.ui.isInitialized()) {
                    this.ui.logToConsole('Connected to MaxBot server');
                }
            });
            
            this.ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    
                    if (message.type === 'status') {
                        if (this.ui && this.ui.isInitialized()) {
                            this.ui.updateStatus(message.data);
                        }
                    } else if (message.type === 'commands') {
                        if (this.ui && this.ui.isInitialized()) {
                            this.ui.updateCommands(message.data);
                        }
                    } else if (message.type === 'log') {
                        if (this.ui && this.ui.isInitialized()) {
                            this.ui.logToConsole(message.data);
                        }
                    }
                } catch (error) {
                    console.error('Error processing message:', error);
                    if (this.ui && this.ui.isInitialized()) {
                        this.ui.logToConsole(`Error processing message: ${error.message}`);
                    }
                }
            });
            
            this.ws.on('error', (error) => {
                console.error('WebSocket error:', error.message);
                if (this.ui && this.ui.isInitialized()) {
                    this.ui.logToConsole(`WebSocket error: ${error.message}`);
                }
            });
            
            this.ws.on('close', () => {
                console.log('Disconnected from WebSocket server');
                
                if (this.ui && this.ui.isInitialized()) {
                    this.ui.updateStatus({ connected: false });
                    this.ui.logToConsole('Disconnected from MaxBot server');
                }
                
                // Attempt to reconnect
                this.scheduleReconnect();
            });
        } catch (error) {
            console.error('Error creating WebSocket connection:', error);
            if (this.ui && this.ui.isInitialized()) {
                this.ui.logToConsole(`Error creating WebSocket connection: ${error.message}`);
            }
            
            // Attempt to reconnect
            this.scheduleReconnect();
        }
    }
    
    scheduleReconnect() {
        this.reconnectAttempts++;
        
        if (this.reconnectAttempts <= this.maxReconnectAttempts) {
            const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);
            console.log(`Attempting to reconnect in ${Math.round(delay/1000)} seconds (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            
            if (this.ui && this.ui.isInitialized()) {
                this.ui.logToConsole(`Attempting to reconnect in ${Math.round(delay/1000)} seconds (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            }
            
            setTimeout(() => {
                console.log('Attempting to reconnect...');
                this.connectToServer();
            }, delay);
        } else {
            console.log('Maximum reconnection attempts reached. Giving up.');
            
            if (this.ui && this.ui.isInitialized()) {
                this.ui.logToConsole('Maximum reconnection attempts reached. Please restart the application.');
            }
        }
    }
    
    sendMessage(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        } else {
            console.error('Cannot send message: WebSocket is not connected');
            if (this.ui && this.ui.isInitialized()) {
                this.ui.logToConsole('Cannot send message: Not connected to MaxBot server');
            }
        }
    }
    
    enableCommand(commandName) {
        this.sendMessage({
            type: 'enableCommand',
            data: { name: commandName }
        });
    }
    
    disableCommand(commandName) {
        this.sendMessage({
            type: 'disableCommand',
            data: { name: commandName }
        });
    }
    
    restartBot() {
        this.sendMessage({
            type: 'restart'
        });
    }
    
    exitBot() {
        this.sendMessage({
            type: 'exit'
        });
    }

    handleMessage(message) {
        try {
            switch (message.type) {
                case 'STATUS':
                    // Add commands to status data if available
                    if (this.commands) {
                        message.data.commands = this.commands;
                    }
                    this.lastStatus = message.data;
                    this.ui.updateStatus(message.data);
                    break;
                case 'COMMANDS':
                    // Store commands for status updates
                    this.commands = message.data;
                    this.ui.updateStatus({
                        ...this.lastStatus,
                        commands: message.data
                    });
                    this.ui.updateCommandControl(message.data);
                    break;
                case 'COMMAND_ENABLED':
                    this.ui.logToConsole(`Command enabled: ${message.command}`);
                    this.requestCommands();
                    break;
                case 'COMMAND_DISABLED':
                    this.ui.logToConsole(`Command disabled: ${message.command}`);
                    this.requestCommands();
                    break;
                case 'COMMAND_RESULT':
                    this.ui.logToConsole(`Command ${message.command} ${message.success ? 'succeeded' : 'failed'}`);
                    break;
                case 'CHAT_MESSAGE':
                    // Format and send to chat panel
                    const chatMsg = `info: [${message.data.channel}] <${message.data.username}>: ${message.data.message}`;
                    this.ui.processChatMessage(chatMsg);
                    break;
                case 'CONNECTION_STATE':
                    if (message.state === 'restarting') {
                        this.restartInProgress = true;
                        this.ui.logToConsole('{yellow-fg}Bot restarting{/yellow-fg}');
                    } else {
                        this.ui.updateConnectionState(message.state);
                    }
                    this.ui.logToConsole(`Bot ${message.state}`);
                    break;
                case 'ERROR':
                    this.ui.logToConsole(`Error: ${message.error}`);
                    break;
                default:
                    this.ui.logToConsole(`Unknown message type: ${message.type}`);
            }
        } catch (err) {
            console.error('Error handling message:', err);
            this.ui.logToConsole(`Error: ${err.message}`);
        }
    }

    send(message) {
        if (this.isConnected) {
            this.ws.send(JSON.stringify(message));
        } else {
            const error = 'Not connected to server';
            console.error(error);
            this.ui.logToConsole(error);
        }
    }

    requestStatus() {
        // The server doesn't support explicit status requests
        // Don't send any requests that will cause errors
        console.log('Not sending status request - server does not support it');
    }

    requestCommands() {
        this.send({ type: 'GET_COMMANDS' });
    }

    startBot() {
        // Check if we're already connected
        if (this.isConnected) {
            this.ui.logToConsole('{yellow-fg}Bot is already running{/yellow-fg}');
            return;
        }
        
        // Try to start the bot using child_process
        try {
            const { spawn } = require('child_process');
            const path = require('path');
            
            // Get the bot directory (assuming it's in a parallel directory)
            const botDir = path.resolve(__dirname, '../MaxBot');
            
            // Command to start the bot
            this.ui.logToConsole('{blue-fg}Attempting to start bot...{/blue-fg}');
            
            // Spawn the bot process
            const botProcess = spawn('npm', ['start'], {
                cwd: botDir,
                detached: true,
                stdio: 'ignore',
                shell: true
            });
            
            // Unref the child process so it can run independently
            botProcess.unref();
            
            this.ui.logToConsole('{blue-fg}Bot process started. Attempting to connect...{/blue-fg}');
            
            // Try to connect after a short delay
            setTimeout(() => {
                this.connectToServer();
            }, 3000);
            
        } catch (error) {
            this.ui.logToConsole(`{red-fg}Failed to start bot: ${error.message}{/red-fg}`);
            console.error('Error starting bot:', error);
        }
    }

    async isBotRunning() {
        try {
            // Try to make a quick connection to check if the bot is running
            const wsUrl = 'ws://192.168.1.122:8080';
            
            return new Promise((resolve) => {
                const ws = new WebSocket(wsUrl);
                
                // Set a short timeout
                const timeout = setTimeout(() => {
                    ws.terminate();
                    resolve(false);
                }, 1000);
                
                ws.on('open', () => {
                    clearTimeout(timeout);
                    ws.close();
                    resolve(true);
                });
                
                ws.on('error', () => {
                    clearTimeout(timeout);
                    resolve(false);
                });
            });
        } catch (error) {
            return false;
        }
    }

    sendDBusMessage(sender, content) {
        if (this.isConnected) {
            this.ws.send(JSON.stringify({
                type: 'send-dbus-message',
                data: { sender, content }
            }));
        }
    }

    sendDBusNotification(title, body, icon = '') {
        if (this.isConnected) {
            this.ws.send(JSON.stringify({
                type: 'send-dbus-notification',
                data: { title, body, icon }
            }));
        }
    }

    // Method to initialize Fedora integration when UI is ready
    initializeFedora() {
        const fedora = require('./fedora');
        if (this.ui && typeof this.ui.logToConsole === 'function' && !fedora.isEnabled) {
            console.log('UI is now ready, initializing Fedora integration');
            fedora.initialize(this, this.ui);
        }
    }

    handleStatusUpdate(status) {
        console.log('Received status update:', JSON.stringify(status));
        
        // Check if we're getting the channel name from the server
        if (status.channel === "Unknown" && status.channels && status.channels.length > 0) {
            status.channel = status.channels[0];
        }
        
        // If we have a connectionState field, use it to determine connected status
        if (status.connectionState) {
            status.connected = status.connectionState === "OPEN";
        }
        
        this.botStatus = status;
        
        // Update the UI if available
        if (this.ui && typeof this.ui.updateStatus === 'function') {
            console.log('Updating UI status display');
            this.ui.updateStatus(status);
        } else {
            console.log('Status update received but UI not ready:', JSON.stringify(status));
        }
        
        // Update commands if available
        if (status.commands && status.commands.length > 0 && this.ui && typeof this.ui.updateCommands === 'function') {
            console.log('Updating UI commands list with', status.commands.length, 'commands');
            this.ui.updateCommands(status.commands);
        } else if (!status.commands || status.commands.length === 0) {
            console.log('No commands in status update');
        }
    }

    // Add this helper method to extract status information from various message formats
    extractStatusInfo(message) {
        // Try to extract status information from whatever format we received
        const status = {
            connected: false,
            channel: 'Unknown',
            uptime: 0,
            commands: []
        };
        
        // Check for direct status properties
        if (message.connected !== undefined) {
            status.connected = message.connected;
        } else if (message.connectionStatus !== undefined) {
            status.connected = message.connectionStatus === 'connected';
        }
        
        // Check for channel information
        if (message.channel) {
            status.channel = message.channel;
        } else if (message.channels && Array.isArray(message.channels) && message.channels.length > 0) {
            status.channel = message.channels[0];
        }
        
        // Check for uptime
        if (message.uptime !== undefined) {
            status.uptime = message.uptime;
        }
        
        // Check for commands
        if (message.commands && Array.isArray(message.commands)) {
            status.commands = message.commands;
        } else if (message.available !== undefined && message.commands) {
            // This might be a different format for commands
            status.commands = message.commands;
        }
        
        return status;
    }

    forceStatusUpdate() {
        console.log('Forcing status update');
        
        // Create a status object with current information
        const status = {
            connected: this.isConnected,
            channel: this.botStatus.channel || 'Unknown',
            uptime: this.botStatus.uptime || 0
        };
        
        // Update the UI
        if (this.ui && typeof this.ui.updateStatus === 'function') {
            console.log('Forcing UI status update with:', JSON.stringify(status));
            this.ui.updateStatus(status);
        } else {
            console.log('Cannot force status update: UI not available');
        }
    }

    // Make sure to clean up resources when the client is destroyed
    destroy() {
        clearTimeout(this.connectionTimeout);
        clearTimeout(this.reconnectTimer);
        
        if (this.ws) {
            try {
                this.ws.close();
            } catch (e) {
                // Ignore close errors
            }
            this.ws = null;
        }
    }
}

module.exports = BotClient;