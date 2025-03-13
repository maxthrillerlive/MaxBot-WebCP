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
        
        console.log('Setting up GUARANTEED exit in 10 seconds');
        
        // Set multiple exit timers to ensure at least one works
        setTimeout(() => {
            console.log('Exit timer 1: Forcing exit with process.exit(1)');
            process.exit(1);
        }, 10000);
        
        setTimeout(() => {
            console.log('Exit timer 2: Forcing exit with SIGTERM');
            process.kill(process.pid, 'SIGTERM');
        }, 10500);
        
        setTimeout(() => {
            console.log('Exit timer 3: Forcing exit with SIGKILL');
            process.kill(process.pid, 'SIGKILL');
        }, 11000);
        
        // Also set up a Node.js exit handler
        process.on('exit', () => {
            console.log('Process exit event triggered');
        });
        
        // Log the PID for manual killing if needed
        console.log(`Process ID: ${process.pid} - You can manually kill with: kill -9 ${process.pid}`);
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
            
            // Create the grid layout
            this.grid = new contrib.grid({
                rows: 12,
                cols: 12,
                screen: this.screen
            });
            
            // Replace the StatusPanel with a simple box
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
            
            // Create a simple text box with auto-exit information
            this.adminBox = this.grid.set(9, 0, 3, 12, blessed.box, {
                label: ' FORCED EXIT IN 10 SECONDS ',
                tags: true,
                content: '{center}{bold}EMERGENCY AUTO-EXIT ACTIVE{/bold}{/center}\n\n' +
                         '{center}This application will forcefully terminate{/center}\n' +
                         '{center}in 10 seconds - NO COUNTDOWN DISPLAY{/center}',
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
                content: ' EMERGENCY EXIT: Application will terminate in 10 seconds (fixed timer, no countdown)',
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
        // No need to clear timeouts - we want them to fire
    }
}

module.exports = BotUI; 