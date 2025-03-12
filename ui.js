const blessed = require('blessed');
const contrib = require('blessed-contrib');

class BotUI {
    constructor(client) {
        this.client = client;
        this.setupScreen();
    }

    setupScreen() {
        this.screen = blessed.screen({
            smartCSR: true,
            title: '★ MaxBot Control Panel ★',
            dockBorders: true,
            fullUnicode: true
        });

        // Create a grid layout
        this.grid = new contrib.grid({
            rows: 12,
            cols: 12,
            screen: this.screen
        });

        // Create the status panel (top)
        this.statusBox = this.grid.set(0, 0, 4, 12, blessed.box, {
            label: ' Bot Status ',
            tags: true,
            border: {
                type: 'line',
                fg: 'cyan'
            },
            style: {
                fg: 'white',
                border: {
                    fg: 'cyan'
                }
            },
            padding: 1
        });

        // Create the console panel (middle)
        this.consoleBox = this.grid.set(4, 0, 8, 12, blessed.log, {
            label: ' Console ',
            tags: true,
            scrollable: true,
            alwaysScroll: true,
            scrollbar: {
                ch: '│',
                track: {
                    bg: 'black'
                },
                style: {
                    fg: 'cyan'
                }
            },
            border: {
                type: 'line',
                fg: 'cyan'
            },
            style: {
                fg: 'white',
                border: {
                    fg: 'cyan'
                }
            },
            mouse: true
        });

        // Create command input box
        this.inputBox = blessed.textbox({
            parent: this.screen,
            bottom: 0,
            left: 0,
            height: 3,
            width: '100%',
            keys: true,
            mouse: true,
            inputOnFocus: true,
            border: {
                type: 'line',
                fg: 'cyan'
            },
            style: {
                fg: 'white',
                border: {
                    fg: 'cyan'
                }
            }
        });

        // Handle command input
        this.inputBox.key(['enter'], () => {
            const command = this.inputBox.getValue().trim();
            if (command) {
                if (command.startsWith('!')) {
                    this.client.executeCommand(command, `#${process.env.CHANNEL_NAME}`);
                    this.logToConsole(`Command sent: ${command}`);
                } else {
                    this.logToConsole('Commands must start with !');
                }
                this.inputBox.clearValue();
                this.screen.render();
            }
        });

        // Exit handling
        this.screen.key(['escape', 'q', 'C-c'], () => {
            this.confirmExit();
        });

        // Clear console with Ctrl+L
        this.screen.key(['C-l'], () => {
            this.consoleBox.setContent('');
            this.screen.render();
        });

        // Focus input by default
        this.inputBox.focus();

        // Initial render
        this.screen.render();
    }

    // Unified method to log all messages to console
    logToConsole(message) {
        if (!message || message.trim() === '') return;
        if (!this.consoleBox) return;

        const timestamp = new Date().toLocaleTimeString();
        let formattedMessage = '';

        // Format based on message type
        if (typeof message === 'string') {
            if (message.includes('Connected to bot server')) {
                formattedMessage = `{green-fg}${message}{/green-fg}`;
            } else if (message.includes('Error:')) {
                formattedMessage = `{red-fg}${message}{/red-fg}`;
            } else if (message.includes('info:') && message.includes('<')) {
                // Format chat messages
                const matches = message.match(/info: \[(.*?)\] <(.*?)>: (.*)/);
                if (matches) {
                    const [, channel, username, text] = matches;
                    formattedMessage = `{yellow-fg}${username}{/yellow-fg}: ${text}`;
                } else {
                    formattedMessage = message;
                }
            } else if (message.includes('Bot Status:')) {
                // Skip status messages as they go to the status panel
                return;
            } else if (message.includes('Available Commands:')) {
                formattedMessage = `{cyan-fg}${message}{/cyan-fg}`;
            } else {
                formattedMessage = message;
            }
        } else {
            formattedMessage = JSON.stringify(message);
        }

        // Add timestamp and log
        this.consoleBox.log(`{gray-fg}[${timestamp}]{/gray-fg} ${formattedMessage}`);
        this.screen.render();
    }

    // Handle chat messages - redirect to console
    addChatMessage(data) {
        if (!data) return;
        
        const username = data.username || 'unknown';
        const message = data.message || '';
        
        this.logToConsole(`{yellow-fg}${username}{/yellow-fg}: ${message}`);
    }

    // Handle status updates - update status panel
    updateStatus(status) {
        if (!status || !this.statusBox) return;
        
        let content = '';
        content += `{green-fg}State:{/green-fg} ${status.connectionState}\n`;
        content += `{green-fg}Username:{/green-fg} ${status.username}\n`;
        content += `{green-fg}Channels:{/green-fg} ${status.channels ? status.channels.join(', ') : 'none'}\n`;
        content += `{green-fg}Uptime:{/green-fg} ${Math.floor(status.uptime || 0)}s\n`;
        content += `{green-fg}Commands:{/green-fg} ${status.commandCount || 0}\n`;
        content += `{green-fg}Memory:{/green-fg} ${Math.round((status.memory?.heapUsed || 0) / 1024 / 1024)}MB\n\n`;
        
        // Add command list to status panel
        if (status.commands && Array.isArray(status.commands)) {
            content += `{cyan-fg}Available Commands:{/cyan-fg}\n`;
            status.commands.forEach(cmd => {
                const cmdStatus = cmd.enabled ? '{green-fg}✓{/green-fg}' : '{red-fg}✗{/red-fg}';
                content += `${cmdStatus} ${cmd.trigger}\n`;
            });
        }
        
        this.statusBox.setContent(content);
        this.screen.render();
    }

    // Handle connection state updates
    updateConnectionState(state) {
        this.logToConsole(`Bot ${state}`);
    }

    // Exit confirmation
    async confirmExit() {
        const confirm = await this.showConfirmDialog('Are you sure you want to exit?');
        if (confirm) {
            this.client.exitBot();
            setTimeout(() => process.exit(0), 1000);
        }
    }

    // Show confirmation dialog
    showConfirmDialog(message) {
        return new Promise((resolve) => {
            const dialog = blessed.box({
                parent: this.screen,
                top: 'center',
                left: 'center',
                width: '50%',
                height: 'shrink',
                border: {
                    type: 'line',
                    fg: 'cyan'
                },
                style: {
                    fg: 'white',
                    border: {
                        fg: 'cyan'
                    }
                },
                padding: 1,
                tags: true,
                content: `{center}${message}{/center}\n\n{center}Press Y to confirm, N or Esc to cancel{/center}`
            });

            const cleanup = () => {
                dialog.destroy();
                this.screen.render();
            };

            this.screen.key(['y', 'Y'], () => {
                cleanup();
                resolve(true);
            });

            this.screen.key(['escape', 'n', 'N'], () => {
                cleanup();
                resolve(false);
            });

            this.screen.render();
        });
    }
}

module.exports = BotUI;