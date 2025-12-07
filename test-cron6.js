const cronParser = require('cron-parser');

console.log('Using default (CronExpressionParser)...');
try {
  const parser = cronParser.default || cronParser.CronExpressionParser;
  
  console.log('Parser:', parser.name);
  console.log('Parser.parse:', typeof parser.parse);
  
  // Try calling parse as a static method
  const interval = parser.parse('0 9 * * MON-FRI', {
    currentDate: new Date(),
    tz: 'UTC'
  });
  
  console.log('SUCCESS!');
  console.log('Interval type:', interval.constructor.name);
  console.log('Next:', interval.next().toDate());
  console.log('Prev:', interval.prev().toDate());
  
} catch (e) {
  console.log('Failed:', e.message);
  console.log('Stack:', e.stack);
}
