const blessed = require('blessed');
const controlPanel = require('./controlPanel');  // Updated import

class BotUI {
    constructor(client) {
        this.client = client;
        this.messageQueue = [];
        this.consoleInitialized = false;

        // Common styles for UI elements
        this.commonBorder = {
            type: 'line',
            fg: 'cyan'
        };

        this.commonStyle = {
            border: {
                fg: 'cyan',
                bold: true
            },
            scrollbar: {
                bg: 'cyan',
                fg: 'black'
            },
            focus: {
                border: {
                    fg: 'white',
                    bold: true
                }
            }
        };

        this.setupScreen();
    }

    setupScreen() {
        // Create a screen object
        this.screen = blessed.screen({
            smartCSR: true,
            title: '★ Twitch Bot Control Panel ★',
            dockBorders: true
        });

        // Create the menu panel (left side)
        this.menuList = blessed.list({
            parent: this.screen,
            width: '30%',
            height: '100%',
            left: 0,
            top: 0,
            border: this.commonBorder,
            style: {
                ...this.commonStyle,
                selected: {
                    bg: 'cyan',
                    fg: 'black',
                    bold: true
                },
                item: {
                    fg: 'white',
                    hover: {
                        bg: 'cyan',
                        fg: 'black'
                    }
                }
            },
            label: {
                text: ' Control Panel ',
                side: 'center'
            },
            keys: true,
            vi: true,
            mouse: true,
            padding: {
                left: 2,
                right: 2
            },
            items: [
                'Commands',
                'Enable Command',
                'Disable Command',
                'Bot Status',
                'Connected Channels',
                'Clear Console',
                'Restart Bot',
                'Exit Bot'
            ].map(item => `  ${item}  `),
            align: 'left'
        });

        // Create the results panel (top right)
        this.resultsBox = blessed.box({
            parent: this.screen,
            width: '70%',
            height: '60%',
            right: 0,
            top: 0,
            border: this.commonBorder,
            style: {
                ...this.commonStyle,
                fg: 'white'
            },
            label: {
                text: ' Status ',
                side: 'center'
            },
            content: '{center}Select an option from the Control Panel{/center}',
            scrollable: true,
            alwaysScroll: true,
            scrollbar: true,
            padding: 1,
            tags: true
        });

        // Create the console panel (bottom right)
        this.consoleBox = blessed.log({
            parent: this.screen,
            width: '70%',
            height: '40%',
            right: 0,
            bottom: 0,
            border: this.commonBorder,
            style: {
                ...this.commonStyle,
                fg: 'white'
            },
            label: {
                text: ' Console ',
                side: 'center'
            },
            scrollable: true,
            alwaysScroll: true,
            scrollbar: true,
            padding: 1,
            tags: true,
            mouse: true
        });

        // Handle menu selection
        this.menuList.on('select', async (item) => {
            const selected = item.content.trim();
            await this.handleMenuChoice(selected);
        });

        // Quit on Escape, q, or Control-C
        this.screen.key(['escape', 'q', 'C-c'], () => {
            this.confirmExit();
        });

        // Focus on the menu
        this.menuList.focus();

        // Initial render
        this.screen.render();
    }

    showResult(content) {
        this.resultsBox.setContent(content);
        this.screen.render();
    }

    logToConsole(message) {
        const timestamp = new Date().toLocaleTimeString();
        this.consoleBox.log(`[${timestamp}] ${message}`);
        this.screen.render();
    }

    async handleMenuChoice(choice) {
        switch (choice) {
            case 'Commands':
                this.client.requestCommands();
                break;
            case 'Enable Command':
                await this.enableCommand();
                break;
            case 'Disable Command':
                await this.disableCommand();
                break;
            case 'Bot Status':
                this.client.requestStatus();
                break;
            case 'Connected Channels':
                this.client.requestStatus();
                break;
            case 'Clear Console':
                this.consoleBox.setContent('');
                this.screen.render();
                break;
            case 'Restart Bot':
                await this.confirmRestart();
                break;
            case 'Exit Bot':
                await this.confirmExit();
                break;
        }
    }

    updateStatus(status) {
        let content = 'Bot Status:\n\n';
        content += `Connection State: ${status.connectionState}\n`;
        content += `Username: ${status.username}\n`;
        content += `Process ID: ${status.processId}\n\n`;
        content += 'Connected Channels:\n';
        status.channels.forEach(channel => {
            content += `${channel}\n`;
        });
        this.showResult(content);
    }

