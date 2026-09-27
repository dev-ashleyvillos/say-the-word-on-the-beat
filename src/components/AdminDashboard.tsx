import { useState, useEffect, useCallback, useRef } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import {
  Trash, ArrowSquareOut, Eye, EyeSlash,
  Flag, MagnifyingGlass, ArrowLeft, ShieldCheck,
  Users, ShareNetwork, ChartBar, CaretLeft, CaretRight,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// ============================================================================
// Types
// ============================================================================

const API_BASE = '/api/admin'

interface AdminStats {
  sessions: { total: number; active: number; stale: number }
  shares: { total: number; public: number; private: number }
  images: number
  audioFiles: number
  staleDays: number
}

interface AdminSession {
  _id: string
  createdAt: string
  lastAccessed: string
  shareCount: number
  imageCount: number
  audioCount: number
  settingCount: number
  suspiciousActivityCount: number
}

interface AdminShare {
  _id: string
  guid: string
  title: string
  isPublic: boolean
  flaggedAsSpam: boolean
  likes: number
  createdAt: string
  lastPlayedAt: string
  expiresAt: string | null
  creatorSessionId: string | null
  creatorIp: string | null
  preview?: {
    contentItems?: Array<{ content: string; type: string }>
    rounds?: number
    bpm?: number
    hasCustomAudio?: boolean
    difficulty?: string
  }
  imageIds?: string[]
  audioId?: string | null
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

// ============================================================================
// API helpers
// ============================================================================

function makeHeaders(password: string): HeadersInit {
  return {
    Authorization: `Bearer ${password}`,
    'Content-Type': 'application/json',
  }
}

async function adminFetch<T>(
  endpoint: string,
  password: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      ...makeHeaders(password),
      ...options?.headers,
    },
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `Request failed (${res.status})`)
  }
  return res.json()
}

// ============================================================================
// Sub-components
// ============================================================================

function StatCard({
  label,
  value,
  icon: Icon,
  color = 'text-primary',
}: {
  label: string
  value: number | string
  icon: typeof Users
  color?: string
}) {
  return (
    <Card className="p-4 flex items-center gap-3">
      <div className={cn('p-2 rounded-lg bg-muted', color)}>
        <Icon size={22} weight="bold" />
      </div>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </Card>
  )
}

function PaginationControls({
  pagination,
  onPageChange,
}: {
  pagination: Pagination
  onPageChange: (page: number) => void
}) {
  if (pagination.totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between pt-2">
      <p className="text-xs text-muted-foreground">
        Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
      </p>
      <div className="flex gap-1">
        <Button
          size="sm"
          variant="outline"
          disabled={pagination.page <= 1}
          onClick={() => onPageChange(pagination.page - 1)}
        >
          <CaretLeft size={14} />
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pagination.page >= pagination.totalPages}
          onClick={() => onPageChange(pagination.page + 1)}
        >
          <CaretRight size={14} />
        </Button>
      </div>
    </div>
  )
}

function ConfirmButton({
  onConfirm,
  label = 'Delete',
  confirmLabel = 'Confirm?',
  variant = 'destructive',
  size = 'sm',
  icon: Icon,
  className,
}: {
  onConfirm: () => void
  label?: string
  confirmLabel?: string
  variant?: 'destructive' | 'outline' | 'ghost' | 'default' | 'secondary' | 'link'
  size?: 'sm' | 'default' | 'lg' | 'icon'
  icon?: typeof Trash
  className?: string
}) {
  const [confirming, setConfirming] = useState(false)
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleClick = () => {
    if (confirming) {
      onConfirm()
      setConfirming(false)
      if (timeout.current) clearTimeout(timeout.current)
    } else {
      setConfirming(true)
      timeout.current = setTimeout(() => setConfirming(false), 3000)
    }
  }

  return (
    <Button
      size={size}
      variant={confirming ? 'destructive' : variant}
      onClick={handleClick}
      className={className}
    >
      {Icon && <Icon size={14} />}
      {confirming ? confirmLabel : label}
    </Button>
  )
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

// ============================================================================
// Sessions Panel
// ============================================================================

function SessionsPanel({ password }: { password: string }) {
  const [sessions, setSessions] = useState<AdminSession[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, totalPages: 0 })
  const [filter, setFilter] = useState<'all' | 'active' | 'stale'>('all')
  const [loading, setLoading] = useState(false)

  const fetchSessions = useCallback(
    async (page = 1) => {
      setLoading(true)
      try {
        const filterParam = filter !== 'all' ? `&filter=${filter}` : ''
        const data = await adminFetch<{ sessions: AdminSession[]; pagination: Pagination }>(
          `/sessions?page=${page}&limit=50${filterParam}`,
          password
        )
        setSessions(data.sessions)
        setPagination(data.pagination)
      } catch (err) {
        toast.error((err as Error).message)
      } finally {
        setLoading(false)
      }
    },
    [password, filter]
  )

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  const handleDelete = async (id: string) => {
    try {
      const data = await adminFetch<{ deleted: Record<string, number> }>(
        `/sessions/${id}`,
        password,
        { method: 'DELETE' }
      )
      toast.success(
        `Session deleted. Removed ${data.deleted.shares} shares, ${data.deleted.images} images, ${data.deleted.audioFiles} audio files.`
      )
      fetchSessions(pagination.page)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        {(['all', 'active', 'stale'] as const).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? 'default' : 'outline'}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All' : f === 'active' ? '🟢 Active' : '🔴 Stale'}
          </Button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-4 text-center">Loading sessions…</p>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No sessions found.</p>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <Card key={s._id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                    {s._id}
                  </code>
                  {s.suspiciousActivityCount > 0 && (
                    <Badge variant="destructive" className="text-[10px]">
                      ⚠ {s.suspiciousActivityCount} suspicious
                    </Badge>
                  )}
                </div>
                <div className="flex gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                  <span>Last active: {timeAgo(s.lastAccessed)}</span>
                  <span>Created: {timeAgo(s.createdAt)}</span>
                  <span>{s.shareCount} shares</span>
                  <span>{s.imageCount} imgs</span>
                  <span>{s.audioCount} audio</span>
                </div>
              </div>
              <ConfirmButton
                onConfirm={() => handleDelete(s._id)}
                icon={Trash}
                variant="outline"
              />
            </Card>
          ))}
        </div>
      )}

      <PaginationControls pagination={pagination} onPageChange={fetchSessions} />
    </div>
  )
}

