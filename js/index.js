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
const express = require("express");
const app = express();
const http = require('http').createServer(app).listen(7950, (systemglobal.interface) ? systemglobal.interface : "0.0.0.0");
const RateLimiter = require('limiter').RateLimiter;
const ping = require('ping');
let init = 0;
const bootTime = (Date.now().valueOf() / 1000).toFixed(0)
const storageHandler = require('node-persist');

const localParameters = storageHandler.create({
    dir: 'data/wd-state',
    stringify: JSON.stringify,
    parse: JSON.parse,
    encoding: 'utf8',
    logging: false,
    ttl: false,
    expiredInterval: 2 * 60 * 1000, // every 2 minutes the process will clean-up the expired cache
    forgiveParseErrors: false
});
localParameters.init((err) => {
    if (err) {
        Logger.printLine("LocalParameters", "Failed to initialize the Local parameters storage", "error", err)
    } else {
        Logger.printLine("LocalParameters", "Initialized successfully the Local parameters storage", "debug", err)
    }
});

const Logger = require('./utils/logSystem')(facilityName);

const startTime = new Date().getTime();
let activeRefresh = false;
let watchdogs = new Map();
let clusters = new Map();
let watchdogsEntities = new Map();
let clusterEntities = new Map();
let clusterActive = new Map();
let watchdogsReady = new Map();
let watchdogsDead = new Map();
let clusterReady = new Map();
let clusterDead = new Map();
let alarminhibited = false;

Logger.printLine("Discord", "Settings up Discord bot", "debug")
const discordClient = new eris.CommandClient(systemglobal.Discord_Key, {
    compress: true,
    restMode: true,
}, {
    name: "Shutaura Watchdog",
    description: "Log and Watchdog Framework",
    owner: "Yukimi Kazari",
    prefix: "!watchdog ",
    restMode: true,
});

