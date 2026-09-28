#!/usr/bin/env node
/**
 * One-time backfill: existing shares were created before preview.sequential
 * existed, so the new "Fixed Order" dashboard filter can't see them even
 * though their config.sequential is already true. Copies config.sequential
 * into preview.sequential for every share missing it.
 *
 * Usage (inside the api container): node migrate-preview-sequential.cjs
 */

const mongoose = require('mongoose')
const Share = require('./src/models/Share')

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://mongo:27017/saytheword')

  const shares = await Share.find({ 'preview.sequential': { $exists: false } })

  let updated = 0
  for (const share of shares) {
    share.preview.sequential = !!share.config?.sequential
    await share.save()
    updated++
  }

  await mongoose.disconnect()

  console.log(`Backfilled preview.sequential on ${updated} of ${shares.length} shares`)
}

main().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
