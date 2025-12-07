const cronParser = require('cron-parser');

try {
  const parser = new cronParser.CronExpressionParser('0 9 * * MON-FRI', {
    currentDate: new Date(),
    tz: 'UTC'
  });
  
  console.log('Parser created:', parser);
  console.log('Parser methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(parser)));
  
  // Try to get next/prev
  const next = parser.next();
  console.log('Next run:', next);
  
} catch (e) {
  console.log('Error:', e.message);
  console.log('Stack:', e.stack);
}
