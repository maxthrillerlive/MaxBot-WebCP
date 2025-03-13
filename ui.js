const blessed = require('blessed');
const contrib = require('blessed-contrib');
const StatusPanel = require('./panels/statusPanel');

class BotUI {
    constructor() {
        // Make blessed available to other modules
        this.blessed = blessed;
        this.contrib = contrib;
        
        // Flag to track initialization
        this.initialized = false;
        this.client = null;
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
            
            // Create only the status panel
            this.statusPanel = new StatusPanel(this.grid, 0, 0, 3, 12);
            
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
            
            this.adminBox = this.grid.set(9, 0, 3, 12, blessed.box, {
                label: ' Admin Panel (Disabled) ',
                tags: true,
                content: '{center}Admin panel is disabled{/center}',
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
            
            // Test the status panel directly
            setTimeout(() => {
                console.log('Testing status panel directly from UI');
                if (this.statusPanel) {
                    this.statusPanel.updateStatus({
                        connected: true,
                        channel: 'Test Channel',
                        uptime: 123
                    });
                    this.screen.render();
                } else {
                    console.log('Status panel not available for test');
                }
            }, 3000);
            
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
        console.log('UI.updateStatus called with:', JSON.stringify(status));
        
        if (this.statusPanel) {
            this.statusPanel.updateStatus(status);
            this.screen.render();
        } else {
            console.log('Status panel not initialized');
        }
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
}

module.exports = BotUI; 