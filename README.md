# Quake 3 Server Manager
Quake 3 Server Manager is a web application that faciliates the management of a Quake 3 engined-based game server. It provides a detailed game server tracker, restarter, web server console and a download page that contains all the mods used by the game server.

## Back-end
The back-end for the application is written in Node.js and provides all the endpoints and logic for controlling the game server. After cloning the repository you can install all necessary dependencies through **NPM**.

    cd q3-sm-backend && mkdir public && mkdir public/downloads && mkdir public/static && npm install

## Configuring the application

The **.env** file inside the main directory contains the settings necessary to properly set up the back-end:

    APP_PORT=443
    APP_REDIRECT_PORT=80
    APP_URL=
    SERVER_IP=
    SERVER_PORT=
    RSA_KEY=
    RSA_CERT=
    JWT_SECRET=
    SERVER_BIN_PATH=
    SERVER_HOMEPATH=
    SERVER_ARGS=
    RCON_PASSWORD=
    START_BY_DEFAULT=false
    LOG_CONSOLE=false
    MAX_FAILED_QUERIES=4
    FRONTEND_URL=
    SEND_STDIN=true

Setting | Description
--- | ---
APP_PORT | The port on which the HTTPS server will be run.
APP_REDIRECT_PORT | The port on which the HTTP server that redirects to the HTTPS server will be run.
APP_URL | The proper URL (ideally a domain) that will be used by the application. If this setting does not exist, then the HTTP redirection server will not be run.
SERVER_IP | The IP of the game server. This has be the IP address that will be visible to the host's network (so if you are hosting the game server locally and you have a private IP address, it most likely should start with 192.168.).
SERVER_PORT | The port of the game server.
RSA_KEY | The path to the RSA private key, used for encryption.
RSA_CERT | The path to the certificate.
JWT_SECRET | The path to the JWT secret key.
SERVER_BIN_PATH | The path to the game server's executable.
SERVER_HOMEPATH | The value of the *fs_homepath* cvar, which should typically point to the executable's directory.
SERVER_ARGS | Additional arguments used for launching the server, should typically include *+set dedicated 2 +exec server.cfg*.
RCON_PASSWORD | RCon password of the server, should be the same as the one specified in *server.cfg*.
START_BY_DEFAULT | If true, will start the game server as soon as the application is launched.
LOG_CONSOLE | If true, every line of output generated by the game server will also be sent to the back-end's console.
MAX_FAILED_QUERIES | The maximum number of failed *getinfo* queries that will cause a server restart.
FRONTEND_URL | This should be set only if the front-end is hosted on a different URL than the back-end. If set, also enables CORS.
SEND_STDIN | If true, will send server commands directly to the standard input. Otherwise, it will send them through RCon. The former may not work for certain engines.

To generate your certificate and keys, I recommend you to read [this article](https://ubuntu.com/server/docs/security-certificates).

## Running the application
If you wish to run the application you should also do it through **NPM**.

    npm start

In some cases, it may be necessary to launch the application with super-user privileges.

    sudo npm start

## Auto-restarter
Every 10 seconds, the back-end will query the game server with a *getinfo* packet, to indicate whether the game server is responsive or not. If the number of failed consecutive queries reaches *MAX_FAILED_QUERIES*, then the application will re-start the game server. At first, the application will attempt a graceful shutdown by sending *rcon exec pubcfg/quit.cfg* to the game server. After 5 seconds, the application will send SIGTERM to the game server process.

### quit.cfg
The application expects the server owner to create a *pubcfg/quit.cfg* (i.e. a **quit.cfg** file inside of a **pubcfg/** directory) within the directory of the mod that the game server is running. It should contain everything necessary to gracefully shut down the server, for example:

    say Server will now quit
    wait 1
    quit


## Synchronizing server-side mods with the Download page
Inside the *config/downloads.json* you can choose which server files should be synchronized with the download page (if any). Only **ZIP** and **PK3** files inside sub-directories of **SERVER_HOMEPATH** can be synchronized. This feature is by default disabled.

Option | Description | Sample value
---|---|---
enabled | If set to yes, the download feature will be enabled. | "yes"
mode | whitelist - only the files listed in the "files" field will be downloadable, blacklist - all files but the ones listed in the "files" field will be downloadable | "whitelist"
overwrite | If set to yes, then all downloadable files will be copied to the download directory every time the application is started, regardless if they already exist in the download directory or not. | "no"
files | Comma separated list of files. | "Main/mp_pakmaps5.pk3", "coopmain/bin.pk3"

## Admins
Every time the application is launched, the users defined in *database/admin.json* will be added to the database as admins (meaning they will be able to access the Server Console). Once the users are added, the file will be removed.

## Server Console
The server console page allows authorized users to view the server console output, send RCon commands, quit the server and manually launch it if necessary. All communication is securely done through WebSocket.

## GET /player/status
This endpoint returns a JSON-formatted *getstatus* response. *Getstatus* response contains all game cvars marked as *CVAR_SERVERINFO* and the list of players. If you wish your game server to return some additional information, for example your website, add:

    setu .Website www.github.com
    
To your *server.cfg* file.

## Serving static files
The application will automatically serve all static files in *public/downloads* and *public/static*. If you wish to deploy the front-end portion of the application alongside back-end, copy the contents of the front-end's *build* directory to *public/static*.
