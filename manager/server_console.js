const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const _ = require('lodash');

const { jwt_secret } = require('../token/token');

let wss = null;

let output_log = []

const setup_console = (server, on_message) => {
    wss = new WebSocket.Server({ server: server, path: '/admin/console'});

    wss.on('connection', (ws, req) => {
        console.log(`Inbound connection from ${req.socket.remoteAddress}`);
        ws.send('auth_request');
        ws.on('message', (message) => {
            if (!ws.user) {
                const message_human = message.toString();
                if (!message_human || message_human.length < 5) {
                    console.log('...sent no auth message...');
                    ws.close();
                    return;
                }
                if (message_human.substring(0, 5) !== 'auth:') {
                    console.log('...has no auth...');
                    ws.close();
                    return;
                }
                const data = message_human.substring(5).split('\n');
                if (data.length != 2) {
                    console.log('...auth message is not split into username and token...');
                    ws.close();
                    return;
                }
                const username = data[0];
                const token = data[1];
                let taken = false;
                wss.clients.forEach((client) => { 
                    if (client !== ws && client.username === username) {
                        taken = true;
                    }
                });
                if (taken) {
                    console.log('...is using a taken username...');
                    ws.send('Someone else is using this username.');
                    ws.close();
                    return;
                }
                jwt.verify(token, jwt_secret, (err, user) => {
                    if (err || user.username !== username) {
                        console.log('...failed to authenticate');
                        ws.close();
                        return;
                    }
                    ws.user = user;
                    ws.username = username;
                    ws.ip_address = req.socket.remoteAddress;
                    console.log('...authentication successful!');
                    send_console(`${ws.username} (${ws.ip_address}) connected\n`);
                    ws.send(output_log.reduce((acc, current) => acc + current, ''));
                });
                return;
            }
            on_message(message);
            wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN && client.user) {
                    const msg = `Q3 Panel: Cmd from ${client.username} (${client.ip_address}): ${message}`;
                    client.send(msg.toString() + '\n');
                    console.log(msg)
                }
            });
        });
      
        ws.on('close', () => {
            if (ws.username && ws.ip_address)
                console.log(`Q3 Panel: ${ws.username} (${ws.ip_address}) disconnected from the Server Console`);
        });
      });
};

const send_console = (msg) => {
    const msg_str = msg.toString();
    output_log.push(msg_str);
    if (output_log.length > 512) {
        output_log = output_log.slice(1);
    }
    wss.clients.forEach((client) => {
        if (client.readyState == WebSocket.OPEN && client.user) {
            client.send(msg_str);
        }
    });
};

const disconnect_user = (user, msg) => {
    wss.clients.forEach((client) => {
        if (client.readyState !== WebSocket.CLOSED && client.readyState !== WebSocket.CLOSING && _.isEqual(client.user, user)) {
            client.send(msg + '\n');
            client.close();
        }
    })
}

const close_console = () => {
    wss.close();
}

module.exports = { send_console, setup_console, close_console, disconnect_user };