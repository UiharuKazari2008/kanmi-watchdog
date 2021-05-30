const systemglobal = require('../../config.json');

const os = require('os');
const mysql = require('mysql');
const sqlConnection = mysql.createPool({
    host: systemglobal.SQLServer,
    user: systemglobal.SQLUsername,
    password: systemglobal.SQLPassword,
    database: systemglobal.SQLDatabase,
    charset : 'utf8mb4',
    collation : 'utf8mb4_0900_ai_ci',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});


module.exports = function (facility, options) {
    let module = {};

    const Logger = require('./logSystem')(facility);
    module.simple = function (sql_q, callback) {
        sqlConnection.query(sql_q, function (err, rows) {
            //here we return the results of the query
            callback(err, rows);
        });
    }
    module.safe = function (sql_q, inputs, callback) {
        sqlConnection.query(mysql.format(sql_q, inputs), function (err, rows) {
            callback(err, rows);
        });
    }

    process.on('uncaughtException', function(err) {
        Logger.printLine("uncaughtException", err.message, "critical", err);
        process.exit(1);
    });

    return module;
}

