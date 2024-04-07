const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const bcrypt = require('bcrypt');

const salt_rounds = 12;

const db = new sqlite3.Database('./database/users.db', sqlite3.OPEN_CREATE | sqlite3.OPEN_READWRITE, (err) => {
  if (err) {
    console.error(err.message);
    return;
  }
  console.log('Connected to the users database.');
});

db.run('CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT UNIQUE, password TEXT);', function(err) {
    if (err) {
        console.log(err);
        console.error(err.message);
        return;
    }
    db.all('SELECT COUNT(*) FROM users;', [], function(err, rows) {
        if (err) {
            console.error(err.message);
            return;
        }
        if (rows.length == 0) {
            console.error('SELECT COUNT(*) has failed for unknown reasons.');
            return;
        }
        if (!fs.existsSync('./database/admin.json')) {
            if (rows[0]['COUNT(*)'] == 0) {
                console.error('./database/admin.json does not exist. It\'s necessary to create the first user in the database.');
            }
            console.log(`There are ${rows[0]['COUNT(*)']} admin users in the database.`);
            return;
        }
        const users = JSON.parse(fs.readFileSync('./database/admin.json'));
        const query = 'INSERT INTO users(username, password) VALUES ' + users.users.map((user) => '(?, ?)').join(', ') + ';';
        const params = users.users.reduce((acc, current) => {
            acc.push(current.username);
            acc.push(bcrypt.hashSync(current.password, salt_rounds));
            return acc;
        }, []);
        db.run(query, params, function(err) {
            if (err) {
                console.error('Error while creating the users: ' + err.message);
                return;
            }
            console.log(`${this.changes} users have been created.`);
            fs.unlinkSync('./database/admin.json');
        });
    });
});

const authenticated_user = (username, password, callback) => {
    db.all(`SELECT password from users WHERE username = ?;`, [username], (err, rows) => {
        if (err) {
            callback(err, undefined);
            return;
        }
        if (!rows) {
            callback(undefined, 'SELECT has failed for unknown reasons.');
            return;
        }
        if (!rows.length) {
            callback(undefined, 'Invalid username or password');
            return;
        }
        if (rows.length > 1) {
            callback(undefined, 'Multiple users with the same username. This should never happen.');
            return;
        }
        const hashed_password = rows[0]['password'];
        bcrypt.compare(password, hashed_password, (err, result) => {
            if (err) {
                callback(err, undefined);
                return; 
            }
            if (!result) {
                callback(undefined, 'Invalid username or password');
                return;
            }
            callback(undefined, undefined);
        });
    });
};

const close_db = () => {
    db.close((err) => {
        if (err) {
          console.error(err.message);
          return;
        }
        console.log('Closed the database connection.');
      });
};

module.exports = { authenticated_user, close_db }