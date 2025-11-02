const express = require('express');
const rateLimit = require('express-rate-limit');
const server_client = express.Router();
const path = require('path');
const { all_downloads, hide_files } = require('../manager/server_download');
const { q3_status, q3_getstatus_to_json } = require('../manager/server_managing');

const homepath = process.env.SERVER_HOMEPATH;

const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 requests per minute per IP
});

server_client.use(limiter);

server_client.get('/status', (req, res) => {
    q3_status((response) => {
        res.send(q3_getstatus_to_json(response.toString()));
    }, (err) => {
        res.send({});
    });
});

server_client.get('/downloads', (req, res) => {
    if (hide_files()) {
        res.send([]);
        return;
    }
    res.send(all_downloads.map((download) => {
        return {name: download.name, size: download.size};
    }));
});

server_client.get('/downloads/:path(*)', (req, res) => {
    if (!req.params || !req.params.path) {
        res.status(404).send('Invalid file.');
        return;
    }

    const file = req.params.path;
    const match = all_downloads.filter((download) => {
        return path.normalize(download.name) === path.normalize(file);
    });

    if (!match.length) {
        res.status(404).send('Invalid file.');
        return;
    }

    if (match.length > 1) {
        console.warn(`Warning: there are multiple files matching ${file}`);
    }

    const serve = match[0];

    console.log(`Attempting to send file ${serve.fullpath} to ${req.ip}`);

    if (!serve.fullpath.startsWith(path.resolve(homepath))) {
        res.status(403).send('Forbidden.');
        return;
    }

    res.sendFile(serve.fullpath, (err) => {
        console.error(`Failed to send file ${serve.fullpath}: ${err} to ${req.ip}`);
    })

})

module.exports = { server_client };