const blessed = require('blessed');
const contrib = require('blessed-contrib');
const dotenv = require('dotenv');
const childProcess = require('child_process');

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
        
        // Change the safety timeout to 15 seconds
        console.log('Setting up safety timeout (15 seconds)');
        this.safetyTimeout = setTimeout(() => {
            console.log('Safety timeout reached, executing kill command');
            try {
                // Execute kill command directly
                childProcess.execSync(`kill -9 ${process.pid}`);
            } catch (e) {
                // This should never be reached, but just in case
                process.exit(1);
            }
        }, 15 * 1000); // 15 seconds
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
            this.screen.key(['escape', 'q', 'Q', 'C-c', 'x', 'X'], () => {
                console.log('Exit key pressed');
                process.exit(0); // Force immediate exit
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
                label: ' Exit Application ',
                tags: true,
                content: '{center}{bold}Click here or press Q to exit{/bold}{/center}',
                border: {
                    type: 'line',
                    fg: 'red'
                },
                style: {
                    fg: 'white',
                    bg: 'red',
                    border: {
                        fg: 'red'
                    },
                    hover: {
                        bg: 'dark-red'
                    }
                },
                mouse: true,
                keys: true,
                clickable: true
            });
            
            // Focus the admin box by default
            this.adminBox.focus();
            
            // Mark as initialized
            this.initialized = true;
            
            // Render the screen
            console.log('Rendering TUI screen...');
            this.screen.render();
            
            console.log('TUI setup complete');
            
            // Update the admin box click handler to be more aggressive
            this.adminBox.on('click', () => {
                console.log('Admin box clicked, forcing exit');
                // Force immediate exit with SIGKILL
                try {
                    process.kill(process.pid, 'SIGKILL');
                } catch (e) {
                    process.exit(1);
                }
            });
            
            // Add this to the setupScreen method right after creating the screen
            // Add a global key handler that will force exit no matter what
            process.stdin.on('keypress', (ch, key) => {
                if (key && (key.name === 'q' || key.name === 'x' || key.name === 'escape' || 
                    (key.ctrl && key.name === 'c'))) {
                    console.log('Force exit key detected');
                    process.exit(1);
                }
            });
            
            // Add a direct event listener to the admin box for key presses
            this.adminBox.on('keypress', (ch, key) => {
                console.log('Key pressed in admin box:', key ? key.name : ch);
                process.exit(1);
            });
            
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