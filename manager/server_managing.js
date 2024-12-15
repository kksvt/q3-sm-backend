const { spawn } = require('child_process');
const dgram = require('dgram');
const { clearInterval } = require('timers');

require('dotenv').config();

const server_ip = process.env.SERVER_IP;
const launch_bin = process.env.SERVER_BIN_PATH;
const fs_homepath = process.env.SERVER_HOMEPATH;
const game_port = process.env.SERVER_PORT;
const launch_args = ['+set', 'fs_homepath', fs_homepath, '+set', 'net_port', game_port, ...process.env.SERVER_ARGS.split(' ')];
const rcon = process.env.RCON_PASSWORD;
const q3_start = process.env.START_BY_DEFAULT && process.env.START_BY_DEFAULT.toLowerCase() === 'true';
const log_console = process.env.LOG_CONSOLE && process.env.LOG_CONSOLE.toLowerCase() === 'true';
const max_attempts = process.env.MAX_FAILED_QUERIES;
const send_stdin = process.env.SEND_STDIN && process.env.SEND_STDIN.toLowerCase() === 'true';

const q3_hexbyte = Buffer.from('FF', 'hex');
const q3_msg_prefix = Buffer.concat([q3_hexbyte, q3_hexbyte, q3_hexbyte, q3_hexbyte]);

let game_server = null;
let game_server_running = false;
let status_response = '';
let last_query = 0;

let q3_info_cronjob = null;

let q3_onprint = (data) => {

};

const set_q3_onprint = (func) => {
    q3_onprint = func;
}

const q3_launch = () => {
    console.log(`Starting game server on port ${game_port}`);
    game_server_running = true;
    game_server = spawn(launch_bin, launch_args, {cwd: fs_homepath, windowsHide: false})

    game_server.stdout.on('data', (chunk) => {
        if (log_console) {
            console.log(chunk.toString());
        }
        q3_onprint(chunk);
    });
    
    //certain q3 server binaries use stderr for standard messages
    game_server.stderr.on('data', (chunk) => {
        if (log_console) {
            console.log(chunk.toString());
        }
        q3_onprint(chunk);
    });
    
    game_server.on('close', (code) => {
        game_server_running = false;
        console.log(`Game server process exited with code ${code}`);
    });

    if (!q3_info_cronjob) {
        q3_info_cronjob = setInterval(() => q3_checkonline(), 10 * 1000);
    }

};

const q3_packet = (data) => {
    return Buffer.concat([q3_msg_prefix, Buffer.from(data)]);
};

const q3_getstatus = (on_success, on_error) => {
    if (!game_server_running) {
        status_response = '';
        on_error('Server is offline.');
        return '';
    }
    const udp_socket = dgram.createSocket('udp4');
    const buf = q3_packet('getstatus');
    udp_socket.on('message', (data) => {
        status_response = data;
        on_success(data);
        udp_socket.close();
    });
    udp_socket.send(buf, 0, buf.length, game_port, server_ip, (err) => {
        if (err) {
            status_response = {};
            on_error(err);
            udp_socket.close();
        }
    });
};

const q3_status = (on_success, on_error) => {
    const current_query = Date.now();
    //cache the result
    if (last_query != 0 && current_query - last_query <= 5000) {
        on_success(status_response);
        return;
    }
    last_query = current_query;
    q3_getstatus(on_success, on_error);
}

const q3_getstatus_to_json = (msg) => {
    const pattern = 'statusResponse\n\\';
    let data = {};
    let start_index = msg.indexOf(pattern);
    if (start_index == -1) {
        return {};
    }
    start_index += pattern.length;
    const end_index = msg.indexOf('\n', start_index);
    if (end_index == -1) {
        return {};
    }
    const keypairs = msg.substring(start_index, end_index).split('\\');
    if (keypairs.length < 2) {
        return {};
    }
    for (let i = 0; i < keypairs.length; i += 2) {
        data[keypairs[i]] = keypairs[i + 1];
    }
    const players = msg.substring(end_index).split('\n').filter((entry) => entry).map((entry) => {
        //score ping \"name\"
        const index = entry.indexOf(' \"');
        const invalid = {score: 0, ping: 0, name: ''};
        if (index == -1) {
            return invalid;
        }
        const data = entry.substring(0, index).split(' ');
        if (data.length != 2) {
            return invalid;
        }
        return {score: data[0], ping: data[1], name: entry.substring(index + 2).replaceAll('\"', '')};
    });
    data.players = players;
    return data;
};

let failed_attempts = 0;
let querying = false;
let timeout = null;

const q3_checkonline = () => {
    if (!q3_isrunning()) {
        q3_launch();
        return;
    }
    //process running doesn't necessarily mean that the server is responsive - it could be hanging after q3's G_Error
    const udp_socket = dgram.createSocket('udp4');
    const buf = q3_packet('getinfo');

    udp_socket
        .on('close', () => {
            if (failed_attempts >= max_attempts) {
                failed_attempts = 0;
                q3_shutdown(() => {
                    setTimeout(() => { q3_launch() }, 2000);
                });
            }
        })
        .on('message', (data) => {
            if (data.toString().includes('infoResponse')) {
                clearTimeout(timeout);
                querying = false;
                failed_attempts = 0;
                udp_socket.close();
            }
        });
    udp_socket.send(buf, 0, buf.length, game_port, server_ip, (err) => {
        querying = true;
        timeout = setTimeout(() => {
            if (!querying) {
                return;
            }
            failed_attempts += 1;
            console.log(`Server is unresponsive. Attempts: ${failed_attempts}/${max_attempts}`)
            udp_socket.close();
        }, 3000);
    });
};

const q3_sendcmd = (cmd, callback) => {
    if (!q3_isrunning()) {
        return;
    }
    
    if (send_stdin) {
        game_server.stdin.write(`${cmd}\n`);
        return;
    }

    const udp_socket = dgram.createSocket('udp4');
    const buf = q3_packet(`rcon ${rcon} ${cmd}`);
    udp_socket.send(buf, 0, buf.length, game_port, server_ip, (err) => {
        setTimeout(() => {
            udp_socket.close();
        }, 1000);
    });
    udp_socket.on('message', (data) => {
        callback(data);
    });
}

const q3_isrunning = () => {
    return game_server_running;
};

const q3_shutdown = (callback) => {
    q3_quit_cronjobs();
    if (!q3_isrunning()) {
        callback();
        return;
    }
    q3_sendcmd('exec pubcfg/quit.cfg', () => {}); //attempt a graceful shutdown first, with whatever the server owner decides is appropriate
    setTimeout(() => {
        game_server.kill('SIGTERM');
        callback();
    }, 5000);
}

const q3_quit_cronjobs = () => {
    if (q3_info_cronjob) {
        console.log('Shutting down getinfo cronjob...');
        clearInterval(q3_info_cronjob);
        q3_info_cronjob = null;
    }
};

const q3_cron_online = () => {
    return q3_info_cronjob !== null;
}

if (q3_start) {
    //start with a 5s delay
    setTimeout(() => q3_launch(), 5000);
}

module.exports = { q3_shutdown, q3_quit_cronjobs, q3_isrunning, q3_launch, q3_packet, q3_getstatus, q3_status, q3_getstatus_to_json, q3_sendcmd, set_q3_onprint, q3_cron_online };