'use strict';

const path = require('path');
const registriesDB = require('cas-server-registries-db');
const Registry = require(path.join(__dirname, 'lib', 'Registry'));

let db;
let registry;

module.exports.name = 'pgTicketRegistry';
module.exports.plugin = function(conf, context) {
  if (!db) {
    db = registriesDB(conf.db);
  }
  if (!registry) {
    registry = new Registry(db, conf, context.logger);
  }

  return registry;
};
