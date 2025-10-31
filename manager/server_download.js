const fs = require('fs');
const path = require('path');

let config = { enabled: 'no' };

require('dotenv').config();

const homepath = process.env.SERVER_HOMEPATH;

const all_downloads = []

const file_allowed = (filename) => {
    if (!filename || filename.length < 4)
        return false;
    if (!filename.toLowerCase().endsWith('.zip') && !filename.toLowerCase().endsWith('.pk3'))
        return false;
    if (!filename.startsWith(path.resolve(homepath)))
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

const hide_files = () => {
    return (config.secret && config.secret.toLowerCase() === 'yes');
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
        if (!file_allowed(fullname)) {
            continue;
        }
        all_downloads.push({name: dirent.name, fullpath: fullname, size:  Math.max(Math.round(fs.statSync(fullname).size * 100 / (1024 * 1024)) / 100, 0.01)});
    }
    curr_path.closeSync();
}

const do_sync = (startup) => {
    all_downloads.length = 0;
    config = JSON.parse(fs.readFileSync('./config/downloads.json'));
    const valid_modes = ['whitelist', 'blacklist'];
    if (!valid_modes.includes(config.mode)) {
        throw new Error(`Invalid config mode: ${config.mode}`);
    }
    if (!Array.isArray(config.files)) {
        throw new Error(`Config "files" must be an array`);
    }
    if (sync_enabled()) {
        sync_files(startup, process.env.SERVER_HOMEPATH, 0, 1, 1);
        if (all_downloads.length > 0) {
            all_downloads.sort((a, b) => a.name.localeCompare(b.name));
            console.log('Downloadable files: ');
            for (const file of all_downloads) {
                console.log(`> ${file.name}: ${file.size} MB`);
            }
            return;
        }
    }
    console.log('There are no downloadable files.');
}

do_sync(true);

module.exports = { do_sync, sync_enabled, all_downloads, hide_files };