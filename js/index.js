/*    ___                  __                        _______ __
     /   | _________ _____/ /__  ____ ___  __  __   / ____(_) /___  __
    / /| |/ ___/ __ `/ __  / _ \/ __ `__ \/ / / /  / /   / / __/ / / /
   / ___ / /__/ /_/ / /_/ /  __/ / / / / / /_/ /  / /___/ / /_/ /_/ /
  /_/  |_\___/\__,_/\__,_/\___/_/ /_/ /_/\__, /   \____/_/\__/\__, /
                                        /____/               /____/
Developed at Academy City Research
"Developing a better automated future"
======================================================================================
Kanmi Project - Discord Log System
Copyright 2020
======================================================================================
This code is under a strict NON-DISCLOSURE AGREEMENT, If you have the rights
to access this project you understand that release, demonstration, or sharing
of this project or its content will result in legal consequences. All questions
about release, "snippets", or to report spillage are to be directed to:

- ACR Docutrol -----------------------------------------
(Academy City Research Document & Data Control Services)
docutrol@acr.moe - 301-399-3671 - docs.acr.moe/docutrol
====================================================================================== */

const systemglobal = require('../config.json');
const watchdogConfig = require('../watchdog.config.json');
const facilityName = 'Discord-Watchdog';

const eris = require('eris');
const colors = require('colors');
const amqp = require('amqplib/callback_api');
const express = require("express");
const app = express();
const http = require('http').createServer(app).listen(7950);
const RateLimiter = require('limiter').RateLimiter;
const limiter1 = new RateLimiter(5, 250);
const cron = require('node-cron');
let init = 0;

const Logger = require('./utils/logSystem')(facilityName);
const db = require('./utils/shutauraSQL')(facilityName);
const mqClient = require('./utils/mqClient')(facilityName);

let watchdogs = new Map();
let watchdogsEntities = new Map();
let watchdogsReady = new Map();
let watchdogsDead = new Map();

const startDate = new Date().getTime()
watchdogConfig.Discord_Status.forEach(w => {
    watchdogs.set(w.id, {
        id: w.id,
        channel: w.channel,
        type: w.type,
        header: w.header,
        entities: w.watchdogs
    });
    w.watchdogs.forEach(e => { watchdogsEntities.set(`${w.id}-${e}`, startDate); });
    console.log('Registered Entities')
})
setTimeout(() => {
    watchdogConfig.Discord_Status.forEach(w => {
        w.watchdogs.forEach(e => { if (!watchdogsReady.has(`${w.id}-${e}`)) { watchdogsReady.set(`${w.id}-${e}`, startDate); } });
        console.log('Registered Ready Entities')
    })
}, 30.1 * 60000)

