const blessed = require('blessed');
const contrib = require('blessed-contrib');
// const StatusPanel = require('./panels/statusPanel');

class BotUI {
    constructor() {
        // Make blessed available to other modules
        this.blessed = blessed;
        this.contrib = contrib;
        
        // Flag to track initialization
        this.initialized = false;
        this.client = null;
        
        // Add a safety timeout to force exit after 10 seconds
        this.exitTimeout = setTimeout(() => {
            console.log('Safety timeout reached, forcing exit');
            process.exit(0);
        }, 10 * 1000); // 10 seconds
    }

    setupScreen() {
        try {
            console.log('Setting up TUI screen...');
            
            // Create the screen
        this.screen = blessed.screen({
            smartCSR: true,
                title: 'MaxBot TUI',
                dockBorders: true,
                fullUnicode: true,
                sendFocus: true,
                useBCE: true
            });
            
            // Set key bindings - try ALL possible keys
            this.screen.key(['escape', 'q', 'Q', 'C-c', 'x', 'X', 'e', 'E', 'C-d', 'C-x', 'C-q', 'C-z', 'f10', 'f4'], () => {
                console.log('Exit key pressed');
                process.exit(0);
            });
            
            // Try to catch ANY key press
            this.screen.on('keypress', (ch, key) => {
                console.log('Key pressed:', key ? key.name : ch);
                // If user presses any key 5 times in a row, exit
                if (!this.keyPressCount) this.keyPressCount = 0;
                this.keyPressCount++;
                
                if (this.keyPressCount >= 5) {
                    console.log('Multiple key presses detected, exiting');
                    process.exit(0);
                }
                
                // Reset count after 2 seconds
                clearTimeout(this.keyResetTimeout);
                this.keyResetTimeout = setTimeout(() => {
                    this.keyPressCount = 0;
                }, 2000);
            });
            
            // Create the grid layout
            this.grid = new contrib.grid({
                rows: 12,
                cols: 12,
                screen: this.screen
            });
            
            // Replace the StatusPanel with a simple box
            // this.statusPanel = new StatusPanel(this.grid, 0, 0, 3, 12);
            this.statusBox = this.grid.set(0, 0, 3, 12, blessed.box, {
                label: ' Bot Status (Disabled) ',
                tags: true,
                content: '{center}Status panel is disabled{/center}',
                border: {
                    type: 'line',
                    fg: 'gray'
                },
                style: {
                    fg: 'gray',
                    border: {
                        fg: 'gray'
                    }
                }
            });
            
            // Keep the existing panels for compatibility, but don't create new ones
            this.commandBox = this.grid.set(3, 0, 3, 12, blessed.box, {
                label: ' Commands (Disabled) ',
                tags: true,
                content: '{center}Commands panel is disabled{/center}',
                border: {
                    type: 'line',
                    fg: 'gray'
                },
                style: {
                    fg: 'gray',
                    border: {
                        fg: 'gray'
                    }
                }
            });
            
            this.consoleBox = this.grid.set(6, 0, 3, 12, blessed.box, {
                label: ' Console (Disabled) ',
                tags: true,
                content: '{center}Console panel is disabled{/center}',
                border: {
                    type: 'line',
                    fg: 'gray'
                },
                style: {
                    fg: 'gray',
                    border: {
                        fg: 'gray'
                    }
                }
            });
            
            // Create a simple text box with clear exit instructions
            this.adminBox = this.grid.set(9, 0, 3, 12, blessed.box, {
                label: ' EMERGENCY EXIT INSTRUCTIONS ',
                tags: true,
                content: '{center}{bold}EMERGENCY EXIT OPTIONS:{/bold}{/center}\n\n' +
                         '{center}1. Press ANY key 5 times quickly{/center}\n' +
                         '{center}2. Wait 10 seconds for auto-exit{/center}\n' +
                         '{center}3. In PuTTY, close the window{/center}\n' +
                         '{center}4. On server, use kill command{/center}',
                border: {
                    type: 'line',
                    fg: 'red'
                },
                style: {
                    fg: 'white',
                    bg: 'red',
                    border: {
                        fg: 'red'
                    }
                }
            });
            
            // Add a message at the bottom of the screen
            this.screen.append(blessed.box({
                bottom: 0,
                left: 0,
                right: 0,
                height: 1,
                content: ' EMERGENCY EXIT: Press ANY key 5 times quickly or wait 10 seconds for auto-exit',
                style: {
                    fg: 'white',
                    bg: 'red'
                }
            }));
            
            // Mark as initialized
            this.initialized = true;
            
            // Render the screen
            console.log('Rendering TUI screen...');
            this.screen.render();
            
            // Set up a render interval to ensure the screen is updated
            setInterval(() => {
                this.screen.render();
            }, 1000);
            
            // Add a countdown timer for the auto-exit
            let remainingSeconds = 10;
            this.countdownInterval = setInterval(() => {
                remainingSeconds--;
                if (remainingSeconds <= 0) {
                    clearInterval(this.countdownInterval);
                } else {
                    this.adminBox.setContent(
                        '{center}{bold}EMERGENCY EXIT OPTIONS:{/bold}{/center}\n\n' +
                        '{center}1. Press ANY key 5 times quickly{/center}\n' +
                        `{center}2. Auto-exit in ${remainingSeconds} seconds{/center}\n` +
                        '{center}3. In PuTTY, close the window{/center}\n' +
                        '{center}4. On server, use kill command{/center}'
                    );
                this.screen.render();
                }
            }, 1000); // Update every second
            
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
        // Just log to stdout since console panel is disabled
        try {
            // Use a simple regex replacement to avoid potential recursion
            let cleanMessage = message;
            if (typeof message === 'string') {
                // Remove blessed tags with a simple approach
                cleanMessage = message.replace(/\{[^}]*\}/g, '');
            }
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
        console.log('Status update ignored - panel is disabled');
        // Do nothing since status panel is disabled
    }

    // Update command list
    updateCommands(commands) {
        // Do nothing since commands panel is disabled
        console.log('Commands update ignored - panel is disabled');
    }

    // Check if UI is initialized
    isInitialized() {
        return this.initialized;
    }

    // Add an exit method to clean up resources
    exit() {
        console.log('Exiting MaxBot TUI...');
        // Clear any timeouts and intervals
        clearTimeout(this.exitTimeout);
        clearTimeout(this.keyResetTimeout);
        clearInterval(this.countdownInterval);
    }
}

module.exports = BotUI; 