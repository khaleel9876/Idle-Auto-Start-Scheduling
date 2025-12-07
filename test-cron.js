const cronParser = require('cron-parser');

console.log('Module:', cronParser);
console.log('Keys:', Object.keys(cronParser));

// Try different approaches
try {
  const interval1 = cronParser.parseExpression('0 9 * * MON-FRI');
  console.log('Method 1 works:', interval1.next().toString());
} catch (e) {
  console.log('Method 1 failed:', e.message);
}

try {
  const CronExpression = cronParser.CronExpression;
  const interval2 = CronExpression.parse('0 9 * * MON-FRI');
  console.log('Method 2 works:', interval2.next().toString());
} catch (e) {
  console.log('Method 2 failed:', e.message);
}

try {
  const parser = new cronParser.CronExpressionParser('0 9 * * MON-FRI');
  console.log('Method 3 works:', parser);
} catch (e) {
  console.log('Method 3 failed:', e.message);
}