// ============================================================================
// Shares Panel
// ============================================================================

function SharesPanel({
  password,
  filter: initialFilter = 'all',
}: {
  password: string
  filter?: 'all' | 'public' | 'private'
}) {
  const [shares, setShares] = useState<AdminShare[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, totalPages: 0 })
  const [filter, setFilter] = useState<'all' | 'public' | 'private'>(initialFilter)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<'newest' | 'oldest' | 'popular'>('newest')
  const [loading, setLoading] = useState(false)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchShares = useCallback(
    async (page = 1) => {
      setLoading(true)
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: '50',
          sort,
        })
        if (filter !== 'all') params.set('filter', filter)
        if (search.trim()) params.set('search', search.trim())

        const data = await adminFetch<{ shares: AdminShare[]; pagination: Pagination }>(
          `/shares?${params}`,
          password
        )
        setShares(data.shares)
        setPagination(data.pagination)
      } catch (err) {
        toast.error((err as Error).message)
      } finally {
        setLoading(false)
      }
    },
    [password, filter, sort, search]
  )

  useEffect(() => {
    fetchShares()
  }, [fetchShares])

  const handleSearchInput = (value: string) => {
    setSearch(value)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => fetchShares(), 400)
  }

  const handleDelete = async (guid: string) => {
    try {
      await adminFetch(`/shares/${guid}`, password, { method: 'DELETE' })
      toast.success('Share deleted')
      fetchShares(pagination.page)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const handleToggleVisibility = async (guid: string) => {
    try {
      const data = await adminFetch<{ isPublic: boolean }>(
        `/shares/${guid}/visibility`,
        password,
        { method: 'PATCH' }
      )
      toast.success(data.isPublic ? 'Made public' : 'Made private')
      fetchShares(pagination.page)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const handleToggleFlag = async (guid: string) => {
    try {
      const data = await adminFetch<{ flaggedAsSpam: boolean }>(
        `/shares/${guid}/flag`,
        password,
        { method: 'PATCH' }
      )
      toast.success(data.flaggedAsSpam ? 'Flagged as spam' : 'Unflagged')
      fetchShares(pagination.page)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const handleLoad = (guid: string) => {
    window.open(`${window.location.origin}/?share=${guid}`, '_blank')
  }

  const difficultyColors: Record<string, string> = {
    easy: 'bg-green-500/20 text-green-700',
    medium: 'bg-yellow-500/20 text-yellow-700',
    hard: 'bg-red-500/20 text-red-700',
  }

  return (
    <div className="space-y-3">
      {/* Filters bar */}
      <div className="flex gap-2 flex-wrap items-center">
        {(['all', 'public', 'private'] as const).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? 'default' : 'outline'}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All' : f === 'public' ? '🌐 Public' : '🔒 Private'}
          </Button>
        ))}
        <div className="h-4 w-px bg-border" />
        {(['newest', 'oldest', 'popular'] as const).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={sort === s ? 'secondary' : 'ghost'}
            onClick={() => setSort(s)}
          >
            {s}
          </Button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <MagnifyingGlass
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          placeholder="Search by GUID or title…"
          value={search}
          onChange={(e) => handleSearchInput(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Shares list */}
      {loading ? (
        <p className="text-sm text-muted-foreground py-4 text-center">Loading shares…</p>
      ) : shares.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No shares found.</p>
      ) : (
        <div className="space-y-2">
          {shares.map((share) => (
            <Card
              key={share.guid}
              className={cn(
                'p-3',
                share.flaggedAsSpam && 'border-red-400/50 bg-red-50/30'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {/* Title & badges */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Preview mini-tiles */}
                    {share.preview?.contentItems && share.preview.contentItems.length > 0 && (
                      <div className="flex gap-0.5">
                        {share.preview.contentItems.slice(0, 4).map((item, i) => (
                          <div
                            key={i}
                            className="w-6 h-6 rounded bg-muted flex items-center justify-center text-xs overflow-hidden"
                          >
                            {item.type === 'image' ? (
                              <img
                                src={item.content}
                                alt=""
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              item.content
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <span className="font-medium text-sm truncate">
                      {share.title || '(untitled)'}
                    </span>
                    <Badge variant={share.isPublic ? 'default' : 'secondary'} className="text-[10px]">
                      {share.isPublic ? '🌐 Public' : '🔒 Private'}
                    </Badge>
                    {share.flaggedAsSpam && (
                      <Badge variant="destructive" className="text-[10px]">
                        🚩 Spam
                      </Badge>
                    )}
                    {share.preview?.difficulty && (
                      <Badge
                        className={cn(
                          'text-[10px]',
                          difficultyColors[share.preview.difficulty] || ''
                        )}
                      >
                        {share.preview.difficulty}
                      </Badge>
                    )}
                  </div>

                  {/* Meta info */}
                  <div className="flex gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                    <code className="font-mono bg-muted px-1 py-0.5 rounded text-[10px]">
                      {share.guid.slice(0, 8)}…
                    </code>
                    <span>❤️ {share.likes}</span>
                    {share.preview?.bpm && <span>{share.preview.bpm} BPM</span>}
                    {share.preview?.rounds && <span>{share.preview.rounds} rounds</span>}
                    {share.preview?.hasCustomAudio && <span>🎵 custom audio</span>}
                    <span>Created: {timeAgo(share.createdAt)}</span>
                    {share.lastPlayedAt && (
                      <span>Played: {timeAgo(share.lastPlayedAt)}</span>
                    )}
                    {share.expiresAt && (
                      <span className="text-orange-600">
                        Expires: {new Date(share.expiresAt).toLocaleDateString()}
                      </span>
                    )}
                    {share.creatorIp && (
                      <span className="font-mono text-[10px]">IP: {share.creatorIp}</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleLoad(share.guid)}
                    title="Load game"
                  >
                    <ArrowSquareOut size={14} />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleToggleVisibility(share.guid)}
                    title={share.isPublic ? 'Make private' : 'Make public'}
                  >
                    {share.isPublic ? <EyeSlash size={14} /> : <Eye size={14} />}
                  </Button>
                  <Button
                    size="sm"
                    variant={share.flaggedAsSpam ? 'destructive' : 'outline'}
                    onClick={() => handleToggleFlag(share.guid)}
                    title={share.flaggedAsSpam ? 'Unflag' : 'Flag as spam'}
                  >
                    <Flag size={14} />
                  </Button>
                  <ConfirmButton
                    onConfirm={() => handleDelete(share.guid)}
                    icon={Trash}
                    variant="outline"
                  />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <PaginationControls pagination={pagination} onPageChange={fetchShares} />
    </div>
  )
}

// ============================================================================
// Site settings
// ============================================================================

interface SiteSettings {
  promoEnabled: boolean
}

function SettingsPanel({ password }: { password: string }) {
  const [settings, setSettings] = useState<SiteSettings | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    adminFetch<SiteSettings>('/site-settings', password)
      .then(setSettings)
      .catch((err) => toast.error((err as Error).message))
  }, [password])

  const setPromoEnabled = async (value: boolean) => {
    setSaving(true)
    try {
      const next = await adminFetch<SiteSettings>('/site-settings/promoEnabled', password, {
        method: 'PUT',
        body: JSON.stringify({ value }),
      })
      setSettings(next)
      toast.success(value ? 'Gameplayce hint switched on' : 'Gameplayce hint switched off')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <label htmlFor="setting-promo" className="font-semibold">
            Gameplayce hint
          </label>
          <p className="text-sm text-muted-foreground mt-1">
            The small &ldquo;Make your own rounds with AI&rdquo; strip that points players to Say the
            Word on Beat on gameplayce.io. It shows only after a finished round (or 90&nbsp;s on the
            page), at most once per visit. Switching it off hides it for every visitor from their next page load.
          </p>
        </div>
        <Switch
          id="setting-promo"
          data-testid="setting-promo"
          checked={settings?.promoEnabled ?? false}
          disabled={!settings || saving}
          onCheckedChange={setPromoEnabled}
        />
      </div>
    </Card>
  )
}

// ============================================================================
// Main Admin Dashboard
// ============================================================================

export function AdminDashboard() {
  const [password, setPassword] = useState('')
  const [authenticated, setAuthenticated] = useState(false)
  const [loginInput, setLoginInput] = useState('')
  const [loginError, setLoginError] = useState('')
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loggingIn, setLoggingIn] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoggingIn(true)
    setLoginError('')

    try {
      const data = await adminFetch<AdminStats>('/stats', loginInput)
      setPassword(loginInput)
      setStats(data)
      setAuthenticated(true)
    } catch {
      setLoginError('Invalid password')
    } finally {
      setLoggingIn(false)
    }
  }

  const refreshStats = useCallback(async () => {
    try {
      const data = await adminFetch<AdminStats>('/stats', password)
      setStats(data)
    } catch {
      // Silently fail stats refresh
    }
  }, [password])

  const handleBack = () => {
    window.location.href = '/'
  }

  // -------------------------------------------------------
  // Login Screen
  // -------------------------------------------------------
  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <Card className="w-full max-w-sm p-6 space-y-4">
          <div className="text-center space-y-2">
            <ShieldCheck size={48} weight="duotone" className="mx-auto text-primary" />
            <h1 className="text-xl font-bold">Admin Dashboard</h1>
            <p className="text-sm text-muted-foreground">Enter the admin password to continue</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-3">
            <Input
              type="password"
              placeholder="Password"
              value={loginInput}
              onChange={(e) => setLoginInput(e.target.value)}
              autoFocus
            />
            {loginError && (
              <p className="text-sm text-destructive">{loginError}</p>
            )}
            <Button type="submit" className="w-full" disabled={!loginInput || loggingIn}>
              {loggingIn ? 'Authenticating…' : 'Sign In'}
            </Button>
          </form>

          <Button variant="ghost" size="sm" className="w-full" onClick={handleBack}>
            <ArrowLeft size={14} /> Back to app
          </Button>
        </Card>
      </div>
    )
  }

  // -------------------------------------------------------
  // Authenticated Dashboard
  // -------------------------------------------------------
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={handleBack}>
              <ArrowLeft size={16} />
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <ShieldCheck size={28} weight="duotone" className="text-primary" />
                Admin Dashboard
              </h1>
              <p className="text-sm text-muted-foreground">
                Manage game sessions, shared games, and content
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={refreshStats}>
            <ChartBar size={14} /> Refresh Stats
          </Button>
        </div>

        {/* Stats cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Total Sessions" value={stats.sessions.total} icon={Users} />
            <StatCard
              label="Active Sessions"
              value={stats.sessions.active}
              icon={Users}
              color="text-green-600"
            />
            <StatCard
              label="Stale Sessions"
              value={stats.sessions.stale}
              icon={Users}
              color="text-red-500"
            />
            <StatCard label="Total Shares" value={stats.shares.total} icon={ShareNetwork} />
            <StatCard
              label="Public Games"
              value={stats.shares.public}
              icon={ShareNetwork}
              color="text-blue-500"
            />
            <StatCard
              label="Private Games"
              value={stats.shares.private}
              icon={ShareNetwork}
              color="text-purple-500"
            />
            <StatCard label="Images" value={stats.images} icon={ChartBar} color="text-orange-500" />
            <StatCard
              label="Audio Files"
              value={stats.audioFiles}
              icon={ChartBar}
              color="text-pink-500"
            />
          </div>
        )}

        {/* Tabbed content */}
        <Tabs defaultValue="shares">
          <TabsList className="w-full justify-start flex-wrap h-auto">
            <TabsTrigger value="shares">🎮 All Shares</TabsTrigger>
            <TabsTrigger value="public">🌐 Public Games</TabsTrigger>
            <TabsTrigger value="private">🔒 Private Games</TabsTrigger>
            <TabsTrigger value="sessions">👤 Sessions</TabsTrigger>
            <TabsTrigger value="settings">⚙️ Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="shares" className="mt-4">
            <SharesPanel password={password} filter="all" />
          </TabsContent>

          <TabsContent value="public" className="mt-4">
            <SharesPanel password={password} filter="public" />
          </TabsContent>

          <TabsContent value="private" className="mt-4">
            <SharesPanel password={password} filter="private" />
          </TabsContent>

          <TabsContent value="sessions" className="mt-4">
            <SessionsPanel password={password} />
          </TabsContent>

          <TabsContent value="settings" className="mt-4">
            <SettingsPanel password={password} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
