import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { command } from './server/release.mjs'
import { expect, it } from 'vitest'

it('старый HTML может запросить свой JS после публикации нового релиза', async () => {
  const root = await mkdtemp(join(tmpdir(), 'throne-assets-'))
  try {
    const source = join(root, 'dist')
    const destination = join(root, 'site')
    await mkdir(join(source, 'assets'), { recursive: true })
    await mkdir(join(destination, 'assets'), { recursive: true })
    await writeFile(join(destination, 'index.html'), '<script src="/assets/old.js"></script>')
    await writeFile(join(destination, 'assets/old.js'), 'old')
    const oldHtml = await readFile(join(destination, 'index.html'), 'utf8')
    await writeFile(join(source, 'index.html'), '<script src="/assets/new.js"></script>')
    await writeFile(join(source, 'assets/new.js'), 'new')
    await command('bash', ['deploy/scripts/upload-web.sh', source, `${destination}/`])
    expect(await readFile(join(destination, 'index.html'), 'utf8')).toContain('new.js')
    expect(await readFile(join(destination, oldHtml.match(/src="\/([^"]+)"/)[1]), 'utf8')).toBe(
      'old',
    )
    expect(await readFile(join(destination, 'assets/new.js'), 'utf8')).toBe('new')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it('сбой загрузки ресурсов не публикует новый HTML', async () => {
  const root = await mkdtemp(join(tmpdir(), 'throne-assets-fail-'))
  try {
    const source = join(root, 'dist')
    const destination = join(root, 'site')
    const bin = join(root, 'bin')
    await mkdir(join(source, 'assets'), { recursive: true })
    await mkdir(destination)
    await mkdir(bin)
    await writeFile(join(destination, 'index.html'), 'old page')
    await writeFile(join(source, 'index.html'), 'new page')
    const calls = join(root, 'calls')
    await writeFile(join(bin, 'rsync'), '#!/bin/sh\necho attempt >> "$CALLS"\nexit 23\n', {
      mode: 0o755,
    })
    await expect(
      command('bash', ['deploy/scripts/upload-web.sh', source, `${destination}/`], {
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, CALLS: calls },
      }),
    ).rejects.toThrow('23')
    expect(await readFile(calls, 'utf8')).toBe('attempt\n')
    expect(await readFile(join(destination, 'index.html'), 'utf8')).toBe('old page')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
