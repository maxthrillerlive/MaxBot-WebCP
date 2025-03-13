const WebSocket = require('ws');
const BotUI = require('./ui');

class BotClient {
    constructor() {
        this.ws = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.connectionState = 'disconnected';
        this.restartInProgress = false;
        this.ui = new BotUI(this);
        this.connect();
    }

    connect() {
        const wsUrl = process.env.BOT_SERVER_URL || 'ws://localhost:8080';
        
        // Don't try to connect if we're already connecting
        if (this.connectionState === 'connecting') return;
        
        this.connectionState = 'connecting';
        this.ui.logToConsole('{yellow-fg}Connecting to bot server...{/yellow-fg}');
        
        this.ws = new WebSocket(wsUrl);

        // Set a connection timeout
        const connectionTimeout = setTimeout(() => {
            if (this.connectionState === 'connecting') {
                this.ws.terminate();
                this.connectionState = 'disconnected';
                this.ui.logToConsole('{red-fg}Connection attempt timed out{/red-fg}');
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
            this.ui.logToConsole('{green-fg}Connected to bot server{/green-fg}');
            
            // If we were in the middle of a restart, clear that state
            if (this.restartInProgress) {
                this.restartInProgress = false;
                this.ui.logToConsole('{green-fg}Bot restart completed successfully{/green-fg}');
            }
        });

        this.ws.on('message', (data) => {
            try {
                const message = JSON.parse(data);
                
                // Handle D-Bus messages
                if (message.type === 'dbus-message') {
                    const { sender, message: content, timestamp } = message.data;
                    this.ui.logToConsole(`{magenta-fg}[D-Bus] ${sender}:{/magenta-fg} ${content}`);
                    this.ui.screen.render();
                }
                
                // Handle D-Bus notifications
                if (message.type === 'dbus-notification') {
                    const { title, body, timestamp } = message.data;
                    this.ui.logToConsole(`{magenta-fg}[Notification] ${title}:{/magenta-fg} ${body}`);
                    this.ui.screen.render();
                }
                
                this.handleMessage(message);
            } catch (error) {
                console.error('Error processing message:', error);
            }
        });

        this.ws.on('close', () => {
            this.isConnected = false;
            this.connectionState = 'disconnected';
            
            // Only show disconnection message if we weren't expecting it
            if (!this.restartInProgress) {
                this.ui.logToConsole('{red-fg}Disconnected from bot server{/red-fg}');
                this.handleReconnect();
            }
        });

        this.ws.on('error', (error) => {
            // Improved error handling with detailed error information
            let errorMessage = 'WebSocket error';
            
            if (error.code) {
                errorMessage += `: ${error.code}`;
            }
            
            if (error.message) {
                errorMessage += ` - ${error.message}`;
            }
            
            if (error.errno) {
                errorMessage += ` (errno: ${error.errno})`;
            }
            
            if (error.address) {
                errorMessage += ` - Address: ${error.address}:${error.port || '8080'}`;
            }
            
            // Log detailed error to console box
            this.ui.logToConsole(`{red-fg}${errorMessage}{/red-fg}`);
            
            // Also log to standard console for debugging
            console.error('WebSocket error:', error);
        });

        this.ws.on('ping', () => {
            this.ws.pong();
        });
    }

    handleReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts && !this.restartInProgress) {
            this.reconnectAttempts++;
            const message = `{yellow-fg}Reconnecting... Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}{/yellow-fg}`;
            this.ui.logToConsole(message);
            
            // Add exponential backoff with jitter
            const baseDelay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);
            const jitter = Math.random() * 0.3 * baseDelay;
            const delay = baseDelay + jitter;
            
            setTimeout(() => this.connect(), delay);
        } else if (!this.restartInProgress) {
            const message = '{red-fg}Max reconnection attempts reached. Please restart the application.{/red-fg}';
            this.ui.logToConsole(message);
        }
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
        this.send({ type: 'GET_STATUS' });
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
}

module.exports = BotClient;