const express = require('express');
const server_admin = express.Router();
const jwt = require('jsonwebtoken');

const { disconnect_user } = require('../manager/server_console.js');
const { do_sync, sync_enabled} = require('../manager/server_download.js');
const { q3_isrunning, q3_shutdown, q3_launch, q3_cron_online } = require('../manager/server_managing.js');
const { authenticated_user } = require('../manager/database.js');

let pending_shutdown = false;
let pending_launch = false;
let pending_sync = false;

const { jwt_secret } = require('../token/token.js'); 

const is_valid_name = (username) => {
    if (!username || !username.length)
        return false;
    if (username.includes('\n'))
        return false;
    return true;
}

server_admin.use('/auth/*', (req, res, next) => {
    if (!req.session.authorization || !req.session.authorization.username) {
        return res.status(403).json({message: 'You are not logged in.'});
    }
    let token = req.session.authorization['accessToken'];
    jwt.verify(token, jwt_secret, (err, user) => {
        if (err) {
            return res.status(403).json({message: 'Failed to authenticate'});
        }
        req.user = user;
        next();
    });
  });

server_admin.post('/auth/quit', (req, res) => {
    if (pending_shutdown || !q3_isrunning()) {
        return res.status(405).send({message: 'Server is offline'});
    }
    pending_shutdown = true;
    console.log(`/auth/quit by ${req.ip}`);
    console.log(`Attempting to shut down server by ${req.ip}`);
    q3_shutdown(() => {
        pending_shutdown = false;
    });
    return res.status(200).send({message: 'Attempting to turn off the server...'});
});

server_admin.post('/auth/launch', (req, res) => {
    if (pending_launch || q3_isrunning()) {
        return res.status(405).send({message: 'Server is online'});
    }
    if (q3_cron_online()) {
        return res.status(405).send({message: 'The restart cronjob is running and will automatically start the server.'});
    }
    pending_launch = true;
    console.log(`/auth/launch by ${req.ip}`);
    q3_launch();
    setTimeout(() => { pending_launch = false; }, 3000); //put some cooldown on it
    return res.status(200).send({message: 'Attempting to turn on the server...'});
});

server_admin.post('/login', (req, res) => {
    console.log('/login sessionID: ' + req.sessionID);
    const username = req.body.username;
    const password = req.body.password;
    if (!is_valid_name(username)) {
      return res.status(400).json({message: 'nousername'});
    }
    if (!password || password.length == 0) {
      return res.status(400).json({message: 'nopassword'});
    }
    console.log(`Attempted login as ${username} from ${req.ip}`);
    authenticated_user(username, password, (err, reject) => {
        if (err) {
            console.error('authenticated user failure ' + err);
            res.status(500).send({message: 'Internal Server Error'});
            return;
        }
        if (reject) {
            console.log('...attempt failed: ' + reject);
            return res.status(401).json({message: 'invalid'});
        }
        console.log('...attempt successful');
        let accessToken = jwt.sign({username: username}, jwt_secret, {expiresIn: 8 * 60 * 60});
        req.session.authorization = {accessToken, username};
        req.session.save((err) => {
            if (err) {
                console.error('Error saving session:', err);
                res.status(500).send('Internal Server Error');
            }
            console.log('session id: ' + req.sessionID);
            return res.status(200).json({message: 'auth_success', username: username, accessToken: accessToken});
        });
    });
});

server_admin.post('/auth/logout', (req, res) => {
    disconnect_user(req.user, '[You have been logged out]');
    req.session.destroy();
    return res.status(200).send({message: 'logged_out', });
});

server_admin.post('/auth/sync', (req, res) => {
    if (pending_sync) {
        return res.status(405).send({message: 'The synchronization is in progress.'});
    }
    if (!sync_enabled()) {
        return res.status(501).send({message: 'This feature is currently disabled'});
    }
    pending_sync = true;
    console.log(`/auth/sync from ${req.ip}`);
    const promise = new Promise((resolve, reject) => {
        do_sync();
        resolve('File sync finished.');
        pending_sync = false;
    });
    promise.then((message) => { console.log(message)}, () => {});
    return res.status(200).send({message: 'Attempting to sync server files with the downloads...'});
});

server_admin.get('/auth/check', (req, res) => {
    req.session.save((err) => {
        if (err) {
            console.error('Error saving session: ' + err);
            return res.status(500).send('Internal Server Error');
        }
        return res.status(200).send({
            message: 'auth_success', 
            username: req.session.authorization.username, 
            accessToken: req.session.authorization.accessToken
        });
    });
});

module.exports = { server_admin };