# Bull.js Queue Fixes for Upstash Redis

## Issues Identified and Fixed

### 1. **Redis Configuration Issues**
**Problem**: Conflicting Redis settings that don't work well with Upstash Redis.

**Fixes Applied**:
- Removed `keepAlive`, `retryDelayOnFailover` settings that can cause issues with Upstash
- Set `lazyConnect: false` for immediate connection
- Increased `connectTimeout` to 30 seconds for better reliability
- Simplified Redis configuration to essential settings only

### 2. **Queue Initialization Timing**
**Problem**: Processor setup happening before queue is fully ready.

**Fixes Applied**:
- Added queue 'ready' event listener to ensure processor setup after queue is ready
- Added duplicate prevention for processor setup
- Added immediate processor setup attempt with fallback to ready event
- Added queue resume call after processor setup

### 3. **Job Processing Configuration**
**Problem**: Overly aggressive stalled job detection and poor retry configuration.

**Fixes Applied**:
- Reduced `stalledInterval` from 5 minutes to 30 seconds
- Increased `maxStalledCount` from 1 to 3
- Added `attempts: 3` to job options for retry capability
- Changed `removeOnComplete` from `true` to `10` (keep last 10 jobs)
- Changed `removeOnFail` from `false` to `50` (keep last 50 failed jobs)

### 4. **Enhanced Debugging and Monitoring**
**Additions**:
- Added `debugQueueStatus()` method for comprehensive queue inspection
- Enhanced logging with emojis and better context
- Added processor setup validation in `addTrademarkJob`
- Added automatic queue status debugging after job addition

## Key Configuration Changes

### Before:
```javascript
// Problematic Redis config
const redisConfig = {
  // ... other settings
  keepAlive: 300000,
  lazyConnect: true,
  connectTimeout: 10000,
  commandTimeout: 5000,
  retryDelayOnFailover: 100,
};

// Problematic queue settings
settings: {
  stalledInterval: 5 * 60 * 1000, // 5 minutes
  maxStalledCount: 1,
  retryProcessDelay: 10000,
},
defaultJobOptions: {
  removeOnComplete: true,
  removeOnFail: false,
}
```

### After:
```javascript
// Fixed Redis config
const redisConfig = {
  // ... other settings
  lazyConnect: false, // Immediate connection
  connectTimeout: 30000, // Increased timeout
  commandTimeout: 10000,
  maxRetriesPerRequest: null, // Required for Upstash
  enableReadyCheck: false, // Required for Upstash
};

// Fixed queue settings
settings: {
  stalledInterval: 30 * 1000, // 30 seconds
  maxStalledCount: 3,
  retryProcessDelay: 5000,
},
defaultJobOptions: {
  removeOnComplete: 10, // Keep last 10
  removeOnFail: 50, // Keep last 50
  attempts: 3, // Allow retries
}
```

## Testing the Fixes

### 1. Run the Debug Script
```bash
cd server
node debug-queue.js
```

This will test the Bull queue configuration in isolation and help identify any remaining issues.

### 2. Check Your Application Logs
Look for these new log messages:
- `✅ Job processor registered successfully`
- `🚀 PROCESSING JOB STARTED`
- `✅ JOB COMPLETED SUCCESSFULLY`
- `🔍 Queue Status Debug`

### 3. Monitor Queue Status
The application now automatically logs queue status after adding jobs. Look for:
```
🔍 Queue Status Debug {
  isProcessorSetup: true,
  isPaused: false,
  counts: { waiting: 0, active: 1, completed: 0, failed: 0 }
}
```

## Common Issues and Solutions

### Issue: Jobs still stuck in "waiting"
**Check**:
1. Is `isProcessorSetup: true` in the logs?
2. Is `isPaused: false` in the queue status?
3. Are there any Redis connection errors?

**Solutions**:
1. Restart the application to reinitialize the queue
2. Check Redis connectivity with the debug script
3. Verify environment variables are correct

### Issue: "subscriber mode" errors
**Cause**: Reusing Redis client instances between Bull and application code.
**Solution**: The fixes ensure Bull creates its own Redis connections.

### Issue: Jobs processing but not updating status
**Check**: MongoDB connection and job status update methods.
**Solution**: Check the `handleJobCompleted` and `handleJobFailed` methods.

## Environment Variables Required
```env
REDIS_HOST=your-upstash-host
REDIS_PORT=your-upstash-port
REDIS_USERNAME=your-upstash-username
REDIS_PASSWORD=your-upstash-password
```

## Next Steps

1. **Test the debug script** to verify Bull queue works in isolation
2. **Restart your application** to apply the fixes
3. **Add a test job** and monitor the logs for the new debug output
4. **Check queue status** using the new debugging information

If jobs are still not processing after these fixes, the issue is likely:
1. Network connectivity to Upstash Redis
2. Incorrect environment variables
3. Upstash Redis plan limitations (check concurrent connections)

## Additional Debugging

If issues persist, you can call the debug method manually:
```javascript
const jobQueue = JobQueueService.getInstance();
await jobQueue.debugQueueStatus();
```

This will provide detailed information about the queue state and help identify the root cause.