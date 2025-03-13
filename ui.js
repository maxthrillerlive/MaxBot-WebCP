const blessed = require('blessed');
const contrib = require('blessed-contrib');

class BotUI {
    constructor() {
        // Make blessed available to other modules
        this.blessed = blessed;
        this.contrib = contrib;
        
        // Flag to track initialization
        this.initialized = false;
    }

    setupScreen() {
        try {
            console.log('Setting up TUI screen...');
            
            // Create the screen
            this.screen = blessed.screen({
                smartCSR: true,
                title: 'MaxBot TUI',
                dockBorders: true,
                fullUnicode: true
            });
            
            // Set key bindings
            this.screen.key(['escape', 'q', 'C-c'], () => {
                return process.exit(0);
            });
            
            // Create the grid layout
            this.grid = new contrib.grid({
                rows: 12,
                cols: 12,
                screen: this.screen
            });
            
            console.log('Creating UI panels...');
            
            // Create status box
            this.statusBox = this.grid.set(0, 0, 3, 6, blessed.box, {
                label: ' Bot Status ',
                tags: true,
                content: '{center}Connecting to bot...{/center}',
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
            
            // Create command list
            this.commandBox = this.grid.set(0, 6, 3, 6, blessed.list, {
                label: ' Commands ',
                tags: true,
                items: ['Loading commands...'],
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
            
            // Create console box
            this.consoleBox = this.grid.set(3, 0, 3, 6, blessed.log, {
                label: ' Console ',
                tags: true,
                scrollable: true,
                alwaysScroll: true,
                scrollbar: {
                    ch: ' ',
                    track: {
                        bg: 'cyan'
                    },
                    style: {
                        inverse: true
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
                keys: true,
                vi: true,
                mouse: true
            });
            
            // Create admin panel
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
            
            // Set up admin panel selection handler
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
            
            // Initial log message
            this.logToConsole('{cyan-fg}MaxBot TUI started{/cyan-fg}');
            this.logToConsole('{yellow-fg}Connecting to bot server...{/yellow-fg}');
            
            // Mark as initialized
            this.initialized = true;
            
            // Render the screen
            console.log('Rendering TUI screen...');
            this.screen.render();
            
            console.log('TUI setup complete');
            
            // Return this for chaining
            return this;
        } catch (error) {
            console.error('Error setting up UI:', error);
            throw error;
        }
    }

    // Set the client reference
    setClient(client) {
        this.client = client;
    }

    // Make logToConsole safer
    logToConsole(message) {
        try {
            if (!this.consoleBox) {
                console.log('Console box not initialized, logging to stdout:', message.replace(/\{[^}]+\}/g, ''));
                return;
            }
            
            // Get current content
            const content = this.consoleBox.getContent();
            
            // Add new message
            this.consoleBox.setContent(content + '\n' + message);
            
            // Scroll to bottom
            this.consoleBox.setScrollPerc(100);
            
            // Render screen
            this.screen.render();
        } catch (error) {
            console.error('Error logging to console:', error);
        }
    }

    // Show a confirmation dialog
    showConfirmDialog(message) {
        return new Promise((resolve) => {
            const dialog = blessed.question({
                parent: this.screen,
                border: 'line',
                height: 'shrink',
                width: 'half',
                top: 'center',
                left: 'center',
                label: ' Confirm ',
                tags: true,
                keys: true,
                vi: true,
                mouse: true,
                content: message,
                style: {
                    fg: 'white',
                    border: {
                        fg: 'blue'
                    }
                }
            });
            
            dialog.on('submit', (value) => {
                resolve(value);
            });
            
            this.screen.append(dialog);
            dialog.focus();
            this.screen.render();
        });
    }

    // Update status display
    updateStatus(status) {
        try {
            console.log('updateStatus called with:', JSON.stringify(status));
            
            if (!this.statusBox) {
                console.log('Status box not initialized');
                return;
            }
            
            const connectedStatus = status.connected ? '{green-fg}Connected{/green-fg}' : '{red-fg}Disconnected{/red-fg}';
            const channel = status.channel || 'None';
            const uptime = status.uptime ? `${Math.floor(status.uptime / 60)}m ${status.uptime % 60}s` : '0s';
            
            this.statusBox.setContent(
                `{bold}Connection:{/bold} ${connectedStatus}\n` +
                `{bold}Channel:{/bold} ${channel}\n` +
                `{bold}Uptime:{/bold} ${uptime}`
            );
            
            this.screen.render();
            console.log('Status display updated');
        } catch (error) {
            console.error('Error updating status:', error);
        }
    }

    // Update command list
    updateCommands(commands) {
        try {
            console.log('updateCommands called with', commands ? commands.length : 0, 'commands');
            
            if (!this.commandBox) {
                console.log('Command box not initialized');
                return;
            }
            
            if (!commands || commands.length === 0) {
                this.commandBox.setItems(['No commands available']);
                this.screen.render();
                console.log('Command list updated: No commands available');
                return;
            }
            
            const items = commands.map(cmd => {
                const enabledStatus = cmd.enabled ? '{green-fg}✓{/green-fg}' : '{red-fg}✗{/red-fg}';
                return `${enabledStatus} ${cmd.trigger} - ${cmd.description}`;
            });
            
            this.commandBox.setItems(items);
            this.screen.render();
            console.log('Command list updated with', items.length, 'items');
        } catch (error) {
            console.error('Error updating commands:', error);
        }
    }

    // Check if UI is initialized
    isInitialized() {
        return this.initialized;
    }
}

module.exports = BotUI; 