const cronParser = require('cron-parser');

console.log('Trying to instantiate CronExpression...');
try {
  const CronExpression = cronParser.CronExpression;
  
  // Try direct instantiation
  const interval = new CronExpression('0 9 * * MON-FRI', {
    currentDate: new Date(),
    tz: 'UTC'
  });
  
  console.log('SUCCESS! Created interval');
  console.log('Next:', interval.next().toDate());
  console.log('Prev:', interval.prev().toDate());
  
} catch (e) {
  console.log('Failed:', e.message, e.stack);
}
