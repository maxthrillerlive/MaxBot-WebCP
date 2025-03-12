const WebSocket = require('ws');
const BotUI = require('./ui');
const controlPanel = require('./controlPanel');

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
        this.ws = new WebSocket('ws://localhost:8080');

        this.ws.on('open', () => {
            console.log('Connected to bot server');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.requestStatus();
        });

        this.ws.on('message', (data) => {
            try {
                const message = JSON.parse(data);
                this.handleMessage(message);
            } catch (err) {
                console.error('Error parsing message:', err);
            }
        });

        this.ws.on('close', () => {
            console.log('Disconnected from bot server');
            this.isConnected = false;
            this.handleReconnect();
        });

        this.ws.on('error', (error) => {
            console.error('WebSocket error:', error);
        });
    }

    handleReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Reconnecting... Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
            setTimeout(() => this.connect(), this.reconnectDelay);
            this.reconnectDelay *= 1.5; // Exponential backoff
        } else {
            console.error('Max reconnection attempts reached');
        }
    }

    handleMessage(message) {
        switch (message.type) {
            case 'STATUS':
                this.ui.updateStatus(message.data);
                break;
            case 'COMMANDS':
                this.ui.updateCommands(message.data);
                break;
            case 'COMMAND_ENABLED':
                this.ui.showResult(`Enabled command: ${message.command}`);
                this.requestCommands();
                break;
            case 'COMMAND_DISABLED':
                this.ui.showResult(`Disabled command: ${message.command}`);
                this.requestCommands();
                break;
            case 'ERROR':
                console.error('Server error:', message.error);
                this.ui.showResult(`Error: ${message.error}`);
                break;
            case 'CONNECTED':
                this.ui.showResult('Bot connected to Twitch');
                this.requestStatus();
                break;
            case 'DISCONNECTED':
                this.ui.showResult(`Bot disconnected from Twitch: ${message.reason}`);
                this.requestStatus();
                break;
            case 'RESTARTING':
                this.ui.showResult('Bot is restarting...');
                break;
            case 'SHUTTING_DOWN':
                this.ui.showResult('Bot is shutting down...');
                break;
        }
    }

    send(message) {
        if (this.isConnected) {
            this.ws.send(JSON.stringify(message));
        } else {
            console.error('Not connected to server');
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

    restartBot() {
        this.send({ type: 'RESTART_BOT' });
    }

    exitBot() {
        this.send({ type: 'EXIT_BOT' });
    }
}

// Start the client
new BotClient(); 