import { beforeEach, describe, expect, it, vi } from 'vitest'

import { resolveDictationExtension, transcribeAudio, transcribeDictation } from './transcription'

const { invoke } = await import('@tauri-apps/api/core')
const { appDataDir, join } = await import('@tauri-apps/api/path')
const { mkdir, remove, writeFile } = await import('@tauri-apps/plugin-fs')

describe('transcription helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(appDataDir).mockResolvedValue('/mock/app-data')
    vi.mocked(join).mockImplementation((...parts: string[]) => Promise.resolve(parts.join('/')))
    vi.mocked(mkdir).mockResolvedValue(undefined)
    vi.mocked(writeFile).mockResolvedValue(undefined)
    vi.mocked(remove).mockResolvedValue(undefined)
  })

  it('transcribeAudio calls the asset transcription command', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined)

    await transcribeAudio('asset-1', '/audio/interview.mp3')

    expect(invoke).toHaveBeenCalledWith('transcribe_audio', {
      assetId: 'asset-1',
      assetPath: '/audio/interview.mp3',
    })
  })

  it('transcribeDictation writes a temp file, invokes tauri, and removes the file on success', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('11111111-1111-1111-1111-111111111111')
    vi.mocked(invoke).mockResolvedValueOnce('texto dictado')

    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' })

    const text = await transcribeDictation(blob)

    expect(mkdir).toHaveBeenCalledWith('/mock/app-data/temp/dictation', { recursive: true })
    expect(writeFile).toHaveBeenCalledWith(
      '/mock/app-data/temp/dictation/11111111-1111-1111-1111-111111111111.webm',
      expect.any(Uint8Array)
    )
    expect(invoke).toHaveBeenCalledWith('transcribe_dictation', {
      audioPath: '/mock/app-data/temp/dictation/11111111-1111-1111-1111-111111111111.webm',
    })
    expect(remove).toHaveBeenCalledWith(
      '/mock/app-data/temp/dictation/11111111-1111-1111-1111-111111111111.webm'
    )
    expect(text).toBe('texto dictado')
  })

  it('transcribeDictation removes the temp file when the backend transcription fails', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('22222222-2222-2222-2222-222222222222')
    vi.mocked(invoke).mockRejectedValueOnce(new Error('boom'))

    const blob = new Blob([new Uint8Array([4, 5, 6])], { type: 'audio/ogg' })

    await expect(transcribeDictation(blob)).rejects.toThrow('boom')

    expect(writeFile).toHaveBeenCalledWith(
      '/mock/app-data/temp/dictation/22222222-2222-2222-2222-222222222222.ogg',
      expect.any(Uint8Array)
    )
    expect(remove).toHaveBeenCalledWith(
      '/mock/app-data/temp/dictation/22222222-2222-2222-2222-222222222222.ogg'
    )
  })

  it('resolveDictationExtension maps supported mime types and falls back to webm', () => {
    expect(resolveDictationExtension('audio/webm;codecs=opus')).toBe('webm')
    expect(resolveDictationExtension('audio/mp4')).toBe('m4a')
    expect(resolveDictationExtension('application/octet-stream')).toBe('webm')
  })
})
