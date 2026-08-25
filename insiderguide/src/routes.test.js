import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { matchRoutes } from 'react-router-dom'

// /creators and /apply are declared BEFORE /:slug in App.jsx, but that is not
// what makes them win — RR7 ranks branches by segment score (static 10 beats
// dynamic 3) and ignores source order, which is why the whole /admin block
// already sits below the catch-all and still resolves. This asserts the
// ranking on the real route table rather than on a copy that can drift: the
// paths are read out of App.jsx itself, so deleting a route fails the test
// instead of silently regressing the page to "Country not found".
const APP_SRC = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8')
const ROUTES = [...APP_SRC.matchAll(/path="(\/[^"]*)"/g)].map((m) => ({ path: m[1] }))

function matchedPath(pathname) {
  const matches = matchRoutes(ROUTES, pathname)
  return matches?.[matches.length - 1]?.route?.path ?? null
}

describe('public route table', () => {
  it('declares the creator application routes', () => {
    expect(ROUTES.map((r) => r.path)).toEqual(expect.arrayContaining(['/creators', '/apply']))
  })

  it('resolves /creators and /apply ahead of the /:slug catch-all', () => {
    expect(matchedPath('/creators')).toBe('/creators')
    expect(matchedPath('/apply')).toBe('/apply')
  })

  it('still routes unknown single segments to the /:slug catch-all', () => {
    expect(matchedPath('/alexspexx')).toBe('/:slug')
    expect(matchedPath('/colombia')).toBe('/:slug')
  })
})
