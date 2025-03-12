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

        this.grid = new contrib.grid({
            rows: 12,
            cols: 12,
            screen: this.screen
        });

        // Create the chat panel (left side, top)
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
            },
            wrap: true,
            padding: {
                left: 1,
                right: 1
            },
            mouse: true
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

        // Create the console/log panel (bottom)
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
            wrap: true,
            padding: {
                left: 1,
                right: 1
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
                } else {
                    this.logToConsole('Commands must start with !');
                }
                this.inputBox.clearValue();
                this.screen.render();
            }
        });

        // Handle key events
        this.screen.key(['escape', 'q', 'C-c'], () => {
            this.confirmExit();
        });

        this.screen.key(['tab'], () => {
            if (this.screen.focused === this.inputBox) {
                this.commandList.focus();
            } else if (this.screen.focused === this.commandList) {
                this.chatBox.focus();
            } else {
                this.inputBox.focus();
            }
        });

        // Add to setupScreen()
        this.screen.key(['C-l'], () => {
            this.clearConsole();
        });

        // Focus on input by default
        this.inputBox.focus();

        // Ensure proper layout
        this.screen.append(this.consoleBox);
        this.screen.append(this.inputBox);

        // Ensure console is above input box
        this.consoleBox.setIndex(1);
        this.inputBox.setIndex(0);

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
        let formattedMessage = '';

        // Format based on message type
        if (message.startsWith('[DEBUG]')) {
            // Skip most debug messages except important ones
            if (message.includes('Command handled:') || 
                message.includes('Attempting to handle') ||
                message.includes('Processing command:') ||
                message.includes('Target channel:') ||
                message.includes('User context:') ||
                message.includes('Received message:')) {
                return;
            }
            // Format remaining debug messages
            const cleanMessage = message.replace('[DEBUG]', '').trim();
            formattedMessage = `{gray-fg}${cleanMessage}{/gray-fg}`;
        }
        else if (message.includes('info:')) {
            // Clean up chat messages
            if (message.includes('<')) {
                const matches = message.match(/\[(.*?)\] info: \[(.*?)\] <(.*?)>: (.*)/);
                if (matches) {
                    const [, , channel, user, text] = matches;
                    formattedMessage = `{yellow-fg}${user}{/yellow-fg}: ${text}`;
                } else {
                    formattedMessage = message.replace(/\[.*?\]/g, '').trim();
                }
            } else {
                formattedMessage = message.replace(/\[.*?\]/g, '').trim()
                                       .replace(/^info:\s*/, '')
                                       .replace(/<.*?>:\s*/, '');
            }
        }
        else if (message.includes('Connected to bot server')) {
            formattedMessage = `{green-fg}${message}{/green-fg}`;
        }
        else if (message.includes('Error:') || message.includes('error:')) {
            formattedMessage = `{red-fg}${message}{/red-fg}`;
        }
        else if (message.includes('Command executed:')) {
            formattedMessage = `{yellow-fg}${message}{/yellow-fg}`;
        }
        else {
            formattedMessage = message;
        }

        // Only log if we have a formatted message
        if (formattedMessage) {
            this.consoleBox.log(`{gray-fg}[${timestamp}]{/gray-fg} ${formattedMessage}`);
            this.screen.render();
        }
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