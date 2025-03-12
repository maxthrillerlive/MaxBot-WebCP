# MaxBot-TUI

A Terminal User Interface (TUI) control panel for MaxBot - A Twitch Chat Bot.

## Features

- Real-time chat monitoring
- Command execution interface
- Bot status monitoring
- Interactive terminal-based UI
- WebSocket connection to MaxBot server
- Customizable layout and themes

## Installation

```bash
npm install
```

## Configuration

Create a `.env` file in the root directory:

```env
BOT_SERVER_URL=ws://localhost:8080
```

## Usage

Start the TUI:
```bash
npm start
```

Development mode with auto-reload:
```bash
npm run dev
```

## Controls

- `Tab`: Switch between panels
- `Enter`: Execute command
- `Esc`: Clear input/Close popup
- `Ctrl+C`: Exit application

## Layout

```
+------------------+------------------+
|                  |                  |
|   Chat Window    |   Status Panel   |
|                  |                  |
|                  |                  |
+------------------+------------------+
|                  |                  |
|  Command Input   |    Bot Logs     |
|                  |                  |
+------------------+------------------+
```

## Development

The TUI is built using:
- `blessed` for the terminal interface
- `blessed-contrib` for advanced widgets
- `ws` for WebSocket communication

## Related Projects

- [MaxBot](https://github.com/maxthrillerlive/MaxBot) - The main bot server

## License

MIT 