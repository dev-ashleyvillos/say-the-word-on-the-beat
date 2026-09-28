#!/usr/bin/env node
/**
 * One-time migration: flip every existing Share to isPublic: true.
 *
 * There's no login yet, so "private" just meant "harder to find" — everything
 * is public for now until Firebase/Auth0 accounts land and a real private
 * library becomes possible again. New shares are already forced public at
 * creation time (server/src/routes/shares.js); this catches shares that
 * existed before that change.
 *
 * Usage (inside the api container): node migrate-shares-public.cjs
 */

const mongoose = require('mongoose')
const Share = require('./src/models/Share')

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://mongo:27017/saytheword')

  const result = await Share.updateMany(
    { isPublic: { $ne: true } },
    { $set: { isPublic: true } }
  )

  await mongoose.disconnect()

  console.log(`Matched ${result.matchedCount}, updated ${result.modifiedCount} shares to isPublic: true`)
}

main().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
