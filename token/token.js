const fs = require('fs');

require('dotenv').config();

const jwt_secret = fs.readFileSync(process.env.JWT_SECRET).toString();

module.exports = { jwt_secret }