'use strict';

const path = require('path');
const registriesDB = require('cas-server-registries-db');
const Registry = require(path.join(__dirname, 'lib', 'Registry'));

let db;
let registry;

module.exports.name = 'pgTicketRegistry';
module.exports.plugin = function(conf, context) {
  if (!db) {
    db = registriesDB(context.dataSources.knex);
  }
  if (!registry) {
    registry = new Registry(db, context.ticketLifetimes, context.logger);
  }

  return registry;
};
