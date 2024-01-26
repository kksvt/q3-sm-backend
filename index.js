const express = require('express');
const cors = require('cors');
const session = require('express-session')
const https = require('https');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const { server_admin } = require('./router/server_admin');
const { server_client } = require('./router/server_client');
const { q3_shutdown, q3_sendcmd, set_q3_onprint } = require('./manager/server_managing');
const { send_console, setup_console, close_console } = require('./manager/server_console');

require('dotenv').config();

const app = express();
const session_secret = fs.readFileSync(process.env.SESSION_SECRET).toString();

app.set('trust proxy', 1);

app.use(session({
  secret: session_secret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 8,
  },
}));

app.use(cors({
  credentials: true,
  origin: process.env.FRONTEND_URL,
}));

app.use(express.json());

app.use('/admin', server_admin);
app.use('/player', server_client);

app.use(express.static('public/downloads'));
app.use(express.static('public/static'));


app.get('*', (req, res) => {
  res.status(404).send('Sorry friend, it looks like you\'ve wandered into a restricted area. I need you to leave. Now.');
});

const https_server = https.createServer({
  key: fs.readFileSync(process.env.RSA_KEY),
  cert: fs.readFileSync(process.env.RSA_CERT),
}, app);

//set up the web socket for game server console handling
setup_console(https_server, 
  (message) => { 
    q3_sendcmd(message, (data) => {
      const data_str = data.toString();
      const index = data_str.indexOf('\n');
      send_console(data_str.substring(index + 1));
    }); 
  }
);

//send the game server's output to websocket
set_q3_onprint((data) => {
  send_console(data);
});

https_server.listen(process.env.APP_PORT, () => console.log('HTTPS Server is running on port ' + process.env.APP_PORT));

process.on('SIGTERM', () => {
    console.log('SIGTERM signal received.');
    close_console();
    q3_shutdown(() => {
      process.exit(0);
    });
  });
  
  process.on('SIGINT', () => {
    console.log('SIGINT signal received.');
    close_console();
    q3_shutdown(() => {
      process.exit(0);
    });
  });