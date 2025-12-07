const cronParser = require('cron-parser');

console.log('Trying static method parseExpression...');
try {
  // Check if parseExpression is a static method
  const interval = cronParser.parseExpression('0 9 * * MON-FRI');
  console.log('SUCCESS! interval:', interval);
  console.log('interval methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(interval)));
  console.log('Next:', interval.next().toDate());
  console.log('Prev:', interval.prev().toDate());
} catch (e) {
  console.log('Failed:', e.message);
}

console.log('\nChecking if it exists on CronExpression...');
try {
  const CronExpression = cronParser.CronExpression;
  console.log('CronExpression type:', typeof CronExpression);
  console.log('CronExpression.parseExpression:', typeof CronExpression.parseExpression);
  
  if (typeof CronExpression === 'function') {
    console.log('CronExpression prototype methods:', Object.getOwnPropertyNames(CronExpression.prototype));
    console.log('CronExpression static methods:', Object.getOwnPropertyNames(CronExpression));
  }
} catch (e) {
  console.log('Error:', e.message);
}

console.log('\nLet me check the package structure...');
const fs = require('fs');
const packageJson = fs.readFileSync('./node_modules/cron-parser/package.json', 'utf8');
const pkg = JSON.parse(packageJson);
console.log('Main file:', pkg.main);
console.log('Exports:', pkg.exports);
