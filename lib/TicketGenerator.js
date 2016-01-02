'use strict';

const crypto = require('crypto');

module.exports = function() {
  const bytes = crypto.randomBytes(32);
  const hash = new crypto.Hash('sha1');
  hash.write(bytes);
  hash.end();

  return hash.read().toString('hex');
};