const MQServer = `amqp://${systemglobal.MQUsername}:${systemglobal.MQPassword}@${systemglobal.MQServer}/?heartbeat=60`
const MQWorkerCmd = `command.api.${systemglobal.SystemName}`
function runtime() {
    Logger.printLine("Discord", "Settings up Discord bot", "debug")
    const discordClient = new eris.CommandClient(systemglobal.Discord_Key, {
        compress: true,
        restMode: true,
    }, {
        name: "Kanmi Log",
        description: "Log and Watchdog Framework",
        owner: "Yukimi Kazari",
        prefix: "log ",
        restMode: true,
    });

    // Kanmi MQ Backend
    function startWorkerCmd() {
        amqpConn.createChannel(function(err, ch) {
            if (closeOnErr(err)) return;
            ch.on("error", function(err) {
                Logger.printLine("KanmiMQ", "Channel 0 Error (Command)", "error", err)
            });
            ch.on("close", function() {
                Logger.printLine("KanmiMQ", "Channel 0 Closed (Command)", "critical")
                start();
            });
            ch.prefetch(10);
            ch.assertQueue(MQWorkerCmd, { durable: true }, function(err, _ok) {
                if (closeOnErr(err)) return;
                ch.consume(MQWorkerCmd, processMsg, { noAck: true });
                Logger.printLine("KanmiMQ", "Channel 0 Worker Ready (Command)", "debug")
            });
            function processMsg(msg) {
                workCmd(msg, function(ok) {
                    try {
                        if (ok)
                            ch.ack(msg);
                        else
                            ch.reject(msg, true);
                    } catch (e) {
                        closeOnErr(e);
                    }
                });
            }
        });
    }
    function workCmd(msg, cb) {
        let MessageContents = JSON.parse(Buffer.from(msg.content).toString('utf-8'));
        if (MessageContents.hasOwnProperty('command')) {
            switch (MessageContents.command) {
                case 'RESET' :
                    console.log("================================ RESET SYSTEM ================================ ".bgRed);
                    cb(true)
                    process.exit(10);
                    break;
                case 'ESTOP':
                    console.log("================================ EMERGENCY STOP! ================================ ".bgRed);
                    cb(true)
                    process.exit(0);
                    break;
                default:
                    Logger.printLine("RemoteCommand", `Unknown Command: ${MessageContents.command}`, "debug");
                    cb(true)
            }
        }
    }

    function start() {
        amqp.connect(MQServer, function(err, conn) {
            if (err) {
                Logger.printLine("KanmiMQ", "Initialization Error", "critical", err)
                return setTimeout(start, 1000);
            }
            conn.on("error", function(err) {
                if (err.message !== "Connection closing") {
                    Logger.printLine("KanmiMQ", "Initialization Connection Error", "emergency", err)
                }
            });
            conn.on("close", function() {
                Logger.printLine("KanmiMQ", "Attempting to Reconnect...", "debug")
                return setTimeout(start, 1000);
            });
            Logger.printLine("KanmiMQ", `Connected to Kanmi Exchange as ${systemglobal.SystemName}!`, "info")
            amqpConn = conn;
            whenConnected();
        });
    }
    function closeOnErr(err) {
        if (!err) return false;
        Logger.printLine("KanmiMQ", "Connection Closed due to error", "error", err)
        amqpConn.close();
        return true;
    }
    function whenConnected() {
        startWorkerCmd();
    }

    app.use(express.json({limit: '20mb'}));
    app.use(express.urlencoded({extended : true, limit: '20mb'}));
    app.use(function(req, res, next) {
        res.header("Access-Control-Allow-Origin", "*"); // update to match the domain you will make the request from
        res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, User-Agent");
        next();
    });
    app.get('/', function (req, res, next) {
        res.status(200).send('<b>Kanmi Watchdog v1</b>')
    });
    app.get("/watchdog/ping", function(req, res, next) {
        if (req.query.id && req.query.entity && watchdogs.has(req.query.id) + '') {
            const _watchdog = watchdogs.get(req.query.id + '')
            if (_watchdog && watchdogsEntities.has( `${req.query.id}-${req.query.entity}`)) {
                watchdogsEntities.set(`${req.query.id}-${req.query.entity}`, new Date().getTime());
                res.status(200)
            } else {
                res.status(404).send('Entity not found');
            }
        } else if (req.query.entity) {
            res.status(404).send('ID Not Found')
        } else {
            res.status(404).send('ID Not Found or Missing Entity')
        }
    });
    app.get("/watchdog/init", function(req, res, next) {
        if (req.query.id && req.query.entity && watchdogs.has(req.query.id) + '') {
            const _watchdog = watchdogs.get(req.query.id + '')
            if (_watchdog && watchdogsEntities.has( `${req.query.id}-${req.query.entity}`)) {
                watchdogsReady.set(`${req.query.id}-${req.query.entity}`, new Date().getTime());
                Logger.printLine("StatusUpdate", `Entity ${req.query.entity}:${req.query.id} has initialized!`, "warning");
                res.status(200)
            } else {
                res.status(404).send('Entity not found');
            }
        } else if (req.query.entity) {
            res.status(404).send('ID Not Found')
        } else {
            res.status(404).send('ID Not Found or Missing Entity')
        }
    });
    app.get("/watchdog/get", function(req, res, next) {
        if (req.query.id && watchdogs.has(req.query.id) + '') {
            const _watchdog = watchdogs.get(req.query.id + '')
            if (_watchdog) {
                let _times = []
                _watchdog.entities.forEach(e => {
                    const _lastInit = watchdogsReady.get(`${req.query.id}-${e}`)
                    const _lastTime = watchdogsEntities.get(`${req.query.id}-${e}`)
                    _times.push({
                        id: e,
                        last_init: _lastInit,
                        last_check_in: _lastTime,
                        isLate:  (((new Date().getTime() - _lastTime) / 60000) >= 2),
                        isDead:  (((new Date().getTime() - _lastTime) / 60000) >= 5)
                    })
                })
                res.status(200).json({
                    id: req.query.id,
                    entities: _times
                });
            } else {
                res.status(404).send('Entity not found');
            }
        } else {
            res.status(404).send('ID Not Found or Missing Entity')
        }
    });

    function updateIndicators() {
        watchdogs.forEach(w => {
            const _ch = discordClient.getChannel(w.channel)
            if (_ch && _ch.name) {
                let statusText =  `${w.header} `;
                let timeStamps = '';
                w.entities.forEach(e => {
                    const _wS = watchdogsEntities.get(`${w.id}-${e}`);
                    const _iS = watchdogsReady.get(`${w.id}-${e}`);
                    const _tS = ((new Date().getTime() - _wS) / 60000).toFixed(2);
                    const _tI = ((new Date().getTime() - _iS) / 60000).toFixed(2);
                    timeStamps += `${_tS}:${_tI} `
                    if ( _tS >= 4.8) {
                        statusText += '🟥'
                        if ( !watchdogsDead.has(`${w.id}-${e}`) ) {
                            discordClient.createMessage(watchdogConfig.Discord_Alarm_Channel, `🔻 ALARM! Entity ${e}:${w.id} may be dead!`)
                                .catch(err => { mqClient.sendMessage(`Error sending message for alarm : ${err.message}`, "err", "StatusUpdate", err); })
                                .then(() => {
                                    watchdogsDead.set(`${w.id}-${e}`, true);
                                    Logger.printLine("StatusUpdate", `Entity ${e}:${w.id} may be dead! It's missed its checkin window!`, "error")
                                })
                        }
                    } else if ( !isNaN(_tI) && _tI <= 30 ) {
                        statusText += '🟨'
                        if ( !watchdogsDead.has(`${w.id}-${e}`) ) {
                            discordClient.createMessage(watchdogConfig.Discord_Warn_Channel, `🔺 WARNING! Entity ${e}:${w.id} has reset!`)
                                .catch(err => { mqClient.sendMessage(`Error sending message for alarm : ${err.message}`, "err", "StatusUpdate", err); })
                                .then(() => {
                                    watchdogsDead.set(`${w.id}-${e}`, true);
                                    Logger.printLine("StatusUpdate", `Entity ${e}:${w.id} has reset!`, "warning")
                                })
                        }
                    } else {
                        statusText += '🟩'
                        watchdogsDead.delete(`${w.id}-${e}`);
                    }
                })
                //console.log(`"${_ch.name}" <= "${statusText}" - ${timeStamps}`)
                if (_ch.name !== statusText) {
                    discordClient.editChannel(w.channel, { name: statusText}, "Status Update")
                        .catch(err => { mqClient.sendMessage(`Error updating "${w.channel}" status text : ${err.message}`, "err", "StatusUpdate", err); })
                }
            } else {
                Logger.printLine("StatusUpdate", `Unable to get status of channel ${w.channel}`, "error")
            }
        })
    }

    setInterval(updateIndicators, 60000);
    discordClient.on("ready", () => {
        Logger.printLine("Discord", "Connected successfully to Discord!", "debug");
        if (init === 0) {
            discordClient.editStatus( "online", {
                name: 'the datacenters',
                type: 3
            })
            init = 1;
        }
        updateIndicators();
        process.send('ready');
    });
    discordClient.on("error", (err) => {
        Logger.printLine("Discord", "Shard Error, Rebooting...", "error", err)
        console.log(`${err.message}`.bgRed)
        discordClient.connect()
    });

    discordClient.connect().catch((er) => { Logger.printLine("Discord", "Failed to connect to Discord", "emergency", er) });

    process.on('uncaughtException', function(err) {
        Logger.printLine("uncaughtException", err.message, "critical", err)
        console.log(err)
        setTimeout(function() {
            process.exit(1)
        }, 3000)
    });
}

runtime();