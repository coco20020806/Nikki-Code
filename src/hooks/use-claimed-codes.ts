import { useEffect, useState } from 'react'

const STORAGE_KEY = 'nikkicodes_claimed'

export function useClaimedCodes() {
  const [claimedIds, setClaimedIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (!stored) return
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) setClaimedIds(new Set(parsed))
    } catch {
      // TODO: 可在后续接入错误上报
    }
  }, [])

  const claimCode = (id: number) => {
    setClaimedIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(next)))
      return next
    })
  }

  const unclaimCode = (id: number) => {
    setClaimedIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(next)))
      return next
    })
  }

  return { claimedIds, claimCode, unclaimCode }
}
