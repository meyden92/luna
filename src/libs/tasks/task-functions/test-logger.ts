import { throwIfAborted, waitFor } from '@/libs/ai-generation-utils';
import type { TaskFunction } from '@/types/tasks';

export const testLoggerTask: TaskFunction = async (...args) => {
  const { signal } = args[args.length - 1];
  const startTime = Date.now();
  const steps: string[] = [];

  console.log('🧪 Starting test logger task...');
  steps.push('Started test logger task');

  // Simulate some processing time
  await waitFor(1000, signal);

  console.log('📊 Generating random data...');
  const randomData = Math.floor(Math.random() * 1000);
  steps.push(`Generated random data: ${randomData}`);

  console.log('⏳ Simulating work...');

  // Simulate different types of work
  for (let i = 1; i <= 3; i++) {
    throwIfAborted(signal);
    console.log(`🔄 Processing step ${i} of 3...`);
    steps.push(`Completed processing step ${i}`);
    await waitFor(300, signal);
  }

  // Random chance of warning
  if (randomData > 800) {
    console.warn('⚠️ High random value detected, proceeding with caution');
    steps.push('Warning: High random value detected');
  }

  const processingTime = Date.now() - startTime;

  console.log(`✅ Test logger task completed successfully in ${processingTime}ms`);
  steps.push(`Task completed in ${processingTime}ms`);

  const summary = `Test logger task completed: processed ${randomData} with ${steps.length} steps`;

  return {
    summary,
    details: {
      steps,
      randomData,
      processingTime,
    },
  };
};
