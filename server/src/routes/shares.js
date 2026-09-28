const express = require('express');
const { v4: uuidv4 } = require('uuid');
const Share = require('../models/Share');
const Session = require('../models/Session');
const { sessionMiddleware, requireSession } = require('../middleware/session');
const { 
  shareCreationLimiter, 
  likeLimiter,
  honeypotValidator,
  timingValidator,
  updateSessionShareTime
} = require('../middleware/rateLimit');

const router = express.Router();

// Minimum time between share creations per session (60 seconds)
const SHARE_COOLDOWN_MS = 60 * 1000;

router.use(sessionMiddleware);

// Helper function to extract preview data from config
function extractPreview(config) {
  const allItems = config.content || config.images || [];
  const contentItems = allItems
    .slice(0, 4)
    .map(item => {
      if (typeof item === 'string') {
        return { content: item, type: 'image' };
      }
      if (item.url) {
        return { content: item.url, type: 'image' };
      }
      return { content: item.content, type: item.type };
    });

  return {
    contentItems,
    totalItems: allItems.length,
    rounds: config.rounds || 3,
    bpm: config.bpm || 91,
    hasCustomAudio: !!config.audio,
    difficulty: config.difficulty || 'medium',
    sequential: !!config.sequential
  };
}

// GET /api/shares/public - Get public shares with pagination
router.get('/public', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const sort = req.query.sort === 'popular'
      ? { likes: -1, createdAt: -1 }
      : { createdAt: -1 };

    const query = { isPublic: true };
    // Fixed Order is its own bucket regardless of the underlying difficulty
    // value it was saved with; the other buckets exclude it so the four
    // options stay mutually exclusive.
    if (req.query.difficulty === 'fixedOrder') {
      query['preview.sequential'] = true;
    } else if (['easy', 'medium', 'hard'].includes(req.query.difficulty)) {
      query['preview.difficulty'] = req.query.difficulty;
      query['preview.sequential'] = { $ne: true };
    }

    const [shares, total] = await Promise.all([
      Share.find(query)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .select('guid title likes preview createdAt likedBy'),
      Share.countDocuments(query)
    ]);

    // Add hasLiked field based on current session
    const sessionId = req.sessionId;
    const sharesWithLikeStatus = shares.map(share => ({
      guid: share.guid,
      title: share.title,
      likes: share.likes,
      preview: share.preview,
      createdAt: share.createdAt,
      hasLiked: sessionId ? share.likedBy.includes(sessionId) : false
    }));

    res.json({
      shares: sharesWithLikeStatus,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + shares.length < total
      }
    });
  } catch (err) {
    console.error('Error getting public shares:', err);
    res.status(500).json({ error: 'Failed to get public shares' });
  }
});

// GET /api/shares/:guid - Get share by GUID
router.get('/:guid', async (req, res) => {
  try {
    // Update lastPlayedAt timestamp when share is accessed
    const share = await Share.findOneAndUpdate(
      { guid: req.params.guid },
      { $set: { lastPlayedAt: new Date() } },
      { new: true }
    );
    
    if (!share) {
      return res.status(404).json({ error: 'Share not found' });
    }
    
    // Add hasLiked status
    const sessionId = req.sessionId;
    
    res.json({
      guid: share.guid,
      config: share.config,
      imageIds: share.imageIds,
      audioId: share.audioId,
      createdAt: share.createdAt,
      isPublic: share.isPublic,
      title: share.title,
      likes: share.likes,
      hasLiked: sessionId ? share.likedBy.includes(sessionId) : false
    });
  } catch (err) {
    console.error('Error getting share:', err);
    res.status(500).json({ error: 'Failed to get share' });
  }
});

// POST /api/shares - Create new share
// Protected by: IP rate limit, honeypot, timing check, session cooldown
router.post('/', 
  shareCreationLimiter,
  honeypotValidator,
  timingValidator,
  async (req, res) => {
  try {
    const { config, imageIds, audioId, expiresInDays, title } = req.body;
    // No login yet, so there's no private/personal library to keep shares out of —
    // every share is public until accounts (Firebase/Auth0) land. Ignore any
    // isPublic value the client sends.
    const isPublic = true;

    if (!config) {
      return res.status(400).json({ error: 'config is required' });
    }

    // All shares must have at least one meaningful customization
    const contentItems = config.content || config.images || [];
    const hasContent    = Array.isArray(contentItems) && contentItems.length > 0;
    const hasAudio      = !!config.audio;
    const hasCustomDiff = config.difficulty && config.difficulty !== 'medium';
    const hasCustomBpm  = config.bpm && config.bpm !== 91;
    const hasCustomRounds = config.rounds && config.rounds !== 5;
    const hasSpeedChange  = config.increaseSpeed === true;

    if (!hasContent && !hasAudio && !hasCustomDiff && !hasCustomBpm && !hasCustomRounds && !hasSpeedChange) {
      return res.status(400).json({ error: 'Customize your game before sharing — change the content, audio, BPM, or difficulty first.' });
    }

    // Every share is public now, so every share needs actual content items
    if (!hasContent) {
      return res.status(400).json({ error: 'Add at least one image or emoji before sharing — a customized BPM or audio alone isn\'t enough for a public game.' });
    }

    // Session-based cooldown check (skipped in development)
    if (req.sessionId && process.env.NODE_ENV === 'production') {
      const session = await Session.findById(req.sessionId);

      if (session && session.lastShareCreatedAt) {
        const elapsed = Date.now() - session.lastShareCreatedAt.getTime();

        if (elapsed < SHARE_COOLDOWN_MS) {
          const waitTime = Math.ceil((SHARE_COOLDOWN_MS - elapsed) / 1000);
          return res.status(429).json({
            error: `Please wait ${waitTime} seconds before sharing again.`,
            retryAfter: waitTime
          });
        }
      }
    }
    
    const guid = uuidv4();
    
    // Sanitize title - remove any HTML/script tags
    const sanitizedTitle = (title || '')
      .slice(0, 100)
      .replace(/<[^>]*>/g, '')
      .replace(/[<>]/g, '');
    
    const shareData = {
      guid,
      config,
      imageIds: imageIds || [],
      audioId: audioId || null,
      createdAt: new Date(),
      isPublic: !!isPublic,
      title: sanitizedTitle,
      preview: extractPreview(config),
      // Track who created this share
      creatorSessionId: req.sessionId || null,
      creatorIp: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
                 req.headers['x-real-ip'] || 
                 req.ip
    };
    
    // Optional expiration (public shares don't expire by default)
    if (expiresInDays && !isPublic) {
      shareData.expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
    }
    
    const share = new Share(shareData);
    await share.save();
    
    // Update session with share creation time for cooldown
    if (req.sessionId) {
      await Session.findByIdAndUpdate(req.sessionId, {
        $set: { lastShareCreatedAt: new Date() },
        $inc: { shareCount: 1 }
      });
    }
    
    res.status(201).json({
      guid: share.guid,
      createdAt: share.createdAt,
      expiresAt: share.expiresAt,
      isPublic: share.isPublic,
      title: share.title
    });
  } catch (err) {
    console.error('Error creating share:', err);
    res.status(500).json({ error: 'Failed to create share' });
  }
});

