#!/usr/bin/env node
/**
 * One-time backfill: existing shares were created before preview.totalItems
 * existed (the dashboard card's tile-count badge needs it), so it's missing
 * from their stored preview. Copies config.content.length into
 * preview.totalItems for every share missing it.
 *
 * Usage (inside the api container): node migrate-preview-total-items.cjs
 */

const mongoose = require('mongoose')
const Share = require('./src/models/Share')

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://mongo:27017/saytheword')

  const shares = await Share.find({ 'preview.totalItems': { $exists: false } })

  let updated = 0
  for (const share of shares) {
    const items = share.config?.content || share.config?.images || []
    share.preview.totalItems = items.length
    await share.save()
    updated++
  }

  await mongoose.disconnect()

  console.log(`Backfilled preview.totalItems on ${updated} of ${shares.length} shares`)
}

main().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