    updateCommands(commands) {
        let content = 'Available Commands:\n\n';
        commands.forEach(cmd => {
            const status = cmd.enabled ? 'Enabled' : 'Disabled';
            const modOnly = cmd.modOnly ? ' (Mod Only)' : '';
            content += `${cmd.trigger}: ${cmd.description}\n`;
            content += `Status: ${status}${modOnly}\n\n`;
        });
        this.showResult(content);
    }

    async enableCommand() {
        const commands = await this.client.requestCommands();
        const disabledCommands = commands.filter(cmd => !cmd.enabled);
        
        if (disabledCommands.length === 0) {
            this.showResult('No disabled commands found.');
            return;
        }

        const promptBox = this.createPromptBox({
            items: disabledCommands.map(cmd => `${cmd.trigger}: ${cmd.description}`),
            label: ' Select Command to Enable (Esc to cancel) '
        });

        return new Promise((resolve) => {
            promptBox.once('select', (item) => {
                const commandName = item.content.split(':')[0].replace('!', '');
                this.client.enableCommand(commandName);
                promptBox.destroy();
                this.menuList.focus();
                this.screen.render();
                resolve();
            });

            promptBox.key(['escape'], () => {
                promptBox.destroy();
                this.menuList.focus();
                this.screen.render();
                resolve();
            });
        });
    }

    async disableCommand() {
        const commands = await this.client.requestCommands();
        const enabledCommands = commands.filter(cmd => cmd.enabled);
        
        if (enabledCommands.length === 0) {
            this.showResult('No enabled commands found.');
            return;
        }

        const promptBox = this.createPromptBox({
            items: enabledCommands.map(cmd => `${cmd.trigger}: ${cmd.description}`),
            label: ' Select Command to Disable (Esc to cancel) '
        });

        return new Promise((resolve) => {
            promptBox.once('select', (item) => {
                const commandName = item.content.split(':')[0].replace('!', '');
                this.client.disableCommand(commandName);
                promptBox.destroy();
                this.menuList.focus();
                this.screen.render();
                resolve();
            });

            promptBox.key(['escape'], () => {
                promptBox.destroy();
                this.menuList.focus();
                this.screen.render();
                resolve();
            });
        });
    }

    async confirmRestart() {
        const confirm = await this.showConfirmDialog('Are you sure you want to restart the bot?');
        if (confirm) {
            this.client.restartBot();
        }
    }

    async confirmExit() {
        const confirm = await this.showConfirmDialog('Are you sure you want to exit?');
        if (confirm) {
            this.client.exitBot();
            setTimeout(() => process.exit(0), 1000);
        }
    }

    createPromptBox(options) {
        const box = blessed.list({
            parent: this.screen,
            width: '50%',
            height: '50%',
            top: 'center',
            left: 'center',
            border: this.commonBorder,
            style: {
                ...this.commonStyle,
                selected: {
                    bg: 'cyan',
                    fg: 'black',
                    bold: true
                },
                item: {
                    fg: 'white',
                    hover: {
                        bg: 'cyan',
                        fg: 'black'
                    }
                }
            },
            label: {
                text: options.label,
                side: 'center'
            },
            keys: true,
            vi: true,
            mouse: true,
            scrollbar: true,
            padding: 1,
            items: options.items
        });

        box.focus();
        this.screen.render();
        return box;
    }

    showConfirmDialog(message) {
        return new Promise((resolve) => {
            const dialog = blessed.box({
                parent: this.screen,
                border: this.commonBorder,
                height: 'shrink',
                width: '50%',
                top: 'center',
                left: 'center',
                label: {
                    text: ' * Confirm * ',
                    side: 'center'
                },
                style: {
                    border: {
                        fg: 'cyan'
                    },
                    fg: 'white'
                },
                padding: 1,
                tags: true,
                content: `{center}${message}{/center}\n\n{center}Press Y to confirm, N or Esc to cancel{/center}`
            });

            const cleanup = () => {
                dialog.destroy();
                this.menuList.focus();
                this.screen.render();
            };

            // Handle key events
            this.screen.key(['y', 'Y'], () => {
                cleanup();
                resolve(true);
            });

            this.screen.key(['escape', 'n', 'N'], () => {
                cleanup();
                resolve(false);
            });

            this.screen.render();
        });
    }
}

module.exports = BotUI; 