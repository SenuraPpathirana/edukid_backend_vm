const bcrypt = require('bcrypt');

exports.hash = (str) => bcrypt.hash(str, 10);
exports.compare = (str, hash) => bcrypt.compare(str, hash);


