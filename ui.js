const blessed = require('blessed');
const contrib = require('blessed-contrib');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

class BotUI {
    constructor() {
        // Make blessed available to other modules
        this.blessed = blessed;
        this.contrib = contrib;
        
        // Flag to track initialization
        this.initialized = false;
        this.client = null;
        
        console.log('Starting MaxBot TUI...');
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
                this.exit();
                return process.exit(0);
            });
            
            // Create the grid layout
            this.grid = new contrib.grid({
                rows: 12,
                cols: 12,
                screen: this.screen
            });
            
            // Create the status box
            this.statusBox = this.grid.set(0, 0, 3, 12, blessed.box, {
                label: ' Bot Status ',
                tags: true,
                content: '{center}Connecting to MaxBot...{/center}',
                border: {
                    type: 'line',
                    fg: 'blue'
                },
                style: {
                    fg: 'white',
                    border: {
                        fg: 'blue'
                    }
                }
            });
            
            // Create the commands box
            this.commandBox = this.grid.set(3, 0, 3, 12, blessed.box, {
                label: ' Commands ',
                tags: true,
                content: '{center}Loading commands...{/center}',
                border: {
                    type: 'line',
                    fg: 'green'
                },
                style: {
                    fg: 'white',
                    border: {
                        fg: 'green'
                    }
                }
            });
            
            // Create the console box
            this.consoleBox = this.grid.set(6, 0, 3, 12, blessed.box, {
                label: ' Console ',
                tags: true,
                content: '',
                scrollable: true,
                alwaysScroll: true,
                scrollbar: {
                    ch: ' ',
                    track: {
                        bg: 'gray'
                    },
                    style: {
                        inverse: true
                    }
                },
                border: {
                    type: 'line',
                    fg: 'yellow'
                },
                style: {
                    fg: 'white',
                    border: {
                        fg: 'yellow'
                    }
                }
            });
            
            // Create the admin box
            this.adminBox = this.grid.set(9, 0, 3, 12, blessed.box, {
                label: ' Admin Panel ',
                tags: true,
                content: '{center}Press Enter to select an option{/center}\n\n' +
                         '{center}[Exit Control Panel]{/center}',
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
                mouse: true,
                keys: true,
                clickable: true
            });
            
            // Add click handler for the exit option
            this.adminBox.on('click', (data) => {
                // Check if the click is on the exit option (roughly line 3)
                if (data.y === 3) {
                    console.log('Exit option clicked');
                    this.confirmExit();
                }
            });
            
            // Add a method to handle exit confirmation
            this.confirmExit = () => {
                const dialog = blessed.question({
                    parent: this.screen,
                    border: 'line',
                    height: 'shrink',
                    width: 'half',
                    top: 'center',
                    left: 'center',
                    label: ' Confirm Exit ',
                    tags: true,
                    content: 'Are you sure you want to exit?',
                    style: {
                        fg: 'white',
                        border: {
                            fg: 'red'
                        }
                    }
                });
                
                dialog.on('submit', (value) => {
                    if (value) {
                        console.log('Exit confirmed, shutting down');
                        this.exit();
                        process.exit(0);
                    } else {
                        console.log('Exit cancelled');
                        this.screen.render();
                    }
                });
                
                this.screen.append(dialog);
                dialog.focus();
                this.screen.render();
            };
            
            // Mark as initialized
            this.initialized = true;
            
            // Render the screen
            console.log('Rendering TUI screen...');
            this.screen.render();
            
            console.log('TUI setup complete');
            
            return this;
        } catch (error) {
            console.error('Error setting up UI:', error);
            throw error;
        }
    }

    // Set the client reference
    setClient(client) {
        this.client = client;
        this.screen.render();
    }

    // Make logToConsole safer
    logToConsole(message) {
        try {
            // Use a simple regex replacement to avoid potential recursion
            let cleanMessage = message;
            if (typeof message === 'string') {
                // Remove blessed tags with a simple approach
                cleanMessage = message.replace(/\{[^}]*\}/g, '');
            } else if (typeof message === 'object') {
                // Convert objects to strings safely
                try {
                    cleanMessage = JSON.stringify(message);
                } catch (e) {
                    cleanMessage = '[Object cannot be stringified]';
                }
            }
            
            // Append to console box
            if (this.consoleBox) {
                this.consoleBox.pushLine(cleanMessage);
                this.consoleBox.setScrollPerc(100);
                this.screen.render();
            }
            
            // Also log to stdout for debugging
            console.log('LOG:', cleanMessage);
        } catch (error) {
            console.error('Error in logToConsole:', error);
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
        if (this.statusBox) {
            let content = '';
            
            if (status) {
                content = `Status: ${status.connected ? '{green-fg}Connected{/green-fg}' : '{red-fg}Disconnected{/red-fg}'}\n` +
                          `Channel: ${status.channel || 'N/A'}\n` +
                          `Uptime: ${status.uptime || '0s'}`;
            } else {
                content = '{center}No status available{/center}';
            }
            
            this.statusBox.setContent(content);
            this.screen.render();
        }
    }

    // Update command list
    updateCommands(commands) {
        if (this.commandBox) {
            if (commands && commands.length > 0) {
                let content = 'Available Commands:\n\n';
                
                commands.forEach(cmd => {
                    const enabled = cmd.enabled ? '{green-fg}Enabled{/green-fg}' : '{red-fg}Disabled{/red-fg}';
                    content += `!${cmd.trigger} - ${cmd.description} [${enabled}]\n`;
                });
                
                this.commandBox.setContent(content);
            } else {
                this.commandBox.setContent('{center}No commands available{/center}');
            }
            
            this.screen.render();
        }
    }

    // Check if UI is initialized
    isInitialized() {
        return this.initialized;
    }

    // Add an exit method to clean up resources
    exit() {
        console.log('Exiting MaxBot TUI...');
        // Clean up any resources if needed
    }
}

module.exports = BotUI; 