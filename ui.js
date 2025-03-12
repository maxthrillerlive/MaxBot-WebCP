const blessed = require('blessed');
const contrib = require('blessed-contrib');

class BotUI {
    constructor(client) {
        this.client = client;
        this.chatMessages = [];
        this.maxChatMessages = 100;
        this.messagesSeen = new Set(); // Add message deduplication
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

        // Create the chat panel (left side)
        this.chatBox = this.grid.set(0, 0, 8, 8, blessed.log, {
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
            }
        });

        // Create the status panel (right side, top)
        this.statusBox = this.grid.set(0, 8, 4, 4, blessed.box, {
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
            }
        });

        // Create the command list (right side, middle)
        this.commandList = this.grid.set(4, 8, 4, 4, blessed.list, {
            label: ' Commands ',
            tags: true,
            items: [],
            border: {
                type: 'line',
                fg: 'cyan'
            },
            style: {
                selected: {
                    bg: 'cyan',
                    fg: 'black'
                },
                fg: 'white',
                border: {
                    fg: 'cyan'
                }
            },
            keys: true,
            vi: true,
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
            }
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
                } else {
                    this.logToConsole('Commands must start with !');
                }
                this.inputBox.clearValue();
                this.screen.render();
            }
        });

        // Ensure proper layout
        this.screen.append(this.consoleBox);
        this.screen.append(this.inputBox);

        // Focus handling
        this.screen.key(['tab'], () => {
            if (this.screen.focused === this.inputBox) {
                this.commandList.focus();
            } else if (this.screen.focused === this.commandList) {
                this.chatBox.focus();
            } else {
                this.inputBox.focus();
            }
        });

        // Exit handling
        this.screen.key(['escape', 'q', 'C-c'], () => {
            this.confirmExit();
        });

        // Focus input by default
        this.inputBox.focus();

        // Initial render
        this.screen.render();
    }

    addChatMessage(data) {
        const timestamp = new Date(data.timestamp).toLocaleTimeString();
        let message = `{gray-fg}[${timestamp}]{/gray-fg} `;
        
        // Add badges if available
        if (data.badges) {
            if (data.badges.broadcaster) message += '{red-fg}👑{/red-fg} ';
            if (data.badges.moderator) message += '{green-fg}⚔️{/green-fg} ';
            if (data.badges.vip) message += '{purple-fg}💎{/purple-fg} ';
            if (data.badges.subscriber) message += '{blue-fg}★{/blue-fg} ';
        }
        
        // Add username and message
        message += `{yellow-fg}${data.username}{/yellow-fg}: ${data.message}`;
        
        // Add to chat box
        this.chatBox.log(message);
        this.screen.render();
    }

    updateStatus(status) {
        let content = '{center}Bot Status{/center}\n\n';
        content += `State: ${status.connectionState}\n`;
        content += `Username: ${status.username}\n`;
        content += `Channels: ${status.channels.join(', ')}\n`;
        content += `Uptime: ${Math.floor(status.uptime)}s\n`;
        content += `Commands: ${status.commandCount}\n`;
        content += `Memory: ${Math.round(status.memory.heapUsed / 1024 / 1024)}MB`;
        
        this.statusBox.setContent(content);
        this.screen.render();
    }

    updateConnectionState(state) {
        const stateColors = {
            connecting: 'yellow',
            connected: 'green',
            disconnected: 'red'
        };
        
        const color = stateColors[state] || 'white';
        this.logToConsole(`{${color}-fg}Bot ${state}{/${color}-fg}`);
    }

    updateCommands(commands) {
        this.commandList.setItems(
            commands.map(cmd => {
                const status = cmd.enabled ? '{green-fg}✓{/green-fg}' : '{red-fg}✗{/red-fg}';
                return `${status} ${cmd.trigger}`;
            })
        );
        this.screen.render();
    }

    logToConsole(message) {
        // Skip empty messages
        if (!message || message.trim() === '') return;

        const timestamp = new Date().toLocaleTimeString();

        // Handle chat messages
        if (message.includes('info:')) {
            if (message.includes('<')) {
                const matches = message.match(/\[.*?\] info: \[.*?\] <(.*?)>: (.*)/);
                if (matches) {
                    const [, username, text] = matches;
                    this.chatBox.log(`{gray-fg}[${timestamp}]{/gray-fg} {yellow-fg}${username}{/yellow-fg}: ${text}`);
                }
            } else if (message.includes('Available commands:')) {
                const cleanMessage = message.replace(/\[.*?\] info: \[.*?\] <.*?>: /, '');
                this.consoleBox.log(`{gray-fg}[${timestamp}]{/gray-fg} ${cleanMessage}`);
            }
        }
        // Handle system messages
        else if (message.includes('Connected to bot server')) {
            this.consoleBox.log(`{gray-fg}[${timestamp}]{/gray-fg} {green-fg}${message}{/green-fg}`);
        }
        else if (message.includes('Error:')) {
            this.consoleBox.log(`{gray-fg}[${timestamp}]{/gray-fg} {red-fg}${message}{/red-fg}`);
        }
        else if (!message.startsWith('[DEBUG]')) {
            this.consoleBox.log(`{gray-fg}[${timestamp}]{/gray-fg} ${message}`);
        }

        this.screen.render();
    }

    async confirmExit() {
        const confirm = await this.showConfirmDialog('Are you sure you want to exit?');
        if (confirm) {
            this.client.exitBot();
            setTimeout(() => process.exit(0), 1000);
        }
    }

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

    // Add method to clear console
    clearConsole() {
        this.consoleBox.setContent('');
        this.messagesSeen.clear();
        this.screen.render();
    }
}

module.exports = BotUI;