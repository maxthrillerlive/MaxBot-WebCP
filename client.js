const WebSocket = require('ws');
const BotUI = require('./ui');
const EventEmitter = require('events');
const fedora = require('./fedora');

class BotClient extends EventEmitter {
    constructor(ui) {
        super();
        console.log('BotClient constructor called with UI:', ui ? 'UI provided' : 'No UI provided');
        this.ui = ui;
        this.ws = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
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
        this.connect();
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

    connect() {
        // Hardcode the WebSocket URL to the correct IP address
        const wsUrl = 'ws://192.168.1.122:8080';
        console.log('Connecting to WebSocket server at:', wsUrl);
        
        // Don't try to connect if we're already connecting
        if (this.connectionState === 'connecting') return;
        
        this.connectionState = 'connecting';
        this.safeLog('{yellow-fg}Connecting to bot server...{/yellow-fg}');
        
        try {
            this.ws = new WebSocket(wsUrl);

            // Set a connection timeout
            const connectionTimeout = setTimeout(() => {
                if (this.connectionState === 'connecting') {
                    this.ws.terminate();
                    this.connectionState = 'disconnected';
                    this.safeLog('{red-fg}Connection attempt timed out{/red-fg}');
                    this.handleReconnect();
                }
            }, 5000);

            this.ws.on('open', () => {
                clearTimeout(connectionTimeout);
                this.isConnected = true;
                this.connectionState = 'connected';
                this.reconnectAttempts = 0;
                this.reconnectDelay = 1000;
                this.requestStatus();
                this.safeLog('{green-fg}Connected to bot server{/green-fg}');
                
                // If we were in the middle of a restart, clear that state
                if (this.restartInProgress) {
                    this.restartInProgress = false;
                    this.safeLog('{green-fg}Bot restart completed successfully{/green-fg}');
                }
                
                // Force a render to ensure UI is displayed
                if (this.ui && typeof this.ui.screen === 'object' && typeof this.ui.screen.render === 'function') {
                    setTimeout(() => this.ui.screen.render(), 100);
                }
                
                // Set up periodic status requests
                this.statusInterval = setInterval(() => {
                    this.requestStatus();
                }, 5000); // Request status every 5 seconds

                // Set a default status if we don't receive one
                setTimeout(() => {
                    if (!this.botStatus.connected) {
                        console.log('No status received, setting default status');
                        const defaultStatus = {
                            connected: true,
                            channel: 'Unknown',
                            uptime: 0,
                            commands: []
                        };
                        this.handleStatusUpdate(defaultStatus);
                    }
                }, 3000);
            });

            this.ws.on('message', (data) => {
                try {
                    const rawMessage = data.toString();
                    console.log('Received raw message from server:', rawMessage.substring(0, 100) + (rawMessage.length > 100 ? '...' : ''));
                    
                    // Try to parse the message
                    let message;
                    try {
                        message = JSON.parse(rawMessage);
                    } catch (parseError) {
                        console.error('Error parsing message:', parseError);
                        this.safeLog(`{red-fg}Error parsing message from server: ${parseError.message}{/red-fg}`);
                        return;
                    }
                    
                    // Check if this is an error message
                    if (message.type === 'ERROR') {
                        console.log('Received error message:', message.error);
                        this.safeLog(`{red-fg}Server error: ${message.error}{/red-fg}`);
                        return;
                    }
                    
                    // Handle different message types
                    if (message.type === 'status' || message.type === 'STATUS') {
                        // The server might be sending status updates directly
                        this.handleStatusUpdate(message.data || message);
                    } else if (message.connectionStatus !== undefined) {
                        // The server might be sending status in a different format
                        // This looks like it might be the actual format based on the console output
                        const status = {
                            connected: message.connectionStatus === 'connected',
                            channel: message.channel || 'Unknown',
                            uptime: message.uptime || 0,
                            commands: message.commands || []
                        };
                        this.handleStatusUpdate(status);
                    } else if (message.type === 'console') {
                        this.safeLog(message.data.message);
                    } else if (message.type === 'command-update') {
                        this.handleCommandUpdate(message.data);
                    } else if (message.type === 'dbus-message') {
                        const { sender, message: content, timestamp } = message.data;
                        this.safeLog(`{magenta-fg}[D-Bus] ${sender}:{/magenta-fg} ${content}`);
                        this.emit('dbus-message', message.data);
                    } else if (message.type === 'dbus-notification') {
                        const { title, body, timestamp } = message.data;
                        this.safeLog(`{magenta-fg}[Notification] ${title}:{/magenta-fg} ${body}`);
                        this.emit('dbus-notification', message.data);
                    } else if (message.type === 'log') {
                        const { level, message: logMessage, timestamp } = message.data;
                        
                        // Format based on log level
                        let formattedMessage;
                        switch (level) {
                            case 'error':
                                formattedMessage = `{red-fg}[ERROR] ${logMessage}{/red-fg}`;
                                break;
                            case 'warn':
                                formattedMessage = `{yellow-fg}[WARN] ${logMessage}{/yellow-fg}`;
                                break;
                            case 'debug':
                                formattedMessage = `{gray-fg}[DEBUG] ${logMessage}{/gray-fg}`;
                                break;
                            case 'info':
                            default:
                                formattedMessage = `{white-fg}[INFO] ${logMessage}{/white-fg}`;
                                break;
                        }
                        
                        this.safeLog(formattedMessage);
                        this.emit('log', message.data);
                    } else {
                        // If we don't recognize the message type, try to extract useful information
                        console.log('Unrecognized message format:', message);
                        
                        // Check if there's any status-like information we can use
                        if (message.available !== undefined) {
                            // This might be a command list
                            this.safeLog(`{cyan-fg}Received command list with ${message.available} commands{/cyan-fg}`);
                            if (message.commands && Array.isArray(message.commands)) {
                                this.ui.updateCommands(message.commands);
                            }
                        }
                        
                        // Check if there's any channel information
                        if (message.channels !== undefined) {
                            this.safeLog(`{cyan-fg}Bot is in channels: ${JSON.stringify(message.channels)}{/cyan-fg}`);
                        }
                        
                        // Check if there's a processId (might indicate the bot is running)
                        if (message.processId !== undefined) {
                            this.safeLog(`{cyan-fg}Bot process ID: ${message.processId}{/cyan-fg}`);
                        }
                    }
                    
                    // Render the screen if UI is available
                    if (this.ui && typeof this.ui.screen === 'object' && typeof this.ui.screen.render === 'function') {
                        this.ui.screen.render();
                    }
                } catch (error) {
                    console.error('Error processing message:', error);
                }
            });

            this.ws.on('close', () => {
                clearTimeout(connectionTimeout);
                this.isConnected = false;
                this.connectionState = 'disconnected';
                this.safeLog('{red-fg}Disconnected from bot server{/red-fg}');
                
                // Update status to show disconnected
                this.botStatus.connected = false;
                this.updateStatusDisplay();
                
                // Don't attempt to reconnect if we're shutting down
                if (!this.isShuttingDown) {
                    this.handleReconnect();
                }
                
                // Render the screen if UI is available
                if (this.ui && typeof this.ui.screen === 'object' && typeof this.ui.screen.render === 'function') {
                    this.ui.screen.render();
                }
                
                // Clear the status interval
                if (this.statusInterval) {
                    clearInterval(this.statusInterval);
                    this.statusInterval = null;
                }
            });

            this.ws.on('error', (error) => {
                console.error('WebSocket error:', error);
                this.safeLog(`{red-fg}WebSocket error: ${error.message}{/red-fg}`);
                
                // Render the screen if UI is available
                if (this.ui && typeof this.ui.screen === 'object' && typeof this.ui.screen.render === 'function') {
                    this.ui.screen.render();
                }
            });
        } catch (error) {
            console.error('Error connecting to WebSocket:', error);
            this.connectionState = 'disconnected';
            this.handleReconnect();
        }
    }

    handleReconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        
        this.reconnectAttempts++;
        const delay = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1), this.maxReconnectDelay);
        
        this.safeLog(`{yellow-fg}Attempting to reconnect in ${Math.round(delay / 1000)} seconds (attempt ${this.reconnectAttempts})...{/yellow-fg}`);
        
        this.reconnectTimer = setTimeout(() => {
            this.safeLog('{yellow-fg}Attempting to reconnect...{/yellow-fg}');
            this.connect();
        }, delay);
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
        if (this.isConnected) {
            console.log('Requesting status update from server');
            try {
                // Try different message formats that the server might expect
                
                // Option 1: Simple 'status' request
                this.ws.send(JSON.stringify({
                    type: 'status'
                }));
                
                // If that doesn't work, we can try other formats in the future
            } catch (error) {
                console.error('Error requesting status:', error);
            }
        } else {
            console.log('Cannot request status: not connected');
        }
    }

    requestCommands() {
        this.send({ type: 'GET_COMMANDS' });
    }

    enableCommand(command) {
        this.send({ type: 'ENABLE_COMMAND', command });
    }

    disableCommand(command) {
        this.send({ type: 'DISABLE_COMMAND', command });
    }

    executeCommand(command, channel) {
        this.send({ 
            type: 'EXECUTE_COMMAND',
            command,
            channel
        });
    }

    restartBot() {
        if (this.isConnected) {
            this.restartInProgress = true;
            this.ui.logToConsole('{yellow-fg}Restarting bot...{/yellow-fg}');
            this.send({ type: 'RESTART_BOT' });
            this.ui.logToConsole('Restart command sent to bot');
            
            // Set a timeout to clear the restart flag if it takes too long
            setTimeout(() => {
                if (this.restartInProgress) {
                    this.restartInProgress = false;
                    this.ui.logToConsole('{red-fg}Restart timed out. Please check the bot server.{/red-fg}');
                }
            }, 30000); // 30 second timeout
        } else {
            this.ui.logToConsole('{red-fg}Not connected to server{/red-fg}');
        }
    }

    exitBot() {
        if (this.isConnected) {
            this.ui.logToConsole('{yellow-fg}Shutting down bot...{/yellow-fg}');
            this.send({ type: 'EXIT_BOT' });
            this.ui.logToConsole('Shutdown command sent to bot');
            
            // Close the connection after a short delay
            setTimeout(() => {
                if (this.ws) {
                    this.ws.close();
                }
                // Exit the TUI after sending the shutdown command
                setTimeout(() => process.exit(0), 500);
            }, 1000);
        } else {
            this.ui.logToConsole('{red-fg}Not connected to server{/red-fg}');
            // Exit anyway since we're not connected
            setTimeout(() => process.exit(0), 500);
        }
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
                this.connect();
            }, 3000);
            
        } catch (error) {
            this.ui.logToConsole(`{red-fg}Failed to start bot: ${error.message}{/red-fg}`);
            console.error('Error starting bot:', error);
        }
    }

    async isBotRunning() {
        try {
            // Try to make a quick connection to check if the bot is running
            const wsUrl = process.env.BOT_SERVER_URL || 'ws://localhost:8080';
            
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
        
        // Try to extract status information from whatever format we received
        const updatedStatus = {
            connected: status.connected || status.connectionStatus === 'connected' || false,
            channel: status.channel || (status.channels && status.channels.length > 0 ? status.channels[0] : 'Unknown'),
            uptime: status.uptime || 0,
            commands: status.commands || []
        };
        
        this.botStatus = updatedStatus;
        
        // Update the UI if available
        if (this.ui && typeof this.ui.updateStatus === 'function') {
            console.log('Updating UI status display');
            this.ui.updateStatus(updatedStatus);
        } else {
            console.log('Status update received but UI not ready:', JSON.stringify(updatedStatus));
        }
        
        // Update commands if available
        if (updatedStatus.commands && updatedStatus.commands.length > 0 && this.ui && typeof this.ui.updateCommands === 'function') {
            console.log('Updating UI commands list with', updatedStatus.commands.length, 'commands');
            this.ui.updateCommands(updatedStatus.commands);
        } else if (!updatedStatus.commands || updatedStatus.commands.length === 0) {
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
}

module.exports = BotClient;