'use strict';

const os = require('os');
const path = require('path');
const async = require(path.join(__dirname, 'async'));

const tooManyResults = new Error('Too many results.');
const tooFewResults = new Error('No results found.');

let log;

function Registry(db, options, $log) {
  let opts = (options && options.hasOwnProperty('tickets')) ?
    options.tickets : {
      loginTicketTTL: 5000,
      ticketGrantingTicketTTL: 15000,
      serviceTicketTTL: 5000
    };

  this.loginTicketTTL = opts.loginTicketTTL;
  this.ticketGrantingTicketTTL = opts.ticketGrantingTicketTTL;
  this.serviceTicketTTL = opts.serviceTicketTTL;

  this.db = db;
  log = $log;
}

Registry.prototype.genLT = function genLT(expires) {
  const LT = this.db.models.LoginTicket;
  const _expires = (expires) ?
    expires : new Date(Date.now() + this.loginTicketTTL);

  function* generator() {
    log.debug('generating st');
    let lt = new LT(_expires);
    try {
      lt = yield LT.query().insert(lt);
    } catch (e) {
      log.error('could not insert lt: %s', lt.tid);
      log.debug('message: %s', e.message);
      log.debug('detail: %s', e.detail);
      throw e;
    }

    log.debug('generated lt: %s', lt.tid);
    return lt;
  }

  return async(generator.bind(this));
};

Registry.prototype.genTGT = function genTGT(loginTicketId, userId, expires) {
  const LT = this.db.models.LoginTicket;
  const TGT = this.db.models.TicketGrantingTicket;

  function* generator() {
    log.debug('generating tgt for lt: %s', loginTicketId);
    let tickets;
    try {
      log.debug('getting lts with id: %s', loginTicketId);
      tickets = yield LT.query().where({tid: loginTicketId});
      log.debug('found lt count: %s', tickets.length);
      if (tickets.length > 1) {
        log.error('found too many login tickets for: %s', loginTicketId);
        throw tooManyResults;
      } else if (tickets.length < 1) {
        log.error('login ticket not found: %s', loginTicketId);
        throw tooFewResults;
      }
    } catch (e) {
      log.error('could not query for login tickets');
      log.debug('message: %s', e.message);
      log.debug('detail: %s', e.detail);
      throw e;
    }

    const lt = tickets[0];
    log.debug('verifying lt: %s', lt.tid);
    if (lt.expires < new Date()) {
      log.debug('could not generate tgt, lt expired: %s', lt.tid);
      throw new Error(`LT for ${userId} expired`);
    }

    const _expires = (expires) ?
      expires : new Date(Date.now() + this.ticketGrantingTicketTTL);
    let tgt = new TGT(userId, _expires);
    tgt.lt_id = lt.id;

    try {
      tgt = TGT.query().insert(tgt);
    } catch (e) {
      log.error('could not generate tgt, could not save tgt: %s', tgt.tid);
      log.debug('message: %s', e.message);
      log.debug('detail: %s', e.detail);
      throw e;
    }

    log.debug('generated tgt: %s', tgt.tid);
    return tgt;
  }

  return async(generator.bind(this));
};

Registry.prototype.genST = function genST(ticketGrantingTicketId, expires) {
  const TGT = this.db.models.TicketGrantingTicket;
  const ST = this.db.models.ServiceTicket;

  function* generator() {
    log.debug('generating st');
    let tickets;
    try {
      log.debug('finding tgts with id: %s', ticketGrantingTicketId);
      tickets = yield TGT.query().where({tid: ticketGrantingTicketId});
      if (tickets.length < 1) {
        log.error('could not find tgt: %s', ticketGrantingTicketId);
        throw tooFewResults;
      } else if (tickets.length > 1) {
        log.error('found too many tgt for: %s', ticketGrantingTicketId);
        throw tooManyResults;
      }
    } catch (e) {
      log.error('could not query for tgts');
      log.debug('message: %s', e.message);
      log.debug('detail: %s', e.detail);
      throw e;
    }

    let tgt = tickets[0];
    log.debug('verifying tgt: %s', tgt.tid);
    if (tgt.expires < new Date()) {
      log.error('could not generate st, tgt expired: %s', tgt.tid);
      throw new Error(`TGT for ${tgt.tid} expired.`);
    }

    const _expires = (expires) ?
      expires : new Date(Date.now() + this.serviceTicketTTL);
    let st = new ST(tgt.id, _expires);
    try {
      st = yield ST.query().insert(st);
    } catch (e) {
      log.error('could not generate st, could not save st: %s', st.tid);
      log.debug('message: %s', e.message);
      log.debug('detail: %s', e.detail);
      throw e;
    }

    log.debug('generated st: %s', st.tid);
    return st;
  }

  return async(generator.bind(this));
};

