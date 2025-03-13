const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');

class FedoraIntegration extends EventEmitter {
  constructor() {
    super();
    this.isEnabled = false;
    this.isFedora = false;
    this.client = null;
    this.ui = null;
  }

  initialize(client, ui) {
    this.client = client;
    this.ui = ui;
    
    // Check if we're running on Fedora
    try {
      if (fs.existsSync('/etc/fedora-release')) {
        this.isFedora = true;
        // Make sure this.ui exists before calling methods on it
        if (this.ui && typeof this.ui.logToConsole === 'function') {
          this.ui.logToConsole('{cyan-fg}Fedora Linux detected, enabling Fedora-specific features{/cyan-fg}');
        } else {
          console.log('Fedora Linux detected, enabling Fedora-specific features');
        }
      } else {
        // Try to detect using os-release
        const osRelease = fs.readFileSync('/etc/os-release', 'utf8');
        if (osRelease.includes('Fedora')) {
          this.isFedora = true;
          // Make sure this.ui exists before calling methods on it
          if (this.ui && typeof this.ui.logToConsole === 'function') {
            this.ui.logToConsole('{cyan-fg}Fedora Linux detected, enabling Fedora-specific features{/cyan-fg}');
          } else {
            console.log('Fedora Linux detected, enabling Fedora-specific features');
          }
        }
      }
    } catch (error) {
      // Make sure this.ui exists before calling methods on it
      if (this.ui && typeof this.ui.logToConsole === 'function') {
        this.ui.logToConsole('{yellow-fg}Not running on Fedora Linux, skipping Fedora-specific features{/yellow-fg}');
      } else {
        console.log('Not running on Fedora Linux, skipping Fedora-specific features');
      }
      return false;
    }

    if (!this.isFedora) {
      return false;
    }

    // Initialize Fedora-specific UI elements
    if (this.ui) {
      this.setupUI();
    }
    
    // Register message handlers
    this.registerMessageHandlers();
    
    this.isEnabled = true;
    
    // Make sure this.ui exists before calling methods on it
    if (this.ui && typeof this.ui.logToConsole === 'function') {
      this.ui.logToConsole('{green-fg}Fedora integration enabled successfully{/green-fg}');
    } else {
      console.log('Fedora integration enabled successfully');
    }
    
    return true;
  }

  setupUI() {
    // Create a Fedora-specific panel in the UI
    this.ui.fedoraBox = this.ui.grid.set(6, 0, 3, 6, this.ui.blessed.box, {
      label: ' Fedora Integration ',
      tags: true,
      content: '{center}Fedora Linux Integration Active{/center}\n\n' +
               '{cyan-fg}D-Bus:{/cyan-fg} Waiting for connection...\n' +
               '{cyan-fg}Notifications:{/cyan-fg} Enabled',
      border: {
        type: 'line',
        fg: 'blue'
      },
      style: {
        fg: 'white',
        border: {
          fg: 'blue'
        }
      }
    });
    
    // Create a button for sending notifications
    this.ui.notifyButton = this.ui.grid.set(9, 0, 1, 3, this.ui.blessed.button, {
      content: 'Send Notification',
      tags: true,
      border: {
        type: 'line',
        fg: 'blue'
      },
      style: {
        fg: 'white',
        bg: 'blue',
        focus: {
          bg: 'cyan'
        },
        hover: {
          bg: 'cyan'
        }
      }
    });
    
    this.ui.notifyButton.on('press', () => {
      this.showNotificationDialog();
    });
    
    // Create a button for sending D-Bus messages
    this.ui.dbusButton = this.ui.grid.set(9, 3, 1, 3, this.ui.blessed.button, {
      content: 'Send D-Bus Message',
      tags: true,
      border: {
        type: 'line',
        fg: 'blue'
      },
      style: {
        fg: 'white',
        bg: 'blue',
        focus: {
          bg: 'cyan'
        },
        hover: {
          bg: 'cyan'
        }
      }
    });
    
    this.ui.dbusButton.on('press', () => {
      this.showDBusMessageDialog();
    });
    
    this.ui.screen.render();
  }

  registerMessageHandlers() {
    // These handlers will be called from client.js when specific message types are received
    this.client.on('dbus-message', (data) => {
      this.handleDBusMessage(data);
    });
    
    this.client.on('dbus-notification', (data) => {
      this.handleDBusNotification(data);
    });
    
    this.client.on('log', (data) => {
      this.handleLogMessage(data);
    });
  }

  handleDBusMessage(data) {
    const { sender, message, timestamp } = data;
    this.ui.logToConsole(`{magenta-fg}[D-Bus] ${sender}:{/magenta-fg} ${message}`);
    
    // Update the Fedora panel
    this.updateFedoraPanel(`Last D-Bus message: ${sender}: ${message.substring(0, 30)}${message.length > 30 ? '...' : ''}`);
    
    this.ui.screen.render();
  }

  handleDBusNotification(data) {
    const { title, body, timestamp } = data;
    this.ui.logToConsole(`{magenta-fg}[Notification] ${title}:{/magenta-fg} ${body}`);
    
    // Update the Fedora panel
    this.updateFedoraPanel(`Last notification: ${title}: ${body.substring(0, 30)}${body.length > 30 ? '...' : ''}`);
    
    this.ui.screen.render();
  }

