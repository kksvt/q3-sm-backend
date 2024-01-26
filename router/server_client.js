const express = require('express');
const server_client = express.Router();
const { all_downloads } = require('../manager/server_download');
const { q3_status, q3_getstatus_to_json } = require('../manager/server_managing');

server_client.get('/status', (req, res) => {
    q3_status((response) => {
        res.send(q3_getstatus_to_json(response.toString()));
    }, (err) => {
        res.send({});
    });
});

server_client.get('/downloads', (req, res) => {
    res.send(all_downloads);
});

module.exports = { server_client };