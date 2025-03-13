module.exports = {
    // WebSocket server configuration
    websocket: {
        host: '192.168.1.122',
        port: 8080,
        get url() {
            return `ws://${this.host}:${this.port}`;
        }
    },
    
    // UI configuration
    ui: {
        // Auto-exit timeout in milliseconds (5 seconds)
        exitTimeout: 5000
    }
}; 