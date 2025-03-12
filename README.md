# MaxBot

A customizable Twitch chat bot with a web-based control panel.

## Features

- Real-time chat monitoring and interaction
- Web-based control panel
- Custom commands and automation
- Secure OAuth2 authentication
- WebSocket-based real-time updates

## Setup

1. Install dependencies:
```bash
npm run install-all
```

2. Configure the bot:
   - Go to [Twitch Developer Console](https://dev.twitch.tv/console)
   - Create a new application
   - Set OAuth Redirect URL to: http://localhost:3000/auth/callback
   - Copy Client ID and Client Secret
   - Update bot-server/.env with your credentials

3. Start the bot:
```bash
npm start
```

For development:
```bash
npm run dev
```

## Project Structure

- `bot-server/` - Backend server that connects to Twitch chat
- `bot-client/` - Web-based control panel frontend
- `src/` - Shared resources and utilities

## License

MIT 