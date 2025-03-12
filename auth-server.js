require('dotenv').config();
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const session = require('express-session');
const rateLimit = require('express-rate-limit');

const app = express();
const port = process.env.AUTH_PORT || 3000;

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});

app.use(limiter);

// Session middleware
app.use(session({
    secret: crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// PKCE and state helpers
function generateCodeVerifier() {
    return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier) {
    return crypto.createHash('sha256')
        .update(verifier)
        .digest('base64url');
}

function generateState() {
    return crypto.randomBytes(16).toString('hex');
}

// Scopes required for the bot
const REQUIRED_SCOPES = [
    'chat:read',
    'chat:edit',
    'channel:moderate',
    'moderator:read:chatters',
    'channel:read:redemptions',
    'moderator:manage:banned_users',
    'moderator:manage:chat_messages',
    'channel:read:subscriptions'
].join(' ');

app.get('/', async (req, res) => {
    // Generate and store PKCE values and state
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = generateState();

    req.session.codeVerifier = codeVerifier;
    req.session.state = state;

    const params = new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        redirect_uri: `http://localhost:${port}/callback`,
        response_type: 'code',
        scope: REQUIRED_SCOPES,
        state: state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256'
    });

    res.redirect(`https://id.twitch.tv/oauth2/authorize?${params.toString()}`);
});

app.get('/callback', async (req, res) => {
    const { code, state } = req.query;

    // Verify state to prevent CSRF
    if (!state || state !== req.session.state) {
        return res.status(400).send('Invalid state parameter. Possible CSRF attack.');
    }

    try {
        // Exchange code for tokens
        const response = await axios.post('https://id.twitch.tv/oauth2/token', null, {
            params: {
                client_id: process.env.CLIENT_ID,
                client_secret: process.env.CLIENT_SECRET,
                code,
                grant_type: 'authorization_code',
                redirect_uri: `http://localhost:${port}/callback`,
                code_verifier: req.session.codeVerifier
            }
        });

        const { access_token, refresh_token, expires_in } = response.data;

        // Validate the token and get user info
        const userResponse = await axios.get('https://api.twitch.tv/helix/users', {
            headers: {
                'Authorization': `Bearer ${access_token}`,
                'Client-Id': process.env.CLIENT_ID
            }
        });

        const userData = userResponse.data.data[0];

        // Store tokens securely
        // In a production environment, these should be stored in a secure database
        const tokenData = {
            access_token,
            refresh_token,
            expires_at: Date.now() + (expires_in * 1000),
            user_id: userData.id,
            user_login: userData.login
        };

        // Save token data to a secure location
        // For development, we'll show it to update the .env file
        res.send(`
            <h1>Authentication Successful!</h1>
            <p>Authenticated as: ${userData.display_name}</p>
            <p>Please update your .env file with these values:</p>
            <pre>
ACCESS_TOKEN=${access_token}
REFRESH_TOKEN=${refresh_token}
USER_ID=${userData.id}
USER_LOGIN=${userData.login}
            </pre>
            <p><strong>Important:</strong> Store these values securely and never expose them in client-side code.</p>
        `);

    } catch (error) {
        console.error('Auth Error:', error.response?.data || error.message);
        res.status(500).send('Authentication failed. Check console for details.');
    }
});

// Token refresh endpoint
app.post('/refresh', async (req, res) => {
    const refreshToken = process.env.REFRESH_TOKEN;

    if (!refreshToken) {
        return res.status(400).send('No refresh token available');
    }

    try {
        const response = await axios.post('https://id.twitch.tv/oauth2/token', null, {
            params: {
                client_id: process.env.CLIENT_ID,
                client_secret: process.env.CLIENT_SECRET,
                grant_type: 'refresh_token',
                refresh_token: refreshToken
            }
        });

        const { access_token, refresh_token } = response.data;

        res.json({
            access_token,
            refresh_token
        });
    } catch (error) {
        console.error('Token refresh failed:', error.response?.data || error.message);
        res.status(500).send('Token refresh failed');
    }
});

app.listen(port, () => {
    console.log(`
    Auth server running at http://localhost:${port}
    
    Please ensure your .env file contains:
    - CLIENT_ID
    - CLIENT_SECRET
    from your Twitch Developer Console.
    
    Additional environment variables needed:
    - AUTH_PORT (optional, defaults to 3000)
    - NODE_ENV (set to 'production' in production)
    
    Visit http://localhost:${port} to start the auth process.
    `);
}); 