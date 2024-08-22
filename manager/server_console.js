const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const _ = require('lodash');
const cookie = require('cookie');

const { jwt_secret } = require('../token/token');

let wss = null;

let output_log = []

const check_validation = (client, callback_valid) => {
    const current_validation = Date.now();
    //last token validation happened over 10 seconds ago
    if (current_validation - client.last_validation > 10 * 1000) {
        jwt.verify(client.token, jwt_secret, (err, user) => {
            if (err) {
                client.close(4001, 'Access expired.');
                return;
            }

            client.last_validation = current_validation;
            callback_valid();
        });
        return;
    }

    callback_valid();
};

const send_console = (msg, log_to_console) => {
    const msg_str = msg.toString();

    if (msg_str.length < 1) {
        return;
    }

    output_log.push(msg_str);
    if (output_log.length > 512) {
        output_log = output_log.slice(1);
    }

    wss.clients.forEach((client) => {
        if (client.readyState == WebSocket.OPEN && client.user) {
            check_validation(client, () => {client.send(msg_str); } );
        }
    });

    if (log_to_console) {
        console.log(msg_str);
    }

};

const setup_console = (server, on_message) => {
    wss = new WebSocket.Server({ server: server, path: '/admin/console'});

    wss.on('connection', (ws, req) => {
        console.log(`Inbound connection from ${req.socket.remoteAddress}`);

        if (!req.headers || !req.headers.cookie) {
            console.log('...has no cookies...');
            ws.close(4001, 'No access token provided.');
            return;
        }

        const cookies = cookie.parse(req.headers.cookie);

        if (!cookies || !cookies.accessToken) {
            console.log('...has no accessToken...');
            ws.close(4001, 'No access token provided.');
            return;
        }

        jwt.verify(cookies.accessToken, jwt_secret, (err, user) => {
            if (err) {
                console.log('...failed to authenticate');
                ws.close(4001, 'Invalid access token.');
                return;
            }

            ws.user = user;
            ws.token = cookies.accessToken;
            ws.ip_address = req.socket.remoteAddress;
            ws.last_validation = Date.now();
            console.log('...authentication successful!');

            ws.on('close', () => {
                if (ws.user.username && ws.ip_address)
                    console.log(`Q3 Panel: ${ws.user.username} (${ws.ip_address}) disconnected from the Server Console`);
            });

            ws.on('message', (message) => {
                check_validation(ws, () => {
                        on_message(message);
                        send_console(`Q3 Panel: Cmd from ${ws.user.username} (${ws.ip_address}): ${message}`, true);
                    }
                );
            });

            ws.send(output_log.reduce((acc, current) => acc + current, ''));
            send_console(`${ws.user.username} (${ws.ip_address}) connected`, true);
        });
      
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