discordClient.registerCommand("reset", function (msg,args) {
    w.watchdogs.forEach(e => { if (!watchdogsReady.has(`${w.id}-${e}`)) { watchdogsReady.set(`${w.id}-${e}`, new Date().getTime()); } })
    return "All Entities have been reset!"
},{
    argsRequired: true,
    caseInsensitive: true,
    description: "Reset Alarms",
    fullDescription: "Resets all active alarms and warnings",
    guildOnly: true
})
discordClient.registerCommand("inhibit", function (msg,args) {
    alarminhibited = (!alarminhibited);
    return `Alarms are ${((alarminhibited) ? 'disabled, dashboard will still update!' : 'enabled!')}`
},{
    argsRequired: false,
    caseInsensitive: false,
    description: "Inhibit All Alarms",
    fullDescription: "Disables all alarms and warnings",
    guildOnly: true
})
discordClient.registerCommand("status", async function (msg,args) {
    if (args.length > 0) {
        switch (args[0]) {
            case 'enable':
                updateStatus(undefined, true, msg.guildID, args[1].replace("<#", "").replace(">", ""));
                return `Added a insights display to <#${args[1].replace("<#", "").replace(">", "")}>`
            case 'disable':
                await localParameters.del(`statusgen-${msg.guildID}`)
                return "Disabled Insights Display for this guild, Please delete the message"
            default:
                return "Invalid Command"
        }
    } else {
        return `Missing command, use "help status"`
    }
}, {
    argsRequired: false,
    caseInsensitive: false,
    description: "Status Controls",
    fullDescription: "Enable/Disable Insights Display and Manage Stored Values\n" +
        "   **enable** - Add an insights display to this server\n      channel\n**disable** - Removes an insights display for this server\n      [system]",
    usage: "command [arguments]",
    guildOnly: true
})

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
            res.status(200).send('Pong');
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
            res.status(200).send('Ok')
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
app.get("/cluster/ping", function(req, res, next) {
    if (req.query.id && req.query.entity && clusters.has(req.query.id) + '') {
        const _cluster = clusters.get(req.query.id + '')
        let _active = clusterActive.get(req.query.id + '')
        if (!_active) {
            clusterActive.set(req.query.id + '', req.query.entity + '')
            localParameters.setItem('clusterActive-' + req.query.id + '', req.query.entity + '');
            _active = req.query.entity;
        }
        if (_cluster && clusterEntities.has( `${req.query.id}-${req.query.entity}`)) {
            clusterEntities.set(`${req.query.id}-${req.query.entity}`, new Date().getTime());
            res.status(200).json({
                active: (_active === req.query.entity)
            });
        } else {
            res.status(404).json({
                error: 'Entity not found'
            });
        }
    } else if (req.query.entity) {
        res.status(404).json({error: 'ID Not Found'})
    } else {
        res.status(404).json({error: 'ID Not Found or Missing Entity'})
    }
});
app.get("/cluster/init", function(req, res, next) {
    if (req.query.id && req.query.entity && clusters.has(req.query.id) + '') {
        const _cluster = clusters.get(req.query.id + '')
        let _active = clusterActive.get(req.query.id + '')
        if (!_active) {
            clusterActive.set(req.query.id + '', req.query.entity + '');
            localParameters.setItem('clusterActive-' + req.query.id + '', req.query.entity + '');
            _active = req.query.entity;
        }
        if (_cluster && clusterEntities.has( `${req.query.id}-${req.query.entity}`)) {
            clusterReady.set(`${req.query.id}-${req.query.entity}`, new Date().getTime());
            Logger.printLine("StatusUpdate", `Entity ${req.query.entity}:${req.query.id} has initialized!`, "warning");
            res.status(200).json({
                active: (_active === req.query.entity)
            });
        } else {
            res.status(404).json({
                error: 'Entity not found'
            });
        }
    } else if (req.query.entity) {
        res.status(404).json({error: 'ID Not Found'})
    } else {
        res.status(404).json({error: 'ID Not Found or Missing Entity'})
    }
});
app.get("/cluster/force", function(req, res, next) {
    if (req.query.id && req.query.entity && clusters.has(req.query.id) + '') {
        const _cluster = clusters.get(req.query.id + '')
        if (_cluster && clusterEntities.has( `${req.query.id}-${req.query.entity}`)) {
            clusterActive.set(req.query.id + '', req.query.entity + '');
            localParameters.setItem('clusterActive-' + req.query.id + '', req.query.entity + '');
            res.status(200).json({
                active: true,
                transition: "forced"
            });
        } else {
            res.status(404).json({
                error: 'Entity not found'
            });
        }
    } else if (req.query.entity) {
        res.status(404).json({error: 'ID Not Found'})
    } else {
        res.status(404).json({error: 'ID Not Found or Missing Entity'})
    }
});
app.get("/cluster/get", function(req, res, next) {
    if (req.query.id && clusters.has(req.query.id) + '') {
        const _cluster = clusters.get(req.query.id + '')
        let _active = clusterActive.get(req.query.id + '')
        if (_cluster) {
            let _times = []
            _cluster.entities.forEach(e => {
                const _lastInit = clusterReady.get(`${req.query.id}-${e}`)
                const _lastTime = clusterEntities.get(`${req.query.id}-${e}`)
                _times.push({
                    id: e.id,
                    name: e.name,
                    active: (_active === e.id),
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

async function updateIndicators() {
    let addUptimeWarning = false;
    let watchDogWarnings = [];
    let watchDogFaults = [];
    let watchDogEntites = [];
    let clusterEntites = [];
    await watchdogs.forEach(w => {
        let statusIcons =  ``;
        if (!addUptimeWarning && process.uptime() <= 15 * 60) {
            watchDogWarnings.push(`🔕 Watchdog system was reset <t:${bootTime}:R>!`)
            addUptimeWarning = true
        }
        w.entities.forEach(e => {
            if (e.startsWith("_")) {
                statusIcons += e.substring(1)
            }
            else {
                // Last Ping
                const _wS = watchdogsEntities.get(`${w.id}-${e}`);
                const _tS = ((new Date().getTime() - _wS) / 60000).toFixed(2);
                // Last Reset
                const _iS = watchdogsReady.get(`${w.id}-${e}`);
                const _tI = ((new Date().getTime() - _iS) / 60000).toFixed(2);
                if (_tS >= 4.8) {
                    statusIcons += '🟥'
                    if (!watchdogsDead.has(`${w.id}-${e}`)) {
                        if (!alarminhibited) {
                            discordClient.createMessage(watchdogConfig.Discord_Alarm_Channel, `🚨 ALARM! Entity ${e}:${w.id} may be dead!`)
                                .catch(err => {
                                    Logger.printLine("StatusUpdate", `Error sending message for alarm : ${err.message}`, "error", err)
                                })
                                .then(() => {
                                    watchdogsDead.set(`${w.id}-${e}`, true);
                                    Logger.printLine("StatusUpdate", `Entity ${e}:${w.id} may be dead! It's missed its checkin window!`, "error")
                                })
                        } else {
                            watchdogsDead.set(`${w.id}-${e}`, true);
                        }
                    }
                    watchDogFaults.push(`⁉️ Entity ${e}:${w.id} has not been online sense <t:${(_wS / 1000).toFixed(0)}:R>`)
                } else if (!isNaN(_tI) && _tI <= 30) {
                    statusIcons += '🟨'
                    if (!watchdogsDead.has(`${w.id}-${e}`)) {
                        if (!alarminhibited) {
                            discordClient.createMessage(watchdogConfig.Discord_Warn_Channel, `♻️ WARNING! Entity ${e}:${w.id} has reset!`)
                                .catch(err => {
                                    Logger.printLine("StatusUpdate", `Error sending message for alarm : ${err.message}`, "error", err)
                                })
                                .then(() => {
                                    watchdogsDead.set(`${w.id}-${e}`, true);
                                    Logger.printLine("StatusUpdate", `Entity ${e}:${w.id} has reset!`, "warning")
                                })
                        } else {
                            watchdogsDead.set(`${w.id}-${e}`, true);
                        }
                    }
                    watchDogWarnings.push(`♻️ Entity ${e}:${w.id} reset <t:${(_iS / 1000).toFixed(0)}:R>`)
                } else {
                    statusIcons += '🟩'
                    watchdogsDead.delete(`${w.id}-${e}`);
                }
            }
        })
        watchDogEntites.push(`${w.header}${w.name}: ${statusIcons}`);
    })
    await clusters.forEach(c => {
        let statusIcons =  ``;
        let activeNode = '🔎'
        let onlineNodes = 0;
        c.entities.forEach(ei => {
            const e = ei.id
            if (e.startsWith("_")) {
                statusIcons += e.substring(1)
            }
            else {
                // Last Ping
                const _wS = clusterEntities.get(`${c.id}-${e}`);
                const _tS = ((new Date().getTime() - _wS) / 60000).toFixed(2);
                // Last Reset
                const _iS = clusterReady.get(`${c.id}-${e}`);
                const _tI = ((new Date().getTime() - _iS) / 60000).toFixed(2);
                if (_tS >= (e.fail_time || 5)) {
                    statusIcons += '🟥'
                    if (!clusterDead.has(`${c.id}-${e}`)) {
                        if (clusterActive.has(c.id) && clusterActive.get(c.id) === e) {
                            if (!alarminhibited) {
                                discordClient.createMessage(watchdogConfig.Discord_Alarm_Channel, `📟 ${c.name} Cluster Node ${ei.name} is no longer the active system! Waiting for next system...`)
                                    .catch(err => {
                                        Logger.printLine("StatusUpdate", `Error sending message for alarm : ${err.message}`, "error", err)
                                    })
                                    .then(() => {
                                        clusterDead.set(`${c.id}-${e}`, true);
                                        Logger.printLine("StatusUpdate", `${c.name} Cluster Node ${ei.name}  was kicked from active role! It's missed its checkin window!`, "error")
                                    })
                            } else {
                                clusterDead.set(`${c.id}-${e}`, true);
                            }
                            clusterActive.set(c.id, false);
                            localParameters.removeItem('clusterActive-' + c.id);
                        } else {
                            clusterDead.set(`${c.id}-${e}`, true);
                        }
                    }
                    watchDogFaults.push(`⁉️ ${c.name} Cluster Node ${ei.name} has not been online sense <t:${(_wS / 1000).toFixed(0)}:R>`)
                } else if (_tS >= 3) {
                    statusIcons += '🟧'
                    if (clusterActive.has(c.id) && clusterActive.get(c.id) === e) {
                        activeNode = ei.name
                    }
                    watchDogWarnings.push(`⚠️ ${c.name} Cluster Node ${ei.name} has not been resonded sense <t:${(_wS / 1000).toFixed(0)}:R>`)
                } else if (!isNaN(_tI) && _tI <= 30) {
                    if (clusterActive.has(c.id) && clusterActive.get(c.id) === e) {
                        activeNode = ei.name
                        statusIcons += '🟦'
                    } else {
                        statusIcons += '🟨'
                    }
                    if (!clusterDead.has(`${c.id}-${e}`)) {
                        if (!alarminhibited && (clusterActive.has(c.id) && clusterActive.get(c.id) === e) ) {
                            discordClient.createMessage(watchdogConfig.Discord_Warn_Channel, `♻️ WARNING! ${c.name} Cluster Node ${ei.name} has reset!`)
                                .catch(err => {
                                    Logger.printLine("StatusUpdate", `Error sending message for alarm : ${err.message}`, "error", err)
                                })
                                .then(() => {
                                    clusterDead.set(`${c.id}-${e}`, true);
                                    Logger.printLine("StatusUpdate", `Cluster Node ${e}:${c.id} has reset!`, "warning")
                                })
                        } else {
                            clusterDead.set(`${c.id}-${e}`, true);
                        }
                    }

                    watchDogWarnings.push(`♻️ ${c.name} Cluster Node ${ei.name} reset <t:${(_iS / 1000).toFixed(0)}:R>`)
                    onlineNodes++;
                } else {
                    if (clusterActive.has(c.id) && clusterActive.get(c.id) === e) {
                        statusIcons += '✅'
                        activeNode = ei.name
                    } else {
                        statusIcons += '🟩'
                    }
                    clusterDead.delete(`${c.id}-${e}`);
                    onlineNodes++;
                }
            }
        })
        if (activeNode === '🔎') {
            watchDogFaults.push(`🔎 Cluster ${c.name} is searching for a new node...`)
        }
        if (onlineNodes <= 1) {
            watchDogWarnings.push(`🛟 Cluster ${c.name} has no redundant nodes!`)
        } else if (onlineNodes === 0) {
            watchDogFaults.push(`🚧 Cluster ${c.name} has no active nodes!`)
        }
        clusterEntites.push(`${c.header}${c.name} [**${activeNode}**]: ${statusIcons}`);
    })
    let pingResults = [];
    if (watchdogConfig.Ping_Hosts) {
        await Array.from(watchdogConfig.Ping_Hosts).reduce((promiseChain, host) => {
            return promiseChain.then(() => new Promise(async (ok) => {
                let res = await ping.promise.probe(host.ip, {
                    timeout: host.timeout || 5,
                    extra: ['-i', '3'],
                });
                const _wS = watchdogsDead.get(`ping-${host.ip}`);
                if (parseFloat(res.packetLoss) === 100) {
                    pingResults.push(`🟥 ${host.name}`);
                    if (!watchdogsDead.has(`ping-${host.ip}`)) {
                        if (!host.no_notify_on_fail && !alarminhibited) {
                            discordClient.createMessage(watchdogConfig.Discord_Alarm_Channel, `🚨 ${host.name} is not responding!`)
                                .catch(err => {
                                    Logger.printLine("StatusUpdate", `Error sending message for alarm : ${err.message}`, "error", err)
                                })
                                .then(() => {
                                    watchdogsDead.set(`ping-${host.ip}`, new Date().getTime());
                                    Logger.printLine("StatusUpdate", `🚨 ${host.name} is not responding!`, "error")
                                })
                        } else {
                            watchdogsDead.set(`ping-${host.ip}`, new Date().getTime());
                        }
                    }
                    watchDogFaults.push(`⁉️ ${host.name} has not responded sense <t:${((_wS || new Date().getTime()) / 1000).toFixed(0)}:R>`)
                } else if (parseFloat(res.packetLoss) > 0) {
                    pingResults.push(`🟨 ${host.name}`);
                    watchDogWarnings.push(`⚠️ ${host.name} has a unstable link!`)
                } else {
                    pingResults.push(`🟩 ${host.name}`);
                    if (watchdogsDead.has(`ping-${host.ip}`)) {
                        if (!host.no_notify_on_success && !alarminhibited) {
                            discordClient.createMessage(watchdogConfig.Discord_Notify_Channel, `🎉 ${host.name} is responding now!`)
                                .catch(err => {
                                    Logger.printLine("StatusUpdate", `Error sending message for alarm : ${err.message}`, "error", err)
                                })
                                .then(() => {
                                    watchdogsDead.delete(`ping-${host.ip}`);
                                    Logger.printLine("StatusUpdate", `🚨 ${host.name} is not responding!`, "error")
                                })
                        }
                    }
                    watchdogsDead.delete(`ping-${host.ip}`);
                }
                ok();
            }))
        }, Promise.resolve());
    }
    localParameters.keys().then((localKeys) => {
        discordClient.getRESTGuilds()
            .then(function (guilds) {
                guilds.forEach(function (guild) {
                    if (localKeys.indexOf("statusgen-" + guild.id) !== -1 ) {
                        updateStatus({
                            status: watchDogEntites,
                            cluster: clusterEntites,
                            pings: pingResults,
                            warnings: watchDogWarnings,
                            faults: watchDogFaults
                        }, true, guild.id)
                    }
                })
            })
    });}
function registerEntities() {
    watchdogConfig.Discord_Status.forEach(w => {
        watchdogs.set(w.id, {
            id: w.id,
            name: w.name,
            channel: w.channel,
            type: w.type,
            header: w.header,
            entities: w.watchdogs
        });
        w.watchdogs.forEach(e => { watchdogsEntities.set(`${w.id}-${e}`, startTime); });
        console.log('Registered Entities')
    })
    if (watchdogConfig.Cluster_Groups) {
        watchdogConfig.Cluster_Groups.forEach(async c => {
            clusters.set(c.id, {
                id: c.id,
                name: c.name,
                channel: c.channel,
                type: c.type,
                header: c.header,
                entities: c.systems
            })
            const clusterActiveNode = await localParameters.getItem('clusterActive-' + c.id)
            if (clusterActiveNode) {
                clusterActive.set(c.id, clusterActiveNode)
            } else {
                clusterActive.set(c.id, c.systems[0].id)
                localParameters.setItem('clusterActive-' + c.id, c.systems[0].id)
            }

            c.systems.forEach(e => {
                clusterEntities.set(`${c.id}-${e.id}`, startTime);
            });
            console.log('Registered Clusters')
        })
    }
}
async function updateStatus(input, forceUpdate, guildID, channelID) {
    if (!activeRefresh) {
        activeRefresh = true;
        let data
        try {
            data = await localParameters.getItem('statusgen-' + guildID)
        } catch (e) {
            console.error("Failed to get guild local parameters")
        }
        let channel;
        if (channelID) {
            channel = channelID
        } else if (data && data.channel) {
            channel = data.channel
        } else {
            return false;
        }
        let embed = {
            "footer": {
                "text": `Watchdog Status`,
                "icon_url": discordClient.guilds.get(guildID).iconURL
            },
            "timestamp": (new Date().toISOString()) + "",
            "color": 65366,
            "thumbnail": {
                "url": null
            },
            "fields": [

            ]
        }
        if (systemglobal.embed_icon) {
            embed.thumbnail = {
                "url": systemglobal.embed_icon
            }
        } else {
            delete embed.thumbnail;
        }

        let warnings = []
        let faults = []
        if (input && input.warnings.length > 0)
            warnings = input.warnings;
        if (input && input.faults.length > 0)
            faults = input.faults;
        if (alarminhibited)
            warnings.push('⚠️ Alarms are inhibited! Please re-enable!');

        if (warnings.length > 0) {
            embed.color = 16771840
            embed.fields.unshift({
                "name": `⚠️ Active Warnings`,
                "value": warnings.join('\n').substring(0, 1024)
            })
        }
        if (faults.length > 0) {
            embed.color = 16711680
            embed.fields.unshift({
                "name": `⛔ Active Alarms`,
                "value": faults.join('\n').substring(0, 1024)
            })
        }

        if (input && input.cluster.length > 0) {
            embed.fields.push({
                "name": `⚙️ Service Cluster`,
                "value": `${input.cluster.join('\n')}`.substring(0, 1024)
            })
        }
        if (input && input.status.length > 0) {
            embed.fields.push({
                "name": `🚥 Service Watchdog`,
                "value": `${input.status.join('\n')}`.substring(0, 1024)
            })
        }
        if (input && input.pings.length > 0) {
            embed.fields.push({
                "name": `📡 Link Status`,
                "value": `${input.pings.join('\n')}`.substring(0, 1024)
            })
        }

        if (!input) {
            embed.color = 16711680
            embed.fields.unshift({
                "name": `⛔ Active Alarms`,
                "value": `Waiting for initialization!`
            })
        }

        if (data && data.message && !channelID) {
            discordClient.editMessage(channel, data.message, {
                embed
            })
                .then(msg => {
                    localParameters.setItem('statusgen-' + guildID, {
                        channel: msg.channel.id,
                        message: msg.id,
                    })
                })
                .catch(e => {
                    console.error(e)
                });
        } else {
            console.log(embed)
            discordClient.createMessage(channel, {
                embed
            })
                .then(async msg => {
                    await localParameters.setItem('statusgen-' + guildID, {
                        channel: msg.channel.id,
                        message: msg.id,
                    })
                })
                .catch(e => {
                    console.error(e)
                });
        }
        activeRefresh = false;
    }
}

registerEntities();
setTimeout(() => {
    watchdogConfig.Discord_Status.forEach(w => {
        w.watchdogs.forEach(e => { if (!watchdogsReady.has(`${w.id}-${e}`)) { watchdogsReady.set(`${w.id}-${e}`, startTime); } });
        console.log('Registered Ready Entities')
    })
}, 30.1 * 60000)
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