// PATCH /api/shares/:guid - Update an existing share's config (Save Changes)
// No creator/session check: matches the existing PATCH title / DELETE routes below.
router.patch('/:guid', async (req, res) => {
  try {
    const { config } = req.body;

    if (!config) {
      return res.status(400).json({ error: 'config is required' });
    }

    // Same "must have meaningful customization" rule as creation.
    const contentItems = config.content || config.images || [];
    const hasContent    = Array.isArray(contentItems) && contentItems.length > 0;
    const hasAudio      = !!config.audio;
    const hasCustomDiff = config.difficulty && config.difficulty !== 'medium';
    const hasCustomBpm  = config.bpm && config.bpm !== 91;
    const hasCustomRounds = config.rounds && config.rounds !== 5;
    const hasSpeedChange  = config.increaseSpeed === true;

    if (!hasContent && !hasAudio && !hasCustomDiff && !hasCustomBpm && !hasCustomRounds && !hasSpeedChange) {
      return res.status(400).json({ error: 'Customize your game before saving — change the content, audio, BPM, or difficulty first.' });
    }

    if (!hasContent) {
      return res.status(400).json({ error: 'Add at least one image or emoji before saving — a customized BPM or audio alone isn\'t enough for a public game.' });
    }

    const share = await Share.findOneAndUpdate(
      { guid: req.params.guid },
      { $set: { config, preview: extractPreview(config) } },
      { new: true }
    );

    if (!share) {
      return res.status(404).json({ error: 'Share not found' });
    }

    res.json({ guid: share.guid });
  } catch (err) {
    console.error('Error updating share:', err);
    res.status(500).json({ error: 'Failed to save changes' });
  }
});

// POST /api/shares/:guid/like - Toggle like on a share
// Protected by: IP rate limit, session requirement
router.post('/:guid/like', likeLimiter, async (req, res) => {
  try {
    const sessionId = req.sessionId;
    
    if (!sessionId) {
      return res.status(401).json({ error: 'Session required to like' });
    }
    
    const share = await Share.findOne({ guid: req.params.guid, isPublic: true });
    
    if (!share) {
      return res.status(404).json({ error: 'Public share not found' });
    }
    
    const hasLiked = share.likedBy.includes(sessionId);
    
    if (hasLiked) {
      // Unlike
      share.likedBy = share.likedBy.filter(id => id !== sessionId);
      share.likes = Math.max(0, share.likes - 1);
    } else {
      // Like
      share.likedBy.push(sessionId);
      share.likes += 1;
    }
    
    await share.save();
    
    res.json({
      likes: share.likes,
      hasLiked: !hasLiked
    });
  } catch (err) {
    console.error('Error toggling like:', err);
    res.status(500).json({ error: 'Failed to toggle like' });
  }
});

// PATCH /api/shares/:guid/title - Rename a public share
// No creator/session check: matches the existing DELETE route below, since
// there's no login yet to tie a share to whoever made it.
router.patch('/:guid/title', likeLimiter, async (req, res) => {
  try {
    const title = req.body.title;

    if (typeof title !== 'string') {
      return res.status(400).json({ error: 'title is required' });
    }

    const sanitizedTitle = title
      .slice(0, 100)
      .replace(/<[^>]*>/g, '')
      .replace(/[<>]/g, '')
      .trim();

    const share = await Share.findOneAndUpdate(
      { guid: req.params.guid },
      { $set: { title: sanitizedTitle } },
      { new: true }
    );

    if (!share) {
      return res.status(404).json({ error: 'Share not found' });
    }

    res.json({ guid: share.guid, title: share.title });
  } catch (err) {
    console.error('Error renaming share:', err);
    res.status(500).json({ error: 'Failed to rename share' });
  }
});

// DELETE /api/shares/:guid - Delete share (only by creator in same session)
router.delete('/:guid', async (req, res) => {
  try {
    const result = await Share.findOneAndDelete({ guid: req.params.guid });
    
    if (!result) {
      return res.status(404).json({ error: 'Share not found' });
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting share:', err);
    res.status(500).json({ error: 'Failed to delete share' });
  }
});

module.exports = router;
