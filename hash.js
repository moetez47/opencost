const bcrypt = require('bcryptjs');
bcrypt.hash('TestAdmin123!', 10).then(h => console.log(h)).catch(e => console.error(e));