const WebSocket = require('ws');
const BotUI = require('./ui');

class BotClient {
    constructor() {
        this.ws = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.ui = new BotUI(this);
        this.connect();
    }

    connect() {
        const wsUrl = process.env.BOT_SERVER_URL || 'ws://localhost:8080';
        this.ws = new WebSocket(wsUrl);

        this.ws.on('open', () => {
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.requestStatus();
            this.ui.logToConsole('{green-fg}Connected to bot server{/green-fg}');
        });

        this.ws.on('message', (data) => {
            try {
                const message = JSON.parse(data);
                this.handleMessage(message);
            } catch (err) {
                console.error('Error parsing message:', err);
                this.ui.logToConsole(`Error: ${err.message}`);
            }
        });

        this.ws.on('close', () => {
            console.log('Disconnected from bot server');
            this.isConnected = false;
            this.ui.logToConsole('Disconnected from bot server');
            this.handleReconnect();
        });

        this.ws.on('error', (error) => {
            console.error('WebSocket error:', error);
            this.ui.logToConsole(`WebSocket error: ${error.message}`);
        });

        this.ws.on('ping', () => {
            this.ws.pong();
        });
    }

    handleReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const message = `Reconnecting... Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`;
            console.log(message);
            this.ui.logToConsole(message);
            setTimeout(() => this.connect(), this.reconnectDelay);
            this.reconnectDelay *= 1.5; // Exponential backoff
        } else {
            const message = 'Max reconnection attempts reached';
            console.error(message);
            this.ui.logToConsole(message);
        }
    }

    handleMessage(message) {
        try {
            switch (message.type) {
                case 'STATUS':
                    this.ui.updateStatus(message.data);
                    break;
                case 'COMMANDS':
                    this.ui.updateCommands(message.data);
                    break;
                case 'COMMAND_ENABLED':
                case 'COMMAND_DISABLED':
                case 'COMMAND_RESULT':
                    // Skip these messages as they're handled by the command list
                    break;
                case 'CHAT_MESSAGE':
                    // Format chat messages
                    const chatMsg = `info: [${message.data.channel}] <${message.data.username}>: ${message.data.message}`;
                    this.ui.logToConsole(chatMsg);
                    break;
                case 'CONNECTION_STATE':
                    this.ui.logToConsole(`Bot ${message.state}`);
                    break;
                case 'ERROR':
                    this.ui.logToConsole(`Error: ${message.error}`);
                    break;
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
        this.send({ type: 'RESTART_BOT' });
    }

    exitBot() {
        this.send({ type: 'EXIT_BOT' });
    }
}

module.exports = BotClient;