function invalidateTicket(type, id) {
  const DB = this.db.models[type];

  function* generator() {
    log.debug('invalidating ticket: (%s, %s)', type, id);
    let ticket;
    try {
      log.debug('retrieving ticket: (%s, %s)', type, id);
      ticket = yield DB.query().first({tid: id});
      log.debug('got ticket: (%s, %s)', type, ticket.tid);
    } catch (e) {
      log.error('could not find %s: %s', type, id);
      log.debug('message: %s', e.message);
      log.debug('detail: %s', e.detail);
      throw e;
    }

    ticket.valid = false;
    ticket.markDirty();
    try {
      ticket = yield DB.query().updateAndFetchById(ticket.id, ticket);
      log.debug('invalidated ticket: (%s, %s)', type, ticket.tid);
    } catch (e) {
      log.error('could not update %s: %s', type, id);
      log.debug('message: %s', e.message);
      log.debug('detail: %s', e.detail);
      throw e;
    }

    return ticket;
  }

  return async(generator.bind(this));
}

Registry.prototype.invalidateLT = function invalidateLT(id) {
  log.debug('invalidating lt: %s', id);
  return invalidateTicket.call(this, 'LoginTicket', id);
};

Registry.prototype.invalidateTGT = function invalidateTGT(id) {
  log.debug('invalidating tgt: %s', id);
  return invalidateTicket.call(this, 'TicketGrantingTicket', id);
};

Registry.prototype.invalidateST = function invalidateST(id) {
  log.debug('invalidating st: %s', id);
  return invalidateTicket.call(this, 'ServiceTicket', id);
};

Registry.prototype.close = function close() {
  return this.db.knex.destroy();
};

function getTicket(type, id) {
  const DB = this.db.models[type];

  function* generator() {
    let tickets;
    try {
      tickets = yield DB.query().where({tid: id});
      if (tickets.length < 1) {
        log.error('no %s found: %s', type, id);
        throw tooFewResults;
      } else if (tickets.length > 1) {
        log.error('too many %ss found: %s', type, id);
        throw tooManyResults;
      }
    } catch (e) {
      log.error('could not query %ss for: %s', type, id);
      log.debug('message: %s', e.message);
      log.debug('detail: %s', e.detail);
      throw e;
    }

    return tickets[0];
  }

  return async(generator.bind(this));
}

Registry.prototype.getLT = function getLT(id) {
  log.debug('retrieving lt: %s', id);
  return getTicket.call(this, 'LoginTicket', id);
};

Registry.prototype.getTGT = function getTGT(id) {
  log.debug('retrieving tgt: %s', id);
  return getTicket.call(this, 'TicketGrantingTicket', id);
};

Registry.prototype.getST = function getST(id) {
  log.debug('retrieving st: %s', id);
  return getTicket.call(this, 'ServiceTicket', id);
};

Registry.prototype.getTGTbyST = function getTGTbyST(id) {
  const TGT = this.db.models.TicketGrantingTicket;
  const ST = this.db.models.ServiceTicket;

  function* generator() {
    log.debug('getting tgt by st: %s', id);
    let st;
    try {
      st = yield this.getST(id);
    } catch (e) {
      log.error('could not find st: %s', id);
      log.debug('message: %s', e.message);
      log.debug('detail: %s', e.detail);
      throw e;
    }

    let tgts;
    try {
      tgts = yield st.$relatedQuery('ticketGrantingTicket');

      if (tgts.length < 1) {
        log.error('could not find tgt for st: %s', id);
        throw tooFewResults;
      } else if (tgts.length > 1) {
        log.error('found too many tgts for st: %s', id);
        throw tooManyResults;
      }
    } catch (e) {
      log.debug('message: %s', e.message);
      log.debug('detail: %s', e.detail);
      throw e;
    }

    log.debug('got tgt: %s', tgts[0].tid);
    return tgts[0];
  }

  return async(generator.bind(this));
};

Registry.prototype.trackServiceLogin = function tsl(st, tgt, serviceUrl) {
  const TGT = this.db.models.TicketGrantingTicket;

  function* generator() {
    log.debug('tracking service login: (%s, %s)', st.tid, tgt.tid);
    const logoutServices = tgt.extra || [];
    if (logoutServices.filter(s => s.logoutUrl === serviceUrl).length === 0) {
      logoutServices.push({
        service: st.serviceId,
        logoutUrl: serviceUrl
      });
    }
    tgt.extra = logoutServices;
    log.debug('tgt serviceIds: %j', tgt.extra);

    try {
      log.debug('registering service "%s" with tgt: %s', st.serviceId, tgt.tid);
      tgt.markDirty();
      yield TGT.query().patch({extra: logoutServices}).where('tid', tgt.tid);
      log.debug('service login tracked: (%s, %s)', st.tid, tgt.tid);
    } catch (e) {
      log.debug('message: %s', e.message);
      log.debug('detail: %s', e.detail);
      // We don't really care about the error. This is just so that
      // we can send logout messages later.
    }
  }

  return async(generator.bind(this));
};

module.exports = Registry;