  handleLogMessage(data) {
    const { level, message, timestamp } = data;
    
    // Update the Fedora panel with the latest log if it's important
    if (level === 'error' || level === 'warn') {
      this.updateFedoraPanel(`Last ${level}: ${message.substring(0, 30)}${message.length > 30 ? '...' : ''}`);
      this.ui.screen.render();
    }
  }

  updateFedoraPanel(statusMessage) {
    if (!this.ui.fedoraBox) return;
    
    this.ui.fedoraBox.setContent(
      '{center}Fedora Linux Integration Active{/center}\n\n' +
      '{cyan-fg}D-Bus:{/cyan-fg} Connected\n' +
      '{cyan-fg}Notifications:{/cyan-fg} Enabled\n\n' +
      `{yellow-fg}${statusMessage}{/yellow-fg}`
    );
    
    this.ui.screen.render();
  }

  showNotificationDialog() {
    const form = this.ui.blessed.form({
      parent: this.ui.screen,
      top: 'center',
      left: 'center',
      width: 60,
      height: 15,
      bg: 'black',
      border: {
        type: 'line',
        fg: 'blue'
      },
      label: ' Send Notification '
    });
    
    const titleLabel = this.ui.blessed.text({
      parent: form,
      top: 2,
      left: 2,
      content: 'Title:'
    });
    
    const titleInput = this.ui.blessed.textbox({
      parent: form,
      top: 2,
      left: 10,
      right: 2,
      height: 1,
      inputOnFocus: true,
      border: {
        type: 'line'
      }
    });
    
    const bodyLabel = this.ui.blessed.text({
      parent: form,
      top: 5,
      left: 2,
      content: 'Body:'
    });
    
    const bodyInput = this.ui.blessed.textarea({
      parent: form,
      top: 5,
      left: 10,
      right: 2,
      height: 3,
      inputOnFocus: true,
      border: {
        type: 'line'
      }
    });
    
    const submitButton = this.ui.blessed.button({
      parent: form,
      bottom: 1,
      left: 10,
      width: 10,
      height: 1,
      content: 'Send',
      bg: 'blue',
      fg: 'white',
      focus: {
        bg: 'cyan'
      }
    });
    
    const cancelButton = this.ui.blessed.button({
      parent: form,
      bottom: 1,
      right: 10,
      width: 10,
      height: 1,
      content: 'Cancel',
      bg: 'red',
      fg: 'white',
      focus: {
        bg: 'pink'
      }
    });
    
    submitButton.on('press', () => {
      const title = titleInput.getValue();
      const body = bodyInput.getValue();
      
      if (title && body) {
        this.client.sendDBusNotification(title, body);
        this.ui.logToConsole(`{green-fg}Sent notification: ${title}{/green-fg}`);
      }
      
      form.destroy();
      this.ui.screen.render();
    });
    
    cancelButton.on('press', () => {
      form.destroy();
      this.ui.screen.render();
    });
    
    this.ui.screen.saveFocus();
    titleInput.focus();
    this.ui.screen.render();
  }

  showDBusMessageDialog() {
    const form = this.ui.blessed.form({
      parent: this.ui.screen,
      top: 'center',
      left: 'center',
      width: 60,
      height: 15,
      bg: 'black',
      border: {
        type: 'line',
        fg: 'blue'
      },
      label: ' Send D-Bus Message '
    });
    
    const senderLabel = this.ui.blessed.text({
      parent: form,
      top: 2,
      left: 2,
      content: 'Sender:'
    });
    
    const senderInput = this.ui.blessed.textbox({
      parent: form,
      top: 2,
      left: 10,
      right: 2,
      height: 1,
      inputOnFocus: true,
      border: {
        type: 'line'
      }
    });
    
    const messageLabel = this.ui.blessed.text({
      parent: form,
      top: 5,
      left: 2,
      content: 'Message:'
    });
    
    const messageInput = this.ui.blessed.textarea({
      parent: form,
      top: 5,
      left: 10,
      right: 2,
      height: 3,
      inputOnFocus: true,
      border: {
        type: 'line'
      }
    });
    
    const submitButton = this.ui.blessed.button({
      parent: form,
      bottom: 1,
      left: 10,
      width: 10,
      height: 1,
      content: 'Send',
      bg: 'blue',
      fg: 'white',
      focus: {
        bg: 'cyan'
      }
    });
    
    const cancelButton = this.ui.blessed.button({
      parent: form,
      bottom: 1,
      right: 10,
      width: 10,
      height: 1,
      content: 'Cancel',
      bg: 'red',
      fg: 'white',
      focus: {
        bg: 'pink'
      }
    });
    
    submitButton.on('press', () => {
      const sender = senderInput.getValue() || 'MaxBot-TUI';
      const message = messageInput.getValue();
      
      if (message) {
        this.client.sendDBusMessage(sender, message);
        this.ui.logToConsole(`{green-fg}Sent D-Bus message from ${sender}{/green-fg}`);
      }
      
      form.destroy();
      this.ui.screen.render();
    });
    
    cancelButton.on('press', () => {
      form.destroy();
      this.ui.screen.render();
    });
    
    this.ui.screen.saveFocus();
    senderInput.focus();
    this.ui.screen.render();
  }
}

module.exports = new FedoraIntegration(); 