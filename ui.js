const blessed = require('blessed');
const contrib = require('blessed-contrib');

class BotUI {
    constructor(client) {
        this.client = client;
        this.blessed = blessed;
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

        // Create the chat panel (top left)
        this.chatBox = this.grid.set(0, 0, 6, 6, blessed.log, {
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
            padding: 0,
            mouse: true
        });

        // Create the status panel (top right)
        this.statusBox = this.grid.set(0, 6, 3, 6, blessed.box, {
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
            padding: 0
        });

        // Create the admin panel (middle right)
        this.adminBox = this.grid.set(3, 6, 3, 6, blessed.list, {
            label: ' Admin Panel ',
            tags: true,
            items: [
                '{blue-fg}Start Bot{/blue-fg}',
                '{green-fg}Restart Bot{/green-fg}',
                '{red-fg}Shutdown Bot{/red-fg}',
                '{yellow-fg}Clear Console{/yellow-fg}'
            ],
            border: {
                type: 'line',
                fg: 'cyan'
            },
            style: {
                selected: {
                    bg: 'cyan',
                    fg: 'black'
                },
                item: {
                    fg: 'white'
                },
                border: {
                    fg: 'cyan'
                }
            },
            keys: true,
            vi: true,
            mouse: true
        });

        // Create the console panel (bottom left)
        this.consoleBox = this.grid.set(6, 0, 6, 6, blessed.log, {
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
            padding: 0,
            mouse: true
        });

        // Create the command control panel (bottom right)
        this.commandControlBox = this.grid.set(6, 6, 6, 6, blessed.list, {
            label: ' Command Control ',
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
                item: {
                    fg: 'white'
                },
                border: {
                    fg: 'cyan'
                }
            },
            keys: true,
            vi: true,
            mouse: true,
            scrollbar: {
                ch: '│',
                track: {
                    bg: 'black'
                },
                style: {
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
                    this.logToConsole(`Command sent: ${command}`);
                } else {
                    this.logToConsole('Commands must start with !');
                }
                this.inputBox.clearValue();
                this.screen.render();
            }
        });

        // Handle command control selection
        this.commandControlBox.on('select', (item) => {
            const commandName = item.content.split(' ')[1].replace('!', '');
            this.toggleCommand(commandName);
        });

        // Handle admin panel selection
        this.adminBox.on('select', async (item) => {
            const action = item.content;
            if (action.includes('Start Bot')) {
                const confirm = await this.showConfirmDialog('Are you sure you want to start the bot?');
                if (confirm) {
                    this.logToConsole('{blue-fg}Starting bot...{/blue-fg}');
                    this.client.startBot();
                }
            } else if (action.includes('Restart Bot')) {
                const confirm = await this.showConfirmDialog('Are you sure you want to restart the bot?');
                if (confirm) {
                    this.logToConsole('{yellow-fg}Restarting bot...{/yellow-fg}');
                    this.client.restartBot();
                }
            } else if (action.includes('Shutdown Bot')) {
                const confirm = await this.showConfirmDialog('Are you sure you want to shutdown the bot?');
                if (confirm) {
                    this.logToConsole('{red-fg}Shutting down bot...{/red-fg}');
                    this.client.exitBot();
                }
            } else if (action.includes('Clear Console')) {
                this.consoleBox.setContent('');
                this.logToConsole('{cyan-fg}Console cleared{/cyan-fg}');
            }
        });

        // Tab navigation
        this.screen.key(['tab'], () => {
            if (this.screen.focused === this.inputBox) {
                this.chatBox.focus();
            } else if (this.screen.focused === this.chatBox) {
                this.statusBox.focus();
            } else if (this.screen.focused === this.statusBox) {
                this.adminBox.focus();
            } else if (this.screen.focused === this.adminBox) {
                this.consoleBox.focus();
            } else if (this.screen.focused === this.consoleBox) {
                this.commandControlBox.focus();
            } else {
                this.inputBox.focus();
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
        
        // Check if message already has color formatting
        const hasFormatting = message.includes('{') && message.includes('}');
        
        // Add timestamp to all messages
        let formattedMessage = `{gray-fg}[${timestamp}]{/gray-fg} `;
        
        // If message already has formatting, just append it
        if (hasFormatting) {
            formattedMessage += message;
        } else {
            // Format based on message type
            if (message.includes('Connected to bot server')) {
                formattedMessage += `{green-fg}${message}{/green-fg}`;
            } else if (message.includes('Error:') || message.includes('error:') || message.includes('WebSocket error')) {
                formattedMessage += `{red-fg}${message}{/red-fg}`;
            } else if (message.includes('Reconnecting')) {
                formattedMessage += `{yellow-fg}${message}{/yellow-fg}`;
            } else if (message.includes('Command sent:')) {
                formattedMessage += `{cyan-fg}${message}{/cyan-fg}`;
            } else {
                formattedMessage += message;
            }
        }

        // Log to console box
        this.consoleBox.log(formattedMessage);
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
        content += `{green-fg}Memory:{/green-fg} ${Math.round((status.memory?.heapUsed || 0) / 1024 / 1024)}MB`;
        
        this.statusBox.setContent(content);
        
        // Update command control if commands are available
        if (status.commands && Array.isArray(status.commands)) {
            this.updateCommandControl(status.commands);
        }
        
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
            // Just exit the TUI without shutting down the bot
            this.logToConsole('{yellow-fg}Exiting TUI...{/yellow-fg}');
            setTimeout(() => process.exit(0), 500);
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

            // Make sure the dialog is above other elements
            dialog.setFront();
                this.screen.render();

            // Create a separate key handler for this dialog
            const keyHandler = (ch, key) => {
                if (key.name === 'y' || key.name === 'Y') {
                cleanup();
                resolve(true);
                } else if (key.name === 'n' || key.name === 'N' || key.name === 'escape') {
                cleanup();
                resolve(false);
                }
            };

            // Add the key handler
            this.screen.on('keypress', keyHandler);

            // Function to clean up the dialog
            const cleanup = () => {
                this.screen.removeListener('keypress', keyHandler);
                dialog.destroy();
                this.screen.render();
            };

            // Focus the dialog to ensure it receives input
            dialog.focus();
            this.screen.render();
        });
    }

    // Toggle command enabled/disabled
    toggleCommand(commandName) {
        if (!commandName) return;
        
        // Find command in current list
        const commands = this.lastCommands || [];
        const command = commands.find(cmd => cmd.name === commandName);
        
        if (command) {
            if (command.enabled) {
                this.client.disableCommand(commandName);
                this.logToConsole(`Disabling command: ${commandName}`);
            } else {
                this.client.enableCommand(commandName);
                this.logToConsole(`Enabling command: ${commandName}`);
            }
        }
    }

    // Update command control list
    updateCommandControl(commands) {
        if (!commands || !Array.isArray(commands) || !this.commandControlBox) return;
        
        // Store commands for toggle functionality
        this.lastCommands = commands;
        
        // Update command list items
        this.commandControlBox.setItems(
            commands.map(cmd => {
                const status = cmd.enabled ? '{green-fg}✓{/green-fg}' : '{red-fg}✗{/red-fg}';
                return `${status} ${cmd.trigger}`;
            })
        );
        
        this.screen.render();
    }
}

module.exports = BotUI; 