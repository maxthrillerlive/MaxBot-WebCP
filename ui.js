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
                this.exit();
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
            
            // Create admin panel with exit option
            this.adminBox = this.grid.set(9, 0, 3, 12, blessed.box, {
                label: ' Admin Panel ',
                tags: true,
                content: '{center}{bold}Press Enter to select an option{/bold}{/center}\n\n' +
                         '{center}{red-fg}[Exit Control Panel]{/red-fg}{/center}\n\n' +
                         '{center}Or press X to exit directly{/center}',
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
                        // Clean up resources
                        if (this.statusPanel && typeof this.statusPanel.destroy === 'function') {
                            this.statusPanel.destroy();
                        }
                        // Exit the process
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
            
            // Set up a render interval to ensure the screen is updated
            setInterval(() => {
                this.screen.render();
            }, 1000);
            
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
        
        // Direct panel content update as a fallback
        if (this.statusPanel && this.statusPanel.panel) {
            try {
                // Try the panel's updateStatus method
                this.statusPanel.updateStatus(status);
            } catch (error) {
                console.error('Error calling statusPanel.updateStatus:', error);
                
                // Fallback: update content directly
                try {
                    this.statusPanel.panel.setContent(
                        `Status: ${status.connected ? 'Connected' : 'Disconnected'}\n` +
                        `Channel: ${status.channel || 'Unknown'}\n` +
                        `Uptime: ${status.uptime || 0}s`
                    );
                } catch (directError) {
                    console.error('Error updating panel content directly:', directError);
                }
            }
            
            // Force render
            this.screen.render();
        } else {
            console.log('Status panel not available');
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

    // Add an exit method to clean up resources
    exit() {
        console.log('Exiting MaxBot TUI...');
        
        // Clean up status panel
        if (this.statusPanel && typeof this.statusPanel.destroy === 'function') {
            this.statusPanel.destroy();
        }
        
        // Clean up other resources as needed
    }
}

module.exports = BotUI; 