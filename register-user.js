// Quick helper to add a user to known-users.json
const fs = require('fs');
const addr = process.argv[2];
if (!addr) { console.log('Usage: node register-user.js 0xAddress'); process.exit(1); }
const file = './known-users.json';
let users = [];
try { users = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
if (!users.includes(addr.toLowerCase())) {
  users.push(addr.toLowerCase());
  fs.writeFileSync(file, JSON.stringify(users));
  console.log('Added:', addr);
} else {
  console.log('Already registered:', addr);
}
