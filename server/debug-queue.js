const Bull = require('bull');
const Redis = require('ioredis');
require('dotenv').config();

// Test Bull queue with Upstash Redis
async function testBullQueue() {
  console.log('🔍 Testing Bull Queue with Upstash Redis...');
  
  // Redis configuration for Upstash
  const redisConfig = {
    port: Number(process.env.REDIS_PORT),
    host: process.env.REDIS_HOST,
    username: process.env.REDIS_USERNAME,
    password: process.env.REDIS_PASSWORD,
    tls: {},
    family: 4,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false,
    connectTimeout: 30000,
    commandTimeout: 10000,
  };

  console.log('📡 Redis Config:', {
    host: redisConfig.host,
    port: redisConfig.port,
    username: redisConfig.username ? '***' : 'none',
    password: redisConfig.password ? '***' : 'none',
  });

  // Test Redis connection first
  const redis = new Redis(redisConfig);
  
  redis.on('connect', () => console.log('✅ Redis connected'));
  redis.on('ready', () => console.log('✅ Redis ready'));
  redis.on('error', (err) => console.error('❌ Redis error:', err));
  redis.on('close', () => console.log('🔌 Redis connection closed'));

  try {
    await redis.ping();
    console.log('✅ Redis ping successful');
  } catch (error) {
    console.error('❌ Redis ping failed:', error);
    return;
  }

  // Create Bull queue
  const queue = new Bull('test-queue', {
    redis: redisConfig,
    settings: {
      stalledInterval: 30 * 1000,
      maxStalledCount: 3,
      retryProcessDelay: 5000,
    },
    defaultJobOptions: {
      removeOnComplete: 10,
      removeOnFail: 50,
      attempts: 3,
    },
  });

  // Set up event listeners
  queue.on('ready', () => console.log('✅ Queue ready'));
  queue.on('error', (error) => console.error('❌ Queue error:', error));
  queue.on('waiting', (jobId) => console.log('⏳ Job waiting:', jobId));
  queue.on('active', (job) => console.log('🚀 Job active:', job.id));
  queue.on('completed', (job) => console.log('✅ Job completed:', job.id));
  queue.on('failed', (job, err) => console.log('❌ Job failed:', job.id, err.message));
  queue.on('stalled', (job) => console.log('⚠️ Job stalled:', job.id));

  // Set up processor for specific job type
  console.log('🔧 Setting up processor...');
  queue.process('test-data', 1, async (job) => {
    console.log('🎯 Processing job:', job.id, 'Data:', job.data);
    
    // Simulate some work
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('✅ Job processing completed:', job.id);
    return { success: true, processedAt: new Date().toISOString() };
  });

  // Wait a bit for setup
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Add a test job
  console.log('➕ Adding test job...');
  const job = await queue.add('test-data', { 
    message: 'Hello from test job!',
    timestamp: new Date().toISOString()
  });
  
  console.log('✅ Job added with ID:', job.id);

  // Check queue status
  setTimeout(async () => {
    try {
      const [waiting, active, completed, failed, paused] = await Promise.all([
        queue.getWaiting(),
        queue.getActive(),
        queue.getCompleted(),
        queue.getFailed(),
        queue.isPaused(),
      ]);

      console.log('📊 Queue Status:', {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        paused,
      });

      if (paused) {
        console.log('🔄 Queue is paused, resuming...');
        await queue.resume();
      }

      // List waiting jobs
      if (waiting.length > 0) {
        console.log('⏳ Waiting jobs:', waiting.map(j => ({ id: j.id, data: j.data })));
      }

      // List active jobs
      if (active.length > 0) {
        console.log('🚀 Active jobs:', active.map(j => ({ id: j.id, data: j.data })));
      }

    } catch (error) {
      console.error('❌ Error checking queue status:', error);
    }
  }, 5000);

  // Keep the script running for a while
  setTimeout(() => {
    console.log('🏁 Test completed');
    process.exit(0);
  }, 15000);
}

testBullQueue().catch(console.error);