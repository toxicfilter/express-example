// A comment wall moderated with the ToxicFilter JavaScript SDK, in Express.
//
// The key stays on this server. In a browser bundle it would be public, and anybody reading
// it could spend the account's allowance: moderate here and send the page the result.

import express from 'express'
import ToxicFilter, { ToxicFilterError, webhookEvent } from 'toxicfilter-sdk'
import { Comments } from './store.js'

const app = express()
const comments = new Comments(new URL('./data/comments.json', import.meta.url))
const tf = new ToxicFilter(process.env.TOXICFILTER_KEY)

app.use(express.static(new URL('./public', import.meta.url).pathname))

app.get('/', (req, res) => {
  res.send(page({ held: 'held' in req.query }))
})

app.post('/comments', express.urlencoded({ extended: false }), async (req, res) => {
  const name = (req.body?.name ?? '').trim()
  const body = (req.body?.body ?? '').trim()

  if (!name || !body) {
    return res.status(422).send(page({ name, body, error: 'Write your name and a comment.' }))
  }

  const id = comments.nextId()
  let verdict

  try {
    verdict = await tf.text(body, {
      surface: 'comment',
      reference: `comment_${id}`, // how the webhook finds this comment later
    })
  } catch (error) {
    if (!(error instanceof ToxicFilterError)) throw error

    // Nobody could judge it: hold it rather than publish it unread.
    comments.add(id, name, body, 'held', null)
    return res.redirect(303, '/?held=1')
  }

  if (verdict.blocked) {
    return res.status(422).send(page({ name, body, error: verdict.reason ?? 'This comment cannot be published.' }))
  }

  comments.add(id, name, body, verdict.needsReview ? 'held' : 'published', verdict.id)
  res.redirect(303, verdict.needsReview ? '/?held=1' : '/')
})

// A person decided on a held comment in ToxicFilter: publish it or drop it. The body is read
// RAW: the signature covers the exact bytes, and a parsed-then-reserialised body is different.
app.post('/webhooks/toxicfilter', express.raw({ type: '*/*' }), async (req, res) => {
  const event = await webhookEvent(
    req.body,
    req.get('X-ToxicFilter-Signature') ?? '',
    process.env.TOXICFILTER_WEBHOOK_SECRET ?? '',
  )

  if (!event) return res.sendStatus(400)

  const match = /^comment_(\d+)$/.exec(event.data?.reference ?? '')

  if (event.event === 'moderation.resolved' && match) {
    event.data.action === 'approved' ? comments.publish(Number(match[1])) : comments.remove(Number(match[1]))
  }

  res.sendStatus(204)
})

app.listen(process.env.PORT ?? 3000, () => console.log(`The wall is on http://localhost:${process.env.PORT ?? 3000}`))

function page({ name = '', body = '', error = null, held = false }) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>The wall</title><link rel="stylesheet" href="/wall.css"></head>
<body>
  <h1>The wall</h1>
  ${held ? '<p class="notice">Thanks. Your comment is waiting for a moderator.</p>' : ''}
  <form method="post" action="/comments">
    <label>Name <input name="name" value="${escape(name)}" required></label>
    <label>Comment <textarea name="body" rows="3" required>${escape(body)}</textarea></label>
    ${error ? `<p class="error">${escape(error)}</p>` : ''}
    <button type="submit">Post</button>
  </form>
  ${comments.published().map((c) => `<article><strong>${escape(c.name)}</strong><p>${escape(c.body)}</p></article>`).join('\n  ')}
</body>
</html>`
}

function escape(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch])
}
