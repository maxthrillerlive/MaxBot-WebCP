const blessed = require('blessed');
const contrib = require('blessed-contrib');
const StatusPanel = require('./panels/statusPanel');
const CommandsPanel = require('./panels/commandsPanel');
const ConsolePanel = require('./panels/consolePanel');
const AdminPanel = require('./panels/adminPanel');

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
            
            console.log('Creating UI panels...');
            
            // Create panels
            this.statusPanel = new StatusPanel(this.grid, 0, 0, 3, 6);
            this.commandsPanel = new CommandsPanel(this.grid, 0, 6, 3, 6);
            this.consolePanel = new ConsolePanel(this.grid, 3, 0, 3, 6);
            
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
        
        // Create admin panel now that we have a client
        this.adminPanel = new AdminPanel(this.grid, 3, 6, 3, 6, this.client, this);
        
        this.screen.render();
    }

    // Make logToConsole safer
    logToConsole(message) {
        try {
            if (this.consolePanel) {
                this.consolePanel.log(message);
                this.screen.render();
            } else {
                console.log('Console panel not initialized, logging to stdout:', message.replace(/\{[^}]+\}/g, ''));
            }
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
        if (this.statusPanel) {
            this.statusPanel.updateStatus(status);
            this.screen.render();
        }
    }

    // Update command list
    updateCommands(commands) {
        if (this.commandsPanel) {
            this.commandsPanel.updateCommands(commands);
            this.screen.render();
        }
    }

    // Check if UI is initialized
    isInitialized() {
        return this.initialized;
    }
}

module.exports = BotUI; 