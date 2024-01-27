const express = require('express');
const cors = require('cors');
const session = require('express-session')
const http = require('http');
const https = require('https');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const { server_admin } = require('./router/server_admin');
const { server_client } = require('./router/server_client');
const { q3_shutdown, q3_sendcmd, set_q3_onprint } = require('./manager/server_managing');
const { send_console, setup_console, close_console } = require('./manager/server_console');
const { close_db } = require('./manager/database.js');

require('dotenv').config();

const app = express();
const session_secret = fs.readFileSync(process.env.SESSION_SECRET).toString();

app.use(session({
  secret: session_secret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 8,
  },
}));

//enable cors if the fronted is hosted under a different url
if (process.env.FRONTEND_URL) {
  console.log('CORS is enabled');
  app.set('trust proxy', 1);
  app.use(cors({
    credentials: true,
    origin: process.env.FRONTEND_URL,
  }));
}

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

// redirect to https
if (process.env.APP_URL) {
  const httpServer = http.createServer((req, res) => {
    res.writeHead(301, { 'Location': `${process.env.APP_URL}/${req.url}` });
    res.end();
  });

  httpServer.listen(process.env.APP_REDIRECT_PORT, () => {
    console.log('HTTP redirection server is running on port ' + process.env.APP_REDIRECT_PORT);
  });
}

process.on('SIGTERM', () => {
    console.log('SIGTERM signal received.');
    close_console();
    close_db();
    q3_shutdown(() => {
      process.exit(0);
    });
  });
  
  process.on('SIGINT', () => {
    console.log('SIGINT signal received.');
    close_console();
    close_db();
    q3_shutdown(() => {
      process.exit(0);
    });
  });