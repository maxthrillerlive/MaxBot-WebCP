// This is a client-side command handler for the D-Bus feature
module.exports = {
  name: 'dbus',
  description: 'Send a D-Bus message',
  execute: (client, args) => {
    const sender = args[0] || 'MaxBot-TUI';
    const message = args.slice(1).join(' ') || 'This is a test D-Bus message';
    
    client.sendDBusMessage(sender, message);
    client.ui.logToConsole(`{green-fg}Sent D-Bus message from ${sender}{/green-fg}`);
    
    return true;
  }
}; 