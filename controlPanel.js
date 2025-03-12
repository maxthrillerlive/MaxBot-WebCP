const fs = require('fs');
const path = require('path');

class ControlPanel {
    constructor() {
        this.commands = new Map();
        this.stateFile = path.join(__dirname, 'commands.json');
        this.loadCommands();
        this.loadState();
    }

    // ... rest of the code stays the same, just the class name changed ...
}

module.exports = new ControlPanel(); 