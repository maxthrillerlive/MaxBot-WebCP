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
        this.statusBox = this.grid.set(0, 0, 3, 12, blessed.box, {
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

        // Create the chat panel (middle)
        this.chatBox = this.grid.set(3, 0, 5, 12, blessed.log, {
            label: ' Chat ',
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

        // Create the console panel (bottom)
        this.consoleBox = this.grid.set(8, 0, 4, 12, blessed.log, {
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
                // Chat messages go to chat panel, not console
                return;
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

    // Handle chat messages - send to chat panel
    addChatMessage(data) {
        if (!data || !this.chatBox) return;
        
        const timestamp = new Date().toLocaleTimeString();
        const username = data.username || 'unknown';
        const message = data.message || '';
        
        // Format chat message with timestamp and username
        let formattedMessage = `{gray-fg}[${timestamp}]{/gray-fg} `;
        
        // Add badges if available
        if (data.badges) {
            if (data.badges.broadcaster) formattedMessage += '{red-fg}👑{/red-fg} ';
            if (data.badges.moderator) formattedMessage += '{green-fg}⚔️{/green-fg} ';
            if (data.badges.vip) formattedMessage += '{purple-fg}💎{/purple-fg} ';
            if (data.badges.subscriber) formattedMessage += '{blue-fg}★{/blue-fg} ';
        }
        
        formattedMessage += `{yellow-fg}${username}{/yellow-fg}: ${message}`;
        
        // Add to chat box
        this.chatBox.log(formattedMessage);
        this.screen.render();
    }

    // Process raw chat message
    processChatMessage(message) {
        if (!message || !this.chatBox) return;
        
        const timestamp = new Date().toLocaleTimeString();
        
        // Extract username and message from raw format
        const matches = message.match(/info: \[(.*?)\] <(.*?)>: (.*)/);
        if (matches) {
            const [, channel, username, text] = matches;
            const formattedMessage = `{gray-fg}[${timestamp}]{/gray-fg} {yellow-fg}${username}{/yellow-fg}: ${text}`;
            this.chatBox.log(formattedMessage);
            this.screen.render();
        }
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