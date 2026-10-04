// The comments, in a JSON file. A file and not a database so the demo has nothing to set up
// and the only code worth reading is the moderation. Swap it for your own storage.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'

export class Comments {
  constructor(file) {
    this.file = file
  }

  /** Published comments, newest first. */
  published() {
    return Object.values(this.#read()).filter((c) => c.status === 'published').reverse()
  }

  /** The id the next comment will get, so the call to ToxicFilter can carry it. */
  nextId() {
    return Math.max(0, ...Object.keys(this.#read()).map(Number)) + 1
  }

  /** Store a comment as `published` or `held`. */
  add(id, name, body, status, verdictId) {
    const comments = this.#read()
    comments[id] = { id, name, body, status, verdict: verdictId, created_at: new Date().toISOString() }
    this.#write(comments)
  }

  /** Publish a held comment. */
  publish(id) {
    const comments = this.#read()
    if (comments[id]) {
      comments[id].status = 'published'
      this.#write(comments)
    }
  }

  /** Drop a comment. */
  remove(id) {
    const comments = this.#read()
    delete comments[id]
    this.#write(comments)
  }

  #read() {
    return existsSync(this.file) ? JSON.parse(readFileSync(this.file, 'utf8') || '{}') : {}
  }

  #write(comments) {
    writeFileSync(this.file, JSON.stringify(comments, null, 2))
  }
}
