import { log } from "./logger"

const DEFAULT_TTL_MS = 3_600_000

const rateLimitCache = new Map<string, number>()

let currentTTL = DEFAULT_TTL_MS

export function markProviderRateLimited(providerID: string): void {
  const timestamp = Date.now()
  rateLimitCache.set(providerID, timestamp)
  log("[markProviderRateLimited] provider marked", { 
    providerID, 
    ttlMs: currentTTL,
    expiresAt: new Date(timestamp + currentTTL).toISOString()
  })
}

export function isProviderRateLimited(providerID: string): boolean {
  const timestamp = rateLimitCache.get(providerID)
  
  if (timestamp === undefined) {
    return false
  }
  
  const now = Date.now()
  const elapsed = now - timestamp
  
  if (elapsed < currentTTL) {
    log("[isProviderRateLimited] cache HIT", { 
      providerID, 
      elapsedMs: elapsed,
      remainingMs: currentTTL - elapsed
    })
    return true
  }
  
  rateLimitCache.delete(providerID)
  log("[isProviderRateLimited] cache EXPIRED - cleanup", { 
    providerID, 
    elapsedMs: elapsed
  })
  return false
}

export function getRateLimitTTL(): number {
  return currentTTL
}

export function setRateLimitTTL(ms: number): void {
  currentTTL = ms
  log("[setRateLimitTTL] TTL updated", { ttlMs: ms })
}

export function __resetRateLimitCache(): void {
  rateLimitCache.clear()
  currentTTL = DEFAULT_TTL_MS
}
