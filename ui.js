const blessed = require('blessed');

class BotUI {
    constructor() {
        // Flag to track initialization
        this.initialized = false;
        
        // Log directly to console
        console.log('EMERGENCY MODE: Will attempt to exit in 5 seconds');
        console.log(`Process ID: ${process.pid}`);
        
        // Use the most direct method to exit
        // This bypasses Node.js event loop entirely
        const exitNow = () => {
            console.log('FORCING EXIT NOW');
            try {
                // Try multiple exit methods
                process.abort(); // This is the most aggressive exit method
            } catch (e) {
                try {
                    process.kill(process.pid, 'SIGKILL');
                } catch (e2) {
                    process.exit(1);
                }
            }
        };
        
        // Set multiple timers with different methods
        setTimeout(exitNow, 5000);
        
        // Also try with setImmediate and nextTick for redundancy
        setTimeout(() => {
            setImmediate(exitNow);
        }, 5500);
        
        setTimeout(() => {
            process.nextTick(exitNow);
        }, 6000);
        
        // Create a fallback file with the process ID
        try {
            const fs = require('fs');
            fs.writeFileSync('kill-maxbot-tui.txt', 
                `Process ID: ${process.pid}\n` +
                `To kill manually, run: kill -9 ${process.pid}\n`
            );
            console.log('Created kill-maxbot-tui.txt with process ID information');
        } catch (e) {
            console.error('Failed to create PID file:', e);
        }
    }

    setupScreen() {
        try {
            // Create a minimal screen
            this.screen = blessed.screen({
                smartCSR: true,
                title: 'MaxBot TUI - EMERGENCY MODE'
            });
            
            // Create a single box with exit information
            this.box = blessed.box({
                top: 'center',
                left: 'center',
                width: '80%',
                height: '50%',
                content: `
                ╔════════════════════════════════════════════════════════════╗
                ║                    !!! EMERGENCY MODE !!!                  ║
                ╠════════════════════════════════════════════════════════════╣
                ║                                                            ║
                ║  APPLICATION WILL FORCEFULLY TERMINATE IN 5 SECONDS        ║
                ║                                                            ║
                ║  Process ID: ${process.pid}                                ║
                ║                                                            ║
                ║  If the application doesn't exit automatically:            ║
                ║  1. Open another terminal                                  ║
                ║  2. Run: kill -9 ${process.pid}                           ║
                ║                                                            ║
                ║  A file named 'kill-maxbot-tui.txt' has been created       ║
                ║  with these instructions.                                  ║
                ║                                                            ║
                ╚════════════════════════════════════════════════════════════╝
                `,
                border: {
                    type: 'line'
                },
                style: {
                    fg: 'white',
                    bg: 'red',
                    border: {
                        fg: 'white'
                    }
                }
            });
            
            // Add the box to the screen
            this.screen.append(this.box);
            
            // Render the screen
            this.screen.render();
            
            // Mark as initialized
            this.initialized = true;
            
            return this;
        } catch (error) {
            console.error('Error setting up emergency UI:', error);
            return this;
        }
    }

    // Minimal implementation of required methods
    setClient() {}
    logToConsole(message) {
        // Use process.stdout.write directly instead of console.log
        // to avoid potential recursion
        try {
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
            process.stdout.write('LOG: ' + cleanMessage + '\n');
        } catch (error) {
            process.stderr.write('Error in logToConsole: ' + error.message + '\n');
        }
    }
    showConfirmDialog() { return Promise.resolve(true); }
    updateStatus() {}
    updateCommands() {}
    isInitialized() { return this.initialized; }
    exit() {}
}

module.exports = BotUI; 