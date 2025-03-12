require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();

const port = 3000;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const SCOPES = process.env.SCOPES;

app.get('/auth', (req, res) => {
    const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=${SCOPES}`;
    res.redirect(authUrl);
});

app.get('/auth/callback', async (req, res) => {
    const code = req.query.code;
    
    try {
        // Exchange code for access token
        const response = await axios.post('https://id.twitch.tv/oauth2/token', null, {
            params: {
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                code: code,
                grant_type: 'authorization_code',
                redirect_uri: REDIRECT_URI
            }
        });

        const { access_token, refresh_token } = response.data;
        
        // Display the tokens
        res.send(`
            <h1>Authentication Successful!</h1>
            <p>Add these to your .env file:</p>
            <pre>
CLIENT_TOKEN=oauth:${access_token}
REFRESH_TOKEN=${refresh_token}
            </pre>
            <p>You can now close this window and restart your bot.</p>
        `);
        
    } catch (error) {
        console.error('Error getting token:', error.response?.data || error.message);
        res.status(500).send('Authentication failed. Check console for details.');
    }
});

app.listen(port, () => {
    console.log(`Auth server running at http://localhost:${port}/auth`);
    console.log('Visit this URL in your browser to authenticate with Twitch');
}); 