#!/usr/bin/env node
// Regenerates assets/theme.json from @opencode/ui as the browser resolves it.
//
// usage: OPENCODE=<opencode checkout> node themes/opencode/tools/theme.mjs > themes/opencode/assets/theme.json
//
// It opens a Storybook story in light and dark, collects every custom property the kit's
// stylesheets and ThemeProvider define (the v2 tokens and the v1 tokens the older components
// still read), and resolves each through the browser: colours to #rrggbbaa (color-mix, rgba()
// and var() chains included), shadows to their computed box-shadow lists. The result is plain
// Rune theme data; nothing here is compiled into Rune.

import { openStory, playwright, serve } from "../../../scripts/kit/storybook.mjs"

const STORY = "ui-button--playground"

async function collect(page) {
  return page.evaluate(() => {
    const names = new Set()
    const walk = (rules) => {
      for (const r of rules) {
        if (r.style) for (const n of r.style) if (n.startsWith("--")) names.add(n)
        if (r.cssRules) walk(r.cssRules)
      }
    }
    for (const sheet of document.styleSheets) {
      try {
        walk(sheet.cssRules)
      } catch {}
    }
    for (const el of [document.documentElement, document.body]) for (const n of el.style) if (n.startsWith("--")) names.add(n)

    const canvas = document.createElement("canvas")
    canvas.width = canvas.height = 1
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    const hex = (css) => {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = "rgba(0,0,0,0)"
      ctx.fillStyle = css
      ctx.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
      return "#" + [r, g, b, a].map((v) => v.toString(16).padStart(2, "0")).join("")
    }
    const probe = document.createElement("div")
    document.body.append(probe)
    const root = getComputedStyle(document.documentElement)
    const colors = {}
    const shadows = {}
    const numbers = {}
    for (const name of [...names].sort()) {
      const raw = root.getPropertyValue(name).trim()
      if (!raw) continue
      const key = name.slice(2)
      if (/shadow|elevation/.test(name) && /px/.test(raw)) {
        probe.style.boxShadow = "none"
        probe.style.boxShadow = `var(${name})`
        const v = getComputedStyle(probe).boxShadow
        if (v && v !== "none") shadows[key] = v.replace(/rgba?\([^)]*\)|color\([^)]*\)|oklch\([^)]*\)/g, (c) => hex(c))
        continue
      }
      if (CSS.supports("color", raw)) {
        probe.style.color = `var(${name})`
        const c = getComputedStyle(probe).color
        colors[key] = hex(c)
        continue
      }
      const px = raw.match(/^(-?[\d.]+)(px)?$/)
      if (px) numbers[key] = Number(px[1])
      else if (/^-?[\d.]+rem$/.test(raw)) numbers[key] = parseFloat(raw) * 16
    }
    probe.remove()
    return { colors, shadows, numbers }
  })
}

const server = await serve()
const browser = await playwright().chromium.launch()
const out = { name: "OpenCode", blend: { mode: "srgb", over: "v2-background-bg-base" } }
let numbers = {}
const shadows = {}
for (const scheme of ["light", "dark"]) {
  const page = await browser.newPage()
  await openStory(page, server.url, STORY, scheme)
  const got = await collect(page)
  out[scheme] = got.colors
  shadows[scheme] = got.shadows
  numbers = { ...got.numbers, ...numbers }
  await page.close()
}
out.shadows = shadows
out.numbers = numbers
await browser.close()
server.close()
process.stdout.write(JSON.stringify(out, null, 1) + "\n")
