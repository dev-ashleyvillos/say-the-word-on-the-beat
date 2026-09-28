const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const sessionsRouter = require('./routes/sessions');
const settingsRouter = require('./routes/settings');
const imagesRouter = require('./routes/images');
const audioRouter = require('./routes/audio');
const sharesRouter = require('./routes/shares');
const adminRouter = require('./routes/admin');
const siteSettingsRouter = require('./routes/siteSettings');
const Share = require('./models/Share');
const { generalLimiter } = require('./middleware/rateLimit');

const app = express();
const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/saytheword';

// Trust proxy for rate limiting behind nginx
app.set('trust proxy', 1);

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// Apply general rate limiting to all API routes
app.use('/api/', generalLimiter);

// Routes
app.use('/api/sessions', sessionsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/images', imagesRouter);
app.use('/api/audio', audioRouter);
app.use('/api/shares', sharesRouter);
app.use('/api/admin', adminRouter);
app.use('/api/site-settings', siteSettingsRouter);

// Health check (not rate limited)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Social share preview pages — serves HTML with per-game OG tags.
// Regular browsers are redirected to the SPA via <meta refresh> + JS.
// Social crawlers (Twitterbot, facebookexternalhit, etc.) read the OG tags.
app.get('/share/:guid', async (req, res) => {
  const guid = req.params.guid;

  // Basic GUID validation (UUID v4)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(guid)) {
    return res.redirect(302, '/');
  }

  try {
    const share = await Share.findOne({ guid }).select('title preview');

    const proto = req.headers['x-forwarded-proto'] || req.protocol;
    const host  = req.headers['x-forwarded-host'] || req.get('host');
    const baseUrl = `${proto}://${host}`;
    const shareUrl = `${baseUrl}/share/${guid}`;
    const appUrl   = `${baseUrl}/?share=${guid}`;

    if (!share) {
      return res.redirect(302, appUrl);
    }

    const rawTitle = share.title || '';
    const ogTitle = rawTitle
      ? `"${rawTitle}" — Say the Word on Beat`
      : 'Say the Word on Beat — Custom Game';

    const parts = [
      share.preview?.rounds    ? `${share.preview.rounds} rounds`           : null,
      share.preview?.difficulty ? share.preview.difficulty + ' difficulty'  : null,
      share.preview?.bpm        ? `${share.preview.bpm} BPM`               : null,
    ].filter(Boolean);
    const ogDescription = parts.length
      ? `${parts.join(' · ')}. Play the viral "Say the Word on Beat" challenge!`
      : 'Play the viral "Say the Word on Beat" challenge!';

    const ogImage = `${baseUrl}/og-image.jpg`;

    // Escape helper — prevents XSS via title/description in HTML attributes
    const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300'); // cache 5 min
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(ogTitle)}</title>
  <meta name="description" content="${esc(ogDescription)}" />

  <!-- Open Graph -->
  <meta property="og:type"        content="website" />
  <meta property="og:url"         content="${esc(shareUrl)}" />
  <meta property="og:title"       content="${esc(ogTitle)}" />
  <meta property="og:description" content="${esc(ogDescription)}" />
  <meta property="og:image"       content="${esc(ogImage)}" />
  <meta property="og:image:width"  content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:site_name"   content="Say the Word on Beat" />
  <meta property="og:locale"      content="en_US" />

  <!-- Twitter -->
  <meta name="twitter:card"        content="summary_large_image" />
  <meta name="twitter:url"         content="${esc(shareUrl)}" />
  <meta name="twitter:title"       content="${esc(ogTitle)}" />
  <meta name="twitter:description" content="${esc(ogDescription)}" />
  <meta name="twitter:image"       content="${esc(ogImage)}" />

  <!-- Redirect browsers to the SPA -->
  <meta http-equiv="refresh" content="0; url=${esc(appUrl)}" />
  <script>window.location.replace("${esc(appUrl)}");</script>
</head>
<body>
  <p>Loading game… <a href="${esc(appUrl)}">Click here if not redirected.</a></p>
</body>
</html>`);
  } catch (err) {
    console.error('Error serving share preview page:', err);
    res.redirect(302, '/');
  }
});

// Connect to MongoDB and start server
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(PORT, () => {
      console.log(`API server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });
