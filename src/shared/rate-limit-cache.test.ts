import { describe, it, expect, beforeEach } from "bun:test"
import {
  markProviderRateLimited,
  isProviderRateLimited,
  getRateLimitTTL,
  setRateLimitTTL,
  __resetRateLimitCache,
} from "./rate-limit-cache"

describe("rate-limit-cache", () => {
  beforeEach(() => {
    //#given - clean state before each test
    __resetRateLimitCache()
  })

  it("should return false for unknown provider", () => {
    //#given - no provider has been marked
    
    //#when - isProviderRateLimited is called for unknown provider
    const result = isProviderRateLimited("anthropic")
    
    //#then - returns false
    expect(result).toBe(false)
  })

  it("should return true for recently marked provider", () => {
    //#given - provider has been marked as rate-limited
    markProviderRateLimited("anthropic")
    
    //#when - isProviderRateLimited is called immediately after
    const result = isProviderRateLimited("anthropic")
    
    //#then - returns true
    expect(result).toBe(true)
  })

  it("should return false after TTL expires", async () => {
    //#given - TTL is set to 100ms and provider marked as rate-limited
    setRateLimitTTL(100)
    markProviderRateLimited("anthropic")
    
    //#when - isProviderRateLimited is called after 150ms
    await Bun.sleep(150)
    const result = isProviderRateLimited("anthropic")
    
    //#then - returns false (expired and cleaned up)
    expect(result).toBe(false)
  })

  it("should allow configurable TTL", () => {
    //#given - TTL is set to custom value
    setRateLimitTTL(500)
    
    //#when - getRateLimitTTL is called
    const result = getRateLimitTTL()
    
    //#then - returns the custom value
    expect(result).toBe(500)
  })

  it("should reset cache and TTL to defaults", () => {
    //#given - provider marked and custom TTL set
    markProviderRateLimited("anthropic")
    setRateLimitTTL(999)
    
    //#when - __resetRateLimitCache is called
    __resetRateLimitCache()
    
    //#then - cache is cleared and TTL reset to default (1 hour)
    expect(isProviderRateLimited("anthropic")).toBe(false)
    expect(getRateLimitTTL()).toBe(3_600_000)
  })

  it("should track multiple providers independently", () => {
    //#given - multiple providers marked as rate-limited
    markProviderRateLimited("anthropic")
    markProviderRateLimited("openai")
    
    //#when - isProviderRateLimited is checked for both
    const anthropicResult = isProviderRateLimited("anthropic")
    const openaiResult = isProviderRateLimited("openai")
    
    //#then - both return true
    expect(anthropicResult).toBe(true)
    expect(openaiResult).toBe(true)
  })

  it("should default TTL to 1 hour (3_600_000ms)", () => {
    //#given - fresh state after reset
    __resetRateLimitCache()
    
    //#when - getRateLimitTTL is called
    const result = getRateLimitTTL()
    
    //#then - returns default 1 hour
    expect(result).toBe(3_600_000)
  })
})
