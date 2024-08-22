const fs = require('fs');
const path = require('path');

let config = { enabled: 'no' };

require('dotenv').config();

const homepath = process.env.SERVER_HOMEPATH;

const all_downloads = []

const file_allowed = (filename) => {
    if (!filename || filename.length < 4)
        return false;
    if (!filename.endsWith('.zip') && !filename.endsWith('.pk3'))
        return false;
    if (config.mode === 'whitelist') {
        if (config.files.filter((mapname) => {
            return path.posix.relative(path.resolve(path.join(homepath, mapname)), filename) == '';
        }).length > 0) {
            return true;
        }
        return false;
    }
    else if (config.mode === 'blacklist') {
        if (config.files.filter((mapname) => {
            return path.posix.relative(path.resolve(path.join(homepath, mapname)), filename) == '';
        }).length > 0) {
            return false;
        }
        return true;
    }
    return false;
}

const sync_enabled = () => {
    return (config.enabled && config.enabled.toLowerCase() === 'yes');
}

const sync_files = (startup, pathname, depth, min_depth, max_depth) => {
    if (depth > max_depth)
        return;
    const curr_path = fs.opendirSync(pathname);
    for (let dirent = curr_path.readSync(); dirent !== null; dirent = curr_path.readSync()) {
        const fullname = path.resolve(path.join(pathname, dirent.name));
        if (dirent.isDirectory()) {
            sync_files(startup, fullname, depth + 1, min_depth, max_depth);
            continue;
        }
        if (depth < min_depth) {
            //you should not sync files from gamedata for ex
            continue;
        }
        const dest = `./public/downloads/${dirent.name}`;
        const file_exists = fs.existsSync(dest);
        if (!file_allowed(fullname)) {
            if (file_exists) {
                console.log(`${dest} used to be a downloadable file, but it is no longer allowed. Removing.`);
                fs.unlinkSync(dest);
            }
            continue;
        }
        console.log('Downloadable file: ' + dest);
        all_downloads.push({name: dirent.name, size:  Math.round(fs.statSync(fullname).size * 100 / (1024 * 1024)) / 100});
        if (!file_exists || (startup && config.overwrite && config.overwrite.toLowerCase() === 'yes'))
            fs.copyFileSync(fullname, dest);
    }
    curr_path.closeSync();
}

const do_sync = (startup) => {
    all_downloads.length = 0;
    config = JSON.parse(fs.readFileSync('./config/downloads.json'));
    if (sync_enabled()) {
        sync_files(startup, process.env.SERVER_HOMEPATH, 0, 1, 1);
        all_downloads.sort((a, b) => a.name.localeCompare(b.name));
    }
}

do_sync(true);

module.exports = { do_sync, sync_enabled, all_downloads };